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
  note: {
    async create({ data: { title, description, contentJson, contentText, userId } }) {
      const id = randomId();
      const now = new Date().toISOString();
      const jsonStr = contentJson ? (typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson)) : null;
      const textStr = contentText != null ? String(contentText) : (description != null ? String(description) : '');
      const desc = description != null ? String(description) : (textStr || '');
      const { rows } = await query(
        `INSERT INTO "Note" (id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "userId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "userId", "createdAt", "updatedAt"`,
        [id, title || 'Untitled', desc, jsonStr, textStr, 0, null, userId, now, now]
      );
      const row = rows[0];
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch{} }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
      }
      return row;
    },
    async findMany({ where: { userId, isTrashed }, orderBy } = {}) {
      const order = orderBy?.createdAt === 'desc' ? '"createdAt" DESC' : '"createdAt" ASC';
      let sql = `SELECT id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "userId", "createdAt", "updatedAt" FROM "Note" WHERE "userId" = $1`;
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
      sql += ` ORDER BY ${order}`;
      const { rows } = await query(sql, params);
      return rows.map(r=>{
        if(r.contentJson && typeof r.contentJson === 'string'){ try{ r.contentJson = JSON.parse(r.contentJson); }catch{} }
        r.isTrashed = !!(r.isTrashed === true || r.isTrashed === 1 || r.isTrashed === '1' || r.isTrashed === 't');
        return r;
      });
    },
    async findFirst({ where: { id, userId } }) {
      const { rows } = await query(
        `SELECT id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "userId", "createdAt", "updatedAt" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
        [id, userId]
      );
      const row = rows[0] || null;
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch{} }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
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
      sets.push(`"updatedAt" = $${idx++}`); params.push(now);
      params.push(id);
      const setClause = sets.join(', ');
      const { rows } = await query(
        `UPDATE "Note" SET ${setClause} WHERE id = $${idx} RETURNING id, title, description, "contentJson", "contentText", "isTrashed", "trashedAt", "userId", "createdAt", "updatedAt"`,
        params
      );
      const row = rows[0];
      if(row){
        if(row.contentJson && typeof row.contentJson === 'string'){ try{ row.contentJson = JSON.parse(row.contentJson); }catch{} }
        row.isTrashed = !!(row.isTrashed === true || row.isTrashed === 1 || row.isTrashed === '1' || row.isTrashed === 't');
      }
      return row;
    },
    async delete({ where: { id } }) {
      await query('DELETE FROM "Note" WHERE id = $1', [id]);
      return { id };
    },
  },
};

export default db;
export { pool, sqliteDb };
