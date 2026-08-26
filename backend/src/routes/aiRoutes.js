import express from 'express';
import rateLimit from 'express-rate-limit';
import auth from '../middleware/auth.js';
import { askMyNotesController } from '../controllers/aiController.js';

const router = express.Router();
router.use(auth);

// WP-AI-007 — global "ask my notes". Same per-user budget family as the
// per-note AI tools (5/15min) — one bucket so no endpoint is an escape hatch.
const askLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.userId ? `user:${req.userId}` : `ip:${req.socket?.remoteAddress || 'unknown'}`),
});

function requireProductionAiProvider(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !process.env.GROQ_API_KEY) {
    return res.status(503).json({ message: 'AI features are not configured' });
  }
  next();
}

router.post('/ask', requireProductionAiProvider, askLimit, askMyNotesController);

export default router;
