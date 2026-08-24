# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Email
`security@notin.app` with the affected component, reproducible steps, impact,
and the minimum supporting data needed to investigate.

Use test accounts. Do not perform denial of service, social engineering,
destructive testing, persistence, automated mass scanning, or access to data
beyond what is required to demonstrate the issue.

The project aims to acknowledge a valid report within three business days.
Response targets are best effort until the service has a staffed public launch.

## Supported versions

Only the current `main` release candidate is supported. There is not yet a
public stable release. Security fixes should be applied to the active release
before it receives public traffic.

## Current security model (2026-08-24)

### Authentication
- **JWT**: 15-minute access tokens (jose HS256) in memory only, never localStorage. Payload includes `sub`, `email`, `type:access`, `tv` (tokenVersion). `tv` checked against `User.tokenVersion` on every request — password reset increments version, invalidating all prior JWTs even within 15m window.
- **Refresh**: rotating httpOnly Secure SameSite=lax cookies (`/api/auth` + `/auth` legacy), SHA-256 hash at rest, one-time use, 30-day expiry. Each mint starts new `family_id` via `randomToken(24)`. Rotation uses compare-and-swap UPDATE to prevent family forking. Grace window 10s for benign race → sibling token; out-of-grace replay → entire family revoked (`revoke_reason='replay'`) with `[SECURITY]` log (userId only, no token material).
- **CSRF**: signed double-submit `notin_csrf` cookie `rand.hmac` (HMAC-SHA256 keyed by sha256(refresh secret)), non-httpOnly, echoed via `x-notin-csrf` header on `POST /auth/refresh` and `/logout`. Missing/mismatched/forged-equal → 403 `Invalid CSRF token`. No refresh cookie → generic 401 `Invalid session` (no oracle).
- **Origin guard**: mutating auth routes with non-allowlisted `Origin` → 403 `Invalid origin`; absent Origin (curl/Playwright) allowed. Allowlist single-sourced in `httpSecurity.js` (`isOriginAllowed`) used by CORS and guard.

### Password policy (WP-SEC-006)
- 8–72 bytes (bcrypt truncates after 72, so longer rejected)
- 3-of-4 categories: lowercase, uppercase, digit, special char
- Blocklist 50+ common passwords (password, qwerty, etc)
- No 3 repeating chars, no 4-char sequential (abcd/1234 asc/desc)
- No email local part or username containment (≥3 chars)
- Client strength bar in reset UI mirrors backend rules
- Enforced in `signupSchema` + `resetPasswordSchema` (Zod strict().superRefine)

### Throttle & lockout (WP-SEC-003)
- Per-email: signin 5 fails → 1m→5m→15m→60m capped, `Retry-After` header. Correct password still runs bcrypt and clears ladder (availability-preserving, prevents lockout by attacker knowing email).
- OTP issue: 5 per email per 15m sliding window (`auth_throttle` table)
- IP budgets: `express-rate-limit` 30/15m on `/api/auth/*`, 60/15m signup, 300/15m signin, 180/15m public share reads

### Device inventory (WP-SEC-005)
- `refresh_tokens` columns `user_agent` ≤500, `ip_address` ≤128, `last_active_at`
- Captured on signup/signin/otpVerify/refresh rotation
- Endpoints (Bearer-protected):
  - `GET /api/auth/sessions` → list active families with UA/IP/lastActive/isCurrent
  - `DELETE /api/auth/sessions/:familyId` → revoke family (`user-revoke`)
  - `POST /api/auth/sessions/revoke-others` → revoke all except current
- Aliases under `/api/users/me/sessions`
- UI: Account → Active sessions shows list + revoke buttons

### Notes & data
- All note/notebook/tag/attachment queries scoped by `userId`
- Trash-first delete guard: `DELETE /api/notes/:id` only when `isTrashed=true`
- Optimistic concurrency: `expectedUpdatedAt` ISO timestamp, stale → 409 `NOTE_CONFLICT`
- Search: PG `websearch_to_tsquery('simple')` + `to_tsvector` + GIN indexes + `ts_rank_cd`; SQLite escaped-LIKE fallback
- Pagination: `?page` positive int, `?limit` 1–100, `?includeMeta` → `{items, meta:{page,limit,total,totalPages}}`
- Quotas: `MAX_NOTES_PER_USER` 5000 (403 `NOTE_QUOTA_REACHED`), `MAX_ATTACHMENT_STORAGE_BYTES` 250MB (403 `STORAGE_QUOTA_REACHED`), `MAX_IMAGES_PER_NOTE` 10, `MAX_IMAGE_BYTES` 5MB
- Attachments: mime whitelist PNG/JPEG/WebP/GIF, magic-byte signature check, random filenames, owner-only serving `private, max-age=3600`, deletion via storage abstraction `lib/storage.js` (local + S3 stub)

### Public sharing
- 32-byte random token, SHA-256 hash at rest, `shareEnabled` boolean, `expiresAt` (SHARE_TTL_DAYS default 30)
- Public routes: `GET /api/public/share/:token` + `/files/:attachmentId` scoped to note, trashed→404, revoked→404
- Rotate/revoke via `POST/DELETE /api/notes/:id/share`

### Ops
- Liveness `GET /health` (no DB), readiness `GET /api/health` (SELECT 1, 2s timeout, 503 when unreachable, no driver leak), deep `GET /api/health/deep` (+ upload writability via `storage.probeWritable()`)
- `X-Request-Id` echo/replace (sane ≤128 `[A-Za-z0-9_-]` echoed, hostile replaced UUID), logged via `logError(req, ...)` prefix `[<id>]`
- Graceful shutdown SIGTERM/SIGINT 10s drain → `db.$disconnect()`, single-flight
- Fail-closed prod boot: missing/placeholder `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`OTP_PEPPER`/`APP_ORIGIN`, non-`postgres://` DATABASE_URL, `TRUST_PROXY` not explicit or `true` → `FATAL:` + exit 1. `AUTH_EMAIL_ENABLED!=false` requires SMTP. SQLite fallback refused in prod at import, $connect, and query() mid-flight.

### AI
- Provider abstraction `lib/ai/provider.js`: Groq when `GROQ_API_KEY` set, deterministic mock otherwise (no network)
- Per-user rate limits `user:<userId>` (no IP starvation), `chat` + `chat/stream` share 5/15m budget, `assist` 5/15m, `summarize/title/tags` separate
- Streaming SSE `data: {\"delta\":…}` + `[DONE]`, in-band error after headers, `res` close cancels upstream reader (not `req` close)
- Client renders via `textContent` only, transcript session-only (6 turns memory)

### Storage
- `lib/storage.js` abstraction: `local` (default `backend/uploads/`) + `s3` stub. `STORAGE_PROVIDER=s3` future path. `probeWritable()` uses random suffix file, not fixed pid-only name.

## What is NOT yet
- S3/R2 real implementation, image thumbnail generation, virus scan
- Stripe billing, Teams/Spaces ACL, web clipper extension, native apps
- End-to-end encryption — Notin is NOT E2E encrypted, authorized infra can process note content (disclosed in privacy.html)
