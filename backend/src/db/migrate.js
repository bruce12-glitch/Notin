import 'dotenv/config';
import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || '';
const isPostgresUrl = DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://');

async function migratePostgres(pool) {
  console.log('Running PostgreSQL migrations...');

  // Create cuid helper for id generation if not exists (fallback, but we generate ids in JS)
  await pool.query(`
    CREATE OR REPLACE FUNCTION cuid() RETURNS TEXT AS $$
    DECLARE ts TEXT; rand TEXT;
    BEGIN
      ts := to_hex((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint);
      rand := substr(md5(random()::text || clock_timestamp()::text), 1, 16);
      RETURN 'c' || ts || rand;
    END; $$ LANGUAGE plpgsql;
  `);

  // User table — create if not exists, then alter to match unified schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "User" (
      id TEXT PRIMARY KEY DEFAULT cuid(),
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      password TEXT,
      google_sub TEXT UNIQUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Ensure columns exist for existing DBs (old schema had username NOT NULL, password NOT NULL, no google_sub)
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS username TEXT;`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS password TEXT;`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS google_sub TEXT;`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  // Make existing NOT NULL constraints relaxed — postgres doesn't easily alter via IF NOT EXISTS, use DO block
  await pool.query(`
    DO $$ BEGIN
      BEGIN
        ALTER TABLE "User" ALTER COLUMN username DROP NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;
      BEGIN
        ALTER TABLE "User" ALTER COLUMN password DROP NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;
    $$;
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "User_google_sub_key" ON "User"(google_sub);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"(email);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Note" (
      id TEXT PRIMARY KEY DEFAULT cuid(),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      "contentJson" TEXT,
      "contentText" TEXT,
      "isTrashed" BOOLEAN DEFAULT FALSE,
      "trashedAt" TIMESTAMPTZ,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "contentJson" TEXT;`);
  await pool.query(`ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "contentText" TEXT;`);
  await pool.query(`ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "isTrashed" BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMPTZ;`);
  // Ensure existing nulls become false
  await pool.query(`UPDATE "Note" SET "isTrashed" = FALSE WHERE "isTrashed" IS NULL;`);
  // WP-APP-007 — pin notes: isPinned boolean (default false; existing notes → false)
  await pool.query(`ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN DEFAULT FALSE;`);
  await pool.query(`UPDATE "Note" SET "isPinned" = FALSE WHERE "isPinned" IS NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "Note_isPinned_idx" ON "Note" ("isPinned");`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note" ("userId");`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "Note_isTrashed_idx" ON "Note" ("isTrashed");`);

  // WP-APP-005 — Notebooks (minimal): table + nullable FK on Note (unfiled = NULL)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Notebook" (
      id TEXT PRIMARY KEY DEFAULT cuid(),
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "Notebook_userId_idx" ON "Notebook" ("userId");`);
  await pool.query(`
    DO $$ BEGIN
      BEGIN
        ALTER TABLE "Note" ADD COLUMN "notebookId" TEXT REFERENCES "Notebook"(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END;
    $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "Note_notebookId_idx" ON "Note" ("notebookId");`);

  // WP-APP-006 — Tags (minimal): Tag + NoteTag junction (composite PK, CASCADE both sides)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Tag" (
      id TEXT PRIMARY KEY DEFAULT cuid(),
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "Tag_userId_idx" ON "Tag" ("userId");`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "NoteTag" (
      "noteId" TEXT NOT NULL REFERENCES "Note"(id) ON DELETE CASCADE,
      "tagId" TEXT NOT NULL REFERENCES "Tag"(id) ON DELETE CASCADE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("noteId", "tagId")
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "NoteTag_noteId_idx" ON "NoteTag" ("noteId");`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "NoteTag_tagId_idx" ON "NoteTag" ("tagId");`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS otp_challenges_user_id_idx ON otp_challenges(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS otp_challenges_expires_at_idx ON otp_challenges(expires_at);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);`);

  // WP-AUTH-003 — password reset tokens (HASH only; single-use; ~60 min TTL)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens(token_hash);`);

  console.log('✅ PostgreSQL migrations complete');
}

function migrateSqlite(dbPath) {
  console.log(`Running SQLite fallback migrations at ${dbPath}...`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  // Use TEXT for timestamps (ISO strings) so JS ISO comparisons work lexical
  db.exec(`
    CREATE TABLE IF NOT EXISTS "User" (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      password TEXT,
      google_sub TEXT UNIQUE,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Ensure indexes
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"(email) WHERE email IS NOT NULL;`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "User_google_sub_key" ON "User"(google_sub) WHERE google_sub IS NOT NULL;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS "Note" (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      "contentJson" TEXT,
      "contentText" TEXT,
      "isTrashed" INTEGER DEFAULT 0,
      "trashedAt" TEXT,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Option A: add TipTap JSON + plain text columns (idempotent)
  try{ db.exec(`ALTER TABLE "Note" ADD COLUMN "contentJson" TEXT`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
  try{ db.exec(`ALTER TABLE "Note" ADD COLUMN "contentText" TEXT`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
  // WP-APP-003: soft delete
  try{ db.exec(`ALTER TABLE "Note" ADD COLUMN "isTrashed" INTEGER DEFAULT 0`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
  try{ db.exec(`ALTER TABLE "Note" ADD COLUMN "trashedAt" TEXT`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
  try{ db.exec(`UPDATE "Note" SET "isTrashed" = 0 WHERE "isTrashed" IS NULL`); }catch{}
  // WP-APP-007: pin notes — default 0 (existing notes → unpinned)
  try{ db.exec(`ALTER TABLE "Note" ADD COLUMN "isPinned" INTEGER DEFAULT 0`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
  try{ db.exec(`UPDATE "Note" SET "isPinned" = 0 WHERE "isPinned" IS NULL`); }catch{}
  try{ db.exec(`CREATE INDEX IF NOT EXISTS "Note_isPinned_idx" ON "Note" ("isPinned")`); }catch{}
  db.exec(`CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note" ("userId");`);
  try{ db.exec(`CREATE INDEX IF NOT EXISTS "Note_isTrashed_idx" ON "Note" ("isTrashed")`); }catch{}

  // WP-APP-005 — Notebooks (minimal): table + nullable FK on Note (unfiled = NULL)
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Notebook" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS "Notebook_userId_idx" ON "Notebook" ("userId");`);
  try{ db.exec(`ALTER TABLE "Note" ADD COLUMN "notebookId" TEXT REFERENCES "Notebook"(id) ON DELETE SET NULL`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
  db.exec(`CREATE INDEX IF NOT EXISTS "Note_notebookId_idx" ON "Note" ("notebookId");`);

  // WP-APP-006 — Tags (minimal): Tag + NoteTag junction (composite PK, CASCADE both sides)
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Tag" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS "Tag_userId_idx" ON "Tag" ("userId");`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS "NoteTag" (
      "noteId" TEXT NOT NULL REFERENCES "Note"(id) ON DELETE CASCADE,
      "tagId" TEXT NOT NULL REFERENCES "Tag"(id) ON DELETE CASCADE,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY ("noteId", "tagId")
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS "NoteTag_noteId_idx" ON "NoteTag" ("noteId");`);
  db.exec(`CREATE INDEX IF NOT EXISTS "NoteTag_tagId_idx" ON "NoteTag" ("tagId");`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS otp_challenges_user_id_idx ON otp_challenges(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS otp_challenges_expires_at_idx ON otp_challenges(expires_at);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);`);

  // WP-AUTH-003 — password reset tokens (HASH only; single-use; ~60 min TTL)
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens(token_hash);`);
  db.close();
  console.log('✅ SQLite fallback migrations complete');
}

async function migrate() {
  console.log('Running migrations...');
  console.log(`DATABASE_URL: ${DATABASE_URL ? DATABASE_URL.replace(/:[^:@/]+@/, ':***@') : '(using SQLite fallback)'}`);

  // Try Postgres first if URL looks like postgres
  if (isPostgresUrl) {
    const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });
    try {
      const client = await pool.connect();
      // quick test
      await client.query('SELECT 1');
      client.release();
      await migratePostgres(pool);
      await pool.end();
      return;
    } catch (e) {
      console.warn(`⚠️  Postgres connection failed (${e.message}), falling back to SQLite for local dev...`);
      try { await pool.end(); } catch {}
      // fall through to sqlite
    }
  } else {
    console.log('No postgres URL detected, using SQLite fallback');
  }

  // SQLite fallback path
  // Prefer DATABASE_URL file: path if it starts with file:
  let sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../../prisma/notin.sqlite');
  if (DATABASE_URL.startsWith('file:')) {
    sqlitePath = DATABASE_URL.slice(5);
  } else if (DATABASE_URL && DATABASE_URL.includes('.sqlite')) {
    sqlitePath = DATABASE_URL;
  }
  // Ensure dir exists
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  migrateSqlite(sqlitePath);
}

migrate().catch(async (err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
