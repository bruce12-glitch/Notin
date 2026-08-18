# PROJECT BIBLE — SESSION REFERENCE
## Notin — AI Note-Taking Platform (Evernote Alternative)

> **Living document.** Paste this at the start of every CTO session.
> Regenerated 2026-08-11 after PR #11 merged to main (`8e7545c`). Deep system knowledge: `DEEP_REPOSITORY_ANALYSIS.md`.

---

## STATUS HEADER

| Field | Value |
|---|---|
| **Last Updated** | 2026-08-18 (WP-DEPLOY-001 production readiness gates) |
| **Current Phase** | Phase 2 (AI Layer) — WP-AI-001/002/002b + WP-FUNNEL-001 shipped; **WP-AI-003 chat, WP-SCHEMA-001 mirror, WP-DEPLOY-001 gates complete on this branch** |
| **MVP Completion** | ~78% |
| **Production readiness** | ~85% — fail-closed boot, CORS lock, CI + Chromium, and a rehearsed backup/restore drill all landed (WP-DEPLOY-001). Remaining: a human runs `RUNBOOK.md` against real infrastructure with real secrets. |

---

## CONFIRMED TECH STACK (verified in code)

| Layer | Reality |
|---|---|
| **App frontend** | Vanilla ES-module JS + **TipTap 2.27**, esbuild bundle (`authentication/app.js` ~1,900 LOC) |
| **Marketing frontend** | Static HTML + Tailwind v4 + Lottie, Green & Neon editions (`frontend/`), dev-server proxies `/api/*`+`/auth/*` → :5000 |
| **Backend** | Node 22 + Express 4.21 ESM, unified on **port 5000** (`backend/src/server.js`) |
| **Database** | PostgreSQL (`pg`) prod · `node:sqlite` dev fallback · migrations `backend/src/db/migrate.js` (WP-* steps, both dialects) |
| **Auth** | Custom JWT (jose): 15-min access in memory + rotating httpOnly refresh cookie · bcrypt passwords · email OTP (demo `123456` when no SMTP) · Google OAuth stub |
| **AI Layer** | ✅ **Phase 2 = 4/7.** WP-AI-001 summarizes notes; WP-AI-002 suggests titles; **WP-AI-002b** suggests 3–5 smart tags through Groq/mock while the server remains read-only and the client applies each accepted tag through the existing tag write paths. **WP-AI-003** adds session-only, non-streaming chat against the open note. Dedicated request-only E2E coverage exists for all four features. Next: WP-AI-004. |
| **Storage** | Local disk `backend/uploads/` (PNG/JPEG/WebP/GIF ≤5 MB × 10/note) |
| **Search** | LIKE/ILIKE substring (`GET /api/notes?q=`), escaped wildcards, 100-row cap |
| **E2E** | Playwright `backend/tests/e2e/mvp-smoke.spec.js` (3 scenarios incl. full UI journey) + API-level account test |
| **Monitoring** | Sentry no-op unless `SENTRY_DSN` set |

## COMPLETED FEATURES (live-verified)

- → Auth: password + OTP + Google stub, refresh rotation, reset w/ session revocation, account-existence check per request ✅
- → Notes: CRUD, trash/restore, delete-only-from-trash, pin (pinned-first), search, notebook/tag filters ✅
- → Notebooks & Tags: CRUD, assignment (`tagIds` replace-set), counts, dup-name 409 ✅
- → Attachments: hardened multer pipeline, authenticated serving ✅
- → Public shares: hashed tokens, rotate/revoke, trashed→404, scoped files ✅
- → Account export + typed-confirm delete with full cascade ✅
- → **WP-UI-HOME-PIXEL-001 (PR #11, 2026-08-10):** post-auth Evernote-dark Home — exact 13-item sidebar IA, notes grid + scratch pad band, capture band, FAB, sidebar collapse, reload rehydration via refresh cookie — **E2E-locked** ✅
- → **WP-UI-NOTES-001 (2026-08-13):** notes list + editor UX refresh — 2-line clamped snippets, tag chips + notebook pill in every row, hover-revealed pin control, green active-accent bar, larger 28px title, meta strip (edited time + live word count), floating toolbar pill, upgraded TipTap typography (code blocks, task-list strikethrough, blockquote, selection color), proper "no note open" empty state, styled scrollbars/sort control. SW cache bumped v4→v5 (also fixed the stale-PWA bug from PR #11). Landing/auth untouched ✅
- → **WP-UI-NOTES-3D-001 (2026-08-17):** notes-app depth and motion polish — shared depth tokens, ≤300ms view/note transitions, context-only row stagger, delegated hover-only card tilt, button press physics, smooth scrolling, and CSS/JS reduced-motion guards. Bundle rebuilt; shell cache v7→v8. Landing/auth/backend untouched ✅
- → **WP-AI-002b (2026-08-18):** smart tag suggestions — authenticated, owner-scoped `POST /api/notes/:id/suggest-tags`; deterministic keyless mock plus Groq provider; 3–5 bounded suggestions mapped to existing tag IDs; server never creates or attaches tags; session-once editor chips apply only through `POST /api/tags` + `PUT {tagIds}` with duplicate-race recovery. Dedicated `ai-tags-smoke` E2E ✅
- → **WP-AI-003 (2026-08-18):** chat with note — authenticated, owner-scoped `POST /api/notes/:id/chat` (non-streaming, one JSON in / one JSON out); deterministic keyless mock plus Groq provider bounded to 800 chars; the server never writes the note and stores no transcript or chat table; the editor panel keeps the last 6 turns in memory only, clearing on note/view change and reload, and renders every bubble via `textContent`. Dedicated `ai-chat-smoke` E2E ✅
- → **WP-SCHEMA-001 (2026-08-18):** `backend/prisma/schema.prisma` now mirrors `migrate.js` exactly — 10 models, 1:1 column parity (verified by script), all 16 non-unique indexes, `@default(cuid())` on User/Note/Notebook/Tag only, no invented unique constraints. Documentation-only: no migration, no dependency, no runtime change ✅
- → **WP-DEPLOY-001 (2026-08-18):** production readiness — (1) fail-closed boot: missing/placeholder `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`OTP_PEPPER`/`APP_ORIGIN` and any non-`postgres://` `DATABASE_URL` print `FATAL:` lines and exit 1; SQLite fallback and unreachable-Postgres downgrade are both refused in production. (2) CORS locked to the `APP_ORIGIN` allowlist in production (preview/localhost echo is now dev-only). (3) GitHub Actions `E2E` workflow: Chromium, whole-suite Playwright, two fail-closed smokes and a `postgres:16-alpine` positive-boot rehearsal — **staged at `ci/e2e.yml`; a human must `git mv` it to `.github/workflows/` because the agent's GitHub App token lacks the `workflows` permission (see `ci/README.md`)**. (4) `RUNBOOK.md` backup/restore drill, executed once. Dev/preview behavior byte-identical ✅
- → PWA: manifest + shell-only service worker (`notin-shell-v10`) + icons ✅
- → **WP-FUNNEL-001 (2026-08-18):** Green/Neon landing CTAs resolve at runtime via `notinAppOrigin()` — login → `/login.html`, signup → `/`, app → `/app.html`, contact → `mailto:hello@notin.app`. Mobile menu destinations set at creation. Auth-modal text-label click hijack removed; `?auth=otp` auto-open preserved. Platform binaries / store / extension links left dead by design ✅

- → Marketing: Green/Neon editions, video/Lottie hero, responsive ✅

## IN PROGRESS

- → **WP-FUNNEL-001** merged to `main` via PR #17.
- → **WP-AI-003 + WP-SCHEMA-001 + WP-DEPLOY-001** are complete and stacked on `arena/01a01262-notin`; PR review is the current task.
- → Locked queue after merge: **WP-AI-004** (writing assistant) → landing leftovers.

## ARCHITECTURE DECISIONS LOCKED

- → Single unified API on **:5000** serving REST + UI + share page. Never deploy legacy :8787 auth server.
- → Access token in memory; refresh in httpOnly cookie. Never localStorage.
- → SQLite = dev fallback only; SQL stays dual-driver compatible (`$n` placeholders).
- → Share secrets hashed only. Uploads on local disk, gitignored, backed up with DB.
- → Vanilla app shell stays vanilla for MVP.
- → **Sidebar placeholders (Tasks, Files, Calendar, Templates, Shared with me, Spaces, More) are STUBS and stay stubs** — E2E asserts their existence as nav items only. They are NOT the roadmap before AI.

## KNOWN TECHNICAL DEBT (priority order)

- → ~~SW cache staleness BUG~~ **FIXED 2026-08-13** by WP-UI-NOTES-001; latest shell cache is `notin-shell-v10` after WP-AI-003. Rule going forward: ANY change to a shell asset (bundle, CSS, HTML) must bump `CACHE_NAME` in `authentication/sw.js`. **Resolved**
- → **Landing CTAs dead:** 26 × `href="#"` per edition (Log in / Start for free / Get started / pricing). Next instruction after WP-AI-001 (WP-FUNNEL-001). **High**
- → ~~Dev fallback JWT secrets + permissive CORS~~ **FIXED 2026-08-18** by WP-DEPLOY-001: production boot refuses missing/placeholder secrets and non-postgres URLs; CORS echoes only `APP_ORIGIN` allowlist entries. Dev keeps the permissive behavior deliberately. **Resolved**
- → ~~Postgres→SQLite silent failover in `db.js`~~ **FIXED 2026-08-18** by WP-DEPLOY-001: refused in production at import, at `$connect()`, and mid-flight in `query()`. Still available in dev. **Resolved**
- → Legacy `authentication/server.js` package: 3 advisories (1 high nodemailer CRLF, 2 moderate) — dead code path; retire the package or pin deps. **Low** (unified backend audit = 0 vulns)
- → `docs/` duplicates `frontend/` (~14 MB each, already diverging) + `screenshots/` ~20 MB. Consolidate when touching marketing. **Low**
- → Legacy `jsonwebtoken` fallback verification path — retire after token migration window. **Low**
- → No unit tests; no deployment manifest. CI is written but **not yet active**: `ci/e2e.yml` must be moved to `.github/workflows/e2e.yml` by a human (agent tokens cannot push workflow files). Until then no run is enforced on PRs. **Medium**
- → Single 1,900-line `app.js` — acceptable while E2E-guarded. **Low**

## DATABASE SCHEMA VERSION

- → `migrate.js` is the real source of truth. Tables: `User, Note(+notebookId,+isPinned), Notebook, Tag, NoteTag, Attachment, NoteShare, otp_challenges, refresh_tokens, password_reset_tokens`.
- → Latest migration applied: `ALTER TABLE "Note" ADD COLUMN summary TEXT` (WP-AI-001, both dialects, idempotent — verified by double run).
- → `prisma/schema.prisma` is a **documented mirror** of that schema (synced by WP-SCHEMA-001); `migrate.js` remains the only applicator. The repo does not run `prisma generate` and has no `@prisma/client` dependency — keep the mirror updated by hand whenever migrate.js gains a column.

## API ENDPOINTS BUILT

- → Notes: `GET/POST /api/notes` · `GET/PUT/PATCH/DELETE /api/notes/:id` · `POST :id/trash` · `POST :id/restore` · `POST/DELETE :id/share` ✅
- → AI: `POST /api/notes/:id/summarize` · `POST :id/suggest-title` · `POST :id/suggest-tags` ✅
- → Public: `GET /api/public/share/:token(+/files/:id)` ✅
- → `GET/POST/PATCH/DELETE /api/notebooks(/:id)` · `GET/POST/DELETE /api/tags(/:id)` ✅
- → Attachments: `GET/POST /api/notes/:id/attachments` · `GET /api/attachments/:id/file` · `DELETE /api/attachments/:id` ✅
- → Users: `POST /api/users/signup|signin` · `GET /api/users/me/export` · `DELETE /api/users/me` ✅
- → Auth: `/api/auth/google(+callback) · otp/resend · otp/demo-request · otp/verify · forgot-password · reset-password · refresh · logout · health` ✅ (mounted at `/api/auth` + legacy `/auth`)
- → `GET /health`, `GET /api/health` ✅

## ENVIRONMENT VARIABLES REQUIRED

- → `DATABASE_URL` (omit → SQLite) · `SQLITE_PATH` · `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ISSUER` (+legacy `JWT_SECRET`) · `OTP_PEPPER` · `APP_ORIGIN` · `PORT` · `NODE_ENV` · `UPLOAD_DIR`
- → Optional: `SENTRY_DSN`/`SENTRY_ENVIRONMENT` · `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` · `SMTP_HOST/PORT/SECURE/USER/PASSWORD` + `MAIL_FROM` (unset ⇒ demo OTP + dev reset-token echo)
- → Optional: `GROQ_API_KEY` for live AI; blank keeps summarize/title/tag suggestions in deterministic mock mode

## CURRENT BLOCKERS

- → Playwright Chromium unavailable in Arena sandboxes — full UI journey must run in CI or a dev machine (`cd backend && npm run test:e2e`).

## DEPLOY GATES (must pass before any real deployment — do not build now)

1. Startup fails closed in `NODE_ENV=production` when JWT secrets missing or Postgres unreachable (no SQLite fallback, no secret fallback).
2. CORS locked to real origins.
3. SMTP + Google OAuth configured → demo OTP and dev reset-token echo automatically off (already guarded — verify).
4. Postgres backup + `uploads/` backup + restore drill documented.
5. CI workflow running Playwright with Chromium.

## NEXT 3 PRIORITIES

1. **Merge the stacked branch** `arena/01a01262-notin` (WP-AI-003 → WP-SCHEMA-001 → WP-DEPLOY-001) once CI is green.
2. **WP-AI-004:** writing assistant (continue / rephrase / shorten, inline diff).
3. **Leftovers:** landing binaries/store/extension links, `docs/` mirror re-sync, close PR #2 with salvage notes.
