# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security
- Production CSP (`script-src 'self'`) no longer broken by the marketing site's
  inline theme script — it now lives in `frontend/script.js`.
- Removed third-party-owned marketing assets (hero video, Lottie JSON) and the
  cross-origin video hotlink; the hero is now an original CSS/JS app demo.
- Development JWT secrets are ephemeral per-process random values; committed
  fallback constants are gone (production stays fail-closed).
- Non-production CORS no longer echoes arbitrary origins with credentials;
  echo is limited to the allowlist + localhost.
- Demo OTP (`123456`) is now opt-in via `ALLOW_DEMO_OTP=true`; the demo
  endpoint 404s otherwise. A boot banner lists every active dev shortcut.
- Runtime Postgres→SQLite fallback now requires `ALLOW_SQLITE_FALLBACK=true`
  and matches only explicit connection-error codes (no substring guessing).

### Fixed
- Optimistic-concurrency note updates cast `updatedAt` to `::timestamptz` on
  Postgres so DB-default `NOW()` rows compare correctly (spurious 409s).
- Auth middleware returns 503 (not 401) on database outages during the user
  lookup; swallowed `contentJson` parse failures are logged.
- Permanent note delete runs its share/attachment/tag/note deletes in one
  transaction; attachment files are removed only after commit.
- Storage provider `s3` fails fast on errors instead of silently falling back
  to local disk; attachment responses add `nosniff` + sanitized
  `Content-Disposition`.
- JSON body limit reduced from 10 MB to 2.5 MB (validation ceiling is 2 MB).
- Access tokens no longer embed the user email (PII).
- Service worker: navigations/HTML are network-first, static assets are
  stale-while-revalidate (shell updates no longer wait for a manual bump).
- Manifest maskable icon split into separate `any` + `maskable` entries.
- Canonical/OG/sitemap now agree on the `/site/` marketing topology.

### Added
- **Reminders**: per-note reminders with in-app due badges/list, email
  delivery (nodemailer) and Web Push notifications (`authentication/sw.js`).
- MIT LICENSE; license metadata aligned across all package.json files.
- `node --test` unit suite (`backend/tests/unit/`) + ESLint flat config.
- `docker-compose.yml` for one-command local runs.
- Dependabot (npm × 3 packages + GitHub Actions), CodeQL workflow, and a
  Docker build + container smoke-test workflow.
- `ci/check-csp.mjs` guard wired into `ci/checks.sh`.

### Removed
- Unused `cors` package (a hand-rolled middleware is used instead).
- Legacy `ci/e2e.yml` duplicate of the GitHub workflow.
