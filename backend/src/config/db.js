import pg from 'pg';
import { logError } from '../lib/logging.js';
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || '';
const isPostgresUrl = DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://');

// WP-DEPLOY-001 — never fall back to SQLite in production. This runs at import
// time, before any SQLite file handle is opened below. Dev is unaffected.
if (!isPostgresUrl && process.env.NODE_ENV === 'production') {
  console.error('FATAL: DATABASE_URL must be a postgres:// URL in production — refusing to start on the SQLite fallback');
  console.error('       (fix this first; remaining environment problems are reported together on the next boot)');
  process.exit(1);
}

let usePostgres = isPostgresUrl;
let pool = null;
let sqliteDb = null;
let sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../../prisma/notin.sqlite');
if (DATABASE_URL.startsWith('file:')) sqlitePath = DATABASE_URL.slice(5);

if (usePostgres) {
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    max: Math.max(1, Number.parseInt(process.env.PG_POOL_MAX || '10', 10) || 10),
    statement_timeout: Math.max(1000, Number.parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '10000', 10) || 10000),
    query_timeout: Math.max(1000, Number.parseInt(process.env.PG_QUERY_TIMEOUT_MS || '12000', 10) || 12000),
  });
  pool.on('error', (err) => {
    logError(null, err, 'postgres_pool');
  });
} else {
  try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
  sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA journal_mode = WAL');
}

// WP-AUDIT-M1 — quote-aware placeholder rewrite for the SQLite dialect. The old
// /\$(\d+)/g pass also rewrote "$n" sequences inside string literals and left
// Postgres casts ($1::timestamptz) behind, corrupting queries on the fallback.
// This scanner skips single-quoted regions (with '' escapes) and absorbs simple
// casts directly after a placeholder.
function pgToSqliteQuery(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (text[i + 1] === "'") { out += "'"; i++; } // '' escape inside literal
        else inString = false;
      }
      continue;
    }
    if (ch === "'") { inString = true; out += ch; continue; }
    if (ch === '$' && /\d/.test(text[i + 1] || '')) {
      let j = i + 1;
      while (j < text.length && /\d/.test(text[j])) j++;
      out += '?';
      const cast = text.slice(j).match(/^::[a-zA-Z]+/);
      i = j + (cast ? cast[0].length : 0) - 1;
      continue;
    }
    out += ch;
  }
  return out;
}
export { pgToSqliteQuery }; // exported for unit tests (WP-AUDIT-M1)
function randomId() {
  return 'c' + Date.now().toString(16) + crypto.randomBytes(8).toString('hex');
}
// WP-AUDIT-M1 — explicit, exhaustive connection-failure detection. Substring
// matching on 'connect' misclassified SQL errors (e.g. "connection" inside a
// constraint message) as outages and silently flipped the process onto an
// empty SQLite file mid-flight.
const PG_CONN_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  '57P01', // admin_shutdown
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01', // SQLSTATE connection class
]);
function isConnectionError(err) {
  if (!err) return false;
  if (PG_CONN_CODES.has(err.code)) return true;
  if (Array.isArray(err.errors) && err.errors.length) return err.errors.some(isConnectionError); // AggregateError
  const msg = String(err.message || '');
  return /\b(ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b/.test(msg);
}
const sqliteFallbackAllowed = process.env.ALLOW_SQLITE_FALLBACK === 'true';
async function query(text, params = []) {
  if (usePostgres && pool) {
    try {
      const result = await pool.query(text, params);
      return result;
    } catch (err) {
      const isConnError = isConnectionError(err);
      if (isConnError) {
        // WP-DEPLOY-001 — same rule mid-flight: production must never silently
        // migrate live traffic onto an empty local SQLite file.
        if (process.env.NODE_ENV === 'production') {
          console.error('FATAL: lost the PostgreSQL connection in production — refusing to fall back to SQLite');
          throw err;
        }
        // WP-AUDIT-M1 — the dev fallback is now opt-in: without
        // ALLOW_SQLITE_FALLBACK=true a Postgres outage fails loudly instead of
        // silently serving an empty/divergent SQLite store.
        if (!sqliteFallbackAllowed) {
          console.error('PostgreSQL query failed. Set ALLOW_SQLITE_FALLBACK=true to enable the development SQLite fallback.');
          throw err;
        }
        console.warn('Postgres query failed, switching to development SQLite fallback');
        usePostgres = false;
        if (!sqliteDb) {
          try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
          sqliteDb = new DatabaseSync(sqlitePath);
          sqliteDb.exec('PRAGMA journal_mode = WAL');
          try {
            sqliteDb.prepare(`SELECT 1 FROM "User" LIMIT 1`).get();
          } catch {
            console.log('SQLite User table missing — creating fallback tables');
            await import('../db/migrate.js');
          }
        }
        return querySqlite(text, params);
      }
      throw err;
    }
  }
  return querySqlite(text, params);
}
function querySqlite(text, params = []) {
  if (!sqliteDb) {
    try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA journal_mode = WAL');
  }
  const sqliteText = pgToSqliteQuery(text);
  const trimmed = sqliteText.trim().toUpperCase();
  const isSelect = trimmed.startsWith('SELECT');
  if (isSelect) {
    const stmt = sqliteDb.prepare(sqliteText);
    const rows = params.length ? stmt.all(...params) : stmt.all();
    return { rows, rowCount: rows.length };
  } else {
    const hasReturning = /RETURNING/i.test(sqliteText);
    if (hasReturning) {
      const stmt = sqliteDb.prepare(sqliteText);
      const rows = params.length ? stmt.all(...params) : stmt.all();
      return { rows, rowCount: rows.length };
    } else {
      const stmt = sqliteDb.prepare(sqliteText);
      const info = params.length ? stmt.run(...params) : stmt.run();
      return { rows: [], rowCount: info.changes };
    }
  }
}
// WP-APP-006 — attach each note's tags (batched IN query, no N+1)
async function attachTags(rows) {
  if (!rows || !rows.length) return rows || [];
  const ids = rows.map(r => r.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: tagRows } = await query(
    `SELECT nt."noteId" AS "noteId", t.id AS id, t.name AS name
     FROM "NoteTag" nt JOIN "Tag" t ON t.id = nt."tagId"
     WHERE nt."noteId" IN (${placeholders}) ORDER BY t.name ASC`,
    ids
  );
  const byNote = {};
  for (const tr of tagRows) {
    (byNote[tr.noteId] ||= []).push({ id: tr.id, name: tr.name });
  }
  rows.forEach(r => { r.tags = byNote[r.id] || []; });
  return rows;
}

// WP-APP-006 — replace a note's tag set atomically-ish (ownership validated upstream)
async function setNoteTags(noteId, tagIds) {
  await query(`DELETE FROM "NoteTag" WHERE "noteId" = $1`, [noteId]);
  const now = new Date().toISOString();
  for (const tagId of tagIds) {
    await query(
      `INSERT INTO "NoteTag" ("noteId", "tagId", "createdAt") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [noteId, tagId, now]
    );
  }
}

// WP-HARDEN-001 — shared WHERE builder for note list + count queries so
// pagination metadata and the page itself can never disagree on filters.
// Returns { sql, params, nextIdx, tsqueryParam } where tsqueryParam is the
// $n of the search tsquery on PostgreSQL (undefined when not searching or on
// SQLite). Every value is parameterized — user input never lands in SQL text.
function noteWhereClause({ userId, isTrashed, q, notebookId, tagId }) {
  const params = [userId];
  let sql = `"userId" = $1`;
  let idx = 2;
  if (isTrashed !== undefined) {
    if (usePostgres) {
      sql += ` AND "isTrashed" = $${idx++}`;
      params.push(isTrashed);
    } else {
      sql += ` AND "isTrashed" = $${idx++}`;
      params.push(isTrashed ? 1 : 0);
    }
  }
  // WP-APP-005 — notebook filter: null = unfiled only, string = that notebook
  if (notebookId !== undefined) {
    if (notebookId === null) {
      sql += ` AND "notebookId" IS NULL`;
    } else {
      sql += ` AND "notebookId" = $${idx++}`;
      params.push(notebookId);
    }
  }
  // WP-APP-006 — tag filter: notes carrying this tag (AND with other filters)
  if (tagId !== undefined) {
    sql += ` AND EXISTS (SELECT 1 FROM "NoteTag" nt WHERE nt."noteId" = "Note".id AND nt."tagId" = $${idx++})`;
    params.push(tagId);
  }
  const needle = typeof q === 'string' ? q.trim() : '';
  let tsqueryParam;
  if (needle) {
    if (usePostgres) {
      // WP-HARDEN-001 — PostgreSQL full-text search. websearch_to_tsquery keeps
      // user input as data (parameterized, never concatenated) and the three
      // to_tsvector expressions are covered by GIN expression indexes from
      // migrate.js. Description stays a fallback for notes without contentText.
      tsqueryParam = idx++;
      params.push(needle);
      sql += ` AND (
        to_tsvector('simple', title) @@ websearch_to_tsquery('simple', $${tsqueryParam})
        OR to_tsvector('simple', COALESCE("contentText", '')) @@ websearch_to_tsquery('simple', $${tsqueryParam})
        OR (COALESCE("contentText", '') = '' AND to_tsvector('simple', COALESCE(description, '')) @@ websearch_to_tsquery('simple', $${tsqueryParam}))
      )`;
    } else {
      // SQLite fallback — unchanged escaped-LIKE behavior (WP-APP-004). No FTS
      // tables: LIKE stays fully migration-safe under node:sqlite.
      const esc = needle.replace(/[\\%_]/g, (m) => '\\' + m);
      const pattern = `%${esc}%`;
      // NOTE: one placeholder per column (SQLite converts each $n to `?` — a
      // placeholder may not be repeated or the bind count would mismatch).
      // ESCAPE must follow EACH LIKE expression (SQL grammar binds it per-LIKE).
      sql += ` AND (
        title LIKE $${idx} ESCAPE '\\'
        OR COALESCE("contentText", '') LIKE $${idx + 1} ESCAPE '\\'
        OR (COALESCE("contentText", '') = '' AND COALESCE(description, '') LIKE $${idx + 2} ESCAPE '\\')
      )`;
      params.push(pattern, pattern, pattern);
      idx += 3;
    }
  }
  return { sql, params, nextIdx: idx, tsqueryParam };
}

const HEALTH_PROBE_TIMEOUT_MS = 2000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('HEALTH_TIMEOUT');
      err.code = 'HEALTH_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function activeDriverName() {
  return usePostgres ? 'PostgreSQL' : 'SQLite-fallback';
}

// WP-OPS-001 — readiness probe. MUST NOT call query(): that wrapper silently
// flips `usePostgres` to false on connection errors in development. Hitting the
// live driver handle (pool.query / sqliteDb.prepare) means a failed probe
// cannot mutate which database this process is using. This function never
// assigns `usePostgres` and never opens a SQLite file.
async function probeHealth(timeoutMs = HEALTH_PROBE_TIMEOUT_MS) {
  const driver = activeDriverName();
  const started = Date.now();
  try {
    if (usePostgres) {
      if (!pool) throw new Error('HEALTH_NO_POOL');
      await withTimeout(pool.query('SELECT 1'), timeoutMs);
    } else {
      if (!sqliteDb) throw new Error('HEALTH_NO_SQLITE');
      await withTimeout(Promise.resolve().then(() => sqliteDb.prepare('SELECT 1').get()), timeoutMs);
    }
    return {
      driver,
      reachable: true,
      latencyMs: Math.max(0, Date.now() - started),
    };
  } catch {
    // Swallow every driver/timeout error — callers must not leak connection
    // strings, host:port, or stack frames to the client.
    return {
      driver,
      reachable: false,
      latencyMs: Math.max(0, Date.now() - started),
    };
  }
}

const db = {
  async $connect() {
    if (usePostgres && pool) {
      try {
        const client = await pool.connect();
        client.release();
        console.log('✅ Connected to PostgreSQL');
        return;
      } catch (_e) {
        // WP-DEPLOY-001 — in production the SQLite fallback is never acceptable.
        // Without this the boot gate would be bypassable: a valid postgres:// URL
        // that simply cannot be reached would silently downgrade the whole
        // process to SQLite. Dev/preview keeps the forgiving fallback below.
        if (process.env.NODE_ENV === 'production') {
          console.error('FATAL: could not connect to PostgreSQL in production — refusing to fall back to SQLite');
          process.exit(1);
        }
        console.warn('Postgres connect failed, using development SQLite fallback');
        usePostgres = false;
        if (!sqliteDb) {
          try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
          sqliteDb = new DatabaseSync(sqlitePath);
          sqliteDb.exec('PRAGMA journal_mode = WAL');
        }
        console.log(`✅ Connected to SQLite fallback at ${sqlitePath}`);
        return;
      }
    }
    if (sqliteDb) {
      console.log(`✅ Connected to SQLite at ${sqlitePath}`);
      return;
    }
    try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA journal_mode = WAL');
    console.log(`✅ Connected to SQLite at ${sqlitePath}`);
  },
  async $disconnect() {
    if (pool) {
      try { await pool.end(); } catch {}
    }
    if (sqliteDb) {
      try { sqliteDb.close(); } catch {}
      sqliteDb = null;
    }
  },
  async query(text, params) {
    return query(text, params);
  },
  // WP-OPS-001 — readiness only. See probeHealth() above: never the query() wrapper.
  async probeHealth(timeoutMs) {
    return probeHealth(timeoutMs);
  },
  async $transaction(callback) {
    if (usePostgres && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({ query: (text, params = []) => client.query(text, params) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    querySqlite('BEGIN');
    try {
      const result = await callback({ query: (text, params = []) => Promise.resolve(querySqlite(text, params)) });
      querySqlite('COMMIT');
      return result;
    } catch (error) {
      try { querySqlite('ROLLBACK'); } catch {}
      throw error;
    }
  },
  get usePostgres() { return usePostgres; },
  get sqlitePath() { return sqlitePath; },
  user: {
    async findUnique({ where: { email } }) {
      if (!email) return null;
      const { rows } = await query('SELECT id, username, email, password, google_sub as "googleSub", "tokenVersion", "createdAt", "updatedAt" FROM "User" WHERE email = $1 LIMIT 1', [email.trim().toLowerCase()]);
      if (rows[0]) rows[0].tokenVersion = Number(rows[0].tokenVersion || 0);
      return rows[0] || null;
    },
    async findById(id) {
      const { rows } = await query('SELECT id, username, email, password, google_sub as "googleSub", "tokenVersion", "createdAt", "updatedAt" FROM "User" WHERE id = $1 LIMIT 1', [id]);
      if (rows[0]) rows[0].tokenVersion = Number(rows[0].tokenVersion || 0);
      return rows[0] || null;
    },
    async findByGoogleSub(googleSub) {
      if (!googleSub) return null;
      const { rows } = await query('SELECT id, username, email, password, google_sub as "googleSub", "tokenVersion", "createdAt", "updatedAt" FROM "User" WHERE google_sub = $1 LIMIT 1', [googleSub]);
      if (rows[0]) rows[0].tokenVersion = Number(rows[0].tokenVersion || 0);
      return rows[0] || null;
    },
    async findFirstByEmail(email) {
      return this.findUnique({ where: { email } });
    },
    async create({ data: { email, password, username, googleSub } }) {
      const id = randomId();
      const now = new Date().toISOString();
      const normEmail = String(email).trim().toLowerCase();
      const { rows } = await query(
        `INSERT INTO "User" (id, email, username, password, google_sub, "tokenVersion", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, username, email, password, google_sub as "googleSub", "tokenVersion", "createdAt", "updatedAt"`,
        [id, normEmail, username || null, password || null, googleSub || null, 0, now, now]
      );
      if (rows[0]) rows[0].tokenVersion = Number(rows[0].tokenVersion || 0);
      return rows[0];
    },
    async updatePassword(id, hashed) {
      const now = new Date().toISOString();
      const { rows } = await query(`UPDATE "User" SET password = $1, "updatedAt" = $2 WHERE id = $3 RETURNING id, username, email, password, google_sub as "googleSub", "tokenVersion", "createdAt", "updatedAt"`, [hashed, now, id]);
      if (rows[0]) rows[0].tokenVersion = Number(rows[0].tokenVersion || 0);
      return rows[0];
    },
    async incrementTokenVersion(id) {
      const now = new Date().toISOString();
      const { rows } = await query(`UPDATE "User" SET "tokenVersion" = COALESCE("tokenVersion",0) + 1, "updatedAt" = $1 WHERE id = $2 RETURNING id, "tokenVersion"`, [now, id]);
      return rows[0] ? Number(rows[0].tokenVersion) : null;
    },
  },
  // WP-APP-005 — Notebooks (minimal)
  notebook: {
    async findMany({ where: { userId } }) {
      // Include a count of non-trashed notes per notebook for the sidebar badge
      const { rows } = await query(
        `SELECT nb.id, nb."userId", nb.name, nb."createdAt", nb."updatedAt",
                (SELECT COUNT(*) FROM "Note" n WHERE n."notebookId" = nb.id AND n."isTrashed" = ${usePostgres ? 'FALSE' : '0'}) AS "noteCount"
         FROM "Notebook" nb WHERE nb."userId" = $1 ORDER BY nb.name ASC`,
        [userId]
      );
      return rows.map(r => ({ ...r, noteCount: Number(r.noteCount) || 0 }));
    },
    async findFirst({ where: { id, userId } }) {
      const { rows } = await query(
        `SELECT id, "userId", name, "createdAt", "updatedAt" FROM "Notebook" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
        [id, userId]
      );
      return rows[0] || null;
    },
    async findByName(userId, name) {
      // Case-insensitive name lookup (uniqueness per user enforced in controller)
      const { rows } = await query(
        `SELECT id, "userId", name, "createdAt", "updatedAt" FROM "Notebook" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [userId, String(name).trim()]
      );
      return rows[0] || null;
    },
    async create({ data: { name, userId } }) {
      const id = randomId();
      const now = new Date().toISOString();
      const { rows } = await query(
        `INSERT INTO "Notebook" (id, "userId", name, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, "userId", name, "createdAt", "updatedAt"`,
        [id, userId, String(name).trim(), now, now]
      );
      return rows[0];
    },
    async update({ where: { id }, data: { name } }) {
      const now = new Date().toISOString();
      const { rows } = await query(
        `UPDATE "Notebook" SET name = $1, "updatedAt" = $2 WHERE id = $3
         RETURNING id, "userId", name, "createdAt", "updatedAt"`,
        [String(name).trim(), now, id]
      );
      return rows[0];
    },
    async unfileNotes(id) {
      // Notes become unfiled (notebookId NULL) — never deleted
      const { rowCount } = await query(
        `UPDATE "Note" SET "notebookId" = NULL WHERE "notebookId" = $1`, [id]
      );
      return rowCount || 0;
    },
    async delete({ where: { id } }) {
      await query(`DELETE FROM "Notebook" WHERE id = $1`, [id]);
      return { id };
    },
  },
  // WP-APP-006 — Tags (minimal)
  tag: {
    async findMany({ where: { userId } }) {
      // Include a count of non-trashed notes carrying each tag (sidebar badge)
      const { rows } = await query(
        `SELECT t.id, t."userId", t.name, t."createdAt",
                (SELECT COUNT(*) FROM "NoteTag" nt JOIN "Note" n ON n.id = nt."noteId"
                  WHERE nt."tagId" = t.id AND n."isTrashed" = ${usePostgres ? 'FALSE' : '0'}) AS "noteCount"
         FROM "Tag" t WHERE t."userId" = $1 ORDER BY t.name ASC`,
        [userId]
      );
      return rows.map(r => ({ ...r, noteCount: Number(r.noteCount) || 0 }));
    },
    async findFirst({ where: { id, userId } }) {
      const { rows } = await query(
        `SELECT id, "userId", name, "createdAt" FROM "Tag" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
        [id, userId]
      );
      return rows[0] || null;
    },
    async findByName(userId, name) {
      // Case-insensitive name lookup (uniqueness per user enforced in controller)
      const { rows } = await query(
        `SELECT id, "userId", name, "createdAt" FROM "Tag" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [userId, String(name).trim()]
      );
      return rows[0] || null;
    },
    // All of the given ids that belong to the user (for tagIds validation)
    async findManyByIds(userId, ids) {
      if (!ids.length) return [];
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await query(
        `SELECT id, "userId", name, "createdAt" FROM "Tag" WHERE "userId" = $1 AND id IN (${placeholders})`,
        [userId, ...ids]
      );
      return rows;
    },
    async create({ data: { name, userId } }) {
      const id = randomId();
      const now = new Date().toISOString();
      const { rows } = await query(
        `INSERT INTO "Tag" (id, "userId", name, "createdAt") VALUES ($1, $2, $3, $4)
         RETURNING id, "userId", name, "createdAt"`,
        [id, userId, String(name).trim(), now]
      );
      return rows[0];
    },
    async detachFromNotes(id) {
      const { rowCount } = await query(`DELETE FROM "NoteTag" WHERE "tagId" = $1`, [id]);
      return rowCount || 0;
    },
    async delete({ where: { id } }) {
      await query(`DELETE FROM "Tag" WHERE id = $1`, [id]);
      return { id };
    },
  },
  note: {
    async create({ data: { title, description, contentJson, contentText, userId, notebookId } }) {
      const id = randomId();
      const now = new Date().toISOString();
      const jsonStr = contentJson ? (typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson)) : null;
      const textStr = contentText != null ? String(contentText) : (description != null ? String(description) : '');
      const desc = description != null ? String(description) : (textStr || '');
      const { rows } = await query(
        `INSERT INTO "Note" (id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, title, description, "contentJson", "contentText", summary, "isTrashed", "isPinned", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt"`,
        [id, title || 'Untitled', desc, jsonStr, textStr, 0, null, notebookId || null, userId, now, now]
      );
      const row = rows[0];
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch(_parseErr){ console.warn('Stored note content could not be parsed'); } }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
        row.isPinned = !!(row.isPinned === true || row.isPinned === 1 || row.isPinned === '1' || row.isPinned === 't'); // WP-APP-007
        row.tags = row.tags || []; // WP-APP-006 — new notes start untagged
      }
      return row;
    },
    async findMany({ where, orderBy, limit, offset, includeRank } = {}) {
      // WP-APP-007 — pinned notes always float to the top of whatever filtered list is
      // returned (active, trash, search, notebook, tag).
      // WP-HARDEN-001 — PostgreSQL search orders by pinned → ts_rank_cd →
      // updatedAt → id; everything else keeps the historical pinned → createdAt
      // order plus a deterministic id tie-breaker.
      const dir = orderBy?.createdAt === 'asc' ? 'ASC' : 'DESC';
      const built = noteWhereClause(where);
      const { params, nextIdx, tsqueryParam } = built;
      let idx = nextIdx;
      // PG-only rank expression (computed in the SELECT list, never after the
      // WHERE clause). The tsquery placeholder is reused — PostgreSQL allows
      // repeating $n; SQLite never executes this branch.
      const selectList = tsqueryParam
        ? `id, title, description, "contentJson", "contentText", summary, "isTrashed", "isPinned", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt", ts_rank_cd(to_tsvector('simple', title || ' ' || COALESCE("contentText", '')), websearch_to_tsquery('simple', $${tsqueryParam})) AS rank`
        : `id, title, description, "contentJson", "contentText", summary, "isTrashed", "isPinned", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt"`;
      let sql = `SELECT ${selectList} FROM "Note" WHERE ${built.sql}`;
      if (tsqueryParam) {
        sql += ` ORDER BY "isPinned" DESC, rank DESC, "updatedAt" DESC, id`;
      } else {
        sql += ` ORDER BY "isPinned" DESC, "createdAt" ${dir}, id`;
      }
      // Result cap (spec: e.g. 100) — always applied, with a hard ceiling
      const lim = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), 500) : 100;
      sql += ` LIMIT $${idx++}`;
      params.push(lim);
      const off = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
      if (off > 0) {
        sql += ` OFFSET $${idx}`;
        params.push(off);
      }
      const { rows } = await query(sql, params);
      const mapped = rows.map(r=>{
        if(r.contentJson && typeof r.contentJson === 'string'){ try{ r.contentJson = JSON.parse(r.contentJson); }catch(_parseErr){ console.warn('Stored note content could not be parsed'); } }
        r.isTrashed = !!(r.isTrashed === true || r.isTrashed === 1 || r.isTrashed === '1' || r.isTrashed === 't');
        r.isPinned = !!(r.isPinned === true || r.isPinned === 1 || r.isPinned === '1' || r.isPinned === 't'); // WP-APP-007
        // WP-HARDEN-001 — rank is internal unless the client asked for it.
        if (!includeRank && 'rank' in r) delete r.rank;
        return r;
      });
      return attachTags(mapped); // WP-APP-006 — every note row carries tags: [{id,name}]
    },
    // WP-HARDEN-001 — parameterized COUNT(*) over the exact same filters as
    // findMany (used by ?includeMeta=true; no N+1, no tag lookups).
    async count({ where } = {}) {
      const built = noteWhereClause(where);
      const { rows } = await query(`SELECT COUNT(*) AS total FROM "Note" WHERE ${built.sql}`, built.params);
      return Number(rows[0]?.total || 0);
    },
    async findFirst({ where: { id, userId } }) {
      const { rows } = await query(
        `SELECT id, title, description, "contentJson", "contentText", summary, "isTrashed", "isPinned", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
        [id, userId]
      );
      const row = rows[0] || null;
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch(_parseErr){ console.warn('Stored note content could not be parsed'); } }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
        row.isPinned = !!(row.isPinned === true || row.isPinned === 1 || row.isPinned === '1' || row.isPinned === 't'); // WP-APP-007
        await attachTags([row]);
      }
      return row;
    },
    async update({ where: { id }, data }) {
      let now = new Date().toISOString();
      if (data.expectedUpdatedAt) {
        const expectedMs = Date.parse(data.expectedUpdatedAt);
        if (Number.isFinite(expectedMs) && Date.parse(now) <= expectedMs) {
          now = new Date(expectedMs + 1).toISOString();
        }
      }
      const sets = [];
      const params = [];
      let idx = 1;
      if(data.title !== undefined){ sets.push(`title = $${idx++}`); params.push(data.title || 'Untitled'); }
      if(data.description !== undefined){ sets.push(`description = $${idx++}`); params.push(String(data.description)); }
      else if(data.contentText !== undefined){ sets.push(`description = $${idx++}`); params.push(String(data.contentText)); }
      if(data.contentJson !== undefined){
        const jsonStr = data.contentJson ? (typeof data.contentJson === 'string' ? data.contentJson : JSON.stringify(data.contentJson)) : null;
        sets.push(`"contentJson" = $${idx++}`); params.push(jsonStr);
      }
      if(data.contentText !== undefined){ sets.push(`"contentText" = $${idx++}`); params.push(String(data.contentText)); }
      if(data.summary !== undefined){ sets.push(`summary = $${idx++}`); params.push(data.summary); }
      if(data.isTrashed !== undefined){
        if(usePostgres){ sets.push(`"isTrashed" = $${idx++}`); params.push(!!data.isTrashed); }
        else { sets.push(`"isTrashed" = $${idx++}`); params.push(data.isTrashed ? 1 : 0); }
        if(data.isTrashed){
          sets.push(`"trashedAt" = $${idx++}`); params.push(data.trashedAt || now);
        } else {
          sets.push(`"trashedAt" = $${idx++}`); params.push(null);
        }
      } else if(data.trashedAt !== undefined){
        sets.push(`"trashedAt" = $${idx++}`); params.push(data.trashedAt);
      }
      // WP-APP-005 — assign/unfile notebook (null = unfiled)
      if (data.notebookId !== undefined){
        sets.push(`"notebookId" = $${idx++}`); params.push(data.notebookId || null);
      }
      // WP-APP-007 — pin/unpin (SQLite stores booleans as 0/1)
      if (data.isPinned !== undefined){
        sets.push(`"isPinned" = $${idx++}`);
        params.push(usePostgres ? !!data.isPinned : (data.isPinned ? 1 : 0));
      }
      sets.push(`"updatedAt" = $${idx++}`); params.push(now);
      const idParam = idx++;
      params.push(id);
      let whereClause = `id = $${idParam}`;
      if (data.expectedUpdatedAt !== undefined) {
        // WP-AUDIT-M2 — rows stamped by DB-default NOW() carry full timestamptz
        // precision; an uncast parameter let Postgres pick text/timestamp
        // semantics and spuriously miss. Pin the type on the pg dialect.
        // NOTE: the leading `$` is load-bearing — without it the clause embeds
        // the raw index (e.g. `AND "updatedAt" = 3`) and keeps one extra bound
        // parameter, which SQLite rejects with SQLITE_RANGE.
        whereClause += ` AND "updatedAt" = $${idx}${usePostgres ? '::timestamptz' : ''}`;
        params.push(data.expectedUpdatedAt);
      }
      const setClause = sets.join(', ');
      const { rows } = await query(
        `UPDATE "Note" SET ${setClause} WHERE ${whereClause} RETURNING id, title, description, "contentJson", "contentText", summary, "isTrashed", "isPinned", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt"`,
        params
      );
      // WP-APP-006 — replace tag set when tagIds provided (ownership validated in controller)
      if (rows[0] && Array.isArray(data.tagIds)) {
        await setNoteTags(id, data.tagIds);
      }
      const row = rows[0];
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch(_parseErr){ console.warn('Stored note content could not be parsed'); } }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
        row.isPinned = !!(row.isPinned === true || row.isPinned === 1 || row.isPinned === '1' || row.isPinned === 't'); // WP-APP-007
        await attachTags([row]);
      }
      return row;
    },
    async delete({ where: { id } }) {
      // WP-APP-006 — explicit junction cleanup (SQLite FK actions are off by default)
      await query('DELETE FROM "NoteTag" WHERE "noteId" = $1', [id]);
      // WP-REM-001 — reminders are note-owned; FK cascades never fire on the
      // SQLite fallback, so drop them with the note they point at.
      await query('DELETE FROM "Reminder" WHERE "noteId" = $1', [id]);
      await query('DELETE FROM "Note" WHERE id = $1', [id]);
      return { id };
    },
  },
  reminder: {
    async create({ data: { noteId, userId, remindAt } }) {
      const id = randomId();
      const now = new Date().toISOString();
      const { rows } = await query(
        `INSERT INTO "Reminder" (id, "noteId", "userId", "remindAt", "isCompleted", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, ${usePostgres ? 'FALSE' : '0'}, $5, $6)
         RETURNING id, "noteId", "userId", "remindAt", "isCompleted", "completedAt", "snoozedUntil", "createdAt", "updatedAt"`,
        [id, noteId, userId, remindAt, now, now]
      );
      const row = rows[0];
      if (row) {
        row.isCompleted = !!(row.isCompleted === true || row.isCompleted === 1 || row.isCompleted === '1' || row.isCompleted === 't');
      }
      return row;
    },
    async findMany({ where: { userId, noteId, isCompleted, dueBefore } } = {}) {
      let sql = `SELECT r.id, r."noteId", r."userId", r."remindAt", r."isCompleted", r."completedAt", r."snoozedUntil", r."createdAt", r."updatedAt",
                        n.title as "noteTitle", n."isTrashed" as "noteIsTrashed"
                 FROM "Reminder" r
                 JOIN "Note" n ON n.id = r."noteId"
                 WHERE r."userId" = $1 AND n."isTrashed" = ${usePostgres ? 'FALSE' : '0'}`;
      const params = [userId];
      let idx = 2;
      if (noteId !== undefined) {
        sql += ` AND r."noteId" = $${idx++}`;
        params.push(noteId);
      }
      if (isCompleted !== undefined) {
        sql += ` AND r."isCompleted" = $${idx++}`;
        params.push(usePostgres ? !!isCompleted : (isCompleted ? 1 : 0));
      }
      if (dueBefore !== undefined) {
        sql += ` AND (r."snoozedUntil" IS NOT NULL AND r."snoozedUntil" <= $${idx} OR (r."snoozedUntil" IS NULL AND r."remindAt" <= $${idx}))`;
        params.push(dueBefore);
      }
      sql += ` ORDER BY COALESCE(r."snoozedUntil", r."remindAt") ASC`;
      const { rows } = await query(sql, params);
      return rows.map(r => ({
        ...r,
        isCompleted: !!(r.isCompleted === true || r.isCompleted === 1 || r.isCompleted === '1' || r.isCompleted === 't'),
        noteIsTrashed: !!(r.noteIsTrashed === true || r.noteIsTrashed === 1 || r.noteIsTrashed === '1' || r.noteIsTrashed === 't'),
      }));
    },
    async findFirst({ where: { id, userId } }) {
      const { rows } = await query(
        `SELECT r.id, r."noteId", r."userId", r."remindAt", r."isCompleted", r."completedAt", r."snoozedUntil", r."createdAt", r."updatedAt",
                n.title as "noteTitle"
         FROM "Reminder" r
         JOIN "Note" n ON n.id = r."noteId"
         WHERE r.id = $1 AND r."userId" = $2 LIMIT 1`,
        [id, userId]
      );
      const row = rows[0] || null;
      if (row) {
        row.isCompleted = !!(row.isCompleted === true || row.isCompleted === 1 || row.isCompleted === '1' || row.isCompleted === 't');
      }
      return row;
    },
    async findByNoteId({ noteId, userId }) {
      const { rows } = await query(
        `SELECT id, "noteId", "userId", "remindAt", "isCompleted", "completedAt", "snoozedUntil", "createdAt", "updatedAt"
         FROM "Reminder" WHERE "noteId" = $1 AND "userId" = $2 LIMIT 1`,
        [noteId, userId]
      );
      const row = rows[0] || null;
      if (row) {
        row.isCompleted = !!(row.isCompleted === true || row.isCompleted === 1 || row.isCompleted === '1' || row.isCompleted === 't');
      }
      return row;
    },
    async update({ where: { id, userId }, data }) {
      const now = new Date().toISOString();
      const sets = [];
      const params = [];
      let idx = 1;
      if (data.remindAt !== undefined) {
        sets.push(`"remindAt" = $${idx++}`);
        params.push(data.remindAt);
      }
      if (data.isCompleted !== undefined) {
        sets.push(`"isCompleted" = $${idx++}`);
        params.push(usePostgres ? !!data.isCompleted : (data.isCompleted ? 1 : 0));
        if (data.isCompleted) {
          sets.push(`"completedAt" = $${idx++}`);
          params.push(now);
        } else {
          sets.push(`"completedAt" = $${idx++}`);
          params.push(null);
        }
      }
      if (data.snoozedUntil !== undefined) {
        sets.push(`"snoozedUntil" = $${idx++}`);
        params.push(data.snoozedUntil);
      }
      sets.push(`"updatedAt" = $${idx++}`);
      params.push(now);
      params.push(id, userId);
      const idParam = idx++;
      const userParam = idx;
      const { rows } = await query(
        `UPDATE "Reminder" SET ${sets.join(', ')} WHERE id = $${idParam} AND "userId" = $${userParam}
         RETURNING id, "noteId", "userId", "remindAt", "isCompleted", "completedAt", "snoozedUntil", "createdAt", "updatedAt"`,
        params
      );
      const row = rows[0] || null;
      if (row) {
        row.isCompleted = !!(row.isCompleted === true || row.isCompleted === 1 || row.isCompleted === '1' || row.isCompleted === 't');
      }
      return row;
    },
    async delete({ where: { id, userId } }) {
      const { rows } = await query(`DELETE FROM "Reminder" WHERE id = $1 AND "userId" = $2 RETURNING id`, [id, userId]);
      return rows[0] || null;
    },
    async deleteByNoteId({ noteId, userId }) {
      await query(`DELETE FROM "Reminder" WHERE "noteId" = $1 AND "userId" = $2`, [noteId, userId]);
    },
  },
  pushSubscription: {
    async upsert({ userId, endpoint, p256dh, auth }) {
      const now = new Date().toISOString();
      const id = randomId();
      const col = usePostgres ? 'EXCLUDED' : 'excluded';
      // A device endpoint can only ever belong to the account that most
      // recently subscribed it: re-registering the same endpoint from another
      // session moves ownership instead of leaving the old user's notifications
      // pointed at the new user's browser.
      const { rows } = await query(
        `INSERT INTO "PushSubscription" (id, "userId", endpoint, p256dh, auth, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = ${col}.p256dh, auth = ${col}.auth, "userId" = ${col}."userId"
         RETURNING id, "userId", endpoint, "createdAt"`,
        [id, userId, endpoint, p256dh, auth, now]
      );
      return rows[0];
    },
    async findMany({ where: { userId } } = {}) {
      const { rows } = await query(
        `SELECT id, "userId", endpoint, p256dh, auth, "createdAt" FROM "PushSubscription" WHERE "userId" = $1`,
        [userId]
      );
      return rows;
    },
    async deleteByEndpoint(endpoint) {
      await query(`DELETE FROM "PushSubscription" WHERE endpoint = $1`, [endpoint]);
    },
  },

};

export default db;
export { pool, sqliteDb };
