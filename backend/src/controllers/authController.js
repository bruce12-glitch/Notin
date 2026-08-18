import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import db from '../config/db.js';
import { createAccessToken, hashToken, randomToken } from '../lib/jwt.js';

const env = process.env;
const origin = env.APP_ORIGIN || 'http://localhost:4173';

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

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, username: u.username || null };
}

// In-memory OAuth state
const pending = new Map();

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
  await mailer.sendMail({
    from: env.MAIL_FROM || 'Notin <noreply@notin.app>',
    to: user.email,
    subject: 'Your Notin sign-in code',
    text: `Your Notin verification code is ${code}. It expires in 5 minutes and can only be used once.`,
  });
  return id;
}

export async function googleStart(req, res) {
  if (!env.GOOGLE_CLIENT_ID) {
    return res.status(503).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID in .env');
  }
  const state = random(24);
  pending.set(state, Date.now() + 300000);
  const url = google.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
  res.redirect(url);
}

export async function googleCallback(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state || !pending.has(state) || pending.get(state) < Date.now()) {
      return res.status(400).send('Invalid or expired OAuth state');
    }
    pending.delete(state);
    const { tokens } = await google.getToken(code);
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
    console.error('googleCallback error', e);
    res.status(401).send('Google authentication failed');
  }
}

export async function otpResend(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const user = await db.user.findUnique({ where: { email } });
    // Anti-enumeration: always return ok, but only send if user exists
    if (user) {
      try {
        await issueOtp(user);
      } catch (e) {
        if (!mailer && !isProduction) {
          // demo fallback
          const id = random(18);
          await db.query(`DELETE FROM otp_challenges WHERE user_id = $1 OR expires_at < $2`, [user.id, nowIso()]);
          await db.query(
            `INSERT INTO otp_challenges (id, user_id, code_hash, expires_at, attempts, used_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, user.id, otpHash(id, '123456'), futureIso(5 * 60 * 1000), 0, null, nowIso()]
          );
          console.log(`[DEMO OTP resend] ${email} => 123456 challenge ${id}`);
        } else {
          throw e;
        }
      }
    }
    res.json({ ok: true, message: 'If the account exists, a new code was sent.' });
  } catch (e) {
    console.error('otpResend', e);
    res.status(500).json({ error: 'Could not resend code' });
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
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
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
  const { challenge, code } = req.body || {};
  if (typeof challenge !== 'string' || !/^[0-9]{6}$/.test(String(code))) {
    return res.status(400).json({ error: 'Invalid code' });
  }
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
  // Update attempts / used_at
  const usedAt = ok ? now : null;
  // Note: for sqlite, need to handle attempts increment correctly; we set attempts+1 if not ok? Spec says attempts = attempts+1
  // We'll fetch current attempts and increment
  const newAttempts = (c.attempts || 0) + 1;
  await db.query(`UPDATE otp_challenges SET attempts = $1, used_at = $2 WHERE id = $3`, [newAttempts, usedAt, challenge]);
  // For timingSafeEqual, we already set usedAt only if ok, but we set attempts increment
  // Actually spec sets used_at = ok ? now : null, and attempts+1 always
  // Our code does that via newAttempts and usedAt

  if (!ok) return res.status(401).json({ error: 'Invalid or expired code' });

  const user = await db.user.findById(c.user_id);
  if (!user) return res.status(401).json({ error: 'Invalid or expired code' });

  const accessToken = await createAccessToken(user, 15);
  const refreshRaw = randomToken(48);
  const expiresAt = futureIso(30 * 86400000);
  await db.query(
    `INSERT INTO refresh_tokens (hash, user_id, expires_at, revoked_at, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(refreshRaw), user.id, expiresAt, null, now]
  );
  res.cookie('notin_refresh', refreshRaw, { ...cookieOpts, maxAge: 30 * 86400000 });
  res.cookie('notin_refresh', refreshRaw, { ...cookieOptsLegacy, maxAge: 30 * 86400000 });
  res.json({ accessToken, token: accessToken, user: publicUser(user) });
}

export async function refresh(req, res) {
  try {
    const raw = req.cookies.notin_refresh;
    if (!raw) throw new Error('No refresh');
    const now = nowIso();
    const { rows } = await db.query(
      `SELECT * FROM refresh_tokens WHERE hash = $1 AND revoked_at IS NULL AND expires_at > $2 LIMIT 1`,
      [hashToken(raw), now]
    );
    const row = rows[0];
    if (!row) throw new Error('Invalid');
    // Rotate: revoke old
    await db.query(`UPDATE refresh_tokens SET revoked_at = $1 WHERE hash = $2`, [now, hashToken(raw)]);
    const user = await db.user.findById(row.user_id);
    if (!user) throw new Error('No user');
    const nextRaw = randomToken(48);
    const expiresAt = futureIso(30 * 86400000);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, expires_at, revoked_at, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [hashToken(nextRaw), user.id, expiresAt, null, now]
    );
    res.cookie('notin_refresh', nextRaw, { ...cookieOpts, maxAge: 30 * 86400000 });
    res.cookie('notin_refresh', nextRaw, { ...cookieOptsLegacy, maxAge: 30 * 86400000 });
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
    await db.query(`UPDATE refresh_tokens SET revoked_at = $1 WHERE hash = $2`, [now, hashToken(raw)]);
  }
  res.clearCookie('notin_refresh', cookieOpts);
  res.clearCookie('notin_refresh', cookieOptsLegacy);
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
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const generic = { ok: true, message: GENERIC_RESET_MSG };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    console.error('forgotPassword', e);
    res.status(500).json({ error: 'Could not process reset request' });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Reset token required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const now = nowIso();
    const { rows } = await db.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
      [resetHash(token.trim())]
    );
    const r = rows[0];
    const invalid = () => res.status(401).json({ error: 'Reset link is invalid or has expired' });
    if (!r || r.used_at || r.expires_at < now) return invalid();
    const user = await db.user.findById(r.user_id);
    if (!user) return invalid();
    const hashed = await bcrypt.hash(password, 10);
    await db.user.updatePassword(user.id, hashed);
    // Single-use: consume the token…
    await db.query(`UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2`, [now, r.id]);
    // …and revoke every existing refresh session for the user (new sign-in required)
    await db.query(`UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL`, [now, user.id]);
    res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
  } catch (e) {
    console.error('resetPassword', e);
    res.status(500).json({ error: 'Could not reset password' });
  }
}

export async function health(req, res) {
  const smtpConfigured = Boolean(mailer);
  res.json({
    ok: true,
    service: 'notin-auth',
    googleConfigured: Boolean(env.GOOGLE_CLIENT_ID),
    smtpConfigured,
    demoMode: !smtpConfigured && !isProduction,
    hint: !smtpConfigured && !isProduction ? 'SMTP not configured — use POST /api/auth/otp/demo-request with {email} then verify with code 123456' : undefined,
  });
}
