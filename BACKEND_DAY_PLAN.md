# NOTIN — BACKEND COMPLETION DAY PLAN
**Date:** 2026-08-20 · **Branch:** `arena/01a01e14-notin` · **Base:** `e4a96c9`

Four advanced backend work packages, in dependency order. Each is a self-contained
agent prompt. Run them **one at a time, in this order** — later packages reuse
patterns established by earlier ones.

| # | Work package | What it closes | Depends on |
|---|---|---|---|
| 1 | WP-HISTORY-001 | Note version history (Phase 3) | WP-AI-005 ✅ done |
| 2 | WP-SEC-003 | Login lockout + token versioning (PR#2 salvage 3 & 4) | — |
| 3 | WP-API-001 | Cursor pagination + N+1 elimination | — |
| 4 | WP-OPS-001 | Deep health, request IDs, graceful shutdown | 1–3 (touches new tables) |

**Hard rules for every package** (from `MASTER_PROMPT_BACKEND.md`):
plain JS ESM · Express 4 · raw SQL with `$n` · double-quoted camelCase identifiers ·
dual dialect Postgres + `node:sqlite` · IDs/timestamps generated in JS ·
ownership failure = `404` not `403` · `message` error key in product routes,
`error` in auth/security routes · **no new dependencies** · no `.github/workflows/**`.

---
---

# PROMPT 1 — WP-HISTORY-001

See `AGENT_INSTRUCTION_WP-HISTORY-001.md` (already in the repo, committed at
`3878128`). Paste that file verbatim. Summary of scope so you can sequence the day:

- `NoteVersion` table in **both** migration paths + `prisma/schema.prisma` mirror
- `noteVersion` model helpers in `db.js`
- Snapshot-on-edit inside `updateNote` with 4 gating rules (content-bearing, actually
  changed, 120 s debounce, not trashed) and a 20-version retention cap
- `GET /:id/versions`, `GET /:id/versions/:versionId`,
  `POST /:id/versions/:versionId/restore`
- Hand-written cascades in `deleteNote` and `accountController`
- Restore limiter keyed per user — copy `aiUserKey` from `noteRoutes.js` (WP-AI-005)
- New `note-versions-smoke.spec.js`

---
---

# PROMPT 2 — WP-SEC-003

```markdown
# LM ARENA AGENT INSTRUCTION
**Feature:** WP-SEC-003 — Login lockout + global token revocation
**Phase:** Security hardening (PR #2 salvage items 3 and 4)
**Priority:** High — required before public launch
**Estimated size:** Multi-hour. Migration → model → auth flow → E2E.

## READ FIRST

Read `MASTER_PROMPT_BACKEND.md` in the repo root. It is binding. Highlights that
matter most here:
- Plain JavaScript, ESM, Express 4. No TypeScript, no Prisma Client, no Zod.
- Raw SQL, `$n` placeholders, double-quoted camelCase identifiers.
- Dual dialect: every statement must run on Postgres **and** `node:sqlite`.
- IDs and timestamps generated in JavaScript, never by the database.
- **Auth and security routes use the `error` key**, product routes use `message`.
  `userController.signin` is a product-shaped route and already uses `message` —
  keep its existing strings byte-identical.
- No new dependencies.

## CONTEXT (verified in the code)

- `backend/src/controllers/userController.js`
  - `signin` (line ~88): looks up the user, rejects Google-only accounts with
    `401 {message:'Invalid credentials — please use Google sign-in for this account'}`,
    then `bcrypt.compare` → on failure `401 {message:'Invalid credentials'}`.
    On success it mints an access token and starts a **new refresh rotation family**
    (WP-SEC-001), then responds `{ user, token, accessToken }`.
  - `signup` (line ~81) responds `201 { user, token, accessToken }`.
- `backend/src/lib/jwt.js` exports `jwtConfig`, `createAccessToken(user, minutes)`,
  `verifyAccessToken`, `verifyAnyToken`, `hashToken`, `randomToken`,
  `mintCsrfToken`, `verifyCsrfToken`.
- `backend/src/middleware/auth.js` verifies the Bearer token, sets `req.userId`,
  then confirms the account still exists via `db.user.findById`. Any throw becomes
  `401 {message:'Unauthorized'}`.
- Existing auth tables (created in `migrate.js`, both dialects):
  `otp_challenges`, `refresh_tokens`, `password_reset_tokens` — note these are
  **snake_case, unquoted** table names with `user_id` columns, unlike the quoted
  camelCase product tables. Match whichever convention the neighbouring table uses.
- `backend/src/controllers/accountController.js` deletes, in order:
  `NoteShare, Attachment, NoteTag, Note, Notebook, Tag, otp_challenges,
  password_reset_tokens, refresh_tokens, User` — inside `db.$transaction`.
- `db.$transaction(cb)` gives `cb({ query })`; it BEGIN/COMMIT/ROLLBACKs on Postgres
  and on SQLite.

## THE GAP

Two holes remain from the PR #2 security review:

1. **No login lockout.** `signin` will accept unlimited password guesses. There is a
   generic IP-based limiter on some auth routes but nothing per-account, so an
   attacker can grind one victim's password from rotating IPs.
2. **No global revocation.** Access tokens are stateless and valid for 15 minutes.
   Changing a password or nuking a refresh family does **not** invalidate an access
   token already in an attacker's hands. `auth.js` only checks that the account still
   exists.

## TASK

### Part A — per-account login lockout

New table `login_attempts` (snake_case, matching the neighbouring auth tables), in
**both** migration paths:

| Column | Postgres | SQLite |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` |
| `email_hash` | `TEXT NOT NULL` | `TEXT NOT NULL` |
| `failed_count` | `INTEGER NOT NULL DEFAULT 0` | `INTEGER NOT NULL DEFAULT 0` |
| `locked_until` | `TIMESTAMPTZ` | `TEXT` |
| `last_failure_at` | `TIMESTAMPTZ` | `TEXT` |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | `TEXT NOT NULL` |

Index: unique on `email_hash`.

**Store `email_hash`, never the raw email** — reuse `hashToken` from `lib/jwt.js`
(it is already the hashing helper for refresh/reset tokens). This keeps the table
useless to anyone who dumps it and means a lockout row exists even for emails that
were never registered, so timing does not leak account existence.

Rules:
- Threshold **10** consecutive failures → lock for **15 minutes**.
- A successful signin **resets** the row to `failed_count = 0, locked_until = NULL`.
- When locked, `signin` returns **`429 {message:'Too many failed attempts. Try again later.'}`**
  and must **not** run `bcrypt.compare` (saves CPU and removes a timing signal).
- Lockout is checked **after** the user lookup and **before** the password compare.
- A locked-out but *correct* password still returns 429 — the lock is the lock.
- Non-existent emails also record failures, so an attacker cannot distinguish
  "wrong password" from "no such account" by lockout behaviour.
- Compare `locked_until` in **JavaScript** (`Date.parse`), not SQL — timestamp types
  differ across dialects.
- Expired locks are lazily reset on the next attempt; no cleanup job.

### Part B — token versioning (global revocation)

Add column `token_version INTEGER NOT NULL DEFAULT 0` to `"User"` in **both**
migration paths (Postgres `ADD COLUMN IF NOT EXISTS`; SQLite via the
`duplicate column` try/catch idiom used throughout `migrateSqlite`).

- `createAccessToken(user, minutes)` must embed the user's current `token_version`
  as a `tv` claim. Read it from the user row that the caller already has — do not
  add a database round-trip inside `jwt.js`.
- `middleware/auth.js` already loads the user to confirm existence. Extend that same
  check: if `payload.tv !== user.token_version`, throw → the existing catch returns
  `401 {message:'Unauthorized'}`. **No new response shape.**
- **Legacy tokens:** a token minted before this change has no `tv` claim. Treat
  `undefined` as `0` so existing sessions keep working. State this in a comment.
- Bump `token_version` (single `UPDATE ... SET token_version = token_version + 1`) on:
  - successful **password reset** (`resetPassword` in `authController.js`)
  - the **refresh-replay nuke** path (WP-SEC-001 already revokes the family — add the
    version bump so the stolen *access* token dies too; the Bible records this as
    salvage item #4, "stateless access token still valid after nuke")
- Do **not** bump on ordinary logout. Logout revokes the refresh family; forcing every
  other device to re-auth on a single logout is wrong behaviour.

### Account deletion

Add `DELETE FROM login_attempts WHERE email_hash = $1` to the `accountController`
transaction, in the correct position (with the other auth-table cleanups).

## FILES TO MODIFY
- `backend/src/db/migrate.js` — `login_attempts` table + index, and `User.token_version`, in **both** paths
- `backend/prisma/schema.prisma` — mirror both changes
- `backend/src/config/db.js` — `loginAttempt` helpers (`findByEmailHash`, `recordFailure`, `reset`, `deleteByEmailHash`) and a `user.bumpTokenVersion(id)`
- `backend/src/lib/jwt.js` — embed the `tv` claim
- `backend/src/middleware/auth.js` — compare `tv` against the loaded user
- `backend/src/controllers/userController.js` — lockout check + reset in `signin`
- `backend/src/controllers/authController.js` — bump on password reset and replay nuke
- `backend/src/controllers/accountController.js` — purge `login_attempts`
- `PROJECT_BIBLE.md` — schema version, env vars if any, salvage scoreboard 3 ✅ 4 ✅

## FILES TO CREATE
- `backend/tests/e2e/auth-lockout-smoke.spec.js` — request-only

## DO NOT
- ❌ Do not store raw emails in `login_attempts`.
- ❌ Do not change `signin`'s existing 401 strings, or any other endpoint's body.
- ❌ Do not bump `token_version` on logout.
- ❌ Do not add a database round-trip inside `createAccessToken`.
- ❌ Do not lock by IP — that is already covered elsewhere and punishes shared NATs.
- ❌ Do not introduce a background cleanup job or a new dependency.
- ❌ Do not use `NOW()` in app queries, or compare timestamps in SQL.
- ❌ Do not touch `authentication/` or `frontend/`.
- ❌ Do not create or modify `.github/workflows/**`.

## ACCEPTANCE CRITERIA
- [ ] `npm run db:migrate` twice in a row is clean (idempotent), SQLite path.
- [ ] 10 wrong passwords → 11th attempt returns `429`, even with the correct password.
- [ ] A successful signin before the threshold resets the counter to 0.
- [ ] Lockout applies to unregistered emails too (no existence oracle).
- [ ] After a password reset, an access token minted **before** the reset returns
      `401` on `GET /api/notes` — proven in the spec by capturing the token first.
- [ ] A token minted **after** the reset works normally.
- [ ] Logout does **not** invalidate other devices' access tokens.
- [ ] Deleting the account removes its `login_attempts` row.
- [ ] Whole request-only suite green on a fresh DB (see command below).
- [ ] `npm audit --omit=dev` → 0 vulnerabilities; no new dependency.
- [ ] No stray `console.log`. Security logs follow the existing `[SECURITY]` style:
      user id only, never tokens or emails.

## VERIFY — run it, paste real output
```bash
cd backend
rm -f prisma/notin.sqlite* && npm run db:migrate && npm run db:migrate
# start the server, then:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 npx playwright test \
  auth-lockout-smoke ai-ratelimit-smoke ai-smoke ai-title-smoke ai-tags-smoke \
  ai-chat-smoke ai-chat-stream-smoke ai-assist-smoke auth-csrf auth-refresh-replay \
  --reporter=line
```
Run against a **fresh** DB: the AI specs share a 15-minute per-user window and a
stale DB produces phantom 429s. The browser spec `mvp-smoke.spec.js:36` cannot run
in this sandbox (no Chromium) — say so, do not fake it.

**Prove the test catches the bug:** before finalising, temporarily revert your
`auth.js` `tv` check and confirm the "old token after reset" assertion fails. A
regression test never seen red is not a regression test.

## AFTER THIS TASK
Report: files created, files modified, decisions not specified here, anything
unverified, and whether 10 attempts / 15 minutes are the right defaults now that
you have implemented it.
```

---
---

# PROMPT 3 — WP-API-001

```markdown
# LM ARENA AGENT INSTRUCTION
**Feature:** WP-API-001 — Cursor pagination and N+1 elimination on list endpoints
**Phase:** 3 (scale readiness)
**Priority:** High — the 100-row cap is a silent data-loss bug for real users
**Estimated size:** Multi-hour. Model layer → controllers → E2E.

## READ FIRST

Read `MASTER_PROMPT_BACKEND.md`. Binding. Most relevant here:
- Raw SQL, `$n` placeholders, double-quoted camelCase identifiers.
- **A placeholder may not be reused.** `pgToSqliteQuery` rewrites each `$n` to a
  positional `?`, so repeating `$3` breaks the SQLite bind count. Emit one
  placeholder per slot.
- Dialect-divergent keywords go behind the existing `usePostgres ? 'ILIKE' : 'LIKE'`
  switch — never bare.
- No CTEs, no window functions, no `NOW()` in app queries.
- Product routes use the `message` error key.
- No new dependencies.

## CONTEXT (verified in the code)

- `backend/src/controllers/noteController.js` → `getNotes` builds a filter set
  (`filter`/`trash`/`trashed`/`isTrashed`, `q`, `notebookId`, `tagId`) and calls
  `prisma.note.findMany({ where, orderBy:{createdAt:'desc'}, limit: 100 })`.
  **That `limit: 100` is a hard cap with no pagination** — user 101 notes onward are
  simply invisible. Comment says "WP-APP-004 result cap".
- `backend/src/config/db.js` → `note.findMany` composes SQL by string-appending
  `AND` clauses with an incrementing `idx` counter, pushing one param per clause.
  The search branch already demonstrates the correct multi-placeholder pattern and
  the `ESCAPE '\\'`-per-LIKE requirement.
- Tag hydration: there is a helper that loads tags for a set of note ids using a
  generated `IN ($1, $2, …)` placeholder list. Find it and reuse it — do **not**
  query tags per note in a loop.
- Sort is currently `createdAt DESC`. The app also sorts by Updated/Created/Title,
  and pinned notes float to the top.
- `GET /api/notebooks` and `GET /api/tags` return every row with counts.

## TASK

### Part A — keyset (cursor) pagination on `GET /api/notes`

Replace the silent 100-row cap with explicit, stable pagination.

Query parameters (all optional, all backward compatible):
- `limit` — default **20**, maximum **100**. Non-numeric, `<1`, or `>100` → clamp,
  do not error.
- `cursor` — opaque string returned by the previous page. Absent = first page.

Response shape changes from a bare array to:
```json
{ "items": [ ...notes... ], "nextCursor": "…" | null, "hasMore": true }
```

> **This is a breaking change to a live endpoint.** The app shell consumes the bare
> array. To avoid breaking it in the same work package: return the **new object shape
> only when `limit` or `cursor` is present in the query string**; otherwise return the
> legacy bare array (still capped at 100, unchanged). Document this dual contract in a
> comment and in the Bible as deliberate, temporary, and owned by a future client WP.

Cursor design:
- **Keyset, not OFFSET.** OFFSET degrades linearly and skips/duplicates rows when
  data changes between pages.
- Encode the sort key of the last row plus its id as a tiebreaker, base64url:
  e.g. `base64url(JSON.stringify({ v: 1, k: <sortValue>, id: <lastId> }))`.
- Use `Buffer.from(...).toString('base64url')` — built into Node, no dependency.
- A malformed or undecodable cursor → **`400 {message:'Invalid cursor'}`**. Never
  silently fall back to page one; that produces infinite loops in clients.
- The comparison clause must match the sort direction exactly and include the id
  tiebreaker, e.g. for `createdAt DESC`:
  `AND ("createdAt" < $n OR ("createdAt" = $n2 AND id < $n3))`
  — three separate placeholders, never a reused one.
- Pinned-first ordering must be preserved: `"isPinned" DESC` leads the ORDER BY, and
  the cursor therefore has to carry the pin flag too. If you conclude that pinned-first
  plus keyset is not safely expressible for a given sort, say so explicitly in your
  report and keep that sort on the legacy path rather than shipping a subtly wrong
  cursor.
- `hasMore` is computed by requesting `limit + 1` rows and trimming — do **not** run a
  second `COUNT(*)`.

### Part B — kill the N+1s

Audit `getNotes`, `GET /api/notebooks`, `GET /api/tags` for per-row queries.
- Notes must hydrate tags with **one** batched `IN (...)` query for the whole page.
- Notebook and tag counts must come from a single grouped query, not one per row.
- If you find a loop issuing one query per note/notebook/tag, replace it and note the
  before/after query count in your report.

### Part C — indexes

Add any missing index needed by the new ORDER BY / cursor comparisons, in **both**
migration paths, `IF NOT EXISTS`. At minimum a composite on
`("userId", "isPinned", "createdAt")` and the equivalent for `updatedAt`.
Do not drop or alter existing indexes.

## FILES TO MODIFY
- `backend/src/config/db.js` — cursor-aware `note.findMany`; batched hydration/counts
- `backend/src/controllers/noteController.js` — param parsing, clamping, dual response shape
- `backend/src/controllers/notebookController.js`, `tagController.js` — batched counts
- `backend/src/db/migrate.js` — new composite indexes, both paths
- `backend/prisma/schema.prisma` — mirror the new `@@index` entries
- `PROJECT_BIBLE.md` — endpoint contract, the deliberate dual shape, schema version

## FILES TO CREATE
- `backend/tests/e2e/notes-pagination-smoke.spec.js` — request-only

## DO NOT
- ❌ Do not use `OFFSET` for pagination.
- ❌ Do not reuse a `$n` placeholder.
- ❌ Do not break the legacy bare-array response when no pagination params are sent —
  the app shell depends on it and its E2E asserts it.
- ❌ Do not silently reset an invalid cursor to page one.
- ❌ Do not add a `COUNT(*)` per request to compute `hasMore`.
- ❌ Do not use CTEs or window functions (SQLite path).
- ❌ Do not change existing error strings or status codes.
- ❌ Do not touch `authentication/` or `frontend/`.
- ❌ Do not create or modify `.github/workflows/**`.

## ACCEPTANCE CRITERIA
- [ ] Seed **45** notes for one user; page through with `limit=20` and collect ids:
      3 pages, `hasMore` true→true→false, **45 unique ids, zero duplicates, zero gaps**.
- [ ] Legacy call with no params still returns a bare JSON array (not an object).
- [ ] `limit=500` clamps to 100; `limit=abc` and `limit=0` clamp to the default.
- [ ] `cursor=not-base64` → `400 {message:'Invalid cursor'}`.
- [ ] Pinned notes still sort first on page one.
- [ ] Search (`?q=`), notebook and tag filters all still work **with** pagination.
- [ ] Another user's cursor cannot leak rows: paginating as user B never returns
      user A's notes.
- [ ] Tag hydration for a 20-note page issues **one** tag query, not 20 (state how
      you measured it).
- [ ] Migration idempotent (run twice).
- [ ] Whole request-only suite green on a fresh DB.
- [ ] `npm audit --omit=dev` → 0 vulnerabilities; no new dependency.

## VERIFY — run it, paste real output
```bash
cd backend
rm -f prisma/notin.sqlite* && npm run db:migrate && npm run db:migrate
# start the server, then:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 npx playwright test --reporter=line \
  --grep-invert 'MVP journey'
```
Fresh DB, always. `mvp-smoke.spec.js:36` needs Chromium and cannot run here.

## AFTER THIS TASK
Report: files created/modified, decisions not specified, anything unverified, the
before/after query counts from Part B, and whether pinned-first keyset pagination
held up cleanly for every sort mode or needed a compromise.
```

---
---

# PROMPT 4 — WP-OPS-001

```markdown
# LM ARENA AGENT INSTRUCTION
**Feature:** WP-OPS-001 — Deep health checks, request correlation IDs, graceful shutdown
**Phase:** Production readiness (final deploy gate)
**Priority:** High — run LAST, after WP-HISTORY-001, WP-SEC-003, WP-API-001
**Estimated size:** Multi-hour.

## READ FIRST

Read `MASTER_PROMPT_BACKEND.md`. Binding. Most relevant here:
- **Middleware order in `server.js` is load-bearing:** helmet → trust proxy → CORS →
  static → `express.json` → `cookieParser` → health → routers → error handler.
  Anything reading `req.body` mounts after `express.json()`.
- Auth/security routes use the `error` key; product routes use `message`.
- No new dependencies. Use `node:crypto` for id generation.
- Never log tokens, passwords, emails, or secrets. Existing `[SECURITY]` lines log a
  user id and nothing else.

## CONTEXT (verified in the code)

- `backend/src/server.js`
  - line ~63 `app.set('trust proxy', 1)`
  - line ~106 `GET /health`, line ~109 `GET /api/health`
  - line ~152 the final error handler
  - Health currently reports which driver is active. It does **not** prove the
    database is actually reachable, so a Postgres outage still returns 200 and a
    load balancer keeps routing traffic to a broken instance.
- `backend/src/config/db.js` — `db.query(text, params)`; in **development** a failed
  Postgres query silently downgrades to SQLite, in production it throws (WP-DEPLOY-001).
- `backend/src/config/sentry.js` — no-op unless `SENTRY_DSN` is set.
- Controllers log with bare `console.error(error)`, so concurrent requests interleave
  with no way to correlate a stack trace to a request.
- `RUNBOOK.md` documents the backup/restore drill; `ci/e2e.yml` is staged but inactive.

## TASK

### Part A — deep health check

Keep `GET /health` **shallow and fast** (process liveness only — this is what a
container liveness probe hits; it must not fail because a dependency blipped).

Upgrade `GET /api/health` to a **readiness** check:
- Execute a real `SELECT 1` against the database with a **2-second timeout**.
- Response `200`:
  ```json
  { "status": "ok", "database": { "driver": "PostgreSQL", "reachable": true, "latencyMs": 3 },
    "uptimeSeconds": 1234, "version": "<git sha or package version>" }
  ```
- On database failure respond **`503`** with `{"status":"degraded", ...,"reachable":false}`
  and **no** error detail (never leak a connection string or driver stack).
- The check must **not** trigger the dev-mode SQLite downgrade. Call the driver
  directly or guard the call so a health probe can never silently mutate which
  database the process is using. **This is the subtle part — get it right and say in
  your report how you guaranteed it.**
- Add `GET /api/health/deep` **only if** you can do it without new dependencies:
  same as readiness plus upload-directory writability. Skip it otherwise and say so.

### Part B — request correlation IDs

- Generate a request id for every request: honour an inbound `X-Request-Id` when
  present and syntactically sane (≤128 chars, `[A-Za-z0-9_-]` only), otherwise
  `crypto.randomUUID()`.
- Expose it as `req.id` and echo it back as the `X-Request-Id` response header.
- Include it in the final error handler's log line and in **every** `console.error`
  in controllers, using a single shared helper (e.g. `logError(req, error, context)`
  in `backend/src/lib/logging.js`).
- The client-facing error body **does not change shape**, but the 500 response may
  now carry the request id so a user can quote it in a support ticket. If you add it,
  add it as an extra field only — do not rename or remove `message`.
- Mount the id middleware **early**, before routers, after `trust proxy`.

### Part C — graceful shutdown

- Handle `SIGTERM` and `SIGINT`: stop accepting new connections
  (`server.close()`), wait for in-flight requests up to **10 seconds**, then
  `db.$disconnect()`, then exit `0`. Force-exit `1` if the grace period expires.
- Guard against double-invocation (two signals in a row must not run teardown twice).
- Log one line per shutdown phase — no secrets.
- This matters because a rolling deploy currently kills in-flight note saves.

### Part D — operational documentation

Update `RUNBOOK.md` with: the readiness-vs-liveness distinction and which URL a load
balancer should poll, what a `503` from `/api/health` means and the first three things
to check, and how to trace a user-reported error via `X-Request-Id`.

## FILES TO CREATE
- `backend/src/lib/logging.js` — request id helper + structured error logger
- `backend/src/middleware/requestId.js`
- `backend/tests/e2e/ops-health-smoke.spec.js` — request-only

## FILES TO MODIFY
- `backend/src/server.js` — mount request id, upgrade `/api/health`, shutdown handlers
- `backend/src/config/db.js` — a health-probe query path that cannot trigger the dev downgrade
- Controllers — swap bare `console.error(error)` for the shared logger. Mechanical;
  do not change any control flow or response while doing it.
- `RUNBOOK.md`, `PROJECT_BIBLE.md`

## DO NOT
- ❌ Do not make `GET /health` depend on the database — liveness must not flap.
- ❌ Do not let the health probe trigger the dev-mode SQLite downgrade.
- ❌ Do not leak connection strings, driver internals, or stack traces to any client.
- ❌ Do not add a logging library, APM, or any dependency. `console` + `node:crypto`.
- ❌ Do not log tokens, passwords, emails, or note content.
- ❌ Do not change existing response shapes beyond the additive `X-Request-Id` header
  and the optional extra id field on 500s.
- ❌ Do not reorder existing middleware except to insert the request id in the correct place.
- ❌ Do not touch `authentication/` or `frontend/`.
- ❌ Do not create or modify `.github/workflows/**`.

## ACCEPTANCE CRITERIA
- [ ] `GET /health` returns `200` in well under a second and never queries the DB.
- [ ] `GET /api/health` returns `200` with a real measured `latencyMs`.
- [ ] With the database unreachable, `/api/health` returns **503** and `/health` still
      returns 200. **Demonstrate this** — e.g. point `DATABASE_URL` at a dead port in
      production mode — and paste the output.
- [ ] A health probe never switches the running process from Postgres to SQLite.
- [ ] Every response carries `X-Request-Id`; a sane inbound value is echoed, a hostile
      one (>128 chars or with control characters) is replaced, not reflected.
- [ ] A forced 500 logs the same request id that the client received.
- [ ] `SIGTERM` during an in-flight request lets it finish, then exits 0.
- [ ] Whole request-only suite green on a fresh DB.
- [ ] `npm audit --omit=dev` → 0 vulnerabilities; no new dependency.
- [ ] Fail-closed production boot still works (all three cases below).

## VERIFY — run it, paste real output
```bash
cd backend
rm -f prisma/notin.sqlite* && npm run db:migrate
# fail-closed boot must still refuse all three:
NODE_ENV=production node src/server.js                      # missing env
NODE_ENV=production JWT_ACCESS_SECRET=... node src/server.js # placeholder secrets
# then start dev server and:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 npx playwright test --reporter=line \
  --grep-invert 'MVP journey'
```

## AFTER THIS TASK
Report: files created/modified, decisions not specified, anything unverified, how you
guaranteed the health probe cannot trigger the dev downgrade, and whether the 10-second
drain and 2-second probe timeout are right after implementing them.
```

---
---

## END-OF-DAY CHECKLIST (human)

- [ ] All four packages committed on `arena/01a01e14-notin`
- [ ] `git mv ci/e2e.yml .github/workflows/e2e.yml` — **only you can do this**; agent
      tokens are rejected on workflow files. Until then nothing is enforced on PRs.
- [ ] Open the PR; confirm CI runs the browser journey that cannot run in the sandbox
- [ ] Then, and only then, `RUNBOOK.md` with real secrets

## A HONEST NOTE ON SCOPE

Four multi-hour backend packages in one day is aggressive. If time runs short, the
order above is also the priority order: **WP-SEC-003 (2) is the one I would not skip**
before letting real users in — unlimited password guessing is a worse launch bug than
missing pagination. WP-OPS-001 (4) is the most deferrable; nothing breaks without it,
you just debug blind.

None of these four touch the editor UI. Version history, in particular, has no client
until a separate front-end work package ships — the API will be complete and unused
until then. That is deliberate sequencing, not an oversight.
