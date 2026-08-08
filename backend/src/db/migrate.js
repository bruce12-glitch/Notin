import db from '../config/db.js';

/**
 * Apply schema matching prisma/schema.prisma
 * Uses a simple cuid()-compatible id generator in SQL via pgcrypto-free approach.
 */
async function migrate() {
  console.log('Running migrations...');

  // cuid-like id generator (collision-resistant enough for this app)
  await db.query(`
    CREATE OR REPLACE FUNCTION cuid() RETURNS TEXT AS $$
    DECLARE
      ts TEXT;
      rand TEXT;
    BEGIN
      ts := to_hex((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint);
      rand := substr(md5(random()::text || clock_timestamp()::text), 1, 16);
      RETURN 'c' || ts || rand;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS "User" (
      id         TEXT PRIMARY KEY DEFAULT cuid(),
      username   TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS "Note" (
      id          TEXT PRIMARY KEY DEFAULT cuid(),
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note" ("userId");
  `);

  console.log('✅ Migrations complete');
  await db.$disconnect();
}

migrate().catch(async (err) => {
  console.error('❌ Migration failed:', err);
  try {
    await db.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
