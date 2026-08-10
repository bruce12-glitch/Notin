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
- [ ] Configure a real PostgreSQL `DATABASE_URL`, run `npm run db:migrate`, and verify `/health` reports PostgreSQL.
- [ ] Configure SMTP (`SMTP_HOST`, port, user, password, sender) so OTP and reset mail can be delivered. Verify demo OTP is disabled.
- [ ] Configure Google OAuth client credentials and an exact HTTPS `GOOGLE_REDIRECT_URI` if Google sign-in is offered.
- [ ] Set the public HTTPS `APP_ORIGIN`; verify secure HTTP-only refresh cookies through the proxy.
- [ ] Put `UPLOAD_DIR` on durable storage with correct filesystem permissions; do not serve it as a public static directory.
- [ ] Schedule and test restores for PostgreSQL and `UPLOAD_DIR` (or SQLite + uploads for non-production installations).
- [ ] Optionally set and verify `SENTRY_DSN`; leave it unset to disable monitoring.
- [ ] Run `npm run test:e2e` against the release URL.
- [ ] Do not deploy or route traffic to the old port 8787 authentication server.

## Basic operational checks

```bash
curl -fsS http://127.0.0.1:5000/health
curl -fsS http://127.0.0.1:5000/api/auth/health
```

A healthy deployment returns HTTP 200. Check application logs for migration/database failures, SMTP delivery problems, unexpected SQLite fallback, and Sentry initialization warnings. Roll back application code and schema-compatible changes together; restore database/uploads from the same backup point when data recovery is required.
