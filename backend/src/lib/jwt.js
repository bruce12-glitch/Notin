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
  return new SignJWT({ sub: user.id, email: user.email, type: 'access' })
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

// Legacy support: verify with jsonwebtoken-style secret if needed (for 7d tokens issued before unify)
// We keep jsonwebtoken verification as fallback attempt if jose fails
import jwt from 'jsonwebtoken';
export async function verifyAnyToken(token) {
  try {
    return await verifyAccessToken(token);
  } catch (e) {
    // Try legacy jsonwebtoken with JWT_SECRET
    try {
      const legacySecret = env.JWT_SECRET || accessSecret;
      const decoded = jwt.verify(token, legacySecret);
      // Normalize to jose payload shape
      if (!decoded.id && !decoded.sub) throw new Error('Invalid legacy token');
      return { sub: decoded.id || decoded.sub, email: decoded.email, type: 'access' };
    } catch {
      throw e;
    }
  }
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
