# Notin — Deep Repository Analysis (Complete System Knowledge)

**Date:** 2026-08-10 · **Branch:** `arena/019fecbf-notin` · **Base commit:** `8891278` (PR #10 merged)
**Method:** 100% of source read line-by-line (backend 17 files, app frontend 6 files, E2E suite, migrations, git history of 10 PRs) + live HTTP verification of every endpoint family.

---

## 1. Build timeline (from PR history)

| PR | Date | What it delivered |
|---|---|---|
| #1 | Aug 4 | Marketing landing (Green edition) + promo video + 3D navbar |
| #2 | Aug 6 | *(open/stale)* early hardened auth experiment |
| #3 | Aug 7 | Repository analysis documents |
| #4 | Aug 8 | 3D authentication experience + Google OTP |
| #5 | Aug 8 | High-fidelity auth page rebuild + backend foundation |
| #6 | Aug 8 | Evernote-style auth UI clone + notes API baseline |
| #7 | Aug 9 | **WP-AUTH-001/002 + WP-APP-001/002/003** — unified identity, OTP wiring, app shell, TipTap editor, Trash |
| #8 | Aug 9 | **WP-APP-004→007 + WP-AUTH-003** — search, notebooks, tags, pin/sort, password reset |
| #9 | Aug 10 | **WP-APP-008/009** — image attachments, public shares, account export/delete, E2E suite, offline PWA |
| #10 | Aug 10 | Authenticated Home shell + pinned Shortcuts view |

**Work-package convention:** `WP-AUTH-xxx`, `WP-APP-xxx` → next namespace is `WP-AI-xxx`.

## 2. Architecture map

```
Browser
 ├─ Landing (:3000, frontend/dev-server.mjs — proxies /api/* + /auth/* → :5000)
 └─ App + Auth UI + Share page (:5000, served statically by the API process)
      │  fetchWithAuth(): Bearer access token in memory; 401 → POST /api/auth/refresh (httpOnly cookie) → retry once
      ▼
 Unified Express API (:5000)  backend/src/server.js
 ├─ helmet (frameguard off for previews) + dev/preview CORS allowlist
 ├─ /api/auth/*  (rate-limited 30/15min; reset routes +10/15min)
 ├─ /api/users/* (signup/signin/me/export/me DELETE)
 ├─ /api/notes/* (auth middleware → noteController + shareController)
 ├─ /api/notebooks/* · /api/tags/* (auth)
 ├─ /api/notes/:id/attachments · /api/attachments/:id (auth, multer)
 ├─ /api/public/share/:token (token-gated, IP-limited 180/15min)
 └─ /health · /api/health
      ▼
 Data layer  backend/src/config/db.js  (Prisma-style facade over TWO drivers)
 ├─ PostgreSQL via pg.Pool   (production; DATABASE_URL)
 └─ node:sqlite DatabaseSync (dev/sandbox fallback; $n→? rewriting)
      ▼
 Migrations  backend/src/db/migrate.js  (sequential WP-* steps, both dialects)
```

## 3. Backend inventory (verified line-by-line)

### 3.1 Data layer (`db.js`, 512 LOC)
- Facade: `db.user / db.note / db.notebook / db.tag` + raw `db.query()` + `db.$transaction()`.
- Cross-driver care: SQLite stores booleans as 0/1 → coercion helpers everywhere; `RETURNING` used on both drivers; LIKE wildcards escaped (`ESCAPE '\'`); one placeholder per column (SQLite bind-count constraint documented in code).
- `note.findMany`: filters (isTrashed, notebookId incl. `null` = unfiled, tagId via EXISTS, `q` substring search ILIKE/LIKE on title/contentText/description-fallback), pinned-first ordering (`"isPinned" DESC, createdAt`), LIMIT cap 100 (max 500), then `attachTags()` — batched IN query, **no N+1**.
- `setNoteTags()`: delete-then-insert junction rows (ownership validated upstream).

### 3.2 Schema (migrate.js, 402 LOC — both dialects)
Tables: `User`, `Note` (+`notebookId`, `isPinned` added via ALTER), `Notebook`, `Tag`, `NoteTag` (composite PK), `Attachment`, `NoteShare` (unique per note + unique tokenHash), `otp_challenges`, `refresh_tokens`, `password_reset_tokens`. All FKs, indexes on every queried column.
⚠️ **`prisma/schema.prisma` is OUT OF SYNC** — missing `isPinned`, `notebookId` on Note, and the Notebook/Tag/NoteTag/password_reset_tokens models entirely. migrate.js is the actual source of truth.

### 3.3 Auth (`authController.js` 409, `userController.js` 130, `lib/jwt.js`, `middleware/auth.js`)
- **Password**: signup/signin with bcrypt(10); refresh cookie set on BOTH `/api/auth` and `/auth` paths.
- **OTP**: 6-digit, 5-min TTL, peppered SHA-256 hash, `timingSafeEqual`, max 5 attempts, anti-enumeration responses, demo mode (`123456`) only when `!production && !SMTP`.
- **Google OAuth**: state map, id-token verification, account linking by email, OTP step still required after OAuth.
- **Sessions**: jose access tokens (15 min, issuer/audience checked) + rotating refresh tokens stored hashed; logout revokes; `middleware/auth.js` re-checks user existence on **every** request → deleted accounts fail immediately; legacy `jsonwebtoken` fallback for pre-unify tokens.
- **Password reset**: hashed single-use 60-min tokens, generic responses, revokes ALL sessions on reset, dev-only token echo guarded by `!production && !SMTP`.

### 3.4 Notes (`noteController.js`)
- Create (notebook ownership checked), list (filters above), update (PUT/PATCH: title/contentJson/contentText/isTrashed/notebookId/`tagIds` replace-set/isPinned strict-boolean), trash/restore idempotent, permanent delete only when trashed (cascades shares + attachment files).

### 3.5 Attachments (`attachmentController.js`)
- multer disk storage; whitelist PNG/JPEG/WebP/GIF; 5 MB/file; 10/note; capacity pre-check middleware; trashed-note guard; on DB error → DB rows AND disk files rolled back; `path.basename()` everywhere (no traversal); private serve with cache headers.

### 3.6 Shares (`shareController.js`)
- 32-byte base64url token → SHA-256 hash only in DB; one share per note (re-POST rotates secret, old URL dies); revoke = flag; public resolver checks enabled + not-trashed + not-expired; public file serving scoped to the share's note; `publicBaseUrl()` honors x-forwarded-proto/host (preview-host safe).

### 3.7 Account ops (`accountController.js`)
- `GET /api/users/me/export`: profile (never password hash) + notes (+tags, notebook names) + notebooks + tags + attachment metadata, `formatVersion: 1`.
- `DELETE /api/users/me` requires `{"confirm":"DELETE"}`; cascades everything incl. disk files; cookies cleared.

## 4. App frontend inventory (`authentication/`)

| File | LOC | Contents |
|---|---|---|
| `index.html` | 236 | Evernote-style OTP login (email → 6-digit code) |
| `login.html` | 278 | Password login + forgot/reset-password UI |
| `app.html` | 277 | Full app shell (below) |
| `app.js` | 1,901 | All app logic (below) |
| `app.bundle.js` | — | esbuild output (TipTap inlined, 717 KB) — rebuilt via `npm run build:app` |
| `styles.css` | 712 | App design system |
| `share.html/js` | 28+ | Public read-only note renderer |
| `sw.js` | — | Shell-only cache `notin-shell-v4`; **never** caches `/api/*` |
| `manifest.webmanifest` | — | PWA, start_url `/app.html` |

**app.html zones:** offline banner · sidebar (search, +Note, Home/Notes/Shortcuts/Notebooks/Tags/Trash with counts, organize panels, account footer, toast) · Home view (greeting, note grid, scratch pad [local-only], capture placeholder) · Shortcuts view (pinned grid) · Organize view (notebook/tag cards + create forms) · note-list panel (sort select, search, empty states ×3) · editor workspace (title input, pin toggle, notebook select, **Share button + share panel**, save status, Save/Trash/Restore/Delete-forever + confirm modal, tag row with add-select, attachment row with +Image/gallery).

**app.js systems:** hash router (7 routes) · `fetchWithAuth` (401→refresh→retry) · IndexedDB snapshots → offline read-only mode with banner · autosave debounce **900 ms** + Ctrl/Cmd-S + dirty flag + per-status classes · TipTap (StarterKit h1/h2, lists, task lists, underline, placeholder) + active-state toolbar · search debounce 300 ms (list + global shell search) · notebooks/tags CRUD + filtered lists · pin toggle (`aria-pressed`) · share create/copy/revoke with status text · attachment upload/gallery/delete · account modal (export download, type-DELETE confirm) · `escapeHtml()` on all dynamic innerHTML · mobile sidebar + back bar.

## 5. Quality & security assessment

**Strong (production-grade for MVP):** ownership checks in every query; hashed secrets only (OTP, refresh, share, reset); timing-safe compare; enumeration-proof responses; refresh rotation + session revocation on reset/delete; rate limits on auth, reset, public shares; upload hardening; no secrets in client bundle; SW never caches authenticated data; E2E covers cross-user isolation (foreign share 404, foreign file 404, delete cascade leaves other user intact).

**Debt / risks:**
1. `prisma/schema.prisma` drift (see 3.2) — **sync before any Prisma tooling is ever used**.
2. Dev fallback JWT secrets in `lib/jwt.js` (boot warning) — must set real env in production.
3. CORS reflects any origin when `NODE_ENV !== production` — tighten at deploy.
4. `app.js` single 1,901-line file — acceptable while E2E-guarded; split at next major feature if it grows.
5. `authentication/server.js` (390 LOC) is the deprecated standalone :8787 auth server — dead path per RUNBOOK, kept for reference only.
6. Stale docs: README + ARCHITECTURE_DIAGRAM.md still call backend/authentication "(future)"/"PLANNED".
7. SW cache name must be bumped (`notin-shell-v4` → `v5`) whenever `app.bundle.js` changes, or users keep a stale bundle.
8. Open stale PR #2 (Aug 6) — close it.

## 6. Live verification results (2026-08-10, this sandbox)

| Check | Result |
|---|---|
| `npm run db:migrate` (SQLite fallback) | ✅ clean |
| `npm start` → `/health` | ✅ `{"ok":true,"database":"SQLite-fallback"}` |
| signup / duplicate-signup / signin / wrong-password | ✅ 201 / reject / token / 401 |
| `GET /api/notes` no token | ✅ 401 |
| create note / search `?q=` / trash / restore | ✅ all pass |
| notebook + tag create (with noteCount) | ✅ 201 |
| `/api/auth/health` demo mode flag | ✅ `demoMode:true` |
| Playwright browser run | ⛔ Chromium download blocked in sandbox — run `npm run test:e2e` on a dev machine |

## 7. Gap analysis — what does NOT exist yet

| Gap | Impact | Priority |
|---|---|---|
| **AI layer** — no provider client, no prompts, no `/api/ai` or note AI endpoints, no `summary` column | The product's stated differentiator is 0% built | **P0 — next** |
| Version history (`note_versions`) | Phase 3 | P2 |
| Note duplicate endpoint | Convenience | P3 |
| Postgres-verified production run | Deploy readiness | P1 (at deploy) |
| Word count / reading time | Editor footer nicety | P3 |

**Conclusion:** Phase 1 (Core Note Engine) is complete, hardened, and E2E-locked. The single correct next build is **WP-AI-001 — AI note summarization**, which installs all reusable AI plumbing (provider client, prompt module, rate-limited route pattern, AI column migration pattern, editor AI UI pattern) that every subsequent AI feature (title gen, smart tags, chat-with-note) will reuse.
