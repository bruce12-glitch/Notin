// WP-CLEANUP-001 — expired token cleanup job
// Deletes expired OTP challenges, password reset tokens, and revoked refresh tokens older than 7 days
// Idempotent, safe to run concurrently (DELETE with time condition)
// Can be called via cron, via GET /api/health/deep?cleanup=true (operator), or via scheduled setInterval in server.js (dev only)

import db from '../config/db.js';

export async function cleanupExpiredTokens() {
  const now = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const results = {};

  try {
    // OTP challenges expired
    const otp = await db.query(`DELETE FROM otp_challenges WHERE expires_at < $1`, [now]);
    results.otpChallenges = otp.rowCount || 0;
  } catch (e) {
    results.otpChallenges = 0;
  }

  try {
    // Password reset tokens expired or used older than 7 days
    const reset = await db.query(`DELETE FROM password_reset_tokens WHERE expires_at < $1 OR (used_at IS NOT NULL AND used_at < $2)`, [now, sevenDaysAgo]);
    results.passwordResetTokens = reset.rowCount || 0;
  } catch (e) {
    results.passwordResetTokens = 0;
  }

  try {
    // Revoked refresh tokens older than 7 days (keep recent revocations for replay detection audit)
    const refresh = await db.query(`DELETE FROM refresh_tokens WHERE revoked_at IS NOT NULL AND revoked_at < $1`, [sevenDaysAgo]);
    results.refreshTokens = refresh.rowCount || 0;
  } catch (e) {
    results.refreshTokens = 0;
  }

  try {
    // Auth throttle entries where locked_until in past and window_start older than 24h
    const dayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const throttle = await db.query(`DELETE FROM auth_throttle WHERE locked_until < $1 AND updated_at < $2`, [now, dayAgo]);
    results.authThrottle = throttle.rowCount || 0;
  } catch (e) {
    results.authThrottle = 0;
  }

  return results;
}

export default cleanupExpiredTokens;
