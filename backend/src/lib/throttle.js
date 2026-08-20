// WP-SEC-003 — per-email auth throttle: signin lockout + OTP issue window.
// Table `auth_throttle` is created by migrate.js (both dialects). All times
// ISO; rows are keyed (email, scope) with scope ∈ {'signin','otp'}.
import db from '../config/db.js';

const LOCK_STEP_FAILURES = 5;
const LOCK_BACKOFF_MINUTES = [1, 5, 15, 60];
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_REQUESTS = 5;
function nowIsoLocal() {
  return new Date().toISOString();
}
const toTs = v => v instanceof Date ? v.getTime() : Date.parse(String(v));

async function getRow(email, scope) {
  const { rows } = await db.query(
    `SELECT * FROM auth_throttle WHERE email = $1 AND scope = $2 LIMIT 1`, [email, scope]);
  return rows[0];
}
export async function clearThrottle(email, scope) {
  await db.query(`DELETE FROM auth_throttle WHERE email = $1 AND scope = $2`, [email, scope]);
}

// — signin half —
export async function signinLockState(email) {
  const row = await getRow(email, 'signin');
  if (!row?.locked_until) return { locked: false };
  const left = Math.ceil((toTs(row.locked_until) - Date.now()) / 1000);
  return left > 0 ? { locked: true, retryAfterSec: left } : { locked: false };
}
export async function recordSigninFail(email) {
  const now = nowIsoLocal();
  const { rows } = await db.query(
    `INSERT INTO auth_throttle (email, scope, count, window_start, lock_level, locked_until, updated_at)
     VALUES ($1, 'signin', 1, NULL, 0, NULL, $2)
     ON CONFLICT (email, scope) DO UPDATE SET count = auth_throttle.count + 1, updated_at = $3
     RETURNING count, lock_level`, [email, now, now]);
  const { count, lock_level } = rows[0];
  if (count % LOCK_STEP_FAILURES !== 0) return { locked: false, count };
  const idx = Math.min(lock_level, LOCK_BACKOFF_MINUTES.length - 1);
  const lockedUntil = new Date(Date.now() + LOCK_BACKOFF_MINUTES[idx] * 60000).toISOString();
  await db.query(
    `UPDATE auth_throttle SET lock_level = $1, locked_until = $2, updated_at = $3
     WHERE email = $4 AND scope = 'signin'`, [lock_level + 1, lockedUntil, now, email]);
  return { locked: true, retryAfterSec: LOCK_BACKOFF_MINUTES[idx] * 60, count };
}

// — otp half (sliding window) —
export async function otpRequestAllowed(email) {
  const now = Date.now();
  const row = await getRow(email, 'otp');
  const windowStartTs = row?.window_start ? toTs(row.window_start) : NaN;
  const fresh = !row || !Number.isFinite(windowStartTs) || (now - windowStartTs) > OTP_WINDOW_MS;
  if (fresh) {
    const isoNow = new Date(now).toISOString();
    await db.query(
      `INSERT INTO auth_throttle (email, scope, count, window_start, lock_level, locked_until, updated_at)
       VALUES ($1, 'otp', 1, $2, 0, NULL, $3)
       ON CONFLICT (email, scope) DO UPDATE SET count = 1, window_start = $2, updated_at = $3`,
      [email, isoNow, isoNow]);
    return { allowed: true };
  }
  const nextCount = row.count + 1;
  await db.query(`UPDATE auth_throttle SET count = $1, updated_at = $2 WHERE email = $3 AND scope = 'otp'`,
    [nextCount, new Date(now).toISOString(), email]);
  if (nextCount <= OTP_MAX_REQUESTS) return { allowed: true };
  const retryAfterSec = Math.max(1, Math.ceil((windowStartTs + OTP_WINDOW_MS - now) / 1000));
  return { allowed: false, retryAfterSec };
}
