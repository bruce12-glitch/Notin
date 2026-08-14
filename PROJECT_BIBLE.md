# PROJECT BIBLE — SESSION REFERENCE
## Notin — AI Note-Taking Platform (Evernote Alternative)

> **Living document.** Paste this at the start of every CTO session.
> Regenerated 2026-08-11 after PR #11 merged to main (`8e7545c`). Deep system knowledge: `DEEP_REPOSITORY_ANALYSIS.md`.

---

## STATUS HEADER

| Field | Value |
|---|---|
| **Last Updated** | 2026-08-14 (post WP-AI-001 verification) |
| **Current Phase** | Phase 2 (AI Layer) — **1/7 shipped**: WP-AI-001 ✅ verified |
| **MVP Completion** | ~75% |
| **Production readiness** | ~40% (deploy gates listed below) |

---

## CONFIRMED TECH STACK (verified in code)

| Layer | Reality |
|---|---|
| **App frontend** | Vanilla ES-module JS + **TipTap 2.27**, esbuild bundle (`authentication/app.js` ~1,900 LOC) |
| **Marketing frontend** | Static HTML + Tailwind v4 + Lottie, Green & Neon editions (`frontend/`), dev-server proxies `/api/*`+`/auth/*` → :5000 |
| **Backend** | Node 22 + Express 4.21 ESM, unified on **port 5000** (`backend/src/server.js`) |
| **Database** | PostgreSQL (`pg`) prod · `node:sqlite` dev fallback · migrations `backend/src/db/migrate.js` (WP-* steps, both dialects) |
| **Auth** | Custom JWT (jose): 15-min access in memory + rotating httpOnly refresh cookie · bcrypt passwords · email OTP (demo `123456` when no SMTP) · Google OAuth stub |
| **AI Layer** | ✅ **Phase 2 = 2/7.** WP-AI-001 shipped (`6cb4441`): `POST /api/notes/:id/summarize` + `Note.summary` + editor summary card. **WP-AI-002 shipped on `arena/019fecbf-notin`**: `POST /api/notes/:id/suggest-title` — server suggests (Groq/mock), NEVER writes the title; client applies via existing autosave; suggestion bar with Use/Dismiss; once-per-session guard; its own E2E (`ai-title-smoke`). Both CTO-verified live 2026-08-14. Next: WP-AI-002b (smart tags) |
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
- → PWA: manifest + shell-only service worker (`notin-shell-v4`) + icons ✅
- → Marketing: Green/Neon editions, video/Lottie hero, responsive ✅

## IN PROGRESS

- → **PR #12 OPEN — review & merge it** (`arena/019fecbf-notin` @ d1b57d1): WP-AI-001 (commit 6cb4441) + WP-UI-NOTES-001 notes refresh + CTO docs, union-merged and re-verified live as one build (bundle rebuilt, SW cache v6). Supersedes a separate WP-AI-001 PR.
- → After merge: run **WP-AI-002** (`CODING_AGENT_MASTER_PROMPT_WP-AI-002.md`) on the new main.
- → Then **WP-UI-NOTES-3D-001** (`CODING_AGENT_MASTER_PROMPT_WP-UI-NOTES-3D.md`) on the post-AI-002 tree.
- → Then **WP-AI-002b — smart tag suggestions** (`CODING_AGENT_MASTER_PROMPT_WP-AI-002B.md`): server suggests 3–5 tags, user applies chips via the existing tag write path.
- → Then: **WP-FUNNEL-001** wire landing CTAs (`CODING_AGENT_MASTER_PROMPT_WP-FUNNEL-001.md`) → WP-AI-003 (chat with note) → schema sync + deploy gates.

## ARCHITECTURE DECISIONS LOCKED

- → Single unified API on **:5000** serving REST + UI + share page. Never deploy legacy :8787 auth server.
- → Access token in memory; refresh in httpOnly cookie. Never localStorage.
- → SQLite = dev fallback only; SQL stays dual-driver compatible (`$n` placeholders).
- → Share secrets hashed only. Uploads on local disk, gitignored, backed up with DB.
- → Vanilla app shell stays vanilla for MVP.
- → **Sidebar placeholders (Tasks, Files, Calendar, Templates, Shared with me, Spaces, More) are STUBS and stay stubs** — E2E asserts their existence as nav items only. They are NOT the roadmap before AI.

## KNOWN TECHNICAL DEBT (priority order)

- → ~~SW cache staleness BUG~~ **FIXED 2026-08-13** by WP-UI-NOTES-001 (cache bumped to `notin-shell-v5`). Rule going forward: ANY change to a shell asset (bundle, CSS, HTML) must bump `CACHE_NAME` in `authentication/sw.js`. **Resolved**
- → **Landing CTAs dead:** 26 × `href="#"` per edition (Log in / Start for free / Get started / pricing). Next instruction after WP-AI-001 (WP-FUNNEL-001). **High**
- → `prisma/schema.prisma` drifts from migrate.js (missing Notebook/Tag/NoteTag/password_reset_tokens models; Note lacks isPinned/notebookId). Quick sync task. **Medium**
- → Dev fallback JWT secrets (boot warning) + permissive non-prod CORS → **deploy-gate: fail closed** (see DEPLOY GATES). **Medium now / High at deploy**
- → Postgres→SQLite silent failover in `db.js` — acceptable in dev, must be disabled in production. **Deploy gate**
- → Legacy `authentication/server.js` package: 3 advisories (1 high nodemailer CRLF, 2 moderate) — dead code path; retire the package or pin deps. **Low** (unified backend audit = 0 vulns)
- → `docs/` duplicates `frontend/` (~14 MB each, already diverging) + `screenshots/` ~20 MB. Consolidate when touching marketing. **Low**
- → Legacy `jsonwebtoken` fallback verification path — retire after token migration window. **Low**
- → No unit tests, no CI workflow, no deployment manifest. **Medium** (add at deploy prep)
- → Single 1,900-line `app.js` — acceptable while E2E-guarded. **Low**

## DATABASE SCHEMA VERSION

- → `migrate.js` is the real source of truth. Tables: `User, Note(+notebookId,+isPinned), Notebook, Tag, NoteTag, Attachment, NoteShare, otp_challenges, refresh_tokens, password_reset_tokens`.
- → Latest migration applied: `ALTER TABLE "Note" ADD COLUMN summary TEXT` (WP-AI-001, both dialects, idempotent — verified by double run).

## API ENDPOINTS BUILT

- → Notes: `GET/POST /api/notes` · `GET/PUT/PATCH/DELETE /api/notes/:id` · `POST :id/trash` · `POST :id/restore` · `POST/DELETE :id/share` ✅
- → Public: `GET /api/public/share/:token(+/files/:id)` ✅
- → `GET/POST/PATCH/DELETE /api/notebooks(/:id)` · `GET/POST/DELETE /api/tags(/:id)` ✅
- → Attachments: `GET/POST /api/notes/:id/attachments` · `GET /api/attachments/:id/file` · `DELETE /api/attachments/:id` ✅
- → Users: `POST /api/users/signup|signin` · `GET /api/users/me/export` · `DELETE /api/users/me` ✅
- → Auth: `/api/auth/google(+callback) · otp/resend · otp/demo-request · otp/verify · forgot-password · reset-password · refresh · logout · health` ✅ (mounted at `/api/auth` + legacy `/auth`)
- → `GET /health`, `GET /api/health` ✅

## ENVIRONMENT VARIABLES REQUIRED

- → `DATABASE_URL` (omit → SQLite) · `SQLITE_PATH` · `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ISSUER` (+legacy `JWT_SECRET`) · `OTP_PEPPER` · `APP_ORIGIN` · `PORT` · `NODE_ENV` · `UPLOAD_DIR`
- → Optional: `SENTRY_DSN`/`SENTRY_ENVIRONMENT` · `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` · `SMTP_HOST/PORT/SECURE/USER/PASSWORD` + `MAIL_FROM` (unset ⇒ demo OTP + dev reset-token echo)
- → **Planned: `GROQ_API_KEY`** (WP-AI-001; blank = deterministic mock mode)

## CURRENT BLOCKERS

- → No `GROQ_API_KEY`. Unblocks with key OR ships keyless via WP-AI-001 mock provider (recommended).
- → Playwright Chromium unavailable in Arena sandboxes — full UI journey must run in CI or a dev machine (`cd backend && npm run test:e2e`).

## DEPLOY GATES (must pass before any real deployment — do not build now)

1. Startup fails closed in `NODE_ENV=production` when JWT secrets missing or Postgres unreachable (no SQLite fallback, no secret fallback).
2. CORS locked to real origins.
3. SMTP + Google OAuth configured → demo OTP and dev reset-token echo automatically off (already guarded — verify).
4. Postgres backup + `uploads/` backup + restore drill documented.
5. CI workflow running Playwright with Chromium.

## NEXT 3 PRIORITIES

1. **Merge WP-AI-001** — open the PR for `arena/019ffe5a-notin` @ `6cb4441` (verified ✅, not yet merged). Resolve the PROJECT_BIBLE.md conflict in favor of this comprehensive Bible.
2. **WP-AI-002 — AI title generation** (`CODING_AGENT_MASTER_PROMPT_WP-AI-002.md`): second AI feature on proven plumbing; server suggests, user accepts via existing autosave; includes its own E2E spec.
3. **WP-UI-NOTES-3D-001** (`CODING_AGENT_MASTER_PROMPT_WP-UI-NOTES-3D.md`): run on the post-AI-002 tree. Queue behind it: WP-AI-002b (smart tags) → WP-FUNNEL-001 (dead landing CTAs) → WP-AI-003 (chat with note) → schema sync + deploy gates.
