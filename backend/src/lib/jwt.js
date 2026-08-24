import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';

const env = process.env;

// Unified secrets — prefer new names, fallback to legacy JWT_SECRET for backwards compat
const accessSecret = env.JWT_ACCESS_SECRET || env.JWT_SECRET || 'dev-access-secret-change-me-32chars-min-ok';
const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET || 'dev-refresh-secret-change-me-32chars-min-ok';
const issuer = env.JWT_ISSUER || 'notin-auth';
const audience = 'notin-api';

if (!env.JWT_ACCESS_SECRET && !env.JWT_SECRET) {
  console.warn('⚠️  JWT_ACCESS_SECRET not set, using fallback — set JWT_ACCESS_SECRET in .env for production');
}
if (!env.JWT_REFRESH_SECRET && !env.JWT_SECRET) {
  console.warn('⚠️  JWT_REFRESH_SECRET not set, using fallback — set JWT_REFRESH_SECRET in .env');
}

const accessKey = new TextEncoder().encode(accessSecret);
const refreshKey = new TextEncoder().encode(refreshSecret);

export const jwtConfig = {
  issuer,
  audience,
  accessSecret,
  refreshSecret,
};

export async function createAccessToken(user, minutes = 15) {
  const tokenVersion = Number.isFinite(Number(user?.tokenVersion)) ? Number(user.tokenVersion) : 0;
  return new SignJWT({ sub: user.id, email: user.email, type: 'access', tv: tokenVersion })
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
