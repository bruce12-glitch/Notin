import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, signin } from '../controllers/userController.js';
import { deleteAccount, exportAccount } from '../controllers/accountController.js';
import auth from '../middleware/auth.js';

const router = express.Router();
const accountLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.post('/signup', signup);
router.post('/signin', signin);
router.get('/me/export', auth, accountLimit, exportAccount);
router.delete('/me', auth, accountLimit, deleteAccount);

export default router;