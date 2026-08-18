# CODING AGENT MASTER PROMPT — Notin · Task WP-SCHEMA-001

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `bd0c0a1`
> (post-PR-#17). **Queue rule (locked):** this session starts only AFTER the
> WP-AI-003 PR merges into `main`. Branch your work from then-current `main`.
> File overlap with WP-AI-003: none — order is policy, not conflict avoidance.
> `migrate.js` is the live source of truth. `prisma/schema.prisma` is
> documentation only — the app does **not** run `@prisma/client`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Shipped and verified on
`main`: notes engine, auth, attachments, shares, WP-AI-001/002/002b,
WP-UI-NOTES-3D-001, WP-FUNNEL-001 (PR #17, merged 2026-08-18). WP-AI-003
(chat) lands immediately ahead of you per the locked queue; WP-DEPLOY-001
follows you. **This session is schema-only.**

Your single task is **WP-SCHEMA-001**: make `backend/prisma/schema.prisma`
describe the same database that `backend/src/db/migrate.js` actually creates,
on both Postgres and SQLite. No runtime behavior change.

Operating rules:
1. **`migrate.js` wins.** Copy tables, columns, nullability, FKs, indexes, and
   unique keys from it. Do not invent columns the CTO aspirational schema
   mentioned (workspaces, embeddings, versions, RLS, pgvector, …).
2. **Do not change the live schema.** No new `ALTER TABLE`. No edits to
   `migrate.js` except a one-line comment pointing at the synced Prisma file
   if you want a breadcrumb — prefer zero edits there.
3. **Prisma is not the runtime.** Controllers import `../config/db.js` (a
   dual-driver helper *named* `prisma`). Do not install `@prisma/client`,
   do not run `prisma generate`, do not add the `prisma` npm package.
4. **Honesty.** If a migrate.js detail cannot be expressed in Prisma, document
   it in the report — do not silently drop it.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18)

```
backend/
├── prisma/schema.prisma     ← STALE. Has User, Note, Attachment, NoteShare,
│                              OtpChallenge, RefreshToken. Missing everything
│                              added after the first cut (inventory below).
├── prisma/notin.sqlite      ← local fallback file (gitignored via *.sqlite*;
│                              never stage it, its -wal, or its -shm)
├── src/db/migrate.js        ← SOURCE OF TRUTH (migratePostgres + migrateSqlite;
│                              defines CREATE OR REPLACE FUNCTION cuid()
│                              for Postgres at line ~19 — that default is real)
├── src/config/db.js         ← dual-driver query helper (imported as `prisma`;
│                              also mints cuid-style ids in JS)
└── package.json             ← "db:generate" is an echo stub; no prisma dep
```

**Current `schema.prisma` is missing (Bible + live migrate.js):**

| Gap | Live location in migrate.js |
|---|---|
| `Note.isPinned` Boolean + `Note_isPinned_idx` | WP-APP-007 |
| `Note.notebookId` nullable FK → Notebook `ON DELETE SET NULL` + `Note_notebookId_idx` | WP-APP-005 |
| `Note.summary` TEXT (nullable) | WP-AI-001 |
| model `Notebook` (`id`, `userId`, `name`, `createdAt`, `updatedAt`, `Notebook_userId_idx`) | WP-APP-005 |
| model `Tag` (`id`, `userId`, `name`, `createdAt`, `Tag_userId_idx`) — NOTE: no `updatedAt` | WP-APP-006 |
| model `NoteTag` composite PK `(noteId, tagId)` + `createdAt` + both FKs CASCADE + two indexes | WP-APP-006 |
| model `PasswordResetToken` → table `password_reset_tokens` | WP-AUTH-003 |
| `User.notebooks` / `User.tags` / `User.passwordResetTokens` relations | implied by FKs |
| `Note.notebook` / `Note.noteTags` relations | implied by FKs |

**Already present and must stay (do not rename maps):**
`User` (`google_sub` mapped), `Note` (title/description/contentJson/contentText/
isTrashed/trashedAt/userId/timestamps, `@@index([userId])`,
`@@index([isTrashed])`, `@@map("Note")`), `Attachment`, `NoteShare`,
`OtpChallenge` → `otp_challenges`, `RefreshToken` → `refresh_tokens`.

**Dialect notes (Prisma file is Postgres-shaped, same as today):**
- SQLite uses `INTEGER 0/1` for booleans and `TEXT` ISO timestamps. Prisma
  keeps `Boolean` / `DateTime` — that is correct; do not add a second sqlite
  schema file.
- IDs are `TEXT` / `String @id`. Postgres DDL carries `DEFAULT cuid()` on
  exactly four tables — **User, Note, Notebook, Tag** — so the Prisma mirror
  keeps `@default(cuid())` on exactly those four models. Attachment /
  NoteShare / OtpChallenge / RefreshToken / PasswordResetToken ids are
  JS-supplied: `@id` WITHOUT a default.
- Tag names are **not** unique in migrate.js (uniqueness is enforced in
  application code, case-insensitive). Do **not** add `@@unique([userId, name])`.
- Same for Notebook names — no unique constraint in SQL.

**`package.json` `db:generate` today:**
```
echo 'Schema is applied via npm run db:migrate (pg driver). prisma/schema.prisma is the source of truth for the data model.'
```
That comment is a lie until you finish this WP. After sync, update the echo
string so it says migrate.js applies SQL and schema.prisma *documents* it.

---

## PART 3 — THE TASK: WP-SCHEMA-001 — SYNC PRISMA TO MIGRATE.JS

### Files to CREATE
None.

### Files to MODIFY
1. `backend/prisma/schema.prisma` — bring to parity with migrate.js
2. `backend/package.json` — honest `db:generate` echo (one string)
3. `PROJECT_BIBLE.md` — mark WP-SCHEMA-001 complete; remove the
   “prisma/schema.prisma drifts…” debt line

### Files you must NOT modify
`backend/src/db/migrate.js`, `backend/src/config/db.js`, any controller,
any route, `authentication/`, `frontend/`, `docs/`, lockfiles, sqlite files.

---

### Spec 1 — Target Prisma models (authoritative)

Keep the existing `generator` + `datasource` blocks unchanged
(`provider = "postgresql"`, `url = env("DATABASE_URL")`).

Rewrite / extend models so the file contains **exactly** these tables
(names after `@@map` / default):

```
User
Note
Notebook
Tag
NoteTag
Attachment
NoteShare
OtpChallenge          @@map("otp_challenges")
RefreshToken          @@map("refresh_tokens")
PasswordResetToken    @@map("password_reset_tokens")
```

**User** — keep current fields. Add relations:
`notebooks Notebook[]`, `tags Tag[]`, `passwordResetTokens PasswordResetToken[]`
alongside existing `notes`, `attachments`, `noteShares`, `otpChallenges`,
`refreshTokens`.

**Note** — keep current fields. Add:
```
isPinned    Boolean   @default(false) @map("isPinned")
notebookId  String?   @map("notebookId")
summary     String?   @db.Text
notebook    Notebook? @relation(fields: [notebookId], references: [id], onDelete: SetNull)
noteTags    NoteTag[]
@@index([isPinned])
@@index([notebookId])
```
Keep existing `@@index([userId])`, `@@index([isTrashed])`, `@@map("Note")`.

**Notebook**
```
id        String   @id @default(cuid())
userId    String   @map("userId")
name      String
createdAt DateTime @default(now()) @map("createdAt")
updatedAt DateTime @updatedAt @map("updatedAt")
user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
notes     Note[]
@@index([userId])
@@map("Notebook")
```

**Tag**
```
id        String   @id @default(cuid())
userId    String   @map("userId")
name      String
createdAt DateTime @default(now()) @map("createdAt")
user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
noteTags  NoteTag[]
@@index([userId])
@@map("Tag")
```

**NoteTag**
```
noteId    String   @map("noteId")
tagId     String   @map("tagId")
createdAt DateTime @default(now()) @map("createdAt")
note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
tag       Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)
@@id([noteId, tagId])
@@index([noteId])
@@index([tagId])
@@map("NoteTag")
```

**PasswordResetToken**
```
id        String    @id
userId    String    @map("user_id")
tokenHash String    @map("token_hash")
expiresAt DateTime  @map("expires_at")
usedAt    DateTime? @map("used_at")
createdAt DateTime  @default(now()) @map("created_at")
user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
@@index([userId])
@@index([tokenHash])
@@map("password_reset_tokens")
```

Attachment / NoteShare / OtpChallenge / RefreshToken: keep current field
names, `@map`s, indexes, and relations. Add nothing extra.

Match the house style already in the file (2-space indent, blank line
between field groups and relations). Do not add `///` essays.

### Spec 2 — `db:generate` honesty (`backend/package.json`)

Replace the `db:generate` script string with:
```
echo 'SQL is applied by npm run db:migrate (migrate.js). prisma/schema.prisma documents that schema; this repo does not run prisma generate.'
```

### Spec 3 — Bible

In `PROJECT_BIBLE.md`:
- COMPLETED FEATURES: add WP-SCHEMA-001 (schema.prisma now matches migrate.js).
- KNOWN TECHNICAL DEBT: delete the “prisma/schema.prisma drifts…” bullet.
- NEXT 3 PRIORITIES: WP-AI-003 (if not yet built) then WP-DEPLOY-001. Do not
  start either.
- DATABASE SCHEMA VERSION: mention that schema.prisma is now a documented
  mirror, migrate.js remains the applicator.

### Spec 4 — Verification (no Prisma CLI)

Because `@prisma/client` / `prisma` are **not** dependencies, do **not**
`npx prisma validate` (that would download a package). Instead:

1. Diff the model list against migrate.js `CREATE TABLE` names (10 tables).
2. For each table, list columns in migrate.js vs Prisma fields (after `@map`).
   They must match 1:1. Extra Prisma fields = fail. Missing columns = fail.
3. Confirm `grep -n 'model ' backend/prisma/schema.prisma` prints exactly
   the 10 models in Spec 1.
4. `grep -n 'isPinned\|notebookId\|summary\|model Notebook\|model Tag\|model NoteTag\|password_reset_tokens' backend/prisma/schema.prisma`
   — all present.
5. Confirm `git diff backend/src/db/migrate.js backend/src/config/db.js` is empty.
6. `cd backend && npm run db:migrate` still succeeds twice (idempotent; no
   schema change expected).

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read** all of `backend/src/db/migrate.js` and `backend/prisma/schema.prisma`.
   Write a gap table in your notes (do not invent).
2. Edit `schema.prisma` to Spec 1.
3. Edit `package.json` echo + `PROJECT_BIBLE.md`.
4. Run Spec 4 greps / migrate twice.
5. Report in PART 7 format.

## PART 5 — DO NOT (hard constraints)

→ Do NOT modify `migrate.js` SQL or `db.js` query helpers.
→ Do NOT add npm dependencies (`prisma`, `@prisma/client`, or anything else).
→ Do NOT run `prisma generate` / `prisma migrate` / `prisma db push`.
→ Do NOT add unique-on-name, color, icon, workspace, embedding, version, or
   RLS fields the CTO prompt dreams about.
→ Do NOT change controllers, routes, auth, landing, or AI code.
→ Do NOT commit `notin.sqlite` / `-wal` / `-shm`.
→ Do NOT start WP-AI-003 or WP-DEPLOY-001.

## PART 6 — ACCEPTANCE CRITERIA

□ `schema.prisma` has exactly the 10 models in Spec 1
□ Every migrate.js column exists as a Prisma field with the same `@map`
□ `@default(cuid())` on exactly User / Note / Notebook / Tag and nowhere else
□ Note has `isPinned`, `notebookId`, `summary`; Notebook/Tag/NoteTag/
  PasswordResetToken exist with the FKs/indexes above
□ No new unique constraints that migrate.js does not create
□ `migrate.js` and `db.js` byte-identical to HEAD
□ `npm run db:migrate` twice still succeeds
□ Bible debt line about Prisma drift is gone
□ Zero new dependencies; sqlite artifacts unstaged

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-SCHEMA-001 REPORT
1. Files modified:          [list]
2. Gap table closed:        [each missing model/column → now present]
3. migrate.js / db.js:      [confirm untouched]
4. Verification:            [model count, grep hits, migrate twice]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers / debt:         [any blockers; any technical debt discovered, with severity]
7. Suggested next:          WP-DEPLOY-001 — do NOT start it.
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-DEPLOY-001** — fail-closed production boot, CORS lock, no SQLite
   fallback in `NODE_ENV=production`, CI + Playwright Chromium.
2. **WP-AI-004** — writing assistant (continue / rephrase / shorten).
3. **Housekeeping** — close PR #2 with a salvage-notes comment.
4. Leftover landing binaries/store/extension links + `docs/` mirror re-sync.
