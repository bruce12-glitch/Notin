import express from 'express';
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
// Read-only secret share links (owner only; POST rotates, DELETE revokes)
router.post('/:id/share', createShare);
router.delete('/:id/share', revokeShare);
// Permanent delete only when already trashed
router.delete('/:id', deleteNote);

export default router;
