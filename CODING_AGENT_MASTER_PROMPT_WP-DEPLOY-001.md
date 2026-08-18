# CODING AGENT MASTER PROMPT — Notin · Task WP-DEPLOY-001

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `bd0c0a1`
> (post-PR-#17). **Queue rule (locked):** this session starts only AFTER the
> WP-AI-003 and WP-SCHEMA-001 PRs merge into `main`. Branch your work from
> then-current `main`. This is the last gate before shipping — correctness
> beats speed here.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Shipped and verified on
`main`: notes engine, auth (OTP/password/refresh rotation), attachments,
shares, notebooks, tags, pins, WP-AI-001/002/002b, WP-UI-NOTES-3D-001,
WP-FUNNEL-001 — plus WP-AI-003 (chat) and WP-SCHEMA-001 (schema mirror),
which merge immediately ahead of you.

Your single task is **WP-DEPLOY-001 — production readiness gates**: four
gates in ONE PR. (1) **Fail-closed production boot.** (2) **CORS lockdown.**
(3) **GitHub Actions E2E CI** (Chromium included — Arena sandboxes cannot
download it, CI can). (4) **Backup/restore drill** appended to `RUNBOOK.md`.

Operating rules:
1. **Environment-driven gates.** When `NODE_ENV !== 'production'`, behavior
   is byte-for-byte today's behavior: SQLite fallback works, demo OTP 123456
   works keyless, CORS stays permissive. You are adding gates, not changing dev.
2. **Never log secret values.** Gate failures print WHICH variable is wrong
   and why — never its value, never a prefix of it.
3. **No new npm dependencies anywhere.** `actions/*` in workflow YAML are
   GitHub-hosted, not npm — those are allowed.
4. **Readiness, not hosting.** You do not deploy to a real host, you do not
   create secrets, you do not touch DNS. You make the repo provably safe to
   deploy.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18 on main @ bd0c0a1)

**`backend/src/server.js`:**
- L26: `const isProd = process.env.NODE_ENV === 'production'` already exists — reuse it.
- L24: `const origin = process.env.APP_ORIGIN || 'http://localhost:4173';`
- CORS is a **hand-rolled middleware** (~L39–58): helmet CSP/frameguard are
  disabled and `Content-Security-Policy: frame-ancestors *` +
  `X-Frame-Options` removal exist to allow Arena/e2b preview iframes.
  Then: unknown request origins receive `Access-Control-Allow-Origin` =
  `APP_ORIGIN`; origins containing `.e2b.app`/`localhost`/`127.0.0.1`/
  `.arena.ai`/`.proxy.` are echoed **even in production** (the hole you close
  in Spec 2); in non-production ANY origin is echoed. `Allow-Credentials:
  true`, `Vary: Origin`, OPTIONS → 204. (The `import cors from 'cors'` is
  unused legacy — leave it alone.)
- `start()` (bottom) does `await db.$connect()` then
  `app.listen(PORT, '0.0.0.0', …)`; listen stays on `0.0.0.0`.
- `/health` + `/api/health` return `{ ok, database: 'PostgreSQL'|'SQLite-fallback' }`.

**`backend/src/config/db.js`:**
- Postgres iff `DATABASE_URL` starts with `postgresql://` or `postgres://`;
  otherwise it creates the SQLite file (`prisma/notin.sqlite` by default) —
  **silently, even in production** (the hole you close in Spec 1b).
- A lazy `import('../db/migrate.js')` inside `query()` self-heals missing
  SQLite tables; `npm run db:migrate` is the explicit, idempotent migrator.

**Secrets today (warn-only fallbacks — the reason for Spec 1a):**
- `src/lib/jwt.js`: `JWT_ACCESS_SECRET || JWT_SECRET ||
  'dev-access-secret-change-me-32chars-min-ok'` (same pattern for refresh;
  only `console.warn` when unset).
- `.env.example` placeholders to reject in production:
  `change-me-access-32chars-minimum-replace-in-prod`,
  `change-me-refresh-32chars-minimum-replace-in-prod`,
  `change-me-pepper-32chars-minimum-replace`.

**`backend/src/controllers/authController.js` — demo surface audit (do NOT "fix" what is already gated):**
- L31: `const isProduction = env.NODE_ENV === 'production'` exists.
- `otpDemoRequest` (L193): returns **404** in production ✅ already gated.
- `otpResend` (L160): demo fallback requires `!mailer && !isProduction` ✅ already gated.
- `forgotPassword` (L320): token echo (`devResetToken`) requires
  `!isProduction && !mailer` ✅ already gated; production+no-SMTP logs an
  error and returns the generic message.
- **`googleCallback` (L97): the demo-OTP fallback branch (`if (!mailer)`,
  ~L138–153) has NO `isProduction` guard — in production without SMTP it
  would silently create a `123456` challenge. THIS is the one auth branch
  you change (Spec 1c).**
- L315: `env.RESET_PEPPER || env.OTP_PEPPER || 'dev-reset-pepper'` — RESET_PEPPER
  is read but NOT documented in `.env.example` (you add one line, Spec 1d).

**CI inputs:**
- `backend/playwright.config.js` already supports CI: `webServer` boots
  `npm start` and waits on `/health` when `PLAYWRIGHT_BASE_URL` is unset,
  `workers: 1`, `retries: CI?1:0`, html reporter in CI, outputDir
  `test-results`, `CHROMIUM_EXECUTABLE_PATH` honored. **Do not modify it.**
- No `.github/workflows/` exists. No `engines` field in `backend/package.json`.
- After WP-AI-003 merges there are five specs in `backend/tests/e2e/` —
  run the whole directory, never a hardcoded list.
- `RUNBOOK.md` exists; `backend/uploads/` holds image bytes (`UPLOAD_DIR`,
  default `./uploads` relative to the backend process cwd).

---

## PART 3 — THE TASK: FOUR GATES, ONE PR

### Files to CREATE
1. `.github/workflows/e2e.yml`

### Files to MODIFY
1. `backend/src/server.js` — Spec 1a (env gate) + Spec 2 (CORS)
2. `backend/src/config/db.js` — Spec 1b (no SQLite in production)
3. `backend/src/controllers/authController.js` — Spec 1c (googleCallback guard only)
4. `backend/.env.example` — Spec 1d (RESET_PEPPER + requirement comments)
5. `RUNBOOK.md` — Spec 4 (backup/restore drill appendix)
6. `PROJECT_BIBLE.md` — mark WP-DEPLOY-001 complete

### Files you must NOT modify
`playwright.config.js`, any `tests/e2e/*` expectation, `migrate.js`,
controllers/routes other than the one auth branch in Spec 1c, `authentication/`,
`frontend/`, `docs/`, `prisma/`, lockfiles (no dependency changes).

---

### Spec 1 — Fail-closed production boot

**1a — `server.js`.** Add a small `assertProductionEnv()` and call it as the
FIRST statement of `start()` (before `db.$connect()`). When `isProd`:
- Required set & non-empty: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `OTP_PEPPER`, `APP_ORIGIN`.
- Additionally, those three secrets must NOT equal their `.env.example`
  placeholder strings (exact compare).
- `DATABASE_URL` must start with `postgresql://` or `postgres://`.
- Collect ALL failures; for each print exactly one line
  `FATAL: <VAR> <reason>` (reasons like `is not set`, `is still the
  .env.example placeholder`, `must be a postgres:// URL in production`).
  If any failure → `process.exit(1)`. When not `isProd`, do nothing at all.

**1b — `db.js`.** Immediately after `isPostgresUrl` is computed: if
`!isPostgresUrl && process.env.NODE_ENV === 'production'` → one clear
`console.error` line, then `process.exit(1)` BEFORE any SQLite file handle is
created.

**1c — `authController.js`.** In `googleCallback`'s OTP-failure fallback ONLY:
change `if (!mailer)` to `if (!mailer && !isProduction)`. Production without
SMTP now falls through to the existing `throw otpErr` path (500 via the error
handler) — no demo challenge in production, ever. Do not touch the other
three demo branches; they are already production-gated.

**1d — `.env.example`.** Add `# Optional — falls back to OTP_PEPPER` +
`RESET_PEPPER=` near OTP, and above the JWT block one comment line:
`# PRODUCTION: the three change-me values below MUST be replaced — boot refuses them`.

### Spec 2 — CORS lockdown (`server.js` custom middleware only)

- Parse once at module top:
  `const allowList = origin.split(',').map(s => s.trim()).filter(Boolean);`
- **Production:** echo `req.headers.origin` ONLY if it is in `allowList`;
  otherwise send `allowList[0]` as the single static ACAO value. The
  `.e2b.app`/`localhost`/`127.0.0.1`/`.arena.ai`/`.proxy.` echo becomes
  **non-production only**.
- **Non-production:** keep today's behavior exactly (echo everything).
- Keep unchanged: `Access-Control-Allow-Credentials: true`, `Vary: Origin`,
  allowed headers/methods, OPTIONS → 204, and the helmet / `X-Frame-Options`
  removal / `frame-ancestors *` lines (iframe embedding is a separate
  concern, owned by the preview environment).

### Spec 3 — `.github/workflows/e2e.yml`

One workflow named `E2E`, triggers `push` and `pull_request` on `main`,
one job on `ubuntu-latest`. Requirements:

1. `actions/checkout@v4` → `actions/setup-node@v4` with `node-version: 22`
   and npm cache for `backend/package-lock.json` + `authentication/package-lock.json`.
2. `npm ci` in `backend/` and in `authentication/` (order: authentication
   first is fine; both are cheap).
3. `cd backend && npm run db:migrate` — must succeed.
4. `cd backend && npx playwright install --with-deps chromium`.
5. **Fail-closed smoke:** from `backend/`, run `NODE_ENV=production node src/server.js`
   with NO env; assert the exit code is non-zero AND the output contains at
   least one `FATAL:` line. Implement with plain shell (no new devDeps) —
   e.g. capture output, expect failure, grep the log, print it.
6. **Positive production boot (the deploy rehearsal):** add a
   `postgres:16-alpine` service container (`POSTGRES_USER/DB=notin`,
   `POSTGRES_PASSWORD` any throwaway, `ports: 5432:5432`, `--health-cmd
   pg_isready` options). Step: with `NODE_ENV=production`, the three secrets
   set to random non-placeholder values, `APP_ORIGIN=https://app.example.com`,
   `DATABASE_URL=postgresql://notin:<pw>@localhost:5432/notin` — run
   `npm run db:migrate`, boot the API in the background, poll `/health`
   (≤30 s) until it returns `200` with `"database":"PostgreSQL"`, then stop
   it. This step proves gates pass when config is correct.
7. `cd backend && npm run test:e2e` (whole `tests/e2e` dir; NODE_ENV
   development, `GROQ_API_KEY` unset → deterministic mock mode).
8. On failure, `actions/upload-artifact@v4` for `backend/playwright-report/`
   and `backend/test-results/` (`if: failure()`, 7-day retention).

### Spec 4 — RUNBOOK appendix: Backup & restore drill

Append a `## Backup & restore` section to `RUNBOOK.md`:
- **Postgres:** exact `pg_dump -Fc -f notin-$(date +%F).dump "$DATABASE_URL"`
  and restore via `pg_restore --clean --if-exists -d "$DATABASE_URL"` (note:
  run `npm run db:migrate` after a bare restore to converge idempotently).
- **Uploads:** `tar czf notin-uploads-$(date +%F).tgz -C backend uploads` and
  the reverse `tar xzf … -C backend`.
- **SQLite demo/dev note:** stop the API, copy `backend/prisma/notin.sqlite*`
  (or `PRAGMA wal_checkpoint(TRUNCATE)` first); labeled clearly as NOT for
  production.
- **Restore-verification checklist:** `/health` 200 with the expected
  `database` field → demo login (OTP 123456) → open a note → open an image
  attachment → `POST /api/notes/:id/summarize` returns a mock summary.
- Append one line recording that the drill was executed once in the sandbox
  (date + "SQLite-equivalent proof, noted as such" is acceptable).

### Spec 5 — `PROJECT_BIBLE.md`

Mark WP-DEPLOY-001 complete (four gates + CI live). NEXT: WP-AI-004 /
leftovers. Do not start them.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: `server.js` (all), `db.js` (top 40 lines), `authController.js`
   (~L90–160 + L190–225 + L310–365), `jwt.js` top, `.env.example`,
   `playwright.config.js`, `RUNBOOK.md`.
2. Implement Spec 1 → Spec 2. Verify dev unchanged FIRST:
   `npm start` keyless boots on SQLite; `/health` ok; demo OTP 123456 still
   works; run all request-only E2E specs.
3. Local fail matrix (each prints its own FATAL line(s), each exits 1):
   `NODE_ENV=production` with (a) nothing set · (b) only JWT_ACCESS_SECRET ·
   (c) secrets set but equal to placeholders · (d) valid secrets but
   `DATABASE_URL` missing · (e) `DATABASE_URL=sqlite-ish/`file:` value`.
   Then a positive local boot against any reachable Postgres (or state
   honestly that only CI proved it).
4. CORS curl matrix: production boot — allowed origin echoed, disallowed
   origin gets `allowList[0]` back (never its own), OPTIONS → 204;
   development boot — arbitrary origin echoed (unchanged).
5. Write Spec 3 workflow. Push → confirm the workflow runs ON YOUR PR and is
   green (including the fail-closed smoke and the Postgres rehearsal).
6. Spec 4 + Spec 5. Report in PART 7 format.

## PART 5 — DO NOT (hard constraints)

→ Do NOT change behavior when `NODE_ENV` is not `production` (dev/preview byte-identical).
→ Do NOT touch helmet, the `frame-ancestors` line, `trust proxy`, or the listen host.
→ Do NOT modify `playwright.config.js` or any E2E expectation; do NOT hardcode a spec list.
→ Do NOT add npm dependencies or engines-locked tooling; do NOT edit lockfiles.
→ Do NOT touch `authentication/`, `frontend/`, `docs/`, `prisma/`, `migrate.js` SQL.
→ Do NOT add second demo-path "fixes" — only the `googleCallback` branch is ungated; the other three are already correct.
→ Do NOT log secret values (not even prefixes) anywhere, including CI output.
→ Do NOT sign up for/deploy to any hosting provider.
→ Do NOT start WP-AI-004 or the landing-leftovers work.

## PART 6 — ACCEPTANCE CRITERIA

□ Production boot fails closed with distinct `FATAL:` lines for: missing
  secrets, placeholder secrets, missing/non-postgres DATABASE_URL — exit 1 each
□ Positive production boot against the CI Postgres service returns
  `/health` `200` with `"database":"PostgreSQL"`
□ `googleCallback` demo fallback requires `!isProduction`; the other three
  demo branches are untouched (diff shows one guarded line)
□ Dev is unchanged: keyless boot on SQLite, demo OTP 123456, every pre-existing
  E2E spec passes unmodified
□ Production CORS: only allowlisted origins echoed; preview/localhost echo
  gone in prod, intact in dev; OPTIONS → 204
□ `E2E` workflow green on this WP's own PR (Chromium install, all five
  specs, fail-closed smoke, Postgres rehearsal), artifacts on failure
□ `RUNBOOK.md` has the drill with an executed-once note; `PROJECT_BIBLE.md` updated
□ No dependency diff; no secret values in any log

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-DEPLOY-001 REPORT
1. Files created/modified:  [lists]
2. Fail-closed matrix:      [each boot → exit code + FATAL line(s)]
3. Positive boot:           [CI Postgres rehearsal result, or honest local]
4. CORS matrix:             [prod allow/deny + dev unchanged]
5. CI:                      [run URL, green/red, artifact names if red]
6. Deviations / debt:       [each justified, with severity]
7. Suggested next:          WP-AI-004 / landing leftovers — do NOT start them.
```

## APPENDIX — QUICK COMMANDS

```bash
# fail-closed spot check (expect exit 1 + FATAL lines):
cd backend && NODE_ENV=production node src/server.js
# dev boot (unchanged):
cd backend && npm start && curl -s localhost:5000/health
# full local E2E (needs Chromium; CI is the canonical runner):
cd backend && npm run test:e2e
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-AI-004** — writing assistant (continue / rephrase / shorten, inline diff).
2. **Housekeeping** — close PR #2 with a salvage-notes comment.
3. **Leftovers** — landing binaries/store/extension links; `docs/` mirror re-sync.
4. **Actual hosting** — a human follows `RUNBOOK.md` with real secrets.
