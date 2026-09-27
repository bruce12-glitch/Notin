import express from 'express';
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  subscribePush,
} from '../controllers/reminderController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

// WP-REM-001 — Note Reminders
router.get('/', getReminders);
router.post('/', createReminder);
router.patch('/:id', updateReminder);
router.delete('/:id', deleteReminder);
router.post('/subscribe', subscribePush);

export default router;
