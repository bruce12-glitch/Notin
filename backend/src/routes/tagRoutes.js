import express from 'express';
import {
  getTags,
  createTag,
  deleteTag,
} from '../controllers/tagController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

// WP-APP-006 — Tags (minimal)
router.get('/', getTags);
router.post('/', createTag);
router.delete('/:id', deleteTag);

export default router;
