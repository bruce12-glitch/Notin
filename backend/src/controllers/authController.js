import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import db from '../config/db.js';
import { createAccessToken, hashToken, randomToken, mintCsrfToken } from '../lib/jwt.js';
import { canonicalOrigin } from '../lib/httpSecurity.js';
import { cleanupExpiredTokens } from '../lib/cleanup.js';
import { evaluatePasswordStrength } from '../lib/passwordStrength.js';
import { otpRequestAllowed } from '../lib/throttle.js';
import { logError } from '../lib/logging.js';
import { otpEmailSchema, otpVerifySchema, forgotPasswordSchema, resetPasswordSchema, EMAIL_RE } from '../lib/validation.js';
import { sendInternalError } from '../lib/apiResponse.js';
import { isBillingConfigured } from '../lib/billing.js';

const env = process.env;
// APP_ORIGIN may contain a comma-separated CORS allowlist. Redirects and links
// must always use one canonical URL rather than the raw list.
const origin = String(env.PUBLIC_APP_URL || canonicalOrigin).replace(/\/+$/, '');
const emailAuthEnabled = env.AUTH_EMAIL_ENABLED !== 'false';

// Mailer — null if SMTP not configured (triggers demo mode)
const mailer =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 465),
        secure: env.SMTP_SECURE !== 'false',
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      })
    : null;

const google = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const otpHash = (id, code) => sha(`${id}:${code}:${env.OTP_PEPPER}`);
const random = (n = 32) => crypto.randomBytes(n).toString('base64url');
const isProduction = env.NODE_ENV === 'production';
const cookieOpts = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api/auth',
};
const cookieOptsLegacy = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/auth',
};
// WP-SEC-002 — readable double-submit cookie; root path covers both mounts
const csrfCookieOpts = { httpOnly: false, secure: isProduction, sameSite: 'lax', path: '/' };

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, username: u.username || null };
}

// OAuth state and PKCE are bound to the initiating browser with short-lived,
// host-only, httpOnly cookies. This works across multiple API instances and
// avoids the login-CSRF and restart problems of a process-local state Map.
const oauthCookieOpts = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: 5 * 60 * 1000,
};
const OAUTH_STATE_COOKIE = 'notin_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'notin_oauth_verifier';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clearOauthCookies(res) {
  const { maxAge, ...clearOptions } = oauthCookieOpts;
  res.clearCookie(OAUTH_STATE_COOKIE, clearOptions);
  res.clearCookie(OAUTH_VERIFIER_COOKIE, clearOptions);
}

// Helpers for time handling — use ISO strings for both pg and sqlite (TEXT)
function nowIso() {
  return new Date().toISOString();
}
function futureIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

async function issueOtp(user) {
  if (!mailer) throw new Error('SMTP is not configured');
  const id = random(18);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = nowIso();
  const expiresAt = futureIso(5 * 60 * 1000);
  // Clean old challenges for user or expired
  await db.query(`DELETE FROM otp_challenges WHERE user_id = $1 OR expires_at < $2`, [user.id, now]);
  await db.query(
    `INSERT INTO otp_challenges (id, user_id, code_hash, expires_at, attempts, used_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, user.id, otpHash(id, code), expiresAt, 0, null, now]
  );
  try {
    await mailer.sendMail({
      from: env.MAIL_FROM || 'Notin <noreply@notin.app>',
      to: user.email,
      subject: 'Your Notin sign-in code',
      text: `Your Notin verification code is ${code}. It expires in 5 minutes and can only be used once.`,
    });
  } catch (error) {
    // Never leave an active code in the database when delivery failed.
    await db.query(`DELETE FROM otp_challenges WHERE id = $1`, [id]).catch(() => {});
    throw error;
  }
  return id;
}

// Public passwordless entry point used by both sign-up and "email me a code".
// A new passwordless user is created only so the existing challenge FK remains
// valid; if delivery fails that provisional row is removed immediately.
export async function otpRequest(req, res) {
  if (!emailAuthEnabled) return res.status(404).json({ error: 'Email sign-in is disabled' });
  if (!mailer) return res.status(503).json({ error: 'Email sign-in is temporarily unavailable' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const parsed = otpEmailSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email required' });
  const email = parsed.data.email;
  const gate = await otpRequestAllowed(email);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec || 900));
    return res.status(429).json({ error: 'Too many codes requested — try again later' });
  }

  let user = await db.user.findUnique({ where: { email } });
  let provisional = false;
  try {
    if (!user) {
      try {
        user = await db.user.create({ data: { email, username: null, password: null, googleSub: null } });
        provisional = true;
      } catch (createError) {
        // A concurrent request may have created the same email after our read.
        user = await db.user.findUnique({ where: { email } });
        if (!user) throw createError;
      }
    }
    const challenge = await issueOtp(user);
    return res.json({ ok: true, challenge, email });
  } catch (error) {
    if (provisional && user?.id) {
      await db.query(
        `DELETE FROM "User" WHERE id = $1 AND password IS NULL AND google_sub IS NULL`,
        [user.id],
      ).catch(() => {});
    }
    return sendInternalError(req, res, error, 'Could not send code', 'otpRequest');
  }
}

export async function googleStart(req, res) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return res.status(503).send('Google OAuth is not configured');
  }
  const state = random(24);
  const codeVerifier = random(48);
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  res.cookie(OAUTH_STATE_COOKIE, state, oauthCookieOpts);
  res.cookie(OAUTH_VERIFIER_COOKIE, codeVerifier, oauthCookieOpts);
  const url = google.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  res.redirect(url);
}

export async function googleCallback(req, res) {
  try {
    const { code, state } = req.query;
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
    const codeVerifier = req.cookies?.[OAUTH_VERIFIER_COOKIE];
    clearOauthCookies(res);
    if (!code || !state || !expectedState || !codeVerifier || !safeEqual(state, expectedState)) {
      return res.status(400).send('Invalid or expired OAuth state');
    }
    const { tokens } = await google.getToken({ code, codeVerifier });
    const ticket = await google.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) {
      return res.status(403).send('A verified Google email is required');
    }
    const email = p.email.toLowerCase();
    let user = await db.user.findByGoogleSub(p.sub);
    if (!user) {
      // Try find by email to link?
      user = await db.user.findUnique({ where: { email } });
      if (user) {
        // Link google_sub to existing user if not already linked
        if (!user.googleSub && !user.google_sub) {
          await db.query(`UPDATE "User" SET google_sub = $1, "updatedAt" = $2 WHERE id = $3`, [p.sub, nowIso(), user.id]);
          user = await db.user.findByGoogleSub(p.sub);
        } else if ((user.googleSub || user.google_sub) !== p.sub) {
          // Email exists with different google_sub — create new? For now, error
          return res.status(409).send('Account exists with different sign-in method');
        }
      } else {
        // Create new user
        const newUser = await db.user.create({ data: { email, username: p.name || null, password: null, googleSub: p.sub } });
        user = newUser;
      }
    }
    // Issue OTP challenge
    try {
      const challenge = await issueOtp(user);
      res.redirect(`${origin}/?auth=otp&challenge=${encodeURIComponent(challenge)}&email=${encodeURIComponent(user.email)}`);
    } catch (otpErr) {
      // If SMTP not configured, fallback to demo — never in production.
      // WP-DEPLOY-001: production without SMTP falls through to `throw otpErr`.
      if (!mailer && !isProduction) {
        // Create demo challenge so flow can continue in dev
        const id = random(18);
        const demoCode = '123456';
        const now = nowIso();
        await db.query(`DELETE FROM otp_challenges WHERE user_id = $1 OR expires_at < $2`, [user.id, now]);
        await db.query(
          `INSERT INTO otp_challenges (id, user_id, code_hash, expires_at, attempts, used_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, user.id, otpHash(id, demoCode), futureIso(5 * 60 * 1000), 0, null, now]
        );
        console.log(`[DEMO OTP fallback] ${user.email} => ${demoCode} challenge ${id}`);
        return res.redirect(`${origin}/?auth=otp&challenge=${encodeURIComponent(id)}&email=${encodeURIComponent(user.email)}`);
      }
      throw otpErr;
    }
  } catch (e) {
    logError(req, e, 'googleCallback error');
    res.status(401).send('Google authentication failed');
  }
}

export async function otpResend(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const parsed = otpEmailSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const email = parsed.data.email;
    const user = await db.user.findUnique({ where: { email } });
    // Always return an opaque challenge-shaped value. For unknown accounts it
    // is intentionally not stored; callers cannot infer account existence from
    // the response shape.
    let responseChallenge = random(18);
    // Anti-enumeration: always return ok, but only send if user exists.
    if (user) {
      // WP-SEC-003 — per-email issue throttle (per-challenge caps cannot
      // accumulate: issueOtp deletes prior challenges)
      const gate = await otpRequestAllowed(email);
      if (!gate.allowed) {
        res.setHeader('Retry-After', String(gate.retryAfterSec || 900));
        return res.status(429).json({ error: 'Too many codes requested — try again later' });
      }
      try {
        responseChallenge = await issueOtp(user);
      } catch (e) {
        if (!mailer && !isProduction) {
          // demo fallback
          const id = random(18);
          await db.query(`DELETE FROM otp_challenges WHERE user_id = $1 OR expires_at < $2`, [user.id, nowIso()]);
          await db.query(
            `INSERT INTO otp_challenges (id, user_id, code_hash, expires_at, attempts, used_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, user.id, otpHash(id, '123456'), futureIso(5 * 60 * 1000), 0, null, nowIso()]
          );
          responseChallenge = id;
          console.log(`[DEMO OTP resend] ${email} => 123456 challenge ${id}`);
        } else {
          throw e;
        }
      }
    }
    res.json({ ok: true, challenge: responseChallenge, email, message: 'If the account exists, a new code was sent.' });
  } catch (e) {
    return sendInternalError(req, res, e, 'Could not resend code', 'otpResend');
  }
}

export async function otpDemoRequest(req, res) {
  // Guard: demo only when NOT production AND SMTP not configured
  if (isProduction) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (mailer) {
    return res.status(403).json({ error: 'Demo OTP disabled when SMTP is configured. Check your email for the real code.' });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const parsed = otpEmailSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const email = parsed.data.email;
  // WP-SEC-003 — per-email issue throttle (per-challenge caps cannot
  // accumulate: issueOtp deletes prior challenges)
  const gate = await otpRequestAllowed(email);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec || 900));
    return res.status(429).json({ error: 'Too many codes requested — try again later' });
  }
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const id = random(18);
    // google_sub demo prefix
    const sub = `demo:${email}:${random(8)}`;
    user = await db.user.create({ data: { email, username: null, password: null, googleSub: sub } });
  }
  const challengeId = random(18);
  const demoCode = '123456';
  const now = nowIso();
  await db.query(`DELETE FROM otp_challenges WHERE user_id = $1 OR expires_at < $2`, [user.id, now]);
  await db.query(
    `INSERT INTO otp_challenges (id, user_id, code_hash, expires_at, attempts, used_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [challengeId, user.id, otpHash(challengeId, demoCode), futureIso(5 * 60 * 1000), 0, null, now]
  );
  console.log(`[DEMO OTP] ${email} => code ${demoCode} challenge ${challengeId}`);
  res.json({ ok: true, challenge: challengeId, email: user.email, demoCode, message: 'Demo code is 123456 (check server logs). SMTP not required for preview.' });
}

export async function otpVerify(req, res) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  const { challenge, code } = parsed.data;
  const now = nowIso();
  const { rows } = await db.query(`SELECT * FROM otp_challenges WHERE id = $1 LIMIT 1`, [challenge]);
  const c = rows[0];
  if (!c || c.used_at || c.expires_at < now || c.attempts >= 5) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }
  const expected = otpHash(challenge, String(code));
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c.code_hash));
  } catch {
    ok = false;
  }
  if (!ok) {
    await db.query(
      `UPDATE otp_challenges SET attempts = attempts + 1
       WHERE id = $1 AND used_at IS NULL AND attempts < 5`,
      [challenge],
    );
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  // Atomic consume: two concurrent submissions of the same correct code cannot
  // both create sessions. Expiry and attempt limits are rechecked in the write.
  const consumed = await db.query(
    `UPDATE otp_challenges SET attempts = attempts + 1, used_at = $1
     WHERE id = $2 AND used_at IS NULL AND attempts < 5 AND expires_at > $3
     RETURNING user_id`,
    [now, challenge, now],
  );
  if (consumed.rowCount !== 1) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  const user = await db.user.findById(consumed.rows[0].user_id);
  if (!user) return res.status(401).json({ error: 'Invalid or expired code' });

  const accessToken = await createAccessToken(user, 15);
  const refreshRaw = randomToken(48);
  const expiresAt = futureIso(30 * 86400000);
  // WP-SEC-001 — every verified session starts a NEW rotation family
  const familyId = randomToken(24);
  const ua = String(req.headers['user-agent'] || '').slice(0, 500);
  const ip = String(req.ip || '').slice(0, 128);
  await db.query(
    `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, user_agent, ip_address, last_active_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [hashToken(refreshRaw), user.id, familyId, expiresAt, null, null, ua, ip, now, now]
  );
  res.cookie('notin_refresh', refreshRaw, { ...cookieOpts, maxAge: 30 * 86400000 });
  res.cookie('notin_refresh', refreshRaw, { ...cookieOptsLegacy, maxAge: 30 * 86400000 });
  res.cookie('notin_csrf', mintCsrfToken(), { ...csrfCookieOpts, maxAge: 30 * 86400000 });
  res.json({ accessToken, token: accessToken, user: publicUser(user) });
}

// WP-SEC-001 — rotation with family replay detection. A consumed refresh
// token being presented again means either a benign rotation race (two
// tabs/calls fired together, inside the grace window) or a stolen cookie
// replayed after rotation. The race gets a fresh family sibling; the theft
// nukes the ENTIRE family so attacker and victim both return to sign-in.
// Every failure path returns the identical 401 body — never an oracle.
const REFRESH_FAMILY_GRACE_MS = 10_000;

export async function refresh(req, res) {
  try {
    const raw = req.cookies.notin_refresh;
    if (!raw) throw new Error('No refresh');
    const now = nowIso();
    const { rows } = await db.query(
      `SELECT * FROM refresh_tokens WHERE hash = $1 LIMIT 1`,
      [hashToken(raw)]
    );
    let row = rows[0];
    if (!row) throw new Error('Invalid');
    // Dual-driver truth: pg returns Date objects, SQLite returns ISO strings.
    const toTs = (value) => value instanceof Date ? value.getTime() : Date.parse(String(value));
    const expiresTs = toTs(row.expires_at);
    if (!Number.isFinite(expiresTs) || expiresTs <= Date.parse(now)) throw new Error('Expired');

    if (!row.revoked_at) {
      // Live token — rotate via compare-and-swap so a concurrent request
      // cannot silently fork the family.
      const { rowCount } = await db.query(
        `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'rotation' WHERE hash = $2 AND revoked_at IS NULL`,
        [now, hashToken(raw)]
      );
      if (rowCount === 0) {
        // Lost the race: the row is now rotated; re-read and fall into the
        // grace evaluation below (same behavior as a sequential reuse).
        const again = await db.query(`SELECT * FROM refresh_tokens WHERE hash = $1 LIMIT 1`, [hashToken(raw)]);
        row = again.rows[0] || row;
      }
    }

    if (row.revoked_at) {
      const revokedTs = toTs(row.revoked_at);
      const inGrace = row.revoke_reason === 'rotation'
        && Number.isFinite(revokedTs)
        && (Date.parse(now) - revokedTs) <= REFRESH_FAMILY_GRACE_MS;
      if (!inGrace) {
        // REPLAY — revoke every live member of this rotation family.
        if (row.family_id) {
          await db.query(
            `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'replay' WHERE family_id = $2 AND revoked_at IS NULL`,
            [now, row.family_id]
          );
        }
        console.error('[SECURITY] refresh-token replay detected — rotation family revoked', { userId: row.user_id });
        res.clearCookie('notin_refresh', cookieOpts);
        res.clearCookie('notin_refresh', cookieOptsLegacy);
        res.clearCookie('notin_csrf', csrfCookieOpts);
        throw new Error('Replay');
      }
      console.warn('[SECURITY] refresh reuse inside rotation grace — sibling issued', { userId: row.user_id });
    }

    const user = await db.user.findById(row.user_id);
    if (!user) throw new Error('No user');
    const nextRaw = randomToken(48);
    const expiresAt = futureIso(30 * 86400000);
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);
    const ip = String(req.ip || '').slice(0, 128);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, user_agent, ip_address, last_active_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [hashToken(nextRaw), user.id, row.family_id, expiresAt, null, null, ua, ip, now, now]
    );
    res.cookie('notin_refresh', nextRaw, { ...cookieOpts, maxAge: 30 * 86400000 });
    res.cookie('notin_refresh', nextRaw, { ...cookieOptsLegacy, maxAge: 30 * 86400000 });
    res.cookie('notin_csrf', mintCsrfToken(), { ...csrfCookieOpts, maxAge: 30 * 86400000 });
    const accessToken = await createAccessToken(user, 15);
    res.json({ accessToken, token: accessToken, user: publicUser(user) });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}

export async function logout(req, res) {
  const raw = req.cookies.notin_refresh;
  if (raw) {
    const now = nowIso();
    // WP-SEC-001 — by-hash revoke with reason; idempotent guard so a
    // concurrent rotation/logout pair cannot clobber the other's reason.
    // Deliberate consequence: replaying a logged-out cookie is an instant
    // family nuke — logout is NOT sheltered by the rotation grace.
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'logout' WHERE hash = $2 AND revoked_at IS NULL`,
      [now, hashToken(raw)]
    );
  }
  res.clearCookie('notin_refresh', cookieOpts);
  res.clearCookie('notin_refresh', cookieOptsLegacy);
  res.clearCookie('notin_csrf', csrfCookieOpts);
  res.status(204).end();
}

// ── WP-AUTH-003 — Forgot password (email reset) ──
// Token is stored HASHED only (peppered sha256) — never plaintext in the DB.
// Delivery: SMTP email when configured; dev-only token echo/log when !production && !SMTP
// (same guard family as the demo OTP — never exposed in production).
const RESET_TTL_MS = 60 * 60 * 1000; // 60 minutes
const resetPepper = env.RESET_PEPPER || env.OTP_PEPPER || 'dev-reset-pepper';
const resetHash = (token) => sha(`reset:${token}:${resetPepper}`);
const GENERIC_RESET_MSG = 'If an account exists for that email, a reset link is on its way.';
const resetLinkFor = (token) => `${origin}/login.html?token=${encodeURIComponent(token)}`;

export async function forgotPassword(req, res) {
  const generic = { ok: true, message: GENERIC_RESET_MSG };
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const parsed = forgotPasswordSchema.safeParse(body);
    // WP-HARDEN-001 — anti-enumeration is preserved verbatim: schema failures
    // and malformed addresses all receive the identical generic response.
    if (!parsed.success) {
      return res.json(generic);
    }
    const email = parsed.data.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.json(generic); // anti-enumeration: same response for malformed input
    }
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.json(generic); // anti-enumeration: same response for unknown email
    }
    // Choice (documented): reset works for password accounts AND OTP/Google-only accounts —
    // for passwordless accounts the reset flow SETS their first password (email ownership proven).
    const token = randomToken(32);
    const now = nowIso();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
    // One active reset per user at a time: supersede any previous unused tokens
    await db.query(`UPDATE password_reset_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL`, [now, user.id]);
    await db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [random(18), user.id, resetHash(token), expiresAt, null, now]
    );
    if (mailer) {
      await mailer.sendMail({
        from: env.MAIL_FROM || 'Notin <noreply@notin.app>',
        to: user.email,
        subject: 'Reset your Notin password',
        text: `We received a request to reset the password for your Notin account.\n\nReset it here (link expires in 60 minutes and works once):\n${resetLinkFor(token)}\n\nIf you did not request this, you can ignore this email — your password will not change.`,
      });
      return res.json(generic);
    }
    if (!isProduction) {
      // DEV fallback (no SMTP, not production) — mirrors the demo-OTP guard: token is echoed
      // in the response + server log so the flow stays end-to-end usable in dev/preview.
      console.log(`[DEV RESET] ${user.email} => token ${token}`);
      console.log(`[DEV RESET] link ${resetLinkFor(token)}`);
      return res.json({ ...generic, devResetToken: token, devResetLink: resetLinkFor(token) });
    }
    // Production without SMTP: never expose the token — must be fixed by configuring SMTP.
    console.error(`[RESET] SMTP is not configured; reset email to ${user.email} could not be delivered`);
    return res.json(generic);
  } catch (e) {
    // Preserve anti-enumeration even during SMTP/database faults. Operators get
    // the request-id-correlated error; callers always receive the generic body.
    logError(req, e, 'forgotPassword');
    return res.json(generic);
  }
}

export async function resetPassword(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      // Legacy exact bodies are part of the reset contract.
      const field = parsed.error.issues[0]?.path?.[0];
      if (field === 'password') {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      return res.status(400).json({ error: 'Reset token required' });
    }
    const { token, password } = parsed.data;
    const now = nowIso();
    const hashed = await bcrypt.hash(password, 10);
    const changed = await db.$transaction(async (tx) => {
      // Consume and obtain ownership in one statement. Only one concurrent
      // request can receive the row and proceed with the password change.
      const consumed = await tx.query(
        `UPDATE password_reset_tokens SET used_at = $1
         WHERE token_hash = $2 AND used_at IS NULL AND expires_at > $3
         RETURNING id, user_id`,
        [now, resetHash(token.trim()), now],
      );
      if (consumed.rowCount !== 1) return false;
      const userId = consumed.rows[0].user_id;
      const existing = await tx.query(`SELECT id FROM "User" WHERE id = $1 LIMIT 1`, [userId]);
      if (existing.rowCount !== 1) return false;
      // WP-SEC-004 — password reset increments tokenVersion, invalidating all
      // existing access tokens even if they are still within 15m window.
      await tx.query(`UPDATE "User" SET password = $1, "tokenVersion" = COALESCE("tokenVersion",0) + 1, "updatedAt" = $2 WHERE id = $3`, [hashed, now, userId]);
      await tx.query(
        `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'password-reset'
         WHERE user_id = $2 AND revoked_at IS NULL`,
        [now, userId],
      );
      return true;
    });
    if (!changed) return res.status(401).json({ error: 'Reset link is invalid or has expired' });
    res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
  } catch (e) {
    return sendInternalError(req, res, e, 'Could not reset password', 'resetPassword');
  }
}


// WP-SEC-005 — device inventory: list active refresh-token families (sessions)
// Each live refresh token = one family = one device/session. User agent and IP
// captured at mint time (refresh rotation updates last_active_at implicitly via
// new row). Current session marked via refresh cookie hash.
export async function listSessions(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const now = nowIso();
    // Find current family from cookie if present
    let currentFamilyId = null;
    const raw = req.cookies?.notin_refresh;
    if (raw) {
      const { rows } = await db.query(`SELECT family_id FROM refresh_tokens WHERE hash = $1 AND user_id = $2 LIMIT 1`, [hashToken(raw), userId]);
      if (rows[0]?.family_id) currentFamilyId = rows[0].family_id;
    }
    // Active sessions = unrevoked refresh tokens (one per family, latest)
    const { rows } = await db.query(
      `SELECT family_id, user_agent, ip_address, last_active_at, created_at, expires_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY COALESCE(last_active_at, created_at) DESC`,
      [userId]
    );
    const sessions = [];
    const seenFamilies = new Set();
    for (const r of rows) {
      // WP-SEC-001 — a family can briefly hold two live tokens (rotation
      // grace sibling). One device = one entry: keep the newest row per family.
      if (seenFamilies.has(r.family_id)) continue;
      seenFamilies.add(r.family_id);
      sessions.push({
        id: r.family_id,
        familyId: r.family_id,
        userAgent: r.user_agent || null,
        ipAddress: r.ip_address || null,
        lastActiveAt: r.last_active_at || r.created_at,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        isCurrent: currentFamilyId ? r.family_id === currentFamilyId : false,
      });
    }
    res.json({ sessions });
  } catch (e) {
    return res.status(500).json({ message: 'Could not list sessions' });
  }
}

export async function revokeSession(req, res) {
  try {
    const userId = req.userId;
    const familyId = String(req.params.familyId || '').trim();
    if (!familyId) return res.status(400).json({ message: 'Family id required' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(familyId)) return res.status(400).json({ message: 'Invalid family id' });
    const now = nowIso();
    const result = await db.query(
      `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'user-revoke' WHERE family_id = $2 AND user_id = $3 AND revoked_at IS NULL`,
      [now, familyId, userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Session not found' });
    // Clear cookies only when the revoked session IS the current one —
    // revoking another device must not log this browser out.
    const raw = req.cookies?.notin_refresh;
    if (raw) {
      const { rows } = await db.query(`SELECT family_id FROM refresh_tokens WHERE hash = $1 AND user_id = $2 LIMIT 1`, [hashToken(raw), userId]);
      if (rows[0]?.family_id === familyId) {
        res.clearCookie('notin_refresh', cookieOpts);
        res.clearCookie('notin_refresh', cookieOptsLegacy);
        res.clearCookie('notin_csrf', csrfCookieOpts);
      }
    }
    res.status(200).json({ ok: true, revokedFamilyId: familyId });
  } catch (e) {
    return res.status(500).json({ message: 'Could not revoke session' });
  }
}

export async function revokeOtherSessions(req, res) {
  try {
    const userId = req.userId;
    let currentFamilyId = null;
    const raw = req.cookies?.notin_refresh;
    if (raw) {
      const { rows } = await db.query(`SELECT family_id FROM refresh_tokens WHERE hash = $1 AND user_id = $2 LIMIT 1`, [hashToken(raw), userId]);
      if (rows[0]?.family_id) currentFamilyId = rows[0].family_id;
    }
    const now = nowIso();
    let result;
    if (currentFamilyId) {
      result = await db.query(
        `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'user-revoke-others' WHERE user_id = $2 AND family_id != $3 AND revoked_at IS NULL`,
        [now, userId, currentFamilyId]
      );
    } else {
      // No current cookie (Bearer-only call) — revoke all refresh sessions
      result = await db.query(
        `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'user-revoke-others' WHERE user_id = $2 AND revoked_at IS NULL`,
        [now, userId]
      );
    }
    res.json({ ok: true, revokedCount: result.rowCount || 0, keptFamilyId: currentFamilyId });
  } catch (e) {
    return res.status(500).json({ message: 'Could not revoke other sessions' });
  }
}

export async function cleanupTokens(req, res) {
  try {
    const results = await cleanupExpiredTokens();
    res.json({ ok: true, cleaned: results });
  } catch (e) {
    res.status(500).json({ message: 'Cleanup failed' });
  }
}

export async function passwordStrength(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const pwd = String(body.password || '');
    const email = String(body.email || '');
    const username = String(body.username || '');
    if (!pwd) return res.status(400).json({ message: 'Password required' });
    if (pwd.length > 500) return res.status(400).json({ message: 'Password too long' });
    const result = evaluatePasswordStrength(pwd, email, username);
    res.json({
      score: result.score,
      label: result.label,
      color: result.color,
      issues: result.issues,
      valid: result.valid,
      categories: result.categories,
    });
  } catch (e) {
    res.status(500).json({ message: 'Could not evaluate password' });
  }
}

export async function health(req, res) {

  const smtpConfigured = Boolean(mailer);
  res.json({
    ok: true,
    service: 'notin-auth',
    googleConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI),
    emailAuthEnabled,
    smtpConfigured,
    demoMode: emailAuthEnabled && !smtpConfigured && !isProduction,
    hint: emailAuthEnabled && !smtpConfigured && !isProduction ? 'SMTP not configured — use POST /api/auth/otp/demo-request with {email} then verify with code 123456' : undefined,
  });
}

// WP-FUNNEL-002 — public capability discovery so clients can render only the
// sign-in options this deployment actually supports (no dead-end buttons).
export async function providers(req, res) {
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
  const smtpConfigured = Boolean(mailer);
  res.set('Cache-Control', 'no-store');
  res.json({
    google,
    apple: false,
    otp: emailAuthEnabled,
    password: emailAuthEnabled && (env.ALLOW_PASSWORD_SIGNUP === 'true' || (!isProduction && env.ALLOW_PASSWORD_SIGNUP !== 'false')),
    demoOtp: emailAuthEnabled && !smtpConfigured && !isProduction,
    // WP-BILLING-001 — capability flag so the app renders the Upgrade entry
    // only on deployments where checkout actually works.
    billing: isBillingConfigured(),
  });
}
