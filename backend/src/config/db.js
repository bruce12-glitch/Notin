import pg from 'pg';
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
  });
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error', err);
  });
} else {
  try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
  sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA journal_mode = WAL');
}

function pgToSqliteQuery(text) {
  return text.replace(/\$(\d+)/g, '?');
}
function randomId() {
  return 'c' + Date.now().toString(16) + crypto.randomBytes(8).toString('hex');
}
async function query(text, params = []) {
  if (usePostgres && pool) {
    try {
      const result = await pool.query(text, params);
      return result;
    } catch (err) {
      const msg = String(err.message || err.code || '');
      const isConnError = msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('connect') || err.code === 'ECONNREFUSED';
      if (isConnError) {
        console.warn(`⚠️  Postgres query failed (${msg}), switching to SQLite fallback at ${sqlitePath}`);
        usePostgres = false;
        if (!sqliteDb) {
          try { fs.mkdirSync(path.dirname(sqlitePath), { recursive: true }); } catch {}
          sqliteDb = new DatabaseSync(sqlitePath);
          sqliteDb.exec('PRAGMA journal_mode = WAL');
          try {
            sqliteDb.prepare(`SELECT 1 FROM "User" LIMIT 1`).get();
          } catch {
            console.log('SQLite User table missing — creating fallback tables');
            const fallbackMigrate = (await import('../db/migrate.js')).default;
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

const db = {
  async $connect() {
    if (usePostgres && pool) {
      try {
        const client = await pool.connect();
        client.release();
        console.log('✅ Connected to PostgreSQL');
        return;
      } catch (e) {
        console.warn(`⚠️  Postgres connect failed (${e.message}), using SQLite fallback`);
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
  get usePostgres() { return usePostgres; },
  get sqlitePath() { return sqlitePath; },
  user: {
    async findUnique({ where: { email } }) {
      if (!email) return null;
      const { rows } = await query('SELECT id, username, email, password, google_sub as "googleSub", "createdAt", "updatedAt" FROM "User" WHERE email = $1 LIMIT 1', [email.trim().toLowerCase()]);
      return rows[0] || null;
    },
    async findById(id) {
      const { rows } = await query('SELECT id, username, email, password, google_sub as "googleSub", "createdAt", "updatedAt" FROM "User" WHERE id = $1 LIMIT 1', [id]);
      return rows[0] || null;
    },
    async findByGoogleSub(googleSub) {
      if (!googleSub) return null;
      const { rows } = await query('SELECT id, username, email, password, google_sub as "googleSub", "createdAt", "updatedAt" FROM "User" WHERE google_sub = $1 LIMIT 1', [googleSub]);
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
        `INSERT INTO "User" (id, email, username, password, google_sub, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, email, password, google_sub as "googleSub", "createdAt", "updatedAt"`,
        [id, normEmail, username || null, password || null, googleSub || null, now, now]
      );
      return rows[0];
    },
    async updatePassword(id, hashed) {
      const now = new Date().toISOString();
      const { rows } = await query(`UPDATE "User" SET password = $1, "updatedAt" = $2 WHERE id = $3 RETURNING id, username, email, password, google_sub as "googleSub", "createdAt", "updatedAt"`, [hashed, now, id]);
      return rows[0];
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
         RETURNING id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt"`,
        [id, title || 'Untitled', desc, jsonStr, textStr, 0, null, notebookId || null, userId, now, now]
      );
      const row = rows[0];
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch{} }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
        row.tags = row.tags || []; // WP-APP-006 — new notes start untagged
      }
      return row;
    },
    async findMany({ where: { userId, isTrashed, q, notebookId, tagId }, orderBy, limit } = {}) {
      const order = orderBy?.createdAt === 'desc' ? '"createdAt" DESC' : '"createdAt" ASC';
      let sql = `SELECT id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt" FROM "Note" WHERE "userId" = $1`;
      const params = [userId];
      let idx = 2;
      if(isTrashed !== undefined){
        if(usePostgres){
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
      // WP-APP-004 — full-text search only.
      // Case-insensitive substring match on title / contentText / description,
      // where description is only a fallback used when contentText is empty/null.
      // Postgres uses ILIKE; SQLite fallback uses LIKE (case-insensitive for ASCII).
      const needle = typeof q === 'string' ? q.trim() : '';
      if (needle) {
        // Escape LIKE wildcards so %, _ and \ in the user's query match literally
        const esc = needle.replace(/[\\%_]/g, (m) => '\\' + m);
        const pattern = `%${esc}%`;
        const like = usePostgres ? 'ILIKE' : 'LIKE';
        // NOTE: one placeholder per column (SQLite converts each $n to `?` — a
        // placeholder may not be repeated or the bind count would mismatch).
        // ESCAPE must follow EACH LIKE expression (SQL grammar binds it per-LIKE).
        sql += ` AND (
          title ${like} $${idx} ESCAPE '\\'
          OR COALESCE("contentText", '') ${like} $${idx + 1} ESCAPE '\\'
          OR (COALESCE("contentText", '') = '' AND COALESCE(description, '') ${like} $${idx + 2} ESCAPE '\\')
        )`;
        params.push(pattern, pattern, pattern);
        idx += 3;
      }
      sql += ` ORDER BY ${order}`;
      // Result cap (spec: e.g. 100) — always applied, with a hard ceiling
      const lim = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), 500) : 100;
      sql += ` LIMIT $${idx++}`;
      params.push(lim);
      const { rows } = await query(sql, params);
      const mapped = rows.map(r=>{
        if(r.contentJson && typeof r.contentJson === 'string'){ try{ r.contentJson = JSON.parse(r.contentJson); }catch{} }
        r.isTrashed = !!(r.isTrashed === true || r.isTrashed === 1 || r.isTrashed === '1' || r.isTrashed === 't');
        return r;
      });
      return attachTags(mapped); // WP-APP-006 — every note row carries tags: [{id,name}]
    },
    async findFirst({ where: { id, userId } }) {
      const { rows } = await query(
        `SELECT id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
        [id, userId]
      );
      const row = rows[0] || null;
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch{} }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
        await attachTags([row]);
      }
      return row;
    },
    async update({ where: { id }, data }) {
      const now = new Date().toISOString();
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
      sets.push(`"updatedAt" = $${idx++}`); params.push(now);
      params.push(id);
      const setClause = sets.join(', ');
      const { rows } = await query(
        `UPDATE "Note" SET ${setClause} WHERE id = $${idx} RETURNING id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "notebookId", "userId", "createdAt", "updatedAt"`,
        params
      );
      // WP-APP-006 — replace tag set when tagIds provided (ownership validated in controller)
      if (Array.isArray(data.tagIds)) {
        await setNoteTags(id, data.tagIds);
      }
      const row = rows[0];
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch{} }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
        await attachTags([row]);
      }
      return row;
    },
    async delete({ where: { id } }) {
      // WP-APP-006 — explicit junction cleanup (SQLite FK actions are off by default)
      await query('DELETE FROM "NoteTag" WHERE "noteId" = $1', [id]);
      await query('DELETE FROM "Note" WHERE id = $1', [id]);
      return { id };
    },
  },
};

export default db;
export { pool, sqliteDb };
