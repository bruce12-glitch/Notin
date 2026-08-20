# LM ARENA AGENT INSTRUCTION
**Feature:** WP-HISTORY-001 — Note version history (backend, full vertical slice)
**Phase:** 3 (Power Features)
**Priority:** High
**Estimated size:** Full working session (multi-hour). One feature, four layers: migration → model → controller → routes → E2E.

---

## READ FIRST

Before writing code, read `MASTER_PROMPT_BACKEND.md` in the repo root. It is the
binding convention document for this codebase. Every rule in it applies here.
The highlights you will trip over on this task specifically:

- **Plain JavaScript, ESM, Express 4.** No TypeScript. No Prisma Client. No Zod.
- **Raw SQL with `$n` placeholders**, identifiers double-quoted camelCase (`"Note"`, `"userId"`).
- **Dual dialect:** every statement must run on Postgres *and* `node:sqlite`.
- **IDs and timestamps are generated in JavaScript**, never by the database.
- **Ownership failure returns `404`, never `403`.**
- Note/notebook/tag/AI controllers use the **`message`** error key (not `error`).
- **Do not install any dependency.** The backend audits at 0 vulnerabilities.

---

## CONTEXT (what exists today — verified by running the code)

Notin is a unified Express API on port 5000 (`backend/`), plus a vanilla-JS + TipTap
app shell (`authentication/`) and a static marketing site (`frontend/`).

Files you will be working in or against:

- **`backend/src/db/migrate.js`** — imperative, idempotent migrations with **two
  fully separate code paths**: the Postgres path (top) and `migrateSqlite(dbPath)`
  (starts ~line 215). A column or table added to only one path is a broken migration.
  - Postgres style: `CREATE TABLE IF NOT EXISTS`, `TIMESTAMPTZ`, `REFERENCES "Note"(id) ON DELETE CASCADE`.
  - SQLite style: `TEXT` for timestamps (ISO strings, lexically comparable),
    `INTEGER` for booleans, and re-runnable `ALTER` via
    `try{ ... }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }`.
- **`backend/src/config/db.js`** — hand-written SQL behind a Prisma-*shaped* facade
  (`db.note.findFirst`, `db.note.update`, …). It is **not** Prisma.
  - `db.note.create()` generates its own id: `'c' + Date.now().toString(16) + crypto.randomBytes(8).toString('hex')`.
  - `db.note.update({ where:{id}, data })` builds a dynamic `SET` clause and returns
    the updated row via `RETURNING`.
  - `db.note.delete()` explicitly deletes `"NoteTag"` rows first, because SQLite runs
    with foreign keys off — **cascades must be written by hand**.
  - `db.query(text, params)` is available for one-off SQL.
  - `result.rowCount` works on both drivers.
- **`backend/src/controllers/noteController.js`** — `updateNote` (line ~79) is the
  single funnel for every note edit: title, contentJson, contentText, description,
  isTrashed, notebookId, tagIds, isPinned. It loads `existing` via
  `prisma.note.findFirst({ where:{ id, userId } })`, returns `404 {message:'Note not found'}`
  when absent, builds a `data` object, returns `200` with `existing` when `data` is
  empty, then calls `prisma.note.update`.
- **`backend/src/controllers/noteController.js` → `deleteNote`** (line ~192) is the
  permanent-delete path. It already hand-cascades: `DELETE FROM "NoteShare"`, then
  `deleteAttachmentsForNote(...)`, then `prisma.note.delete(...)`.
- **`backend/src/routes/noteRoutes.js`** — thin. `router.use(auth)` at the top, then
  rate limiters, then path → controller mappings.
- **`backend/src/middleware/auth.js`** — sets `req.userId`; returns
  `401 {message:'Unauthorized'}` otherwise. It runs before everything on this router.
- **`backend/src/controllers/attachmentController.js` → `ensureAttachmentCapacity`**
  is the reference pattern for enforcing a per-note cap with a `COUNT(*)` query.
- **`backend/prisma/schema.prisma`** — a hand-maintained **documentation mirror**.
  Never executed. Must be updated by hand when the schema changes.
- **`backend/tests/e2e/`** — Playwright. Most specs are **request-only** (no browser):
  they use `request.newContext()`. `ai-chat-smoke.spec.js` is a good template.
  The one browser spec (`mvp-smoke.spec.js:36`) cannot run in this sandbox.

### Autosave behaviour that makes this feature non-trivial

The editor autosaves on a **900 ms debounce**. A user typing for two minutes fires
dozens of `PUT /api/notes/:id`. A naive "snapshot on every update" writes dozens of
near-identical rows, and on a 500 MB free-tier Postgres that is a real cost problem.
The throttling rules below are the core of this task — not an afterthought.

---

## TASK (what to build)

Server-side version history for notes: automatic snapshots on meaningful edits,
a listing endpoint, a single-version fetch, and a restore endpoint.

### Data model

New table **`NoteVersion`**:

| Column | Postgres | SQLite | Notes |
|---|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` | generated in JS |
| `noteId` | `TEXT NOT NULL REFERENCES "Note"(id) ON DELETE CASCADE` | same, `REFERENCES "Note"(id) ON DELETE CASCADE` | |
| `userId` | `TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE` | same | denormalised so every query filters by owner without a join |
| `title` | `TEXT` | `TEXT` | snapshot of title **before** the edit |
| `contentJson` | `TEXT` | `TEXT` | snapshot |
| `contentText` | `TEXT` | `TEXT` | snapshot |
| `versionNumber` | `INTEGER NOT NULL` | `INTEGER NOT NULL` | 1-based, per note, monotonic |
| `createdAt` | `TIMESTAMPTZ NOT NULL` | `TEXT NOT NULL` | ISO string generated in JS |

Indexes (both dialects):
- `"NoteVersion_noteId_idx"` on `("noteId")`
- `"NoteVersion_userId_idx"` on `("userId")`

Add the table to **both** migration paths, and mirror it into
`backend/prisma/schema.prisma`.

### Snapshot rules (the heart of this task — implement exactly)

Snapshots are taken inside `updateNote`, **before** the note row is modified, and
capture the note's state **prior** to the edit. So the newest version row is always
the last-known-good previous state, and the live `Note` row is the current state.

Take a snapshot **only if all four hold**:

1. **The edit is content-bearing.** At least one of `title`, `contentJson`,
   `contentText`, `description` is actually changing. Metadata-only edits
   (`isPinned`, `notebookId`, `tagIds`, `isTrashed`, `trashedAt`) **never** snapshot.
2. **Something actually changed.** Compare the incoming value against `existing`.
   If the payload's content fields are byte-identical to the stored ones, skip.
   (Autosave frequently re-sends unchanged content.)
3. **Debounce window passed.** Skip if the note's most recent `NoteVersion` was
   created **less than 120 seconds ago**. This collapses a typing burst into one
   snapshot. Use the stored `createdAt` of the latest version; compare in JS
   (`Date.parse`), not in SQL — timestamp types differ across dialects.
4. **The note is not trashed.** If `existing.isTrashed` is truthy, skip.
   Note the existing truthiness idiom for SQLite in `ensureAttachmentCapacity`:
   `v === true || v === 1 || v === '1' || v === 't'`. Reuse it.

**Retention cap: keep at most 20 versions per note.** After inserting, delete the
oldest rows beyond 20 for that `noteId`. Do this with an explicit id-list delete
(select the ids to keep or drop, then `DELETE ... WHERE id IN (...)` with generated
`$n` placeholders) — **do not** use a correlated subquery with `LIMIT/OFFSET`, which
behaves differently across the two dialects.

**Version numbering:** `versionNumber = (SELECT MAX("versionNumber") ...) + 1`, read
in JS then written explicitly. Numbers are **never reused** even after pruning — if
versions 1–20 exist and 1 is pruned, the next is 21.

**A snapshot failure must never fail the user's save.** Wrap the whole snapshot
block in its own `try/catch`, log with `console.error`, and continue with the update.
Losing a version is acceptable; losing the user's edit is not.

### Endpoints (all authenticated, all owner-scoped, all `404` on foreign notes)

**`GET /api/notes/:id/versions`**
- Verify the note exists and is owned → else `404 {message:'Note not found'}`.
- Returns `200` with a JSON **array**, newest first, of:
  `{ id, versionNumber, title, createdAt, contentLength }`
  where `contentLength` is `contentText?.length ?? 0`.
- **Deliberately omits the content bodies** so the list stays small.
- Empty array (not 404) when the note has no versions yet.

**`GET /api/notes/:id/versions/:versionId`**
- Owner-scoped on both the note and the version.
- `404 {message:'Version not found'}` if the version doesn't exist, belongs to
  another note, or belongs to another user.
- Returns `200` with `{ id, noteId, versionNumber, title, contentJson, contentText, createdAt }`.

**`POST /api/notes/:id/versions/:versionId/restore`**
- Snapshots the note's **current** state first (bypassing the 120 s debounce — an
  explicit restore must always be undoable), then overwrites the note's `title`,
  `contentJson`, `contentText`, and `description` from the version.
- `description` follows the existing convention in `updateNote`: it mirrors
  `contentText`.
- Also bumps the note's `updatedAt`.
- Returns `200` with the **full updated note object**, the same shape
  `PUT /api/notes/:id` returns, so the client can swap it straight into state.
- `400 {message:'Restore the note before editing'}` if the note is trashed.
- `404` for a missing/foreign note or version.

### Cascade

Permanent note deletion must remove its versions. Add an explicit
`DELETE FROM "NoteVersion" WHERE "noteId" = $1 AND "userId" = $2` to `deleteNote`,
alongside the existing `NoteShare` and attachment cleanup. **SQLite runs with foreign
keys off — the `ON DELETE CASCADE` in the schema will not fire.** Follow the existing
hand-cascade pattern.

Account deletion (`accountController.js`) must also purge `NoteVersion` rows for that
user. Find the existing cascade there and add the table in the correct order
(children before parents).

### Rate limiting

Add a limiter to the **restore** endpoint only: 30 per 15 minutes.
**It must be keyed by user, not IP** — use the same `keyGenerator` approach described
in `AGENT_INSTRUCTION_WP-AI-005.md` (`req.userId`, with the `ipKeyGenerator` helper
for the fallback). The two read endpoints are cheap and need no limiter.

---

## FILES TO CREATE

- `backend/tests/e2e/note-versions-smoke.spec.js` — request-only Playwright spec.

## FILES TO MODIFY

- `backend/src/db/migrate.js` — `NoteVersion` table + 2 indexes, in **both** the
  Postgres path and `migrateSqlite`.
- `backend/prisma/schema.prisma` — add the `NoteVersion` model (documentation mirror;
  match the existing style, `@@index` entries included).
- `backend/src/config/db.js` — add a `noteVersion` model helper next to `note`:
  `create`, `findManyByNote`, `findFirst`, `countByNote`, `deleteOldest`/`pruneToLimit`,
  `latestForNote`, `maxVersionNumber`, `deleteManyByNote`.
- `backend/src/controllers/noteController.js` — snapshot logic in `updateNote`;
  version cleanup in `deleteNote`; three new exported controllers
  (`listNoteVersions`, `getNoteVersion`, `restoreNoteVersion`).
- `backend/src/routes/noteRoutes.js` — three routes + the restore limiter.
- `backend/src/controllers/accountController.js` — purge versions on account delete.
- `PROJECT_BIBLE.md` — API endpoints built, schema version, completed features.

---

## DO NOT

- ❌ Do **not** install any dependency. No diffing library, no ORM, no UUID package.
- ❌ Do **not** snapshot on metadata-only edits (pin, notebook, tags, trash).
- ❌ Do **not** let a snapshot failure break the note save.
- ❌ Do **not** store a diff/patch format. Full snapshots only — simpler, and the
  20-version cap bounds the cost.
- ❌ Do **not** return `403` for another user's note or version. It is `404`.
- ❌ Do **not** use `NOW()`, `ILIKE` bare, CTEs, or window functions.
  (`ILIKE` is permitted **only** behind the existing `usePostgres ? 'ILIKE' : 'LIKE'`
  switch — you should not need it here at all.)
- ❌ Do **not** reuse a `$n` placeholder twice in one statement — `pgToSqliteQuery`
  rewrites each to a positional `?` and the bind count would mismatch.
- ❌ Do **not** rely on `ON DELETE CASCADE` firing in SQLite. Hand-cascade.
- ❌ Do **not** change any existing endpoint's response shape, status code, or error
  string. The E2E suite asserts them byte-for-byte.
- ❌ Do **not** edit or remove an existing migration statement. Append only.
- ❌ Do **not** touch `authentication/` or `frontend/`. This is a backend-only work
  package. The editor UI for history is a **separate** future work package — say so
  in your report rather than starting it. (A shell change would also require bumping
  `CACHE_NAME` in `authentication/sw.js`.)
- ❌ Do **not** create or modify `.github/workflows/**` — the agent token lacks the
  `workflows` permission and the push will be rejected.

---

## ACCEPTANCE CRITERIA

Functional:
- [ ] `npm run db:migrate` run **twice** in a row is clean both times (idempotent),
      on the SQLite path.
- [ ] Editing a note's content creates exactly **one** version row capturing the
      **previous** state.
- [ ] A second content edit **within 120 s** creates **no** new version.
- [ ] A metadata-only edit (`{"isPinned":true}`) creates **no** version.
- [ ] Re-sending byte-identical content creates **no** version.
- [ ] `GET /api/notes/:id/versions` returns newest-first, with `contentLength` and
      **no** content bodies.
- [ ] `GET /api/notes/:id/versions/:versionId` returns the full snapshot.
- [ ] Restore overwrites the note, returns the full note object, and itself creates
      a version of the pre-restore state (so restore is undoable).
- [ ] The 20-version cap prunes oldest-first while `versionNumber` keeps climbing.
- [ ] Another user gets `404` on all three endpoints.
- [ ] Unauthenticated requests get `401 {message:'Unauthorized'}`.
- [ ] Permanent-deleting a note removes its versions (verify with a direct
      `SELECT COUNT(*)`).

Quality:
- [ ] No new dependency in `backend/package.json`.
- [ ] `npm audit --omit=dev` still reports **0 vulnerabilities**.
- [ ] Every new query parameterized with `$n`; identifiers double-quoted camelCase.
- [ ] Every new async path has `try/catch`; no internal error text reaches the client.
- [ ] No stray `console.log`.
- [ ] `prisma/schema.prisma` mirror updated.

Verification — run it and paste the real output:
```bash
cd backend
rm -f prisma/notin.sqlite* && npm run db:migrate && npm run db:migrate   # twice
# start the server, then in another shell:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 npx playwright test \
  note-versions-smoke ai-smoke ai-title-smoke ai-tags-smoke ai-chat-smoke \
  ai-chat-stream-smoke ai-assist-smoke auth-csrf auth-refresh-replay --reporter=line
```
Expected: **9 passed**.

> **Run against a freshly migrated database.** The AI specs share a 15-minute
> rate-limit window; a stale DB produces phantom `429` failures that look like real
> bugs and will waste your time.

> The browser journey `mvp-smoke.spec.js:36` **cannot** run in this sandbox
> (Chromium unavailable). Do not attempt to fix it, and do not report it as a
> failure you caused — state that it needs CI.

### E2E spec requirements — `note-versions-smoke.spec.js`

Request-only, following `ai-chat-smoke.spec.js`. Contract gotchas that will cost you
time if you guess:

- Signup response field is **`token`** (not `accessToken`).
- Create-note takes **`contentText`** (not `content`). Wrong field ⇒ empty note.
- Use `try/finally` to `dispose()` every request context.
- To test the 120 s debounce **without waiting two minutes**: assert the *negative*
  case (a second immediate edit creates no version), and cover pruning by inserting
  versions through the model layer or by spacing logic you can control. **Do not add
  a `sleep(120_000)` to the suite.** If you cannot test the positive re-snapshot path
  without sleeping, say so in your report rather than slowing the suite down.

---

## AFTER THIS TASK

Report:
1. Files created (list)
2. Files modified (list)
3. Decisions you made that were not specified here
4. Anything you could not verify, and why
5. Whether you believe the 120 s debounce and 20-version cap are the right defaults
   after implementing them — you now know things about this code that the spec author
   did not.
