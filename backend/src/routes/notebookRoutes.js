import express from 'express';
import {
  getNotebooks,
  createNotebook,
  updateNotebook,
  deleteNotebook,
} from '../controllers/notebookController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

// WP-APP-005 — Notebooks (minimal)
router.get('/', getNotebooks);
router.post('/', createNotebook);
router.patch('/:id', updateNotebook);
router.delete('/:id', deleteNotebook);

export default router;
