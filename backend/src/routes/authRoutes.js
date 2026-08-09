import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  googleStart,
  googleCallback,
  otpResend,
  otpDemoRequest,
  otpVerify,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
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

// Apply rate limit to all /api/auth/* (and legacy /auth/* if mounted)
router.use(strict);

router.get('/google', googleStart);
router.get('/google/callback', googleCallback);
router.post('/otp/resend', otpResend);
router.post('/otp/demo-request', otpDemoRequest);
router.post('/otp/verify', otpVerify);
router.post('/forgot-password', resetStrict, forgotPassword);
router.post('/reset-password', resetStrict, resetPassword);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/health', health);

export default router;
