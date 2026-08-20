# PROJECT BIBLE — SESSION REFERENCE
## Notin — AI Note-Taking Platform (Evernote Alternative)

> **Living document.** Paste this at the start of every CTO session.
> Regenerated 2026-08-11 after PR #11 merged to main (`8e7545c`). Deep system knowledge: `DEEP_REPOSITORY_ANALYSIS.md`.

---

## STATUS HEADER

| Field | Value |
|---|---|
| **Last Updated** | 2026-08-20 (CTO live audit — runtime verification of every Phase-2 claim; **one critical defect found**, see WP-AI-005) |
| **Current Phase** | Phase 2 (AI Layer) **complete — WP-AI-001/002/002b/003/003b/004/004b**; WP-SCHEMA-001 mirror, WP-DEPLOY-001 gates, WP-FUNNEL-001, and **WP-LEFTOVERS-001** complete |
| **MVP Completion** | ~81% (unchanged — audit found no missing features, one broken one) |
| **Production readiness** | **~70%, revised down from ~85%** — fail-closed boot, CORS lock, CSRF/origin guards and the backup/restore drill are all real and were re-verified live on 2026-08-20. But **AI rate limiting is keyed by IP, so a new user's first AI call can return 429** (WP-AI-005). That is a multi-user launch blocker: it must be fixed before anyone but the developer uses the product. CI is still inactive (`ci/e2e.yml` not yet moved by a human). |

### 2026-08-20 live audit — what was actually executed

Not a doc review. The API was booted on SQLite against a freshly migrated database and exercised with real HTTP:

- ✅ **Verified working:** signup → JWT; note CRUD; search `?q=`; notebooks; tags; share-link mint; account export; owner scoping (another user gets **404**, not 403 — correct, no existence leak); unauthenticated `GET /api/notes` → **401**.
- ✅ **All five AI endpoints verified live in mock mode:** `summarize`, `suggest-title`, `suggest-tags`, `chat`, `chat/stream` (SSE), `assist` (`continue`/`rephrase`/`shorten`/`expand`). Phase 2 is genuinely complete, not aspirational.
- ✅ **Fail-closed boot re-proven, all three ways:** no env → `FATAL: DATABASE_URL must be a postgres:// URL`; `.env.example` placeholder secrets → three `FATAL:` lines + refusal; real secrets with a non-postgres URL → refusal.
- ✅ **Security guards re-proven live:** bad `Origin` on refresh → `403 {"error":"Invalid origin"}`; missing CSRF header → `403`; HSTS + `X-Content-Type-Options: nosniff` present.
- ✅ **8/8 request-only E2E pass** against a clean DB (all six AI specs + `auth-csrf` + `auth-refresh-replay`).
- ❌ **DEFECT FOUND — see technical debt / WP-AI-005.**
- ⚠️ **Unverifiable here:** `mvp-smoke.spec.js` browser journey — Playwright Chromium binary genuinely cannot be installed in the Arena sandbox. Confirms the standing blocker; needs CI or a dev machine.
- 📝 **API contract note for anyone writing tests or clients:** create-note takes **`contentText`** (not `content`); chat takes **`question`** (not `message`); assist takes **`{action, text}`** (not `selection`). Wrong field names save an empty note and then trip the length guards — looks like an AI bug, isn't one.
- 📝 **Doc drift corrected:** the Bible listed `docs/` and `screenshots/` as technical debt. **Neither directory exists** in this checkout (`git ls-files` top level = `authentication`, `backend`, `ci`, `frontend`, 5 markdown files, `index.html`). Those debt items are removed below.

---

## CONFIRMED TECH STACK (verified in code)

| Layer | Reality |
|---|---|
| **App frontend** | Vanilla ES-module JS + **TipTap 2.27**, esbuild bundle (`authentication/app.js` ~2,400 LOC) |
| **Marketing frontend** | Static HTML + Tailwind v4 + Lottie, Green & Neon editions (`frontend/`), dev-server proxies `/api/*`+`/auth/*` → :5000 |
| **Backend** | Node 22 + Express 4.21 ESM, unified on **port 5000** (`backend/src/server.js`) |
| **Database** | PostgreSQL (`pg`) prod · `node:sqlite` dev fallback · migrations `backend/src/db/migrate.js` (WP-* steps, both dialects) |
| **Auth** | Custom JWT (jose): 15-min access in memory + rotating httpOnly refresh cookie · bcrypt passwords · email OTP (demo `123456` when no SMTP) · Google OAuth stub |
| **AI Layer** | ✅ **Phase 2 = 7/7 (complete).** WP-AI-001 summarizes notes; WP-AI-002 suggests titles; WP-AI-002b suggests smart tags; WP-AI-003 adds session-only note chat; **WP-AI-003b** streams that chat over SSE with the JSON endpoint intact as fallback (one shared rate budget); WP-AI-004 adds non-streaming continue/rephrase/shorten suggestions; **WP-AI-004b** widens the assistant to four actions with `expand` plus a zero-dependency selection bubble menu. The assist endpoint is read-only; only explicit Apply mutates TipTap and enters the existing autosave path. Dedicated request-only E2E coverage exists for every AI work package. |
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
- → **WP-AI-004 (2026-08-18):** writing assistant — authenticated, owner-scoped `POST /api/notes/:id/assist` with dedicated 5-per-15-minute limiting and three non-streaming actions: continue from persisted note context, or rephrase/shorten an explicit selection. Deterministic keyless mock plus bounded Groq provider; server remains read-only. Pending suggestions stay in memory and render via `textContent`; explicit Apply replaces the captured selection or appends at the document end, calls `onEdit()`, and relies on the existing 900 ms autosave. Dedicated `ai-assist-smoke` E2E ✅
- → **WP-SCHEMA-001 (2026-08-18):** `backend/prisma/schema.prisma` now mirrors `migrate.js` exactly — 10 models, 1:1 column parity (verified by script), all 16 non-unique indexes, `@default(cuid())` on User/Note/Notebook/Tag only, no invented unique constraints. Documentation-only: no migration, no dependency, no runtime change ✅
- → **WP-DEPLOY-001 (2026-08-18):** production readiness — (1) fail-closed boot: missing/placeholder `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`OTP_PEPPER`/`APP_ORIGIN` and any non-`postgres://` `DATABASE_URL` print `FATAL:` lines and exit 1; SQLite fallback and unreachable-Postgres downgrade are both refused in production. (2) CORS locked to the `APP_ORIGIN` allowlist in production (preview/localhost echo is now dev-only). (3) GitHub Actions `E2E` workflow: Chromium, whole-suite Playwright, two fail-closed smokes and a `postgres:16-alpine` positive-boot rehearsal — **staged at `ci/e2e.yml`; a human must `git mv` it to `.github/workflows/` because the agent's GitHub App token lacks the `workflows` permission (see `ci/README.md`)**. (4) `RUNBOOK.md` backup/restore drill, executed once. Dev/preview behavior byte-identical ✅
- → PWA: manifest + shell-only service worker (`notin-shell-v15`) + icons ✅
- → **WP-FUNNEL-001 (2026-08-18):** Green/Neon landing CTAs resolve at runtime via `notinAppOrigin()` — login → `/login.html`, signup → `/`, app → `/app.html`, contact → `mailto:hello@notin.app`. Mobile menu destinations set at creation. Auth-modal text-label click hijack removed; `?auth=otp` auto-open preserved. `data-cta` `href="#"` no-JS fallbacks kept by design ✅
- → **WP-LEFTOVERS-001 (2026-08-18):** zero placeholder landing CTAs. Enterprise nav → `mailto:hello@notin.app?subject=Enterprise%20demo`. Eight binary/store/extension items per edition are disabled spans (`role="link"`, `aria-disabled`, “Coming soon — the web app is live today”). Changelog / Blog / Careers / Privacy / Terms / Security removed (Legal column dropped once empty). `docs/` GitHub Pages mirror re-synced byte-for-byte to `frontend/` (including `polish.css`) ✅
- → **WP-AI-003b (2026-08-18):** streaming chat — authenticated, owner-scoped `POST /api/notes/:id/chat/stream` answers as SSE (`data: {"delta":…}` frames + terminal `data: [DONE]`), reusing the SAME 5-per-15-minute `chatLimit` as the JSON route so streaming is not a rate-limit escape hatch. Keyless mock splits the deterministic `mockChatAnswer` into ~6-word chunks via `setImmediate` (no timers, no randomness): assembled deltas equal the JSON answer byte-for-byte, asserted by the dedicated `ai-chat-stream-smoke` E2E alongside the full guard matrix (401/400/400/404/400, all JSON pre-upgrade). Groq path streams upstream frames with buffered line parsing, per-frame JSON-parse tolerance, the same 20 s whole-response abort budget, and a `finally` that cancels the reader when a client abandons mid-stream (disconnect detected via `res` 'close' — `req` 'close' fires at body-consumption on Node ≥16 and would cut every stream). Post-header failures become in-band `{"error":…}` + `[DONE]`; guards and setup errors keep the JSON endpoint's exact bodies. Client is stream-first with empty-bubble `textContent +=` fill and the original one-JSON request as fallback; transcript stays session-only. Still zero persistence. Shell cache v11→v12 ✅
- → **WP-AI-004b (2026-08-18):** assistant finished — (1) fourth action `expand`: selection-based like rephrase/shorten, landed through the data-driven `ASSIST_ACTIONS` allowlist with **zero controller/route edits**; locked deterministic mock string asserted byte-exact by the extended `ai-assist-smoke` E2E; groq prompt added to `ASSIST_SYSTEM` and picked up automatically (`assistWithGroq` untouched). Same `assistLimit` 5/15 min budget, same locked messages. (2) Zero-dependency floating selection bubble (Rephrase/Shorten/Expand) hand-rolled on `editor.view.coordsAtPos()` from bundled `@tiptap/core` — no BubbleMenu extension, no floating-ui; hidden on blur/Escape/editor-column scroll and every existing view-change reset (`hideAiAssist`); viewport-right clamped. Dropdown and bubble funnel into ONE shared `runAssist()` and the SAME Apply bar; consent still only via Apply → `insertContentAt` → `onEdit()` → 900 ms autosave; server never writes the note. New dropdown entry `Expand selection`. Shell cache v12→v13 ✅
- → **WP-SEC-001 (2026-08-19):** refresh-token rotation families + replay detection — **PR #2 salvage item #1**. `refresh_tokens` gains `family_id` + `revoke_reason` (`'rotation' | 'logout' | 'password-reset' | 'replay'`, both migrate.js dialects, `refresh_tokens_family_idx`); every mint site (signup / signin / otpVerify) starts a NEW family via `randomToken(24)`, and rotation successors inherit the consumed row's family — the chain IS the family. Legacy rows backfilled `family_id = user_id` (one family per user; a legacy replay fail-closed revokes that user's remaining legacy sessions). `refresh()` rotates via ONE compare-and-swap UPDATE (`rowCount` works on both drivers — `info.changes` on SQLite) so a concurrent request cannot fork the family; a consumed token presented again inside the locked 10 s rotation grace gets a fresh family SIBLING (benign two-tab / burst race → no false positive), while an out-of-grace replay revokes every live member of the family (`revoke_reason='replay'`) — attacker AND victim drop to sign-in. Logout-then-reuse is an instant nuke by design: logout's `revoke_reason='logout'` is NOT sheltered by the rotation grace. Oracle rule: every failure path keeps the byte-identical `401 {"error":"Invalid session"}` — detection is server-side only, one userid-only `[SECURITY]` log line per event (no token material logged). Docs-only `prisma/schema.prisma` mirror updated per the WP-SCHEMA-001 rule. Client `app.js` gains a single-flight `bootstrapToken` guard so same-tab parallel 401s share ONE rotation call (cross-tab same-instant races are handled server-side by the grace window — module state cannot span tabs). New request-only E2E `auth-refresh-replay.spec.js`: rotation chain, grace sibling, logout nuke + deep-equality oracle body + clearing set-cookie, family isolation + garbage cookie, 3-way concurrent burst (all siblings), and the honesty assertion (stateless access token still valid after nuke — salvage item #4). Shell cache v13→v14 ✅ — **PR #2 salvage scoreboard: 1 ✅ (this WP) · remaining 2 CSRF · 3 lockout · 4 token-versioning · 5 device inventory · 6 password policy · 7 Express 5 (future WP-SEC-002…; item 7 = deliberate upgrade, never drive-by)**
- → **WP-SEC-002 (2026-08-19):** signed CSRF + trusted-origin enforcement on cookie-carried auth mutations — **PR #2 salvage item #2**. Architectural scope: exactly TWO endpoints authenticate by cookie (`POST /auth/refresh`, `POST /auth/logout`, each mounted at `/api/auth` + legacy `/auth`) — every other route authorizes via the Bearer header, which cross-site pages cannot forge, so those routes stay untouched BY DESIGN. Layer A (trusted origin): mutating methods on the auth router with a present-but-non-allowlisted `Origin` → `403 {"error":"Invalid origin"}`; absent Origin (curl, Playwright request specs) passes — mirrors the WP-DEPLOY-001 allowlist, now single-sourced in `backend/src/lib/httpSecurity.js` (`isOriginAllowed`, used by BOTH the CORS echo and the router `originGuard`; no second constant, source stays `APP_ORIGIN`). Layer B (signed double-submit CSRF): non-httpOnly `notin_csrf` cookie (`rand.hmac`, HMAC-SHA256 keyed by a sha256 derivative of the refresh secret, `timingSafeEqual` verify — zero deps) minted at all four refresh mints (signup/signin/otpVerify + the SEC-001 rotate/grace-sibling tail), rotated with every refresh, cleared at logout AND the replay-nuke path. On refresh/logout the guard requires: cookie present ∧ `x-notin-csrf` header present ∧ equal ∧ signature valid, else `403 {"error":"Invalid CSRF token"}`; no refresh cookie → skip (the SEC-001 generic `401 {"error":"Invalid session"}` path owns it) — guards ordered `strict` → `originGuard` → `csrfGuard` on the two routes. Client `app.js` echoes the cookie via new `readCookie`/`csrfHeaders` helpers at all four fetch sites (both refresh fallbacks + both logout fallbacks); CORS preflight `Access-Control-Allow-Headers` now includes `X-Notin-CSRF`. The `/api/auth/signup|signin` aliases mounted directly in server.js bypass the auth router by design — they read no cookies. New request-only `auth-csrf.spec.js` (bad/dev origin, missing/mismatched/forged-equal CSRF, genuine dual-cookie rotation, logout matrix, cookie-less 401) + `auth-refresh-replay.spec.js` updated to echo the header on every cookie-carrying call (replay semantics unchanged — now provably reachable only with a valid signed pair). Shell cache v14→v15 ✅ — **PR #2 salvage scoreboard: 1 ✅ · 2 ✅ · remaining 3 lockout · 4 token-versioning · 5 device inventory · 6 password policy · 7 Express 5**

- → Marketing: Green/Neon editions, video/Lottie hero, responsive ✅

## IN PROGRESS

- → None code-wise. WP-AI-004b is complete and committed on top of WP-AI-003b (branch `arena/01a015f7-notin`); its PR opens after PR #22 (WP-AI-003b) merges. Next in queue: hosting (`RUNBOOK.md` with real secrets) once the owner merges the stack.

## ARCHITECTURE DECISIONS LOCKED

- → Single unified API on **:5000** serving REST + UI + share page. Never deploy legacy :8787 auth server.
- → Access token in memory; refresh in httpOnly cookie. Never localStorage.
- → SQLite = dev fallback only; SQL stays dual-driver compatible (`$n` placeholders).
- → Share secrets hashed only. Uploads on local disk, gitignored, backed up with DB.
- → Vanilla app shell stays vanilla for MVP.
- → **Sidebar placeholders (Tasks, Files, Calendar, Templates, Shared with me, Spaces, More) are STUBS and stay stubs** — E2E asserts their existence as nav items only. They are NOT the roadmap before AI.

## KNOWN TECHNICAL DEBT (priority order)

- → ~~SW cache staleness BUG~~ **FIXED 2026-08-13** by WP-UI-NOTES-001; latest shell cache is `notin-shell-v15` after WP-SEC-002. Rule going forward: ANY change to a shell asset (bundle, CSS, HTML) must bump `CACHE_NAME` in `authentication/sw.js`. **Resolved**
- → ~~Landing leftover `href="#"` CTAs~~ **FIXED 2026-08-18** by WP-FUNNEL-001 + WP-LEFTOVERS-001: remaining `href="#"` are only the 11 data-cta / `#smartDownload` no-JS fallbacks. **Resolved**
- → ~~Dev fallback JWT secrets + permissive CORS~~ **FIXED 2026-08-18** by WP-DEPLOY-001: production boot refuses missing/placeholder secrets and non-postgres URLs; CORS echoes only `APP_ORIGIN` allowlist entries. Dev keeps the permissive behavior deliberately. **Resolved**
- → ~~Postgres→SQLite silent failover in `db.js`~~ **FIXED 2026-08-18** by WP-DEPLOY-001: refused in production at import, at `$connect()`, and mid-flight in `query()`. Still available in dev. **Resolved**
- → Legacy `authentication/server.js` package: 3 advisories (1 high nodemailer CRLF, 2 moderate) — dead code path; retire the package or pin deps. **Low** (unified backend audit = 0 vulns)
- → 🚨 **AI rate limiters are keyed by IP, not by user — CRITICAL, fix before any multi-user deployment.** All five `rateLimit(...)` instances in `backend/src/routes/noteRoutes.js` (lines ~35–51) omit `keyGenerator`, so express-rate-limit v8 falls back to client IP. Reproduced live 2026-08-20 on a clean DB: user A burns the summarize budget (`200 200 429 429 429`), then a **brand-new user's first ever AI call returns 429**. Behind a proxy, NAT, campus, or mobile carrier, five requests lock out every other customer on that egress IP for 15 minutes. It also makes the E2E suite order-dependent (re-running the AI specs inside one window fails four of them; `ai-assist-smoke.spec.js:53` documents the workaround instead of catching the bug). Fix = one shared `keyGenerator` on `req.userId` — `auth` already runs before every limiter on that router. **Full agent instruction ready at `AGENT_INSTRUCTION_WP-AI-005.md`.** **Critical**
- → In-memory rate-limit store is single-instance only. Correct for the MVP; if the API is ever scaled to more than one process/dyno the budgets fork per instance. Revisit only at that point (Upstash Redis is the free-tier option). **Low — do not build now**
- → ~~`docs/` stale artifacts~~ and ~~`screenshots/` ~20 MB~~ — **both directories do not exist in this checkout** (verified 2026-08-20 via `git ls-files`). Stale Bible entries; removed. **Resolved / not applicable**
- → Legacy `jsonwebtoken` fallback verification path — retire after token migration window. **Low**
- → No unit tests; no deployment manifest. CI is written but **not yet active**: `ci/e2e.yml` must be moved to `.github/workflows/e2e.yml` by a human (agent tokens cannot push workflow files). Until then no run is enforced on PRs. **Medium**
- → Single ~2,400-line `app.js` — acceptable while E2E-guarded. **Low**

## DATABASE SCHEMA VERSION

- → `migrate.js` is the real source of truth. Tables: `User, Note(+notebookId,+isPinned), Notebook, Tag, NoteTag, Attachment, NoteShare, otp_challenges, refresh_tokens, password_reset_tokens`.
- → Latest migration applied: `ALTER TABLE "Note" ADD COLUMN summary TEXT` (WP-AI-001, both dialects, idempotent — verified by double run).
- → `prisma/schema.prisma` is a **documented mirror** of that schema (synced by WP-SCHEMA-001); `migrate.js` remains the only applicator. The repo does not run `prisma generate` and has no `@prisma/client` dependency — keep the mirror updated by hand whenever migrate.js gains a column.

## API ENDPOINTS BUILT

- → Notes: `GET/POST /api/notes` · `GET/PUT/PATCH/DELETE /api/notes/:id` · `POST :id/trash` · `POST :id/restore` · `POST/DELETE :id/share` ✅
- → AI: `POST /api/notes/:id/summarize` · `POST :id/suggest-title` · `POST :id/suggest-tags` · `POST :id/chat` · `POST :id/chat/stream` (SSE) · `POST :id/assist` (continue/rephrase/shorten/expand) ✅
- → Public: `GET /api/public/share/:token(+/files/:id)` ✅
- → `GET/POST/PATCH/DELETE /api/notebooks(/:id)` · `GET/POST/DELETE /api/tags(/:id)` ✅
- → Attachments: `GET/POST /api/notes/:id/attachments` · `GET /api/attachments/:id/file` · `DELETE /api/attachments/:id` ✅
- → Users: `POST /api/users/signup|signin` · `GET /api/users/me/export` · `DELETE /api/users/me` ✅
- → Auth: `/api/auth/google(+callback) · otp/resend · otp/demo-request · otp/verify · forgot-password · reset-password · refresh · logout · health` ✅ (mounted at `/api/auth` + legacy `/auth`)
- → `GET /health`, `GET /api/health` ✅

## ENVIRONMENT VARIABLES REQUIRED

- → `DATABASE_URL` (omit → SQLite) · `SQLITE_PATH` · `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ISSUER` (+legacy `JWT_SECRET`) · `OTP_PEPPER` · `APP_ORIGIN` · `PORT` · `NODE_ENV` · `UPLOAD_DIR`
- → Optional: `SENTRY_DSN`/`SENTRY_ENVIRONMENT` · `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` · `SMTP_HOST/PORT/SECURE/USER/PASSWORD` + `MAIL_FROM` (unset ⇒ demo OTP + dev reset-token echo)
- → Optional: `GROQ_API_KEY` for live AI; blank keeps summarize/title/tag/chat/assist responses in deterministic mock mode

## CURRENT BLOCKERS

- → Playwright Chromium unavailable in Arena sandboxes — full UI journey must run in CI or a dev machine (`cd backend && npm run test:e2e`).

## DEPLOY GATES (must pass before any real deployment — do not build now)

1. Startup fails closed in `NODE_ENV=production` when JWT secrets missing or Postgres unreachable (no SQLite fallback, no secret fallback).
2. CORS locked to real origins.
3. SMTP + Google OAuth configured → demo OTP and dev reset-token echo automatically off (already guarded — verify).
4. Postgres backup + `uploads/` backup + restore drill documented.
5. CI workflow running Playwright with Chromium.

## NEXT 3 PRIORITIES

1. 🚨 **WP-AI-005 — per-user AI rate limiting.** Now ahead of hosting: deploying today ships a product where a second user on the same IP is locked out of every AI feature. One route file + one new E2E spec, no new dependency. Instruction ready at `AGENT_INSTRUCTION_WP-AI-005.md`.
2. **CI activation** — `git mv ci/e2e.yml .github/workflows/e2e.yml` by the owner (agent tokens cannot push workflow files). Promoted above hosting because the browser journey is the one thing that **cannot** be verified in this sandbox, and it is the only guard on the app-shell UI.
3. **Hosting** — human follows `RUNBOOK.md` with real secrets. Do this **after** 1 and 2: the fail-closed boot, CORS lock, and CSRF guards are verified and ready, so the only thing standing between this repo and a real deployment is the rate-limit defect and an active CI signal.

> Deferred, deliberately: PR #2 salvage items 3–7 (lockout, token-versioning, device inventory, password policy, Express 5). All are real, none block launch. Do not start them before priority 1.
