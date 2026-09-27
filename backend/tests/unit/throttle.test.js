// WP-AUDIT — unit tests for lib/throttle.js against a throwaway SQLite store.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notin-throttle-')), 'test.sqlite');
process.env.SQLITE_PATH = tmpDb;
delete process.env.DATABASE_URL;

const db = (await import('../../src/config/db.js')).default;
const {
  signinLockState,
  recordSigninFail,
  otpRequestAllowed,
  clearThrottle,
} = await import('../../src/lib/throttle.js');

before(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS auth_throttle (
    email TEXT NOT NULL,
    scope TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TEXT,
    lock_level INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    updated_at TEXT,
    PRIMARY KEY (email, scope)
  )`);
});

test('signin lockout ladder: free for 4 failures, locked at the 5th (1 min)', async () => {
  const email = 'ladder@example.com';
  await clearThrottle(email, 'signin');
  for (let i = 0; i < 4; i++) {
    const r = await recordSigninFail(email);
    assert.equal(r.locked, false, `failure ${i + 1} must not lock`);
  }
  const fifth = await recordSigninFail(email);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.retryAfterSec, 60);
  const state = await signinLockState(email);
  assert.equal(state.locked, true);
  assert.ok(state.retryAfterSec > 0 && state.retryAfterSec <= 60);
});

test('lockout backoff escalates: 10th failure locks for 5 minutes', async () => {
  const email = 'escalate@example.com';
  await clearThrottle(email, 'signin');
  let last;
  for (let i = 0; i < 10; i++) last = await recordSigninFail(email);
  assert.equal(last.locked, true);
  assert.equal(last.retryAfterSec, 300);
});

test('OTP window: first 5 requests allowed, 6th blocked with retry hint', async () => {
  const email = 'otp@example.com';
  await clearThrottle(email, 'otp');
  for (let i = 0; i < 5; i++) {
    const r = await otpRequestAllowed(email);
    assert.equal(r.allowed, true, `request ${i + 1} must be allowed`);
  }
  const blocked = await otpRequestAllowed(email);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);
});

test('throttles are isolated per email and per scope', async () => {
  const email = 'iso@example.com';
  await clearThrottle(email, 'otp');
  for (let i = 0; i < 5; i++) await otpRequestAllowed(email);
  assert.equal((await otpRequestAllowed('other@example.com')).allowed, true);
  assert.equal((await signinLockState(email)).locked, false);
});
