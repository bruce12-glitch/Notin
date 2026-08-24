# 🏗️ Notin Architecture Diagram — Current (2026-08-22)

> Updated after WP-HARDEN-001 + production-beta hardening (#45). Previous version incorrectly marked Backend/Auth as PLANNED — now 100% implemented.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NOTIN REPOSITORY  (e2ee739)                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   FRONTEND      │  │    BACKEND       │  │  AUTHENTICATION   │            │
│  │   (✅ COMPLETE)  │  │   (✅ COMPLETE)  │  │   (✅ COMPLETE)  │            │
│  │                 │  │                  │  │                 │              │
│  │  index.html     │  │  Express 4.21    │  │  app.html       │              │
│  │  index-neon.html│  │  Unified :5000   │  │  TipTap 2.27    │              │
│  │  context.html   │  │  REST + static   │  │  OAuth + OTP    │              │
│  │  legal pages    │  │  Prisma docs     │  │  PWA sw.js v15  │              │
│  │  Tailwind v4    │  │  pg + SQLite     │  │  share.html     │              │
│  │  Vanilla JS     │  │  Zod validation  │  │  esbuild bundle │              │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘              │
│           │                    │                     │                       │
│           │  dev-server :3000  │  serves static      │                       │
│           └──── proxies /api/*─┴──── from ../../authentication              │
│                                │                                             │
│                                ▼                                             │
│                     ┌─────────────────────┐                                  │
│                     │  Database            │                                  │
│                     │  PG 16 prod          │                                  │
│                     │  SQLite dev fallback │                                  │
│                     │  migrate.js source   │                                  │
│                     │  10 tables           │                                  │
│                     └─────────────────────┘                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  CI/CD: .github/workflows/e2e.yml (active) + ci/e2e.yml (mirror)     │    │
│  │  Fail-closed smokes, Postgres rehearsal, Playwright Chromium         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

Ports:
  5000 = Unified API + Auth + Editor + Share (backend/src/server.js)
  3000 = Marketing dev server (frontend/dev-server.mjs) proxies /api/* /auth/* → :5000
```

---

## Backend — Unified Server (port 5000)

```
backend/src/server.js
├─ trust proxy → requestId (X-Request-Id echo/replace)
├─ compression → helmet CSP (prod: frame-ancestors self, else *)
├─ CORS: prod = APP_ORIGIN allowlist only, dev = echo origin
├─ static allowlist: only /index.html,/login.html,/app.html,/share.html,
│                    /script.js,/app.bundle.js,/share.js,/styles.css,/app.css,
│                    /sw.js,/manifest.webmanifest,/icons/icon-*.png
├─ json 10mb + cookieParser
├─ /health (liveness, no DB) → {ok, database: PG|SQLite-fallback}
├─ /api/health (readiness, SELECT 1, 2s timeout) → 200 ok / 503 degraded
├─ /api/health/deep (+ uploadDir writability)
├─ /api/auth/* + /auth/* (legacy) → authRoutes (refresh, logout CSRF-guarded)
├─ /api/users → userRoutes (signup, signin, export, delete)
├─ /api/notes → noteRoutes (CRUD, trash/restore, share, AI)
├─ /api/notebooks → notebookRoutes
├─ /api/tags → tagRoutes
├─ /api/notes/:id/attachments + /api/attachments/:id/file → attachmentRoutes
├─ /api/public/share/:token → publicShareRoutes (no auth)
├─ errorHandler (Sentry stripped)
└─ graceful shutdown SIGTERM/SIGINT 10s drain → db.disconnect

config/db.js:
  - DATABASE_URL postgres://? → pg.Pool, else node:sqlite fallback
  - Production refuses fallback at import + $connect + query()
  - query() uses $n placeholders, dual driver compatible

db/migrate.js:
  - Real source of truth, idempotent DO $$ blocks (fixed missing END;)
  - Tables: User, Note(+notebookId,isPinned,summary), Notebook, Tag, NoteTag,
            Attachment, NoteShare, otp_challenges, refresh_tokens(+family_id,revoke_reason),
            password_reset_tokens, auth_throttle
  - Indexes: 16 non-unique + GIN FTS indexes (Note_title_fts_idx, etc)

lib/:
  - validation.js (Zod): noteCreate/Update strict, notebook/tag name 1-100/50,
                         contentJson plain-object ≤2MB deep walk, tagIds ≤50 unique,
                         EMAIL_RE, ID_RE, expectedUpdatedAt ISO
  - apiResponse.js: sendValidationError, sendNotFound, sendConflict, sendInternalError
  - httpSecurity.js: canonicalOrigin, isOriginAllowed single source
  - jwt.js: jose access 15m + refresh rotation, family_id
  - throttle.js: per-email lockout 1→5→15→60m, OTP issue 5/15m sliding window
  - logging.js: logError(req, err, ctx) with [requestId]

controllers/:
  - authController.js: OTP issue/verify/resend/demo-request, Google OAuth stub (503 without creds),
                       forgot/reset (hashed, 60m TTL, session revocation), refresh (compare-and-swap UPDATE,
                       10s grace sibling, replay nuke), logout
  - userController.js: signup/signin, export JSON, DELETE /me {confirm:DELETE} cascade
  - noteController.js: create with quota 5000, getNotes with filter=active|trash|all, q (FTS PG vs LIKE SQLite),
                       notebookId=none/unfiled, tagId, pagination page/limit/includeMeta/includeRank,
                       update with expectedUpdatedAt, tagIds replace-set, isPinned boolean
  - notebook/tag/share/attachment/ai controllers
  - aiController.js: summarize, suggest-title, suggest-tags (maps to existing IDs), chat (non-streaming),
                     chat/stream SSE (same 5/15m budget, mock split ~6-word chunks, Groq streaming with
                     buffered line parsing, disconnect via res close), assist (continue/rephrase/shorten/expand)
```

---

## Frontend — Marketing Site (Green + Neon)

```
frontend/
├─ index.html (956L) Green Edition, index-neon.html (915L) Neon
├─ context.html roadmap, privacy.html / terms.html / security.html (beta drafts 2026-08-22)
├─ input.css / input-neon.css → Tailwind v4 → styles.css / styles-neon.css (28KB min)
├─ polish.css responsive layer
├─ script.js (858L) motion engine:
│   - scroll progress, back-to-top, navbar shrink 72→58px @260px
│   - IntersectionObserver reveal threshold 0.12, stagger i*70ms max 420ms
│   - 3D tilt perspective(900px), magnetic buttons dx*0.22, parallax --px3d/--py3d
│   - CardsShowcase 8 cards infinite loop dual sets, autoplay 2.6s, hover circles
│   - Video play-enforcer, OS-aware download CTA, theme switcher via notinAppOrigin()
├─ dev-server.mjs :3000 proxies /api/* /auth/* → :5000
└─ assets/: hero-demo-full.mp4, Lottie evernote-homepage.json, 3D icons
```

Component hierarchy same as previous doc — 12 sections: Navbar (mega-menu), Hero split, CardsShowcase, Capture, OrganizeShowcase, Testimonials, Pricing, AIToolsBand, Download (6 platforms + web clipper disabled spans aria-disabled), DarkCTA, FAQ, Footer.

CTA wiring fixed WP-FUNNEL-001 + WP-LEFTOVERS-001: login→/login.html, signup→/, app→/app.html, enterprise→mailto:hello@notin.app, binaries → disabled spans role=link Coming soon.

---

## Authentication & Editor App (post-auth)

```
authentication/
├─ index.html signup, login.html signin, script.js auth client
│   - readCookie, csrfHeaders, single-flight bootstrapToken guard
├─ app.html (356L) Evernote-dark Home + editor
│   - sidebar: All Notes, Shortcuts (pinned), Notebooks, Tags, Trash, + hidden beta nav
│   - list: searchInput, note rows with tag chips + notebook pill + hover pin + green active bar
│   - editor: TipTap (StarterKit + Underline + TaskList/Item + Placeholder), 28px title,
│             meta strip edited time + live word count, floating toolbar pill, 900ms debounce autosave
│   - AI: Summarize button, Ask this note panel (6 turns memory-only, textContent bubbles),
│         Assist dropdown (Continue/Rephrase/Shorten/Expand) + selection bubble on coordsAtPos()
│   - account modal: export, DELETE typed confirm, logout
│   - offline banner via navigator.onLine
├─ app.js (2717L) vanilla ESM:
│   - plainFromNote, docFromNote, compareNotes (pinned-first + updated/created/title)
│   - IndexedDB notin-offline-v1 snapshots per userId (notes/notebooks/tags, never tokens)
│   - offlineReadOnly guards, loadCachedNotes, updateOfflineSnapshot
│   - SW registration skipped under Playwright webdriver
├─ app.bundle.js esbuild minified (git diff check in CI)
├─ app.css, styles.css
├─ share.html/share.js public renderer (title+body+image metadata only)
├─ sw.js CACHE_NAME notin-shell-v15, shell-only, bypass /api/* /auth/*
├─ manifest.webmanifest + icons/icon-192.png / 512.png
└─ package.json only TipTap + esbuild (no express/nodemailer legacy — retired WP-HARDEN-001)
```

---

## Database Schema (migrate.js source)

```
User: id, email unique, username?, password?, google_sub unique?, createdAt, updatedAt
Note: id, title, description, contentJson TEXT, contentText TEXT, summary TEXT,
      isTrashed BOOL default 0, trashedAt, isPinned BOOL default 0,
      userId FK CASCADE, notebookId FK SET NULL, createdAt, updatedAt
Notebook: id, userId FK CASCADE, name, createdAt, updatedAt
Tag: id, userId FK CASCADE, name, createdAt
NoteTag: noteId FK CASCADE, tagId FK CASCADE, composite PK, createdAt
Attachment: id, noteId FK CASCADE, userId FK CASCADE, filename, mime, size, path, createdAt
NoteShare: id, noteId unique FK CASCADE, userId FK CASCADE, tokenHash unique, shareEnabled BOOL,
           createdAt, expiresAt
otp_challenges: id, user_id FK CASCADE, code_hash, expires_at, attempts, used_at, created_at
refresh_tokens: hash PK, user_id FK CASCADE, expires_at, revoked_at, family_id, revoke_reason, created_at
password_reset_tokens: id, user_id FK CASCADE, token_hash, expires_at, used_at, created_at
auth_throttle: email+scope PK, count, window_start, lock_level, locked_until, updated_at
schema_migrations: version

Indexes: User_email_key, User_google_sub_key, Note_userId_idx, Note_isTrashed_idx,
         Note_isPinned_idx, Note_notebookId_idx, Note_title_fts_idx GIN, Note_content_fts_idx GIN,
         Note_description_fts_idx GIN, Notebook_userId_idx, Tag_userId_idx, NoteTag_noteId_idx,
         NoteTag_tagId_idx, Attachment_noteId_idx, Attachment_userId_idx, NoteShare_noteId_key,
         NoteShare_tokenHash_key, NoteShare_userId_idx, otp_challenges_user_id_idx, etc,
         refresh_tokens_user_id_idx, refresh_tokens_family_idx, etc
```

---

## Security Model

```
JWT: access 15m memory-only, refresh httpOnly Secure SameSite rotating cookie SHA-256 one-time-use
     family_id = user_id for legacy rows, randomToken(24) for new families, successor inherits family
     replay: consumed token in 10s grace → fresh sibling (benign race), else nuke family revoke_reason='replay'
     logout → revoke_reason='logout' not sheltered by grace

CSRF: notin_csrf cookie rand.hmac (HMAC-SHA256 keyed by sha256(refresh secret)), non-httpOnly
      requires cookie present ∧ header x-notin-csrf present ∧ equal ∧ signature valid on refresh/logout
      else 403 Invalid CSRF token; absent refresh cookie → skip → generic 401 Invalid session
      Origin guard: mutating auth routes with non-allowlisted Origin → 403 Invalid origin

Throttle: auth_throttle per email per scope (signin, otp-issue), 5 fails → 1m →5m→15m→60m capped
          wrong password still runs bcrypt, correct password clears ladder

Validation: Zod strict, unknown fields rejected, control chars rejected, title ≤500, description ≤100k,
            contentText ≤500k, contentJson plain acyclic ≤2MB, tagIds 0-50 unique, notebookId sane charset

Shares: 32-byte random token, SHA-256 at rest, rotate/revoke, trashed→404, scoped files

Attachments: mime whitelist PNG/JPEG/WebP/GIF, ≤5MB, ≤10/note, storage quota 250MB, magic-byte check,
             random filenames, owner-only serving private max-age 3600

CORS: prod locked to APP_ORIGIN allowlist, preview echo dev-only, Vary Origin
```

---

## AI Layer (Phase 2 complete 7/7)

```
Provider: lib/ai/provider.js abstraction
  - GROQ_API_KEY unset → deterministic mocks (no network)
  - GROQ_API_KEY set → Groq API bounded to 800 chars, 20s whole-response abort

Endpoints (all owner-scoped, authenticated, per-user rate limit user:<userId>):
  POST /api/notes/:id/summarize → mock or Groq
  POST /api/notes/:id/suggest-title
  POST /api/notes/:id/suggest-tags → 3-5 suggestions mapped to existing tag IDs, never creates tags
  POST /api/notes/:id/chat → non-streaming JSON in/out, ≤6 turns history, role user|assistant, content ≤2000
  POST /api/notes/:id/chat/stream → SSE data: {"delta":…} + [DONE], same 5/15m budget as chat,
                                  mock splits mockChatAnswer into ~6-word chunks via setImmediate,
                                  Groq path buffered line parsing, per-frame JSON tolerance, finally cancels reader on res close
  POST /api/notes/:id/assist → continue/rephrase/shorten/expand, 5/15m dedicated budget,
                              read-only server, pending suggestion memory-only, Apply → insertContentAt → onEdit → autosave

Client: stream-first empty bubble textContent += fill, fallback to JSON endpoint, transcript session-only cleared on view change/reload
```

---

## PWA / Offline

```
manifest.webmanifest installable, icons 192/512
sw.js notin-shell-v15 caches shell assets only, bypasses /api/* /auth/*
IndexedDB notin-offline-v1 store snapshots keyed by userId, session-only active userId cleared on logout/delete
Offline: list/body read-only, create/edit/save/organize/share disabled, offline banner shown
Not a sync engine — offline edits intentionally unsupported
```

---

## Motion & Design Tokens

```
Tailwind v4 @theme:
  font-sans Inter, font-display IBM Plex Sans, font-mono JetBrains Mono
  brand 50 #e9f9ee → 800 #005c1a, primary 500 #8fe333 (Evernote green)
  bg-primary #f4eee5 cream, bg-tertiary #141414 near-black, surface #fff
  text-primary #141414, stroke-cards #e7e0d3

Motion engine:
  rAF scroll progress 3px top, back-to-top @600px, navbar shrink @260px
  reveal IntersectionObserver 0.12, stagger 70ms max 420ms, opacity 0→1 translateY 22px→0
  tilt perspective(900px) rotateX/Y, magnetic dx*0.22, parallax data-parallax speed
  carousel dual sets infinite loop, autoplay 2.6s pause on hover/touch
  video autoplay muted loop playsinline + play-enforcer + poster fallback
  reduced-motion guards CSS + JS
```

---

## CI/CD & Ops

```
.github/workflows/e2e.yml (active) + ci/e2e.yml (mirror):
  - install auth/backend/frontend deps, npm run check (node --check), build:app + git diff check,
    audit --omit=dev high level
  - migrate SQLite dev path
  - fail-closed smokes: no env + placeholder secrets → must exit non-zero + FATAL: line
  - Postgres rehearsal: real postgres:16-alpine, random non-placeholder secrets, assert /health reports PostgreSQL
  - Playwright E2E whole suite (workers 1, retries 1 in CI, trace retain-on-failure)
  - artifacts playwright-report/test-results on failure

Dockerfile: multi-stage auth-build (esbuild) + backend-deps + runtime node:22.22-alpine non-root notin,
           HEALTHCHECK wget /health

RUNBOOK.md: backup/restore drill executed 2026-08-18 SQLite proof, Postgres commands documented,
            liveness vs readiness table, X-Request-Id tracing, graceful shutdown 10s

Deploy nginx.conf.example: marketing notin.app + app/API app.notin.app two-origin contract
```

---

## Summary

Notin now has:
- Marketing 100% with truthful beta legal pages
- Unified backend 100% with fail-closed prod boot, FTS search, pagination, quotas, Zod validation, per-user AI limits, CSRF+replay+lockout hardening
- Editor 100% with TipTap, organize, attachments, shares, AI chat/stream/assist, PWA offline read-only
- CI fully staged and now active at .github/workflows/e2e.yml
- Remaining for public market: real hosting, S3 uploads, SMTP/Google OAuth, Stripe billing, Teams/Spaces, native apps/web clipper, legal entity review, monitoring, token-versioning/device inventory/password policy hardening.
