import express from 'express';
import {
  createNote,
  getNotes,
  updateNote,
  deleteNote,
} from '../controllers/noteController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

router.get('/', getNotes);
router.post('/', createNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;