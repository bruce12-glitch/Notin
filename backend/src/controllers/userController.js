import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { createAccessToken, randomToken, hashToken, mintCsrfToken } from '../lib/jwt.js';
import { signinLockState, recordSigninFail, clearThrottle } from '../lib/throttle.js';
import { logError } from '../lib/logging.js';
import { signupSchema, signinSchema, validateBody, zodDetails } from '../lib/validation.js';
import { sendValidationError, sendInternalError } from '../lib/apiResponse.js';

// Used when an account does not exist or has no password. Running the same
// bcrypt work and returning the same response prevents account enumeration and
// large timing differences between failure paths.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('notin-invalid-credential-sentinel', 10);

function publicUser(u) {
  if (!u) return null;
  const { password, google_sub, googleSub, ...rest } = u;
  // normalize googleSub key
  return { id: u.id, email: u.email, username: u.username || null, googleSub: u.googleSub || u.google_sub || null, createdAt: u.createdAt || u.created_at, updatedAt: u.updatedAt || u.updated_at };
}

// WP-HARDEN-001 — signup validation. Legacy exact messages are preserved for
// the checks the frontend already surfaced; new checks (username shape, unknown
// fields, wrong types) use the standard VALIDATION_ERROR envelope.
export const signup = async (req, res) => {
  // The public UI verifies email through OTP. Raw password signup is retained
  // for development/API compatibility but is fail-closed in production unless
  // an operator deliberately enables it.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PASSWORD_SIGNUP !== 'true') {
    return res.status(404).json({ message: 'Not found' });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { email, password } = body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first.path[0] === 'email') return res.status(400).json({ message: 'Invalid email' });
    if (first.path[0] === 'password') return res.status(400).json({ message: first.message });
    return sendValidationError(res, zodDetails(parsed.error));
  }
  const { username } = parsed.data;
  const normEmail = parsed.data.email;

  try {
    const existing = await db.user.findUnique({ where: { email: normEmail } });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email: normEmail,
        password: hashed,
        username: username || null,
        googleSub: null,
      },
    });

    const accessToken = await createAccessToken(user, 15);
    // Also issue refresh token for unified session model
    const refreshRaw = randomToken(48);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    // WP-SEC-001 — every signup starts a NEW rotation family
    const familyId = randomToken(24);
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);
    const ip = String(req.ip || '').slice(0, 128);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, user_agent, ip_address, last_active_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [hashToken(refreshRaw), user.id, familyId, expiresAt, null, null, ua, ip, now, now]
    );

    // Set httpOnly cookie for refresh (same options as auth)
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 86400000,
    });
    // Also set legacy /auth path for compatibility with auth frontend
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 86400000,
    });
    // WP-SEC-002 — readable double-submit cookie; root path covers both mounts
    res.cookie('notin_csrf', mintCsrfToken(), {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400000,
    });

    const pub = publicUser(user);
    res.status(201).json({ user: pub, token: accessToken, accessToken });
  } catch (error) {
    return sendInternalError(req, res, error, 'Something went wrong during signup', 'signup');
  }
};

export const signin = async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { email, password } = body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // WP-HARDEN-001 — shape/type guard only. The 404/401/429 signin contract is
  // intentionally untouched (unknown accounts keep their legacy behavior).
  const parsed = signinSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const normEmail = String(parsed.data.email).trim().toLowerCase();

  try {
    const user = await db.user.findUnique({ where: { email: normEmail } });

    // WP-SEC-003 — availability-preserving: even locked, a CORRECT password
    // passes (and clears the row); only misses see the 429. Unknown and
    // passwordless accounts still run bcrypt against a sentinel and receive the
    // exact same outward response as a wrong password.
    const lockState = await signinLockState(normEmail);
    const passwordBytesValid = Buffer.byteLength(String(password), 'utf8') <= 72;
    const candidateHash = user?.password || DUMMY_PASSWORD_HASH;
    const passwordMatches = passwordBytesValid && await bcrypt.compare(String(password), candidateHash);
    const isValid = Boolean(user?.password && passwordMatches);
    if (!isValid) {
      const fail = await recordSigninFail(normEmail);
      if (lockState.locked || fail.locked) {
        const secs = fail.retryAfterSec || lockState.retryAfterSec || 60;
        res.setHeader('Retry-After', String(secs));
        return res.status(429).json({ message: 'Too many failed attempts — try again later' });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    await clearThrottle(normEmail, 'signin'); // any success resets the ladder

    const accessToken = await createAccessToken(user, 15);
    const refreshRaw = randomToken(48);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    // WP-SEC-001 — every signin starts a NEW rotation family
    const familyId = randomToken(24);
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);
    const ip = String(req.ip || '').slice(0, 128);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, user_agent, ip_address, last_active_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [hashToken(refreshRaw), user.id, familyId, expiresAt, null, null, ua, ip, now, now]
    );
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 86400000,
    });
    res.cookie('notin_refresh', refreshRaw, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 86400000,
    });
    // WP-SEC-002 — readable double-submit cookie; root path covers both mounts
    res.cookie('notin_csrf', mintCsrfToken(), {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400000,
    });

    const pub = publicUser(user);
    res.status(200).json({ user: pub, token: accessToken, accessToken });
  } catch (error) {
    return sendInternalError(req, res, error, 'Something went wrong during signin', 'signin');
  }
};
