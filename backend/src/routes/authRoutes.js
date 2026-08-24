import express from 'express';
import rateLimit from 'express-rate-limit';
import { isOriginAllowed } from '../lib/httpSecurity.js';
import { verifyCsrfToken } from '../lib/jwt.js';
import auth from '../middleware/auth.js';
import {
  googleStart,
  googleCallback,
  otpRequest,
  otpResend,
  otpDemoRequest,
  otpVerify,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  cleanupTokens,
  health,
} from '../controllers/authController.js';

const router = express.Router();

const strict = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
// WP-AUTH-003 — password-reset routes get a tighter budget on top of `strict`
const resetStrict = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const sessionLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limit to all /api/auth/* (and legacy /auth/* if mounted)
router.use(strict);

// WP-SEC-002 — trusted-origin enforcement on mutating auth routes. Absent
// Origin = non-browser caller → allowed (CORS already governs browsers).
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function originGuard(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  const originHeader = req.headers.origin;
  if (!originHeader || isOriginAllowed(originHeader)) return next();
  return res.status(403).json({ error: 'Invalid origin' });
}
// WP-SEC-002 — signed double-submit CSRF for the ONLY cookie-authenticated
// mutations. No refresh cookie → the SEC-001 generic-401 path owns it.
function csrfGuard(req, res, next) {
  if (!req.cookies?.notin_refresh) return next();
  const cookieToken = req.cookies?.notin_csrf;
  const headerToken = req.headers['x-notin-csrf'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken || !verifyCsrfToken(cookieToken)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}
router.use(originGuard);

router.get('/google', googleStart);
router.get('/google/callback', googleCallback);
router.post('/otp/request', otpRequest);
router.post('/otp/resend', otpResend);
router.post('/otp/demo-request', otpDemoRequest);
router.post('/otp/verify', otpVerify);
router.post('/forgot-password', resetStrict, forgotPassword);
router.post('/reset-password', resetStrict, resetPassword);
router.post('/refresh', csrfGuard, refresh);
router.post('/logout', csrfGuard, logout);
// WP-SEC-005 — device inventory (Bearer-protected, not cookie-only)
router.get('/sessions', auth, sessionLimit, listSessions);
router.post('/sessions/revoke-others', auth, sessionLimit, revokeOtherSessions);
router.delete('/sessions/:familyId', auth, sessionLimit, revokeSession);
// WP-CLEANUP-001 — expired token cleanup (Bearer-protected, rate limited)
router.post('/cleanup', auth, sessionLimit, cleanupTokens);
router.get('/health', health);

export default router;
