// WP-AUDIT-M1 — unit tests for the quote-aware pg→SQLite placeholder rewrite
// and the dialect-selection behavior of config/db.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the SQLite fallback at a throwaway file BEFORE importing db.js.
const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notin-test-')), 'test.sqlite');
process.env.SQLITE_PATH = tmpDb;
delete process.env.DATABASE_URL;

const { pgToSqliteQuery } = await import('../../src/config/db.js');

test('plain placeholders rewrite $n → ?', () => {
  assert.equal(
    pgToSqliteQuery('SELECT * FROM "Note" WHERE id = $1 AND "userId" = $2'),
    'SELECT * FROM "Note" WHERE id = ? AND "userId" = ?'
  );
});

test('multi-digit placeholders rewrite', () => {
  assert.equal(pgToSqliteQuery('VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)'), 'VALUES (?,?,?,?,?,?,?,?,?,?)');
});

test('$n inside single-quoted literals is NOT rewritten', () => {
  assert.equal(
    pgToSqliteQuery("SELECT '$1' AS literal, name FROM t WHERE id = $1"),
    "SELECT '$1' AS literal, name FROM t WHERE id = ?"
  );
});

test('escaped quotes inside literals do not end the string early', () => {
  assert.equal(
    pgToSqliteQuery("SELECT 'it''s $2 here' AS x FROM t WHERE a = $1 AND b = $2"),
    "SELECT 'it''s $2 here' AS x FROM t WHERE a = ? AND b = ?"
  );
});

test('simple casts after placeholders are stripped (WP-AUDIT-M2)', () => {
  assert.equal(
    pgToSqliteQuery('UPDATE "Note" SET "updatedAt" = $1 WHERE id = $2 AND "updatedAt" = $3::timestamptz'),
    'UPDATE "Note" SET "updatedAt" = ? WHERE id = ? AND "updatedAt" = ?'
  );
});

test('casts elsewhere in the statement are untouched', () => {
  assert.equal(pgToSqliteQuery('SELECT NOW()::text'), 'SELECT NOW()::text');
});

test('no placeholders → identity', () => {
  assert.equal(pgToSqliteQuery('SELECT 1'), 'SELECT 1');
});
