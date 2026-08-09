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

const router = express.Router();

router.use(auth);

// GET /api/notes?filter=active|trash  (default active) — also supports ?trash=0|1, ?isTrashed
router.get('/', getNotes);
router.post('/', createNote);
// Update (title, description, contentJson/contentText, or isTrashed)
router.put('/:id', updateNote);
router.patch('/:id', updateNote);
// Trash / Restore dedicated endpoints
router.post('/:id/trash', trashNote);
router.post('/:id/restore', restoreNote);
// Permanent delete only when already trashed
router.delete('/:id', deleteNote);

export default router;
