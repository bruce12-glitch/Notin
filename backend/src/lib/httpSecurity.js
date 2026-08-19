// WP-SEC-002 — trusted-origin decisions, shared by the CORS middleware
// (server.js) and the auth-router originGuard (authRoutes.js).
const origin = process.env.APP_ORIGIN || 'http://localhost:4173';
export const allowList = origin.split(',').map((s) => s.trim()).filter(Boolean);
export const canonicalOrigin = allowList[0] || origin;
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function isOriginAllowed(originHeader) {
  if (!originHeader) return true; // non-browser callers are handled elsewhere
  if (allowList.includes(originHeader)) return true;
  if (process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(originHeader)) return true;
  return false;
}
