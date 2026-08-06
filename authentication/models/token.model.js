// ============================================================
// models/token.model.js — rotating session families and reset tokens
// ============================================================
const crypto = require("crypto");
const db = require("../db");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function storeRefreshToken({ userId, token, familyId, expiresAt, userAgent = "", ip = "" }) {
  db.prepare(
    `INSERT INTO refresh_tokens
      (user_id, token_hash, family_id, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, sha256(token), familyId, expiresAt, userAgent.slice(0, 500), ip.slice(0, 100));
}

function getRefreshTokenRecord(token) {
  return db.prepare(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = ?`
  ).get(sha256(token));
}

function isRefreshTokenActive(token) {
  const row = getRefreshTokenRecord(token);
  return !!row && row.revoked === 0 && new Date(row.expires_at).getTime() > Date.now();
}

function rotateRefreshToken(oldToken, newToken) {
  db.prepare(
    `UPDATE refresh_tokens
     SET revoked = 1, replaced_by_hash = ?
     WHERE token_hash = ?`
  ).run(sha256(newToken), sha256(oldToken));
}

function revokeRefreshToken(token) {
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?")
    .run(sha256(token));
}

function revokeAllForUser(userId) {
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?").run(userId);
}

function revokeFamily(familyId) {
  if (!familyId) return;
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?").run(familyId);
}

function listSessions(userId) {
  return db.prepare(
    `SELECT id, user_agent, ip, expires_at, created_at,
            CASE WHEN revoked = 0 AND julianday(expires_at) > julianday('now') THEN 1 ELSE 0 END AS active
     FROM refresh_tokens
     WHERE user_id = ? AND replaced_by_hash = ''
     ORDER BY created_at DESC
     LIMIT 50`
  ).all(userId);
}

function revokeSession(userId, sessionId) {
  return db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE id = ? AND user_id = ?")
    .run(sessionId, userId).changes > 0;
}

function storeResetToken({ userId, token, expiresAt }) {
  db.transaction(() => {
    db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0").run(userId);
    db.prepare(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
    ).run(userId, sha256(token), expiresAt);
  });
}

function findValidResetToken(token) {
  return db.prepare(
    `SELECT * FROM password_resets
     WHERE token_hash = ? AND used = 0
       AND julianday(expires_at) > julianday('now')`
  ).get(sha256(token));
}

function markResetTokenUsed(id) {
  db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(id);
}

module.exports = {
  sha256,
  storeRefreshToken,
  getRefreshTokenRecord,
  isRefreshTokenActive,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  revokeFamily,
  listSessions,
  revokeSession,
  storeResetToken,
  findValidResetToken,
  markResetTokenUsed,
};
