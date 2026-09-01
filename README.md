# 📝 Notin — Full-Stack Note-Taking Platform

<p align="center">
  <img src="frontend/assets/notin-icon-nav.png" width="100" alt="Notin 3D icon" />
</p>

<p align="center">
  <strong>An Evernote-inspired note-taking web application with a pixel-perfect marketing site (Green &amp; Neon editions), a RESTful API backend, and authentication — all built from scratch.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-4.21-000000?style=flat-square&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/TipTap-2.27-6C47FF?style=flat-square" alt="TipTap Editor" />
  <img src="https://img.shields.io/badge/Playwright-E2E-45BA4B?style=flat-square&logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/JWT-auth-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" alt="JWT" />
  <img src="https://img.shields.io/badge/type-Personal%2FPortfolio-8FE333?style=flat-square" alt="Project type" />
</p>

## 📌 Project metadata

**Description:** Notin is a full-stack, privacy-minded note-taking platform for capturing ideas, organizing work, and finding information quickly.

- **Website:** [notin.app](https://notin.app/)
- **About Notin:** [Read the story and roadmap](frontend/context.html)
- **Security policy:** [SECURITY.md](SECURITY.md) · [Report a vulnerability](mailto:security@notin.app)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Project type:** Personal / portfolio project

**Topics:** `note-taking` · `productivity` · `vanilla-javascript` · `nodejs` · `express` · `postgresql` · `prisma` · `jwt` · `pwa` · `ai`

---

## 📋 Table of Contents

- [Project metadata](#-project-metadata)
- [Overview](#-overview)
- [Architecture](#-architecture)
- [Tech Stack](#️-tech-stack)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Endpoints](#-api-endpoints)
- [Testing](#-testing)
- [CI/CD](#-cicd)
- [Security](#-security)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Key Learnings & Challenges](#-key-learnings--challenges)

---

## 📌 Overview

**Notin** is a full-stack note-taking platform inspired by Evernote. It consists of three integrated layers:

| Layer | Description | Status |
|---|---|---|
| 🎨 **Marketing Site** | Pixel-perfect Evernote-style landing page in two themes (Green & Neon) with 3D motion design, Lottie animations, and responsive layout | ✅ Complete |
| ⚙️ **REST API** | Express.js backend with PostgreSQL/SQLite, JWT auth, CRUD for notes/notebooks/tags, image attachments, AI integration, and read-only public sharing | ✅ Complete |
| 🔐 **Auth & Editor App** | Google OAuth + email OTP sign-in, TipTap rich-text editor, post-auth Home dashboard (Evernote-dark clone), PWA offline support | ✅ Complete |

The entire frontend is built with **vanilla JavaScript** (no React/Angular/Vue) and **Tailwind CSS v4**, demonstrating deep understanding of the DOM, CSS architecture, and interactive motion design.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NOTIN REPOSITORY                              │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    FRONTEND          │  │    BACKEND       │  │ AUTHENTICATION  │ │
│  │   (Marketing Site)   │  │   (API Server)   │  │   (App & Auth)  │ │
│  │                      │  │                  │  │                 │ │
│  │  index.html (Green)  │  │  Express 4.21    │  │  App (TipTap)   │ │
│  │  index-neon.html     │  │  RESTful routes   │  │  Sign-up/Login  │ │
│  │  context.html        │  │  Controllers      │  │  OAuth + OTP    │ │
│  │  Tailwind v4 CSS     │  │  Middleware       │  │  PWA + SW       │ │
│  │  Vanilla ES6 JS      │  │  Prisma ORM       │  │  Share renderer │ │
│  │  3D Motion Engine    │  │  PostgreSQL/SQLite│  │                 │ │
│  │  Lottie Animations   │  │  Sentry Monitoring│  │                 │ │
│  └─────────────────────┘  └─────────────────┘  └─────────────────┘ │
│                              │                        │              │
│                              └──────────┬─────────────┘              │
│                                         │                            │
│                              ┌──────────▼──────────┐                │
│                              │   Database           │                │
│                              │   (PostgreSQL prod,  │                │
│                              │    SQLite dev)       │                │
│                              └─────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘

  Port 5000: Unified API + Auth + App (backend/src/server.js)
  Port 3000: Marketing site dev server (frontend/dev-server.mjs)
```

---

## 🛠️ Tech Stack

### Frontend (Marketing Site)
| Technology | Purpose |
|---|---|
| **HTML5** | Semantic markup, ARIA accessibility |
| **Tailwind CSS v4** | Utility-first CSS (pre-compiled, zero runtime) |
| **Vanilla ES6 JavaScript** | Motion engine, 3D parallax, Lottie, theme switching |
| **CSS 3D Transforms** | `perspective`, `transform3d`, `requestAnimationFrame` |
| **Google Fonts** | Manrope, Inter, JetBrains Mono, IBM Plex Sans |
| **Lottie-web** | Vector animations |

### Backend (API)
| Technology | Purpose |
|---|---|
| **Node.js 22** | Runtime |
| **Express 4.21** | HTTP framework (ESM) |
| **PostgreSQL 16** | Production database |
| **SQLite (node:sqlite)** | Development/demo fallback |
| **Prisma ORM** | Schema declaration & documentation |
| **JWT (jose)** | Access + refresh token auth |
| **bcryptjs** | Password hashing |
| **Multer** | File upload handling |
| **Zod** | Runtime request validation |
| **Sentry** | Error monitoring (optional) |
| **Groq API** | AI features (summarize, chat, assist) |

### Authentication & Editor App
| Technology | Purpose |
|---|---|
| **TipTap 2.27** | Rich-text editor (ProseMirror-based) |
| **esbuild** | JavaScript bundler |
| **Google OAuth** | Third-party authentication |
| **SMTP** | Email OTP delivery |
| **Service Worker** | PWA offline read-only support |
| **IndexedDB** | Offline note snapshots |

### DevOps
| Technology | Purpose |
|---|---|
| **Playwright** | E2E smoke tests (Chromium) |
| **GitHub Actions** | Complete release workflow staged at `ci/e2e.yml`; owner activation required |
| **pg_dump / SQLite** | Backup & restore |

---

## ✨ Features

### Marketing Site (Green + Neon Editions)
- **Split hero** — Full-viewport layout with 1920×1200 product video, play-enforcer, and fallback
- **WebGL 3D hero layer (three.js)** — Extruded floating note cards + additive particle field behind the hero, theme-aware (Green/Neon palettes), mouse-parallax camera, scroll-linked dolly/tilt; renders a static frame under `prefers-reduced-motion`, pauses off-screen/hidden, and silently skips when WebGL is unavailable
- **CardsShowcase** — 8 exact Evernote feature cards in an infinite autoplay loop with hover circle animations
- **3D interactions** — Mouse-parallax note cards, glowing AI badge, rotating ring, tilt-on-hover throughout
- **Mega-menu navigation** — Features/Explore/Plans dropdowns with responsive mobile accordion
- **Theme switcher** — Seamless toggle between Green (cream + green) and Neon (black + lime) editions
- **Motion engine** — Scroll progress bar, staggered reveals, magnetic buttons, back-to-top, animated counters
- **Evernote-faithful design** — Exact typography scale, spacing rhythm, color palette, and button styles

### Note-Taking App (Post-Auth)
- **Rich-text editor** — TipTap with bold, italic, underline, headings, bullet/ordered/checklist lists, code blocks, blockquotes, links/bookmarks
- **Instant capture** — Ctrl+Alt+N Quick Add: type a thought, press Enter, cursor lands in the note body ready to expand
- **Rich media** — images (paste, drag-drop, picker), PDF attachments (15 MB, opens in-app), voice recordings (🎙 in-browser MediaRecorder → auto-transcription), sketch pad (draw → PNG attachment)
- **Bi-directional linking** — type `[[` to link any note (autocomplete picker); every note shows its Linked mentions (backlinks + outgoing)
- **Graph view** — force-directed knowledge graph of notes and their `[[ links ]]`; drag nodes, click to open
- **Ask AI (global Q&A)** — "talk to your notes": keyword retrieval + grounded answer with numbered, clickable sources (Groq when configured, deterministic mock otherwise)
- **AI writing tools** — Summarize, suggest title/tags, per-note chat, streaming chat, and Assist actions: continue, rephrase, shorten, expand, **fix grammar, create outline**
- **Audio transcription** — recordings transcribe via Groq Whisper (`whisper-large-v3`) when `GROQ_API_KEY` is set; transcript is appended to the note as plain text
- **Web clipper** — bookmarklet that sends any page (title + selection + URL) straight into your notes via `app.html#clip?...`
- **Focus mode** — Ctrl/Cmd+Shift+F (or the ⛶ button) hides the sidebar and list for distraction-free writing; Esc exits
- **Undo trash** — moving a note to trash shows a 6-second toast with one-click Undo (full restore)
- **Exports** — per-note download as Markdown, plain text, or styled HTML (plus print)
- **Tag colors** — every tag name deterministically maps to its own hue across chips, list rows, and the sidebar
- **Keyboard-first** — Ctrl+N new note, Ctrl+Alt+N quick add, Ctrl+K search, Ctrl+S save, ↑/↓ to move through the note list, `?` for the shortcuts cheat-sheet
- **Search filters** — full-text search (PostgreSQL FTS with relevance ranking / SQLite LIKE fallback) plus a date filter (today / 7 days / 30 days)
- **Live save status** — "Saved · just now / Xm ago" keeps the autosave state honest
- **Organize** — Notebooks (folders) + Tags (multi-tagging) + `[[ links ]]` — hybrid structure that works however your brain does
- **Attachments** — PNG/JPEG/WebP/GIF (≤5 MB), PDF (≤15 MB), audio (≤25 MB), ≤10 per note, magic-byte validated, owner-only access
- **Public sharing** — Cryptographically secure share links (32-byte random tokens, SHA-256 at rest), scoped to note
- **Trash management** — Trash → restore → delete-forever (trash-first guard)
- **Pin notes** — Pinned-first sorting with hover-revealed pin control
- **Auto-save** — 900ms debounced persistence + manual save + Ctrl/Cmd+S
- **Account export/delete** — Full JSON export and complete account cascade deletion

> **Roadmap** (needs external services or native tooling): OCR/PDF text extraction in search, embedding-based semantic search, native desktop/mobile builds, full offline write-sync queue, calendar integration.

### AI Features
- **Summarize** — `POST /api/notes/:id/summarize` with Groq integration (mock when key unset)
- **Title suggestions** — AI-generated titles for notes
- **Smart tags** — Suggested tags mapped to existing tags
- **Note chat** — Session-only Q&A about a note (no transcript stored)
- **Writing assistant** — Continue, rephrase, shorten, and expand actions with selection bubble menu
- **Streaming chat** — SSE streaming for chat responses (with JSON fallback, shared per-user rate budget)

### PWA & Offline
- **Service worker** — Caches static shell assets; app.html reads last-known data from IndexedDB when offline
- **Offline banner** — Disables create/edit/save/share when `navigator.onLine` is false
- **Manifest** — Installable web app with 192px/512px icons

---

## 📁 Project Structure

```
notin/
├── index.html                  # Entry — redirects to frontend/
├── README.md                   # ← You are here
├── RUNBOOK.md                  # Operations, deployment, backup/restore, E2E
├── ARCHITECTURE_DIAGRAM.md    # Full system architecture diagram
├── GAP_ANALYSIS.md             # Product gap analysis & roadmap
├── PROJECT_BIBLE.md            # Comprehensive project state reference
│
├── frontend/                   # 🎨 MARKETING SITE
│   ├── index.html              # Green Edition landing page
│   ├── index-neon.html         # Neon Edition landing page
│   ├── context.html            # About / roadmap page
│   ├── input.css               # Tailwind v4 source (Green theme)
│   ├── input-neon.css          # Tailwind v4 source (Neon theme)
│   ├── styles.css              # Compiled Green CSS (28KB minified)
│   ├── styles-neon.css         # Compiled Neon CSS
│   ├── polish.css              # Shared responsive visual layer
│   ├── script.js               # Motion engine & interactions (~985 LOC)
│   ├── dev-server.mjs          # Dev server with API proxy
│   └── assets/                  # Images, video, Lottie, icon
│       ├── hero-demo-full.mp4  # Product demo video
│       ├── notin-icon-*.png    # 3D logos & favicons
│       └── ...
│
├── backend/                    # ⚙️ REST API
│   ├── src/
│   │   ├── server.js           # Express app entry (port 5000)
│   │   ├── config/             # Database (db.js), Sentry (sentry.js)
│   │   ├── controllers/        # account, ai, attachment, auth,
│   │   │                        # note, notebook, share, tag, user
│   │   ├── routes/             # attachment, auth, note, notebook,
│   │   │                        # publicShare, tag, user
│   │   ├── middleware/         # JWT auth middleware
│   │   ├── lib/               # JWT, httpSecurity, AI provider/prompts
│   │   └── db/                 # Data migrations (migrate.js)
│   ├── prisma/                # Schema declaration (mirrors migrates)
│   ├── tests/e2e/             # Playwright E2E tests (request + UI specs)
│   ├── package.json
│   └── playwright.config.js
│
├── authentication/            # 🔐 AUTH & EDITOR APP
│   ├── app.html / app.js / app.css   # TipTap rich-text editor
│   ├── index.html / login.html       # Sign-up / Sign-in
│   ├── script.js                     # Auth client logic
│   ├── sw.js                         # Service worker (PWA)
│   ├── manifest.webmanifest          # PWA manifest
│   ├── share.html / share.js         # Read-only share renderer
│   ├── icons/                        # PWA icons
│   └── package.json
│
├── ci/e2e.yml                # Release gates; move to .github/workflows to activate
├── Dockerfile                 # Production Node 22 container
├── deploy/nginx.conf.example # Marketing/app two-origin reverse-proxy reference
│
└── .gitignore
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22.5+
- npm
- Chromium (for E2E tests)

### 1. Marketing Site (standalone)
```bash
cd frontend
npm install

# Open the landing pages directly (no build — pre-compiled)
open index.html       # Green Edition
open index-neon.html  # Neon Edition

# Or run the dev server with API proxy
node dev-server.mjs   # http://localhost:3000
```

### 2. Full App (API + Auth + Editor) — Unified on port 5000
```bash
# Install auth dependencies
cd authentication
npm ci

# Install backend dependencies
cd ../backend
npm ci

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL URL or leave blank for SQLite dev fallback

# Run database migrations
npm run db:migrate

# Start the unified server
npm start    # http://localhost:5000
```

### 3. Marketing Site with Live API
```bash
cd frontend
PORT=3000 API_TARGET=http://localhost:5000 node dev-server.mjs
```

> **Demo mode:** When `NODE_ENV` is not `production` and SMTP is unset, the demo OTP `123456` is available for testing the full auth flow.

---

## 📡 API Endpoints

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health (database type, uptime) |
| GET | `/api/auth/health` | Auth health (demo mode status) |

### Authentication (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/google` | Google OAuth — start flow |
| GET | `/api/auth/google/callback` | Google OAuth — callback |
| POST | `/api/auth/otp/request` | Request a production email OTP challenge (creates passwordless account when new) |
| POST | `/api/auth/otp/verify` | Atomically verify and consume an OTP code |
| POST | `/api/auth/otp/resend` | Resend OTP and return a replacement opaque challenge |
| POST | `/api/auth/otp/demo-request` | Request demo OTP (dev only) |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token (increments tokenVersion, revokes all refresh) |
| POST | `/api/auth/refresh` | Rotate refresh token (captures UA/IP) |
| POST | `/api/auth/logout` | Revoke refresh token (CSRF-guarded) |
| GET | `/api/auth/sessions` | List active sessions (device inventory, Bearer) |
| POST | `/api/auth/sessions/revoke-others` | Revoke all other sessions |
| DELETE | `/api/auth/sessions/:familyId` | Revoke a session by familyId |
| POST | `/api/auth/cleanup` | Cleanup expired OTP/reset/revoked tokens (Bearer, returns counts) |
| POST | `/api/auth/password-strength` | Evaluate password strength (public, returns score/label/issues) |
| GET | `/api/auth/providers` | Public capability discovery — `{ google, apple, otp, password, demoOtp }` so sign-in UIs render only supported options |
| GET | `/api/auth/health` | Auth health (demo mode status) |

### Users (`/api/users`)
| Method | Path | Description |
|---|---|---|
| POST | `/api/users/signup` | Create account (password policy: 3-of-4 categories, common blocklist) |
| POST | `/api/users/signin` | Sign in (returns JWT + refresh cookie, captures UA/IP) |
| GET | `/api/users/me/export` | Export all user data (JSON, protected) |
| GET | `/api/users/me/usage` | Usage: notes/quota, storage, sessions (protected) |
| GET | `/api/users/me/sessions` | Alias for active sessions (protected) |
| DELETE | `/api/users/me` | Permanently delete account (protected) |

### Notes (`/api/notes` — protected)
| Method | Path | Description |
|---|---|---|
| GET | `/api/notes` | List notes (search `?q=`, notebook/tag filters, `?page`/`?limit` pagination, `?includeMeta=true` for `{ items, meta }`, `?includeRank=true` for FTS rank) |
| POST | `/api/notes` | Create note |
| PUT / PATCH | `/api/notes/:id` | Update note |
| POST | `/api/notes/:id/trash` | Move to trash |
| POST | `/api/notes/:id/restore` | Restore from trash |
| DELETE | `/api/notes/:id` | Delete from trash (permanent) |
| POST | `/api/notes/:id/share` | Create/rotate public share link |
| DELETE | `/api/notes/:id/share` | Revoke share link |

### Notebooks & Tags (protected)
| Method | Path | Description |
|---|---|---|
| GET | `/api/notebooks` | List notebooks |
| POST | `/api/notebooks` | Create notebook |
| PATCH | `/api/notebooks/:id` | Rename notebook |
| DELETE | `/api/notebooks/:id` | Delete notebook |
| GET | `/api/tags` | List tags |
| POST | `/api/tags` | Create tag |
| DELETE | `/api/tags/:id` | Delete tag |

### Attachments (protected)
| Method | Path | Description |
|---|---|---|
| GET | `/api/notes/:noteId/attachments` | List attachments |
| POST | `/api/notes/:noteId/attachments` | Upload images (multipart `images`) |
| GET | `/api/attachments/:id/file` | Download image |
| DELETE | `/api/attachments/:id` | Delete attachment |

### AI Features (protected)
| Method | Path | Description |
|---|---|---|
| POST | `/api/notes/:id/summarize` | Summarize note |
| POST | `/api/notes/:id/suggest-title` | Suggest title |
| POST | `/api/notes/:id/suggest-tags` | Suggest tags |
| POST | `/api/notes/:id/chat` | Chat about note (non-streaming) |
| POST | `/api/notes/:id/chat/stream` | Streaming chat (SSE) |
| POST | `/api/notes/:id/assist` | Writing assistant (continue/rephrase/shorten/expand) |

### Public Sharing (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/api/public/share/:token` | Read shared note (title + body + image metadata) |
| GET | `/api/public/share/:token/files/:attachmentId` | Read shared image |

---

## 🧪 Testing

The project includes a comprehensive Playwright E2E test suite:

```bash
cd backend
npx playwright install chromium
npm run test:e2e
```

**Test specs** (in `backend/tests/e2e/`):
| File | Scope |
|---|---|
| `mvp-smoke.spec.js` | Full UI journey — signup → editor → notebooks → tags → attachments → shares → trash → export → logout |
| `ai-smoke.spec.js` | AI endpoint availability |
| `ai-chat-smoke.spec.js` | Note chat endpoint |
| `ai-chat-stream-smoke.spec.js` | Streaming chat (SSE) |
| `ai-assist-smoke.spec.js` | Writing assistant |
| `ai-tags-smoke.spec.js` | Smart tag suggestions |
| `ai-title-smoke.spec.js` | Title suggestions |
| `auth-csrf.spec.js` | CSRF protection verification |
| `auth-refresh-replay.spec.js` | Refresh token replay attack prevention |

Tests use throwaway data on every run. Failure-only screenshots and retained traces are written to ignored artifact directories.

---

## 🔁 CI/CD

The complete CI pipeline is **active** at `.github/workflows/e2e.yml` (mirror at `ci/e2e.yml`):

- **E2E suite** — Full Playwright test run against Chromium
- **Fail-closed smokes** — Verifies the server refuses to boot with placeholder secrets or non-`postgres://` URLs
- **Postgres rehearsal** — Boots against a real `postgres:16-alpine` service and asserts `/health` reports PostgreSQL
- **Backup/restore drill** — Documented and executed in the RUNBOOK

---

## 🔒 Security

The project implements several security-hardening measures:

| Measure | Implementation |
|---|---|
| **JWT authentication** | 15-minute access tokens (memory-only, `tv` claim) + rotating HTTP-only refresh cookies (SHA-256, one-time use) + tokenVersion invalidation on password reset |
| **Password hashing** | bcryptjs + password policy (3-of-4 categories, common blocklist, no sequential/repeating, no email/username containment) |
| **OTP security** | Hashed codes, 5-minute expiry, single-use, max 5 attempts |
| **CSRF protection** | Signed origin validation via httpSecurity middleware |
| **Fail-closed boot** | Production refuses to start with placeholder secrets or without a real PostgreSQL URL |
| **CORS** | Locked to `APP_ORIGIN` in production; preview/localhost echo is dev-only |
| **Rate limiting** | IP-based rate limits on auth endpoints and public share reads |
| **Device inventory** | Active sessions with UA/IP/lastActive, revoke per device or revoke-others |
| **Share tokens** | 32-byte cryptographically random tokens; only SHA-256 hashes stored |
| **Input sanitization** | SQL injection prevention via parameterized queries; XSS prevention in editor output |
| **Attachment validation** | File type whitelist (PNG/JPEG/WebP/GIF), size limits, random filenames |
| **Sentry privacy** | Request data, users, extras, and breadcrumbs intentionally stripped |

---

## 🧠 Key Learnings & Challenges

### Architecture Decisions
- **Unified server on port 5000** — Combined the API, auth, and static app hosting into a single Express process rather than maintaining separate services, simplifying deployment and reducing surface area.
- **SQLite dev fallback** — Local development works without PostgreSQL, but production hard-fails on non-`postgres://` URLs (no silent fallback to prevent data loss).
- **Prisma as documentation only** — The ORM schema mirrors the raw SQL migration tool; migrations are applied via `migrate.js`, keeping control over the exact SQL.

### Frontend Highlights
- **100% vanilla JS** — No framework. Built a custom motion engine with `requestAnimationFrame`, `IntersectionObserver`, touch/pointer event normalization, and `prefers-reduced-motion` support — demonstrating strong DOM and browser API knowledge.
- **Pixel-perfect replica** — Reverse-engineered Evernote's landing page to achieve 100/100 design match score, including exact card titles, colors, spacing, and interactions.
- **Dual theme architecture** — Two complete themes (Green/Neon) sharing the same HTML structure via CSS custom properties and separate input files.

### Backend Highlights
- **Full CRUD with data integrity** — Trash-first delete pattern, notebook/tag referential integrity, cascade deletes on account removal.
- **AI integration** — Built a provider abstraction layer that supports both Groq API and deterministic keyless mocks for development, with per-action rate limiting and streaming SSE support.
- **Authentication from scratch** — JWT access/refresh token rotation, bcrypt password hashing, OTP generation/verification (with demo mode), Google OAuth scaffolding.

### Security-First Design
- **Fail-closed philosophy** — The server won't boot in production unless all critical secrets are properly configured.
- **Share token hashing** — Raw share secrets are never stored; only SHA-256 hashes, preventing token theft via DB dump.
- **Defense in depth** — CSRF signed origins, CORS restriction, HTTP-only cookies (vs. localStorage), and separate auth concerns.

---

## 📄 License

© Notin. Personal / portfolio project. The Evernote Lottie asset is the property of Evernote and is used here for design reference only.