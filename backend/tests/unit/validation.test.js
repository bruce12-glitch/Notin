// WP-AUDIT — unit tests for lib/validation.js (representative coverage)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idSchema,
  emailSchema,
  noteCreateSchema,
  noteUpdateSchema,
  notebookSchema,
  otpVerifySchema,
  zodDetails,
  NOTE_TITLE_MAX,
} from '../../src/lib/validation.js';

test('idSchema accepts server id shapes, rejects path/control junk', () => {
  assert.equal(idSchema.safeParse('c1a2b3').success, true);
  assert.equal(idSchema.safeParse('att_550e8400-e29b-41d4-a716-446655440000').success, true);
  assert.equal(idSchema.safeParse('../etc/passwd').success, false);
  assert.equal(idSchema.safeParse('has space').success, false);
  assert.equal(idSchema.safeParse('').success, false);
  assert.equal(idSchema.safeParse('x'.repeat(129)).success, false);
  assert.equal(idSchema.safeParse(42).success, false);
});

test('emailSchema trims + lowercases; rejects malformed input', () => {
  const ok = emailSchema.safeParse('  Bruce@Example.COM ');
  assert.equal(ok.success, true);
  assert.equal(ok.data, 'bruce@example.com');
  assert.equal(emailSchema.safeParse('not-an-email').success, false);
  assert.equal(emailSchema.safeParse('a@b').success, false);
});

test('noteCreateSchema: valid minimal note passes', () => {
  const r = noteCreateSchema.safeParse({ title: 'Hello', description: 'world' });
  assert.equal(r.success, true);
});

test('noteCreateSchema is strict: update-only fields are rejected on create', () => {
  for (const body of [
    { title: 't', description: 'd', isPinned: true },
    { title: 't', description: 'd', isTrashed: false },
    { title: 't', description: 'd', tagIds: [] },
    { title: 't', description: 'd', hackerz: 1 },
  ]) {
    assert.equal(noteCreateSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test('noteUpdateSchema accepts update-only fields and expectedUpdatedAt', () => {
  const r = noteUpdateSchema.safeParse({
    isPinned: true,
    tagIds: ['c1', 'c2'],
    expectedUpdatedAt: new Date().toISOString(),
  });
  assert.equal(r.success, true);
});

test('noteUpdateSchema rejects client-supplied trashedAt (server-authoritative)', () => {
  const r = noteUpdateSchema.safeParse({ isTrashed: true, trashedAt: new Date().toISOString() });
  assert.equal(r.success, false);
});

test('noteUpdateSchema rejects wrong types and malformed expectedUpdatedAt', () => {
  assert.equal(noteUpdateSchema.safeParse({ isPinned: 'yes' }).success, false);
  assert.equal(noteUpdateSchema.safeParse({ expectedUpdatedAt: 'tomorrow' }).success, false);
});

test('note title ceiling is enforced', () => {
  const r = noteCreateSchema.safeParse({ title: 'x'.repeat(NOTE_TITLE_MAX + 1), description: '' });
  assert.equal(r.success, false);
});

test('notebookSchema trims and collapses whitespace', () => {
  const r = notebookSchema.safeParse({ name: '  Work   Notes  ' });
  assert.equal(r.success, true);
  assert.equal(r.data.name, 'Work Notes');
  assert.equal(notebookSchema.safeParse({ name: '   ' }).success, false);
});

test('otpVerifySchema requires a 6-digit numeric code', () => {
  assert.equal(otpVerifySchema.safeParse({ challenge: 'abc', code: '123456' }).success, true);
  assert.equal(otpVerifySchema.safeParse({ challenge: 'abc', code: '12345' }).success, false);
  assert.equal(otpVerifySchema.safeParse({ challenge: 'abc', code: 'abcdef' }).success, false);
});

test('zodDetails maps issues to the {field, message} envelope', () => {
  const result = noteCreateSchema.safeParse({ title: 't', description: 'd', nope: 1 });
  assert.equal(result.success, false);
  const details = zodDetails(result.error);
  assert.ok(Array.isArray(details));
  assert.ok(details.length >= 1);
  assert.ok(details.every((d) => typeof d.field === 'string' && typeof d.message === 'string'));
});
