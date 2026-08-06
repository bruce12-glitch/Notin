// ============================================================
// models/user.model.js — all user database access in one place
// ============================================================
const db = require("../db");

const PUBLIC_FIELDS = "id, email, display_name, role, is_verified, created_at, updated_at";

function createUser({ email, passwordHash, displayName = "" }) {
  const info = db
    .prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)")
    .run(email.toLowerCase(), passwordHash, displayName);
  return getUserById(info.lastInsertRowid);
}

function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
}

function getUserById(id) {
  return db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
}

function updateProfile(id, { displayName }) {
  db.prepare(
    "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(displayName, id);
  return getUserById(id);
}

function updatePassword(id, passwordHash) {
  db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(passwordHash, id);
}

function setVerified(id, value = 1) {
  db.prepare("UPDATE users SET is_verified = ?, updated_at = datetime('now') WHERE id = ?").run(value, id);
}

function deleteUser(id) {
  return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

module.exports = {
  createUser, getUserByEmail, getUserById,
  updateProfile, updatePassword, setVerified, deleteUser,
};
