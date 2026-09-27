import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderCreateSchema, reminderUpdateSchema, pushSubscriptionSchema } from '../../src/lib/validation.js';

test('reminderCreateSchema: valid reminder payload passes', () => {
  const result = reminderCreateSchema.safeParse({
    noteId: 'note_123abc',
    remindAt: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(result.success, true);
});

test('reminderCreateSchema: invalid remindAt date is rejected', () => {
  const result = reminderCreateSchema.safeParse({
    noteId: 'note_123abc',
    remindAt: 'tomorrow-at-5pm',
  });
  assert.equal(result.success, false);
});

test('reminderCreateSchema: extra fields are rejected (.strict())', () => {
  const result = reminderCreateSchema.safeParse({
    noteId: 'note_123abc',
    remindAt: new Date().toISOString(),
    isCompleted: true,
  });
  assert.equal(result.success, false);
});

test('reminderUpdateSchema: valid patch fields pass', () => {
  const result = reminderUpdateSchema.safeParse({
    isCompleted: true,
    snoozeMinutes: 60,
  });
  assert.equal(result.success, true);
});

test('reminderUpdateSchema: negative or excessive snoozeMinutes is rejected', () => {
  assert.equal(reminderUpdateSchema.safeParse({ snoozeMinutes: 0 }).success, false);
  assert.equal(reminderUpdateSchema.safeParse({ snoozeMinutes: 20000 }).success, false);
});

test('pushSubscriptionSchema: valid subscription passes', () => {
  const result = pushSubscriptionSchema.safeParse({
    endpoint: 'https://fcm.googleapis.com/fcm/send/sample-token',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ic04YpqxHWIuQhg1-KKMei2xBSMBHKIKqWRMgG-UBAxnw',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  });
  assert.equal(result.success, true);
});
