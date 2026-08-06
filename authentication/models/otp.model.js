// ============================================================
// models/otp.model.js — pending signups + OTP handling
// ============================================================
const crypto = require("crypto");
const db = require("../db");

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MINUTES || 10);
const MAX_ATTEMPTS = 5;

function sha256(v) {
  return crypto.createHash("sha256").update(String(v)).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function upsertPending({ email, passwordHash, displayName }) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  db.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
  db.prepare(
    `INSERT INTO pending_signups (email, password_hash, display_name, otp_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(email, passwordHash, displayName || "", sha256(otp), expiresAt);

  return otp;
}

function getPending(email) {
  return db.prepare("SELECT * FROM pending_signups WHERE email = ?").get(email);
}

function verifyOtp(email, code) {
  const row = getPending(email);
  if (!row) return { ok: false, reason: "no pending signup — please sign up again" };

  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
    return { ok: false, reason: "code expired — please sign up again" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
    return { ok: false, reason: "too many wrong attempts — please sign up again" };
  }

  if (row.otp_hash !== sha256(code)) {
    db.prepare("UPDATE pending_signups SET attempts = attempts + 1 WHERE email = ?").run(email);
    return { ok: false, reason: "incorrect code", remaining: MAX_ATTEMPTS - (row.attempts + 1) };
  }

  return { ok: true, pending: row };
}

function deletePending(email) {
  db.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
}

module.exports = { generateOtp, upsertPending, getPending, verifyOtp, deletePending, OTP_TTL_MIN };
