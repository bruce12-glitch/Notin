// ============================================================
// models/user.model.js — user persistence and login defenses
// ============================================================
const db = require("../db");
const config = require("../config");

const PUBLIC_FIELDS = [
  "id", "email", "display_name", "role", "is_verified",
  "last_login_at", "created_at", "updated_at",
].join(", ");

function createUser({ email, passwordHash, displayName = "", verified = 0 }) {
  const info = db.prepare(
    "INSERT INTO users (email, password_hash, display_name, is_verified, password_changed_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).run(email.toLowerCase(), passwordHash, displayName, verified ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}

function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email.toLowerCase());
}

function getUserById(id) {
  return db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
}

function getSecurityState(id) {
  return db.prepare(
    "SELECT id, role, is_verified, password_changed_at, token_version FROM users WHERE id = ?"
  ).get(id);
}

function updateProfile(id, { displayName }) {
  db.prepare("UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(displayName, id);
  return getUserById(id);
}

function updatePassword(id, passwordHash) {
  db.prepare(
    `UPDATE users
     SET password_hash = ?, password_changed_at = datetime('now'), token_version = token_version + 1,
         failed_login_attempts = 0, locked_until = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(passwordHash, id);
}

function setVerified(id, value = 1) {
  db.prepare("UPDATE users SET is_verified = ?, updated_at = datetime('now') WHERE id = ?")
    .run(value ? 1 : 0, id);
}

function isLoginLocked(user) {
  if (!user?.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}

function recordFailedLogin(id) {
  return db.transaction(() => {
    const row = db.prepare("SELECT failed_login_attempts FROM users WHERE id = ?").get(id);
    if (!row) return { locked: false, attempts: 0 };
    const attempts = Number(row.failed_login_attempts || 0) + 1;
    const locked = attempts >= config.LOGIN_MAX_ATTEMPTS;
    const lockedUntil = locked
      ? new Date(Date.now() + config.LOGIN_LOCK_MINUTES * 60 * 1000).toISOString()
      : null;
    db.prepare(
      "UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(attempts, lockedUntil, id);
    return { locked, attempts, lockedUntil };
  });
}

function recordSuccessfulLogin(id) {
  db.prepare(
    `UPDATE users
     SET failed_login_attempts = 0, locked_until = NULL,
         last_login_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);
  return getUserById(id);
}

function deleteUser(id) {
  return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getSecurityState,
  updateProfile,
  updatePassword,
  setVerified,
  isLoginLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  deleteUser,
};
