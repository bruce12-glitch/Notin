import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, signin } from '../controllers/userController.js';
import { deleteAccount, exportAccount, getUsage } from '../controllers/accountController.js';
import { listSessions, revokeSession, revokeOtherSessions } from '../controllers/authController.js';
import auth from '../middleware/auth.js';

const router = express.Router();
const accountLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
// Coarse IP budgets complement the database-backed per-email throttles. Values
// are intentionally high enough for shared networks while stopping unbounded
// account creation and credential spraying from one source.
const signupIpLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const signinIpLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });

router.post('/signup', signupIpLimit, signup);
router.post('/signin', signinIpLimit, signin);
router.get('/me/export', auth, accountLimit, exportAccount);
router.get('/me/usage', auth, accountLimit, getUsage);
router.delete('/me', auth, accountLimit, deleteAccount);
// WP-SEC-005 — device inventory aliases under /users/me
router.get('/me/sessions', auth, accountLimit, listSessions);
router.post('/me/sessions/revoke-others', auth, accountLimit, revokeOtherSessions);
router.delete('/me/sessions/:familyId', auth, accountLimit, revokeSession);

export default router;