// ============================================================
// models/token.model.js — refresh tokens & password resets
// ============================================================
const crypto = require("crypto");
const db = require("../db");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function storeRefreshToken({ userId, token, expiresAt, userAgent = "", ip = "" }) {
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, sha256(token), expiresAt, userAgent, ip);
}

function isRefreshTokenActive(token) {
  const row = db
    .prepare("SELECT revoked FROM refresh_tokens WHERE token_hash = ?")
    .get(sha256(token));
  return !!row && row.revoked === 0;
}

function revokeRefreshToken(token) {
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?").run(sha256(token));
}

function revokeAllForUser(userId) {
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?").run(userId);
}

function storeResetToken({ userId, token, expiresAt }) {
  db.prepare(
    "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
  ).run(userId, sha256(token), expiresAt);
}

function findValidResetToken(token) {
  return db
    .prepare(
      `SELECT * FROM password_resets
       WHERE token_hash = ? AND used = 0
         AND julianday(expires_at) > julianday('now')`
    )
    .get(sha256(token));
}

function markResetTokenUsed(id) {
  db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(id);
}

module.exports = {
  sha256, storeRefreshToken, isRefreshTokenActive,
  revokeRefreshToken, revokeAllForUser,
  storeResetToken, findValidResetToken, markResetTokenUsed,
};
