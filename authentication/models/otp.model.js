// ============================================================
// models/otp.model.js — peppered OTPs, cooldowns, and attempt limits
// ============================================================
const crypto = require("crypto");
const db = require("../db");
const config = require("../config");

const OTP_TTL_MIN = config.OTP_TTL_MINUTES;
const MAX_ATTEMPTS = config.OTP_MAX_ATTEMPTS;

function hashOtp(email, code) {
  return crypto
    .createHmac("sha256", config.OTP_PEPPER)
    .update(`${email.toLowerCase()}:${String(code)}`)
    .digest("hex");
}

function safeEqualHex(left, right) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function upsertPending({ email, passwordHash, displayName }) {
  const normalized = email.toLowerCase();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  db.transaction(() => {
    db.prepare("DELETE FROM pending_signups WHERE email = ? COLLATE NOCASE").run(normalized);
    db.prepare(
      `INSERT INTO pending_signups
        (email, password_hash, display_name, otp_hash, attempts, expires_at, last_sent_at)
       VALUES (?, ?, ?, ?, 0, ?, datetime('now'))`
    ).run(normalized, passwordHash, displayName || "", hashOtp(normalized, otp), expiresAt);
  });
  return otp;
}

function getPending(email) {
  return db.prepare("SELECT * FROM pending_signups WHERE email = ? COLLATE NOCASE")
    .get(email.toLowerCase());
}

function resendPending(email) {
  const normalized = email.toLowerCase();
  const row = getPending(normalized);
  if (!row) return { ok: false, reason: "no pending signup" };

  const rawLastSent = String(row.last_sent_at || "");
  const normalizedLastSent = rawLastSent.includes("T")
    ? rawLastSent
    : `${rawLastSent.replace(" ", "T")}Z`;
  const lastSent = rawLastSent ? new Date(normalizedLastSent).getTime() : 0;
  const elapsed = Math.max(0, Math.floor((Date.now() - lastSent) / 1000));
  const retryAfter = Math.max(0, config.OTP_RESEND_SECONDS - elapsed);
  if (retryAfter > 0) return { ok: false, reason: "cooldown", retryAfter };

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();
  db.prepare(
    `UPDATE pending_signups
     SET otp_hash = ?, attempts = 0, expires_at = ?, last_sent_at = datetime('now')
     WHERE email = ? COLLATE NOCASE`
  ).run(hashOtp(normalized, otp), expiresAt, normalized);
  return { ok: true, otp, pending: row };
}

function verifyOtp(email, code) {
  const normalized = email.toLowerCase();
  const row = getPending(normalized);
  if (!row) return { ok: false, reason: "Verification request expired. Please sign up again." };

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deletePending(normalized);
    return { ok: false, reason: "Verification code expired. Please sign up again." };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    deletePending(normalized);
    return { ok: false, reason: "Too many incorrect attempts. Please sign up again." };
  }

  if (!safeEqualHex(row.otp_hash, hashOtp(normalized, code))) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      deletePending(normalized);
      return { ok: false, reason: "Too many incorrect attempts. Please sign up again.", remaining: 0 };
    }
    db.prepare("UPDATE pending_signups SET attempts = ? WHERE email = ? COLLATE NOCASE")
      .run(attempts, normalized);
    return { ok: false, reason: "Incorrect verification code.", remaining: MAX_ATTEMPTS - attempts };
  }

  return { ok: true, pending: row };
}

function deletePending(email) {
  db.prepare("DELETE FROM pending_signups WHERE email = ? COLLATE NOCASE")
    .run(email.toLowerCase());
}

module.exports = {
  generateOtp,
  upsertPending,
  resendPending,
  getPending,
  verifyOtp,
  deletePending,
  OTP_TTL_MIN,
  MAX_ATTEMPTS,
};
