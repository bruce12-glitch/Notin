// ============================================================
// db.js — SQLite connection, migrations, and health helpers
// ============================================================
require("dotenv").config({ quiet: true });
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const requestedPath = process.env.DB_PATH || "auth.db";
const DB_PATH = requestedPath === ":memory:"
  ? requestedPath
  : path.isAbsolute(requestedPath) ? requestedPath : path.resolve(__dirname, requestedPath);
if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    email                 TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password_hash         TEXT    NOT NULL,
    display_name          TEXT    NOT NULL DEFAULT '',
    role                  TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    is_verified           INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0, 1)),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until          TEXT,
    last_login_at         TEXT,
    password_changed_at   TEXT,
    token_version         INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT    NOT NULL DEFAULT '',
    body       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    token_hash       TEXT    UNIQUE NOT NULL,
    family_id        TEXT    NOT NULL DEFAULT '',
    replaced_by_hash TEXT    NOT NULL DEFAULT '',
    revoked          INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0, 1)),
    user_agent       TEXT    NOT NULL DEFAULT '',
    ip               TEXT    NOT NULL DEFAULT '',
    expires_at       TEXT    NOT NULL,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token_hash TEXT    UNIQUE NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0 CHECK(used IN (0, 1)),
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pending_signups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    display_name  TEXT    NOT NULL DEFAULT '',
    otp_hash      TEXT    NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    expires_at    TEXT    NOT NULL,
    last_sent_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

function columns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function addColumn(table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function transaction(fn) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    throw error;
  }
}

// Idempotent migration for databases created by earlier Notin versions.
transaction(() => {
  addColumn("users", "failed_login_attempts INTEGER NOT NULL DEFAULT 0");
  addColumn("users", "locked_until TEXT");
  addColumn("users", "last_login_at TEXT");
  addColumn("users", "password_changed_at TEXT");
  addColumn("users", "token_version INTEGER NOT NULL DEFAULT 0");
  addColumn("refresh_tokens", "family_id TEXT NOT NULL DEFAULT ''");
  addColumn("refresh_tokens", "replaced_by_hash TEXT NOT NULL DEFAULT ''");
  addColumn("pending_signups", "last_sent_at TEXT");
  db.exec("UPDATE pending_signups SET last_sent_at = COALESCE(last_sent_at, created_at);");
  db.prepare("INSERT OR IGNORE INTO schema_migrations (id, name) VALUES (?, ?)")
    .run(1, "security-columns-and-token-families");
});

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_rt_family ON refresh_tokens(family_id);
  CREATE INDEX IF NOT EXISTS idx_rt_expiry ON refresh_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_pr_user ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_pr_expiry ON password_resets(expires_at);
  CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_signups(expires_at);
`);

function cleanupExpired() {
  const refresh = db.prepare("DELETE FROM refresh_tokens WHERE julianday(expires_at) <= julianday('now')").run().changes;
  const resets = db.prepare("DELETE FROM password_resets WHERE used = 1 OR julianday(expires_at) <= julianday('now')").run().changes;
  const pending = db.prepare("DELETE FROM pending_signups WHERE julianday(expires_at) <= julianday('now')").run().changes;
  return { refresh, resets, pending };
}

function healthCheck() {
  const row = db.prepare("PRAGMA quick_check").get();
  const value = row ? Object.values(row)[0] : "unknown";
  return { ok: value === "ok", result: value, path: DB_PATH };
}

Object.assign(db, { transaction, cleanupExpired, healthCheck, path: DB_PATH });
cleanupExpired();

module.exports = db;
