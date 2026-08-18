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

// GET /api/notes?filter=active|trash  (default active) — also supports ?trash=0|1, ?isTrashed
router.get('/', getNotes);
router.post('/', createNote);
// Update (title, description, contentJson/contentText, isTrashed, notebookId, tagIds, isPinned)
router.put('/:id', updateNote);
router.patch('/:id', updateNote);
// Trash / Restore dedicated endpoints
router.post('/:id/trash', trashNote);
router.post('/:id/restore', restoreNote);
const aiLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/summarize', aiLimit, summarizeNote);
// WP-AI-002 — AI title suggestion (server suggests; client applies via autosave)
const titleLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/suggest-title', titleLimit, suggestNoteTitle);
// WP-AI-002b — AI tag suggestions (server suggests; existing tag paths apply)
const tagsLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/suggest-tags', tagsLimit, suggestNoteTags);
// WP-AI-003 — chat with the open note (non-streaming; nothing is persisted)
const chatLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/chat', chatLimit, chatWithNoteController);
// WP-AI-003b — streaming chat transport. Deliberately reuses the SAME chatLimit
// instance: both transports draw from one 5-per-15-minute budget per IP, so
// streaming is not a rate-limit escape hatch.
router.post('/:id/chat/stream', chatLimit, chatWithNoteStreamController);
// WP-AI-004 — writing assistant (suggestion only; client applies explicitly)
const assistLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/assist', assistLimit, assistNoteController);
// Read-only secret share links (owner only; POST rotates, DELETE revokes)
router.post('/:id/share', createShare);
router.delete('/:id/share', revokeShare);
// Permanent delete only when already trashed
router.delete('/:id', deleteNote);

export default router;
