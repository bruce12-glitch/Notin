import prisma from '../config/db.js';
import { reminderCreateSchema, reminderUpdateSchema, pushSubscriptionSchema, validateBody, idSchema } from '../lib/validation.js';
import { sendInternalError } from '../lib/apiResponse.js';

// WP-REM-001 — Note Reminders controller

// GET /api/reminders — list user's reminders
export const getReminders = async (req, res) => {
  try {
    const isCompleted = req.query.completed === 'true' ? true : (req.query.completed === 'false' ? false : undefined);
    const noteId = req.query.noteId || undefined;
    const reminders = await prisma.reminder.findMany({
      where: {
        userId: req.userId,
        noteId,
        isCompleted,
      },
    });
    res.status(200).json(reminders);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to fetch reminders', 'getReminders');
  }
};

// POST /api/reminders — create or replace a reminder for a note
export const createReminder = async (req, res) => {
  const userId = req.userId;
  const body = validateBody(reminderCreateSchema, req, res);
  if (!body) return;

  try {
    // Verify note ownership
    const note = await prisma.note.findFirst({ where: { id: body.noteId, userId } });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Upsert semantics: if a reminder already exists for this note, update it
    const existing = await prisma.reminder.findByNoteId({ noteId: body.noteId, userId });
    let reminder;
    if (existing) {
      reminder = await prisma.reminder.update({
        where: { id: existing.id, userId },
        data: { remindAt: body.remindAt, isCompleted: false, snoozedUntil: null },
      });
    } else {
      reminder = await prisma.reminder.create({
        data: {
          noteId: body.noteId,
          userId,
          remindAt: body.remindAt,
        },
      });
    }

    res.status(201).json({ ...reminder, noteTitle: note.title });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to set reminder', 'createReminder');
  }
};

// PATCH /api/reminders/:id — update, complete, or snooze a reminder
export const updateReminder = async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) {
    return res.status(400).json({ message: 'Invalid reminder id' });
  }

  const body = validateBody(reminderUpdateSchema, req, res);
  if (!body) return;

  try {
    const existing = await prisma.reminder.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ message: 'Reminder not found' });
    }

    const patch = {};
    if (body.remindAt !== undefined) patch.remindAt = body.remindAt;
    if (body.isCompleted !== undefined) patch.isCompleted = body.isCompleted;
    if (body.snoozeMinutes !== undefined) {
      const snoozeDate = new Date(Date.now() + body.snoozeMinutes * 60 * 1000);
      patch.snoozedUntil = snoozeDate.toISOString();
      patch.isCompleted = false;
    }

    const updated = await prisma.reminder.update({
      where: { id, userId },
      data: patch,
    });

    res.status(200).json({ ...updated, noteTitle: existing.noteTitle });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to update reminder', 'updateReminder');
  }
};

// DELETE /api/reminders/:id — delete a reminder
export const deleteReminder = async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) {
    return res.status(400).json({ message: 'Invalid reminder id' });
  }

  try {
    const deleted = await prisma.reminder.delete({ where: { id, userId } });
    if (!deleted) {
      return res.status(404).json({ message: 'Reminder not found' });
    }
    res.status(200).json({ message: 'Reminder deleted', id });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to delete reminder', 'deleteReminder');
  }
};

// POST /api/reminders/subscribe — register Web Push subscription
export const subscribePush = async (req, res) => {
  const userId = req.userId;
  const body = validateBody(pushSubscriptionSchema, req, res);
  if (!body) return;

  try {
    const sub = await prisma.pushSubscription.upsert({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    res.status(201).json({ message: 'Push subscription registered', id: sub.id });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to register push subscription', 'subscribePush');
  }
};
