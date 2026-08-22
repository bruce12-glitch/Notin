import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, signin } from '../controllers/userController.js';
import { deleteAccount, exportAccount } from '../controllers/accountController.js';
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
router.delete('/me', auth, accountLimit, deleteAccount);

export default router;