import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createNote,
  getNotes,
  updateNote,
  deleteNote,
  trashNote,
  restoreNote,
} from '../controllers/noteController.js';
import auth from '../middleware/auth.js';
import { createShare, revokeShare } from '../controllers/shareController.js';
import {
  summarizeNote,
  suggestNoteTitle,
  suggestNoteTags,
  chatWithNoteController,
  chatWithNoteStreamController,
  assistNoteController,
} from '../controllers/aiController.js';

const router = express.Router();

router.use(auth);

// WP-HARDEN-001 — authenticated AI budgets are keyed per USER (user:<id>),
// never per IP: one client behind a shared NAT/proxy can no longer starve the
// neighbours, and rotating IPs cannot refresh a budget. `auth` runs before the
// limiters so req.userId is always present; the socket-address fallback is
// belt-and-braces only. The key generator deliberately never references
// req.ip, which express-rate-limit flags for IPv6 handling (ERR_ERL_KEY_GEN_IPV6).
function aiKeyGenerator(req) {
  if (req.userId) return `user:${req.userId}`;
  const addr = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
  return `ip:${addr}`;
}

function requireProductionAiProvider(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !process.env.GROQ_API_KEY) {
    return res.status(503).json({ message: 'AI features are not configured' });
  }
  next();
}

function makeAiLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: aiKeyGenerator,
  });
}

// GET /api/notes?filter=active|trash  (default active) — also supports ?trash=0|1, ?isTrashed
router.get('/', getNotes);
router.post('/', createNote);
// Update (title, description, contentJson/contentText, isTrashed, notebookId, tagIds, isPinned)
router.put('/:id', updateNote);
router.patch('/:id', updateNote);
// Trash / Restore dedicated endpoints
router.post('/:id/trash', trashNote);
router.post('/:id/restore', restoreNote);
const aiLimit = makeAiLimiter();
router.post('/:id/summarize', requireProductionAiProvider, aiLimit, summarizeNote);
// WP-AI-002 — AI title suggestion (server suggests; client applies via autosave)
const titleLimit = makeAiLimiter();
router.post('/:id/suggest-title', requireProductionAiProvider, titleLimit, suggestNoteTitle);
// WP-AI-002b — AI tag suggestions (server suggests; existing tag paths apply)
const tagsLimit = makeAiLimiter();
router.post('/:id/suggest-tags', requireProductionAiProvider, tagsLimit, suggestNoteTags);
// WP-AI-003 — chat with the open note (non-streaming; nothing is persisted)
const chatLimit = makeAiLimiter();
router.post('/:id/chat', requireProductionAiProvider, chatLimit, chatWithNoteController);
// WP-AI-003b — streaming chat transport. Deliberately reuses the SAME chatLimit
// instance: both transports draw from one 5-per-15-minute budget per USER, so
// streaming is not a rate-limit escape hatch.
router.post('/:id/chat/stream', requireProductionAiProvider, chatLimit, chatWithNoteStreamController);
// WP-AI-004 — writing assistant (suggestion only; client applies explicitly)
const assistLimit = makeAiLimiter();
router.post('/:id/assist', requireProductionAiProvider, assistLimit, assistNoteController);
// Read-only secret share links (owner only; POST rotates, DELETE revokes)
router.post('/:id/share', createShare);
router.delete('/:id/share', revokeShare);
// Permanent delete only when already trashed
router.delete('/:id', deleteNote);

export default router;
