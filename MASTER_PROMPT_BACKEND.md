# MASTER PROMPT — BACKEND DEVELOPMENT (Notin Unified API)

> **What this is.** A reusable system prompt. Paste the whole file as the first
> message of any session whose job is to change `backend/`. It encodes the
> conventions actually present in the code, verified by running it on 2026-08-20 —
> not a generic Node/Express style guide, and not the idealized stack from the
> original CTO brief.
>
> **Scope.** `backend/` only. Changes to `authentication/` (app shell) or
> `frontend/` (marketing) are out of scope and have their own rules.

---

## PART 0 — GROUND TRUTH (read before writing a single line)

You are working on **Notin**, an AI note-taking platform (Evernote alternative).
The backend is a **single unified Express API on port 5000** that serves REST
endpoints, the static app shell, and the public share page.

### The stack is what it is. Do not "modernize" it.

| Layer | Reality | Common wrong assumption |
|---|---|---|
| Runtime | **Node 22, ESM** (`"type":"module"`, `import`/`export`) | Not CommonJS. No `require()`. |
| Framework | **Express 4.21** | Not Express 5, not Fastify, not Next.js route handlers |
| Language | **Plain JavaScript** | **There is no TypeScript.** No `tsconfig.json`, no types, no `.ts` files |
| DB access | **Raw SQL** through a hand-written client (`src/config/db.js`) | **Prisma is NOT installed.** No `@prisma/client`, no `prisma generate` |
| DB engines | **Postgres (prod) + `node:sqlite` (dev fallback)** | Not Supabase, not MongoDB |
| Migrations | **`src/db/migrate.js`** — imperative, idempotent SQL | Not `prisma migrate`, no migration folder |
| Validation | **Hand-written guards** in controllers | **Zod is NOT a backend dependency.** Don't import it |
| Auth | **Custom JWT via `jose`** — Bearer access token + httpOnly refresh cookie | Not NextAuth, not Supabase Auth, not Passport |
| AI | **Groq via `fetch`**, with a deterministic mock fallback | No OpenAI SDK, no LangChain, no vector DB |
| Tests | **Playwright, request-only + one browser journey** | No Jest, no Vitest, no unit tests |

**If a task seems to require a new dependency, stop and say so before installing
anything.** The backend currently audits at **0 vulnerabilities** and that is a
property worth protecting. `express-rate-limit`, `helmet`, `multer`, `bcryptjs`,
`jose`, `pg`, `cors`, `cookie-parser`, `nodemailer`, `google-auth-library`,
`dotenv`, `@sentry/node` are the entire production dependency set.

### File map

```
backend/src/
  server.js              Express app: middleware order, route mounting, boot-time env validation
  config/db.js           The database client — Postgres pool + SQLite fallback + model helpers
  config/sentry.js       No-op unless SENTRY_DSN is set
  db/migrate.js          Idempotent schema migrations, BOTH dialects
  middleware/auth.js     Bearer-token guard; sets req.userId
  lib/jwt.js             jose sign/verify (access + refresh), legacy fallback
  lib/httpSecurity.js    isOriginAllowed + CSRF helpers (single source of origin truth)
  lib/ai/provider.js     Groq calls + deterministic mocks, one exported fn per AI feature
  lib/ai/prompts.js      All prompt strings live here — never inline a prompt
  routes/*.js            Thin: mount auth, mount limiters, map path → controller
  controllers/*.js       All business logic
tests/e2e/*.spec.js      Playwright
prisma/schema.prisma     DOCUMENTATION MIRROR ONLY — never executed
```

---

## PART 1 — THE NON-NEGOTIABLE CONVENTIONS

These are extracted from the existing code. Violating one makes your diff
inconsistent with ~4,000 lines of working backend.

### 1. Every SQL statement uses `$n` placeholders — always parameterized

```js
await query('SELECT id FROM "Note" WHERE id = $1 AND "userId" = $2', [id, userId]);
```

- **Never** interpolate a value into SQL. Not once, not "just for an integer."
- `$n` is mandatory even though dev runs SQLite: `pgToSqliteQuery()` rewrites
  `$1 → ?` by regex. Writing `?` directly **breaks Postgres**.
- Table and column names are **double-quoted and camelCase**: `"Note"`,
  `"userId"`, `"isTrashed"`, `"createdAt"`. Postgres folds unquoted identifiers to
  lowercase — omitting quotes breaks production while dev still passes.
- Exception, and it is the only one: a dynamic `IN (...)` list must build
  placeholders programmatically, never values:
  ```js
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
  ```

### 2. Dual-dialect discipline

Every statement must run on **both** Postgres and SQLite. The translation layer is
one regex — it does nothing else.

- ✅ Safe: `SELECT`, `INSERT ... RETURNING`, `UPDATE ... RETURNING`, `DELETE`,
  `LOWER()`, `IN`, `LIMIT`, `ON CONFLICT DO NOTHING`.
- ❌ Unsafe: `NOW()` inside app queries (generate timestamps in JS), CTEs, window
  functions, `jsonb` operators.
- **Dialect-divergent keywords use a runtime switch, not a ban.** The search query
  does exactly this and is the pattern to copy:
  ```js
  const like = usePostgres ? 'ILIKE' : 'LIKE';
  ```
  So `ILIKE` is permitted *only* behind that switch, never written bare.
- **A placeholder may not be repeated.** `pgToSqliteQuery` rewrites every `$n` to a
  positional `?`, so reusing `$3` in two spots makes the SQLite bind count
  mismatch. Emit one placeholder per column and push the value once per slot —
  see the three-column search clause.
- Escape LIKE wildcards (`%`, `_`, `\`) in user input and put `ESCAPE '\\'` after
  **each** LIKE expression — the grammar binds it per-LIKE, not per-statement.
- Detecting rows changed: `result.rowCount` works on both paths — the SQLite branch
  maps `info.changes` onto it for you. Use `rowCount`, never `info.changes`.

### 3. IDs are generated in JavaScript, not by the database

```js
'c' + Date.now().toString(16) + crypto.randomBytes(8).toString('hex')
```

The `cuid()` SQL default exists only as a safety net. **Generate the id in the
model helper and pass it explicitly** in the `INSERT`, the way every existing
`create()` does. SQLite has no `cuid()` function — relying on the default breaks dev.

### 4. Timestamps are generated in JavaScript

`const now = new Date().toISOString();` then pass as a parameter. Never `NOW()` in
an app query — SQLite doesn't have it in the same form.

### 5. Controllers own logic; routes stay thin

A route file may only: `router.use(auth)`, declare rate limiters, and map paths to
controllers. **No business logic, no SQL, no validation in a route file.**

### 6. Database access goes through the `db` model helpers

`src/config/db.js` exports a Prisma-*shaped* object (`db.user.findUnique`,
`db.note.findMany`, `db.notebook.create`, …). It is **not Prisma** — it is
hand-written SQL behind a familiar surface.

- Prefer an existing helper. If you need a new query, **add a helper to `db.js`**
  next to its siblings rather than putting raw SQL in a controller.
- Keep the helper's return shape consistent with neighbours (aliased columns like
  `google_sub as "googleSub"` exist so callers see camelCase).

### 7. Error response shape — match the neighbourhood, exactly

The codebase uses **two** keys, and the split is deliberate:

| Area | Key | Example |
|---|---|---|
| Notes, notebooks, tags, attachments, users, AI | **`message`** | `res.status(404).json({ message: 'Note not found' })` |
| Auth router + security guards (`lib/httpSecurity.js`, refresh/logout/CSRF/origin) | **`error`** | `res.status(403).json({ error: 'Invalid origin' })` |

**Match the file you are editing.** E2E specs assert these bodies byte-for-byte;
"harmonizing" them is a breaking change, not a cleanup.

### 8. Every controller is `async` and wrapped in `try/catch`

The universal shape:

```js
export const doThing = async (req, res) => {
  const userId = req.userId;
  try {
    // 1. validate input → 400 with a specific message
    // 2. load + ownership-check → 404 if not found OR not owned
    // 3. mutate
    // 4. res.status(200).json(result)
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to do thing' });
  }
};
```

Never leak `error.message` to the client. The catch returns a fixed, friendly string.

### 9. Ownership check = `404`, never `403`

Every user-scoped query carries `AND "userId" = $n`. A note belonging to someone
else must return **`404 {"message":"Note not found"}`** — identical to a note that
doesn't exist. This is intentional: `403` confirms the resource exists and leaks
information. This behaviour is asserted by the AI E2E specs.

### 10. Status codes in use

`200` ok · `201` created (note/notebook/tag creation) · `400` validation ·
`401` unauthenticated · `403` origin/CSRF rejection · `404` missing or not owned ·
`409` duplicate name · `429` rate limited · `500` unexpected · `503` dependency down.

### 11. Idempotent no-ops return `200`, not an error

Trashing an already-trashed note returns `200` with the existing row. Restoring an
untrashed note likewise. Follow that pattern for new toggles.

### 12. Migrations are append-only and idempotent

`migrate.js` must be safe to run repeatedly (it is run twice to verify).

- The file has **two independent code paths**: the Postgres path and
  `migrateSqlite(dbPath)` (around line 215). **A new column must be added to both.**
  A migration applied to only one dialect is a broken migration — and dev will keep
  passing while production breaks, or vice versa.
- Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Postgres: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- SQLite has **no** `ADD COLUMN IF NOT EXISTS`. In `migrateSqlite`, follow the
  existing local convention for making an `ALTER` re-runnable (a `PRAGMA
  table_info` existence check, or a guarded try/catch that swallows only the
  duplicate-column error). Read the surrounding code and match it rather than
  inventing a third style.
- Verify by running `npm run db:migrate` **twice** — the second run must be clean.
- **Never edit or delete a past migration statement.** Append.
- Index every column you filter or join on.
- After adding a column, update `prisma/schema.prisma` **by hand** to keep the
  documentation mirror accurate. It is never executed.

### 13. Secrets come from `process.env`, always

No key, token, or password in source. New required variables must be added to
`backend/.env.example` **and** to the boot-time validation in `server.js` if
production cannot run without them.

### 14. Rate limiters key on the authenticated user

> Historical note: all five AI limiters originally omitted `keyGenerator` and fell
> back to IP, which meant one user could 429 a stranger behind the same NAT. See
> `AGENT_INSTRUCTION_WP-AI-005.md`.

New limiters on an authenticated router must supply a `keyGenerator` based on
`req.userId`, and must use the `ipKeyGenerator` helper for any IP fallback
(express-rate-limit v8 rejects raw `req.ip` in a custom generator for IPv6 safety).

### 15. AI code layout

- Prompts → `lib/ai/prompts.js`. Never inline a prompt string in a controller.
- Provider calls → `lib/ai/provider.js`, one exported function per feature.
- **Every AI feature must work with no `GROQ_API_KEY`**, returning a deterministic
  mock. This is how the entire E2E suite runs — no network, no spend. A feature
  that requires a live key is not finished.
- Every Groq call needs an `AbortController` timeout (existing budget: 20s).
- Return `{ result, provider }` where `provider` is `'groq'` or `'mock'`.
- AI endpoints are **read-only**: the server suggests, the client applies. Never
  write the note from an AI route.

### 16. Middleware order in `server.js` is load-bearing

`helmet` → `trust proxy` → CORS → static → `express.json` → `cookieParser` →
health → routers → error handler. Anything reading `req.body` must mount after
`express.json()`; anything reading cookies after `cookieParser()`. Adding a router
above the body parser produces a confusing `undefined` body.

### 17. `console.log` is for deliberate operational lines only

Keep: `[AI] summarize via mock`, `[SECURITY] …`, boot banner. Remove all debugging
output before declaring a task complete. Never log tokens, passwords, or secrets —
the existing `[SECURITY]` lines log a `userId` and nothing else.

---

## PART 2 — API CONTRACT GOTCHAS (verified live — these cost real debugging time)

Field names that are easy to guess wrong. Guessing produces a *valid-looking*
request that silently misbehaves.

| Endpoint | Correct field | Wrong guess | Symptom if wrong |
|---|---|---|---|
| `POST /api/notes` | **`contentText`** | `content` | Note saves with empty body; every AI call then fails a length guard |
| `POST /api/notes/:id/chat` | **`question`** | `message` | `400 Ask a question (1–500 characters)` |
| `POST /api/notes/:id/assist` | **`{action, text}`** | `selection` | `400 Select some text first (1–2000 characters)` |
| signup/signin response | **`token`** | `accessToken` | Undefined token → every later call 401 |

AI length guards: summarize needs **≥200** chars; suggest-tags needs **≥100**;
suggest-title only runs while the title is still `'Untitled'`.
Assist actions: `continue`, `rephrase`, `shorten`, `expand`.

---

## PART 3 — REQUIRED OUTPUT FORMAT

Answer every backend task in this order. Do not skip straight to code.

**1. RESTATE** — one sentence: what changes, and what stays untouched.

**2. PLAN** — before any code:
- Files to create (full paths)
- Files to modify (full paths + what changes in each)
- New env vars (and whether production boot must fail without them)
- Schema changes (and the matching `prisma/schema.prisma` mirror update)
- New dependencies — **if any, justify and ask first**
- Blast radius: which existing endpoints/tests could this break?

**3. IMPLEMENT** — smallest diff that fully does the job.
- Match surrounding style exactly (quotes, comment voice, error-key choice).
- No drive-by refactors. No reformatting untouched lines.
- Comment the *why* for anything non-obvious, in the voice of the existing comments.

**4. VERIFY** — actually run it, and paste real output:
```bash
cd backend && rm -f prisma/notin.sqlite* && npm run db:migrate   # twice, prove idempotency
# boot the server, then:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 npx playwright test --reporter=line
```
- Rate-limited endpoints: **run against a freshly migrated DB.** A stale 15-minute
  window produces phantom 429 failures that look like real bugs.
- The browser journey (`mvp-smoke.spec.js:36`) **cannot run in the Arena sandbox** —
  Chromium is unavailable. Say so; don't fake it or silently skip it.

**5. REPORT** — close with:
1. Files created
2. Files modified
3. Decisions made that weren't specified
4. Blockers, and anything you could not verify

---

## PART 4 — HARD PROHIBITIONS

- ❌ Introduce TypeScript, Prisma Client, Zod, Supabase, an ORM, or any new runtime
  dependency without asking first.
- ❌ String-interpolate anything into SQL.
- ❌ Write Postgres-only or SQLite-only SQL in shared paths (`ILIKE`, `NOW()` in app
  queries, CTEs, `jsonb` operators).
- ❌ Use unquoted or snake_case identifiers in SQL.
- ❌ Return `403` for a resource owned by another user — it must be `404`.
- ❌ Change an existing error body string, status code, or response shape.
  E2E asserts them byte-for-byte.
- ❌ Edit or remove an existing migration statement. Append only.
- ❌ Persist AI output from inside an AI route.
- ❌ Add an AI feature that can't run in mock mode without a key.
- ❌ Log secrets, tokens, or password material.
- ❌ Touch `authentication/` or `frontend/` during a backend task. If a change needs
  a client update, say so and stop — a shell-asset change also requires bumping
  `CACHE_NAME` in `authentication/sw.js`, which is a separate work package.
- ❌ Create or modify `.github/workflows/**` — the agent token lacks the `workflows`
  permission and the push will be rejected. Stage under `ci/` and tell the human.
- ❌ Weaken the production fail-closed boot or the CORS/CSRF/origin guards.
- ❌ Commit `prisma/notin.sqlite*`, `test-results/`, `playwright-report/`, `uploads/`.

---

## PART 5 — DEFINITION OF DONE

- [ ] Runs on **both** dialects — migration applied twice, cleanly, both branches written
- [ ] Every query parameterized with `$n`; identifiers double-quoted camelCase
- [ ] Every new async path has `try/catch`; no internal error text reaches the client
- [ ] Every user-scoped query filters by `userId`; foreign access returns `404`
- [ ] Input validated with a specific `400` message per failure case
- [ ] Error key (`message` vs `error`) matches the file being edited
- [ ] New env vars documented in `.env.example` (+ boot validation if prod-critical)
- [ ] `prisma/schema.prisma` mirror updated if the schema changed
- [ ] New behaviour covered by a **request-only** Playwright spec (no browser dependency)
- [ ] Full request-only suite green on a **fresh** DB — paste the output
- [ ] `npm audit --omit=dev` still reports **0 vulnerabilities**
- [ ] No stray `console.log`; no unrelated diff noise
- [ ] `PROJECT_BIBLE.md` updated: endpoints built, schema version, env vars, tech debt

---

## PART 6 — WHEN THE TASK IS AMBIGUOUS

Do not guess and do not silently pick. State the ambiguity, give the options with a
recommendation, and ask. One clarifying question costs a minute; a wrong
architectural assumption costs a rewrite.

Push back explicitly when a request would:
- add a dependency that duplicates something already present,
- break the free-tier posture (managed vector DB, always-on worker, paid queue),
- build a Phase 3+ feature while a Phase 1/2 defect is open,
- or trade away a security guard for convenience.

The honest answer — *"this works, but here's the flaw"* — is always worth more than
a clean-looking diff that hides one.
