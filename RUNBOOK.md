# Notin MVP Runbook

This runbook is the source of truth for running and deploying the current MVP.

## Architecture and ports

- **Unified app/API — port 5000:** `backend/src/server.js` serves the REST API plus the static authentication UI, TipTap app, and public `share.html` page from `authentication/`.
- **Marketing site — port 3000 (optional):** `frontend/dev-server.mjs` serves the Green/Neon landing pages and proxies `/api/*` and `/auth/*` to port 5000.
- **Database:** PostgreSQL in production; local development can use the ignored SQLite fallback at `backend/prisma/notin.sqlite`.
- **Files:** image attachment metadata is in the database; image bytes are in `backend/uploads/` by default.

Do **not** run the standalone authentication service on port 8787 as a source of truth. The unified process on port 5000 owns authentication, users, notes, attachments, and shares.

## Local setup

Requirements: Node.js 20+, npm, and Chromium for E2E tests.

```bash
# Browser-side TipTap dependencies / optional bundle rebuild tooling
cd authentication
npm ci
# Only needed after editing app.js:
npm run build:app

# Unified API and app
cd ../backend
npm ci
cp .env.example .env       # edit values; never commit .env
npm run db:migrate
npm start                  # http://127.0.0.1:5000
```

For local SQLite, remove/comment the example PostgreSQL `DATABASE_URL` or set `SQLITE_PATH`. For PostgreSQL, provide a real `postgresql://...` URL. Confirm startup logs and `GET /health`; production must report `"database":"PostgreSQL"` rather than silently using the development fallback.

Optional marketing site, in another process:

```bash
cd frontend
PORT=3000 API_TARGET=http://127.0.0.1:5000 node dev-server.mjs
```

## Development authentication behavior

- Demo OTP **`123456`** is available only when `NODE_ENV` is not `production` and SMTP is not configured. `/api/auth/health` reports `demoMode`.
- Forgot-password responses remain generic. When SMTP is unset and the server is not in production, the one-time 60-minute reset token/link is returned as `devResetToken`/`devResetLink` and written to server logs. Production never returns the token.
- Access tokens stay in browser memory; refresh tokens use HTTP-only cookies. Do not add token persistence to localStorage.

## Uploads and read-only shares

- `UPLOAD_DIR` defaults to `backend/uploads/` when the backend is started normally. The directory is ignored by Git; never commit uploaded files.
- Accepted images are PNG/JPEG/WebP/GIF, up to 5 MB each and 10 per note.
- Back up the uploads directory together with the database. Permanent note deletion removes its local image files.
- Share secrets are 32 random bytes; only SHA-256 hashes are stored. Public routes are `/api/public/share/:token` and `/api/public/share/:token/files/:attachmentId`.
- Public share reads expose only title/body and safely scoped note images. Revoked/invalid shares return 404. Trashed notes also return 404 publicly; restoring an enabled share makes it readable again.

## Account export & delete

Authenticated users can download JSON from `GET /api/users/me/export`. It includes their profile (never the password hash), notes and editor content, notebooks, tags, and attachment metadata; uploaded image bytes and auth/share secrets are not included. In the app, open **Account → Export data**.

`DELETE /api/users/me` requires the exact JSON body `{ "confirm": "DELETE" }`. The app requires typing `DELETE`. A successful deletion removes notes, notebooks, tags, shares, OTP/reset/refresh records, attachment rows and local files, then clears refresh cookies. Remaining access tokens fail immediately because protected requests verify that the user still exists. This operation is irreversible; export and verify backups first.

## Optional Sentry monitoring

Set `SENTRY_DSN` in the backend environment to enable `@sentry/node`. Leave it empty in development if you do not want monitoring noise. `SENTRY_ENVIRONMENT` is optional and otherwise follows `NODE_ENV`.

```bash
SENTRY_DSN=https://public-key@sentry.example/123
SENTRY_ENVIRONMENT=production
```

An empty DSN is a no-op. A malformed DSN is ignored with a warning and does not prevent startup. Reports intentionally strip request data, users, extras, and breadcrumbs; never place passwords, OTPs, refresh/access tokens, reset tokens, or share tokens in manually captured metadata.

## PWA / offline read

`/app.html` links `manifest.webmanifest` and registers `/sw.js` on HTTPS or localhost. The service worker caches only versioned static shell assets (app/share HTML, JS, CSS, manifest, and icons). It deliberately bypasses every `/api/*` and `/auth/*` request, so Bearer-authenticated responses never enter shared Cache Storage.

After successful online reads, the app stores a last-known notes/notebooks/tags snapshot in IndexedDB under the JWT user ID; no access or refresh token is persisted. The active user ID is session-only and is cleared on logout/account deletion, so another login reads only its own key. When `navigator.onLine` is false, the cached list and note body are read-only: create/edit/save, organize mutations, image loading, sharing, and account operations are disabled, and a clear offline banner is shown. This is not a sync engine—offline edits and attachment caching are intentionally unsupported.

Manual check: sign in online, open/list notes, then in Chromium DevTools set **Network → Offline** and reload `/app.html`. Confirm the shell, cached list/body, and offline banner appear and editing is disabled. Reconnect and reload to resume normal online behavior. Service-worker registration is skipped under Playwright webdriver to keep E2E deterministic; the smoke suite still verifies the manifest, worker, and icons are served.

## E2E smoke test

Install Chromium once, then run from `backend/`:

```bash
cd backend
npx playwright install chromium
npm run test:e2e
```

The default config reuses port 5000 or starts `npm start` automatically. To test an already deployed environment:

```bash
PLAYWRIGHT_BASE_URL=https://notin.example.com npm run test:e2e
```

The full journey requires development demo OTP conditions. If demo OTP is disabled, the journey is explicitly skipped while the health test still runs. The suite creates throwaway users and exercises auth, editor persistence, organization, images, share security, trash/restore/delete, and logout.

## Production checklist

- [ ] Set `NODE_ENV=production` and expose only the unified port 5000 behind HTTPS/reverse proxy.
- [ ] Use strong, independent `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `OTP_PEPPER` values; remove placeholder/legacy secrets.
- [ ] Configure a real PostgreSQL `DATABASE_URL`, run `npm run db:migrate`, and verify `/api/health` returns 200 with `"driver":"PostgreSQL"` and `"reachable":true`. Point the load balancer at `/api/health` (readiness), not `/health` (liveness).
- [ ] Configure SMTP (`SMTP_HOST`, port, user, password, sender) so OTP and reset mail can be delivered. Verify demo OTP is disabled.
- [ ] Configure Google OAuth client credentials and an exact HTTPS `GOOGLE_REDIRECT_URI` if Google sign-in is offered.
- [ ] Set the public HTTPS `APP_ORIGIN`; verify secure HTTP-only refresh cookies through the proxy.
- [ ] Put `UPLOAD_DIR` on durable storage with correct filesystem permissions; do not serve it as a public static directory.
- [ ] Schedule and test restores for PostgreSQL and `UPLOAD_DIR` (or SQLite + uploads for non-production installations).
- [ ] Optionally set and verify `SENTRY_DSN`; leave it unset to disable monitoring.
- [ ] Run `npm run test:e2e` against the release URL.
- [ ] Do not deploy or route traffic to the old port 8787 authentication server.

## Liveness vs readiness (load balancer)

Two health URLs exist on purpose. Do not point a load balancer at the wrong one.

| Probe | URL | What it proves | Failure |
|---|---|---|---|
| **Liveness** (container / process) | `GET /health` | The Node process is up. **Never queries the database.** | HTTP 200 while the process lives. A Postgres blip must **not** restart the container. |
| **Readiness** (load balancer) | `GET /api/health` | A real `SELECT 1` against the active driver, 2-second timeout. | **200** `{ "status": "ok", "database": { "driver", "reachable": true, "latencyMs" }, "uptimeSeconds", "version" }` — **503** `{ "status": "degraded", "database": { "reachable": false, … } }` with **no** error detail. |
| **Deep** (operator, optional) | `GET /api/health/deep` | Readiness plus `UPLOAD_DIR` writability. | Same 200/503 contract, plus `"uploads": { "writable": true\|false }`. |

**The load balancer / target-group health check must poll `GET /api/health`.** Use `GET /health` only as a Kubernetes/Docker **liveness** probe (restart the process if it hangs). Polling liveness for traffic routing would keep sending users to an instance whose database is down.

```bash
curl -fsS -D- http://127.0.0.1:5000/health
curl -fsS -D- http://127.0.0.1:5000/api/health
curl -fsS -D- http://127.0.0.1:5000/api/health/deep
```

### What a 503 from `/api/health` means

The process is alive but **not ready for traffic**. The JSON `status` is `"degraded"` and `database.reachable` is `false`. No connection string, host, or stack is returned.

First three things to check:

1. **Can this instance still reach Postgres?** From the same host: `psql "$DATABASE_URL" -c 'SELECT 1'` (or the provider's console). A timeout here matches a 2s probe timeout.
2. **Is `DATABASE_URL` the database you think it is?** Wrong host/db/user after a rotate, or a proxy that stopped accepting connections. Production never falls back to SQLite — a 503 is not "it's on SQLite now".
3. **Pool exhaustion / lock storm?** `latencyMs` near 2000 means the probe timed out. Check active connections, long transactions, and disk on the database host.

Liveness (`GET /health`) will still return 200 during that 503. That is correct: do not kill the process; stop routing to it until readiness recovers.

### Tracing a user-reported error via `X-Request-Id`

Every response (including 4xx/5xx and static files) carries `X-Request-Id`.

- If the client sends a sane id (`≤128` chars, `[A-Za-z0-9_-]` only) it is echoed.
- Anything else (too long, spaces, slashes, control characters) is **replaced** with a server-generated UUID — never reflected.
- Unhandled 500 bodies keep `{ "message": "Internal Server Error" }` and may add `"requestId"` so the user can quote it. Product 500s from controllers keep their existing `{ message }` / `{ error }` shape.

Ask the user for the `X-Request-Id` header (or the `requestId` field on a 500). Grep application logs for that exact token; every `console.error` from a controller is prefixed `[<id>]` via `logError`. Do **not** expect emails, tokens, passwords, or note content in those lines.

```bash
# Example: confirm echo
curl -sS -D- -H 'X-Request-Id: support-ticket-123' http://127.0.0.1:5000/api/health
```

### Graceful shutdown

`SIGTERM` / `SIGINT` stop accepting new connections (`server.close()`), wait up to **10 seconds** for in-flight requests, then `db.$disconnect()` and exit 0. A second signal is ignored (teardown is single-flight). If the grace period expires the process force-exits 1. Rolling deploys should therefore SIGTERM and wait ≥10s before SIGKILL so in-flight note saves can finish.

## Basic operational checks

```bash
curl -fsS http://127.0.0.1:5000/health
curl -fsS http://127.0.0.1:5000/api/health
curl -fsS http://127.0.0.1:5000/api/auth/health
```

A healthy deployment returns HTTP 200 from liveness and readiness. Check application logs for migration/database failures, SMTP delivery problems, unexpected SQLite fallback, and Sentry initialization warnings. Roll back application code and schema-compatible changes together; restore database/uploads from the same backup point when data recovery is required.

## Backup & restore

Back up the database and `UPLOAD_DIR` **at the same point in time** — attachment
rows reference files on disk, so a database restored without its uploads (or the
reverse) leaves broken images. Store both artifacts off-host and encrypted.

### PostgreSQL (production)

```bash
# Backup — custom format, compressed and selectively restorable
pg_dump -Fc -f notin-$(date +%F).dump "$DATABASE_URL"

# Restore into an existing database
pg_restore --clean --if-exists -d "$DATABASE_URL" notin-$(date +%F).dump

# Always converge the schema afterwards (idempotent; safe to re-run)
cd backend && npm run db:migrate
```

Run `npm run db:migrate` after a bare restore: it is idempotent and reconciles a
dump taken before a later migration shipped. `backend/prisma/schema.prisma`
documents the schema but never applies it — `migrate.js` is the only applicator.

### Uploads (image bytes)

```bash
# Backup — archive the directory UPLOAD_DIR points at (default backend/uploads)
tar czf notin-uploads-$(date +%F).tgz -C backend uploads

# Restore
tar xzf notin-uploads-$(date +%F).tgz -C backend
```

### SQLite (demo/dev only — NOT for production)

Production refuses to boot on SQLite: a non-`postgres://` `DATABASE_URL`, or an
unreachable Postgres, exits with a `FATAL:` line rather than silently falling
back. For local/demo installations only:

```bash
# Stop the API first, then collapse the WAL so a single file is consistent
sqlite3 backend/prisma/notin.sqlite 'PRAGMA wal_checkpoint(TRUNCATE);'
cp backend/prisma/notin.sqlite notin-$(date +%F).sqlite   # plus -wal/-shm if present

# Restore: stop the API, replace the file, then converge
cp notin-$(date +%F).sqlite backend/prisma/notin.sqlite
cd backend && npm run db:migrate
```

### Restore-verification checklist

Run all five after every restore, before returning traffic:

1. `curl -fsS http://127.0.0.1:5000/health` → `200`, and `database` reads
   `"PostgreSQL"` in production (`"SQLite-fallback"` only in dev/demo).
2. Sign in. In dev/demo use OTP `123456`; in production use a real mailed code
   and confirm `/api/auth/health` reports `demoMode: false`.
3. Open a pre-existing note and confirm its body renders.
4. Open an image attachment on that note — proves DB rows and `UPLOAD_DIR`
   came from the same backup point.
5. `POST /api/notes/:id/summarize` → returns a summary (mock when
   `GROQ_API_KEY` is unset), proving the AI path and write path still work.

### Drill log

- **2026-08-18 — executed once in the Arena sandbox.** SQLite-equivalent proof,
  noted as such: no Postgres or Docker is available in the sandbox, so the
  Postgres commands above are documented but were exercised only in CI (the
  `Positive production boot (Postgres rehearsal)` job step boots against a real
  `postgres:16-alpine` service and asserts `/health` reports PostgreSQL). The
  drill performed locally was: seed a note → `PRAGMA wal_checkpoint(TRUNCATE)`
  → copy the SQLite file → `tar czf` the uploads → delete the live database to
  simulate loss → restore both → `npm run db:migrate` → confirm the seeded note
  returned, then all five verification steps passed (health 200, OTP `123456`
  login, note readable, summarize returned a mock summary).
