import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';

const env = process.env;

// Unified secrets — prefer new names, fallback to legacy JWT_SECRET for backwards compat.
// WP-AUDIT-H2 — never fall back to a committed constant: in non-production a missing
// secret becomes a per-process EPHEMERAL random value (tokens die on restart, and a
// published constant can never mint valid tokens for a preview deployment). Production
// is fail-closed via assertProductionEnv() in server.js before this module matters.
const isProd = env.NODE_ENV === 'production';
const ephemeralAccess = crypto.randomBytes(32).toString('hex');
const ephemeralRefresh = crypto.randomBytes(32).toString('hex');
const accessSecret = env.JWT_ACCESS_SECRET || env.JWT_SECRET || ephemeralAccess;
const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET || ephemeralRefresh;
const issuer = env.JWT_ISSUER || 'notin-auth';
const audience = 'notin-api';

export const devShortcuts = {
  ephemeralAccessSecret: !env.JWT_ACCESS_SECRET && !env.JWT_SECRET,
  ephemeralRefreshSecret: !env.JWT_REFRESH_SECRET && !env.JWT_SECRET,
};

if (!isProd && devShortcuts.ephemeralAccessSecret) {
  console.warn('⚠️  JWT_ACCESS_SECRET not set — using an ephemeral per-process secret (dev only; all sessions invalidate on restart)');
}
if (!isProd && devShortcuts.ephemeralRefreshSecret) {
  console.warn('⚠️  JWT_REFRESH_SECRET not set — using an ephemeral per-process secret (dev only; all sessions invalidate on restart)');
}
if (isProd && (!env.JWT_ACCESS_SECRET || !env.JWT_REFRESH_SECRET)) {
  // assertProductionEnv() normally exits first; this is belt-and-braces for
  // any embedding that imports this module without booting server.js.
  throw new Error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production');
}

const accessKey = new TextEncoder().encode(accessSecret);

export const jwtConfig = {
  issuer,
  audience,
  accessSecret,
  refreshSecret,
};

export async function createAccessToken(user, minutes = 15) {
  const tokenVersion = Number.isFinite(Number(user?.tokenVersion)) ? Number(user.tokenVersion) : 0;
  // WP-AUDIT-L2 — no email in the token: sub + tv suffice; tokens pass through
  // logs/proxies and email is PII. middleware/auth.js loads the user row anyway.
  return new SignJWT({ sub: user.id, type: 'access', tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${minutes}m`)
    .sign(accessKey);
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, accessKey, {
    issuer,
    audience,
  });
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

// Legacy jsonwebtoken fallback retired in market-hardening — all tokens now jose HS256 15m.
// Any pre-unify 7d tokens have long expired; no fallback needed.

export function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// WP-SEC-002 — signed double-submit CSRF tokens (cookie-carried mutations only).
// Not httpOnly: the client must read + echo it. Signature defeats value forgery.
const csrfKey = crypto.createHash('sha256').update(`csrf:${refreshSecret}`).digest();
export function mintCsrfToken() {
  const rand = randomToken(24);
  return `${rand}.${crypto.createHmac('sha256', csrfKey).update(rand).digest('hex')}`;
}
export function verifyCsrfToken(token) {
  if (typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const expected = crypto.createHmac('sha256', csrfKey).update(token.slice(0, dot)).digest('hex');
  const sig = Buffer.from(token.slice(dot + 1));
  const exp = Buffer.from(expected);
  return sig.length === exp.length && crypto.timingSafeEqual(sig, exp);
}
