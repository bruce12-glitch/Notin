# Notin — Note-Taking Web App

**Live demo (marketing site):** [bruce12-glitch.github.io/Notin](https://bruce12-glitch.github.io/Notin/) — the full app (login, notes, AI) runs with the [local setup](#quick-start) below.

Notin is a full-stack note-taking app: a marketing landing site, a REST API backend, and a rich-text notes app with sign-in, all in one repository.

- **Marketing site** (`frontend/`) — landing pages in Green and Neon themes, plus an About page.
- **Backend API** (`backend/`) — Node.js + Express on port 5000. Serves the API, the auth pages, the notes app, and the marketing site from one process.
- **Notes app** (`authentication/`) — sign-up/sign-in pages and the TipTap rich-text editor app (`/app.html`).

## Features

- Rich-text notes (headings, lists, checklists, code blocks, quotes, links) with 900ms autosave
- Notebooks, tags, pinning, trash with restore and undo, full-text search with filters
- Image/PDF/audio attachments, sketch pad, voice recording with transcription
- `[[wiki-style]]` note links with backlinks panel, knowledge graph view, global Ask AI
- AI writing tools: summarize, suggest title/tags, per-note chat (streaming), rephrase/shorten/expand/grammar/outline
- Public read-only share links (hashed tokens, rotate/revoke), per-note Markdown/text/HTML export and print
- Per-note reminders: due dates, reminders view with snooze/complete, Web Push notifications
- Auth: password + email OTP + Google OAuth, JWT access/refresh rotation, sessions device list, password reset, account export/delete
- PWA with offline read-only snapshot; keyboard shortcuts throughout

Not included (roadmap): native desktop/mobile apps, team workspaces, billing, real-time sync.

| 🤝 **Contributing Guide** | [CONTRIBUTING.md](CONTRIBUTING.md) | Development standards, git workflow, and branch policy |

---

## 📋 Table of Contents

- [Live Website & Links](#-live-website--links)
- [Overview](#-overview)
- [Architecture](#️-architecture)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Endpoints](#-api-endpoints)
- [Testing & Quality Gates](#-testing--quality-gates)
- [Security Hardening](#-security-hardening)
- [CI/CD & DevOps](#-cicd--devops)
- [License](#-license)

---

## 📌 Overview

**Notin** is an end-to-end personal knowledge base and note-taking platform inspired by Evernote. It is structured into three unified, zero-bloat layers:

1. **Frontend (Marketing & Landing)** — Dual-theme landing site (**Green Edition** & **Neon Edition**) built entirely with **vanilla JavaScript** and **Tailwind CSS v4** without any bloated client-side framework runtime. Features 3D parallax effects, interactive feature carousels, responsive mega-menus, and accessibility standards.
2. **Backend (Unified API)** — An Express 4.21 server with a dual-database architecture: production-grade **PostgreSQL 16** with a zero-setup **SQLite (`node:sqlite`)** fallback for instant local developer onboarding.
3. **Authentication & App Shell** — A focused PWA application offering TipTap rich-text editing, quick-capture notes, bi-directional `[[ wikilinks ]]`, interactive knowledge graph, per-note reminders with snoozing and Web Push notifications, offline snapshot caching via IndexedDB + Service Worker, and Groq-powered AI writing tools.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NOTIN MONOREPO                                │
│                                                                         │
│  ┌───────────────────────┐  ┌───────────────────┐  ┌──────────────────┐ │
│  │       FRONTEND        │  │     BACKEND       │  │  AUTHENTICATION  │ │
│  │   (Marketing Site)    │  │   (Express API)   │  │   (App & Editor) │ │
│  │                       │  │                   │  │                  │ │
│  │  • index.html (Green) │  │  • RESTful API    │  │  • TipTap 2.27   │ │
│  │  • index-neon.html    │  │  • Auth / JWT     │  │  • Reminders UI  │ │
│  │  • Vanilla ES6 JS     │  │  • Web Push API   │  │  • Graph View    │ │
│  │  • Tailwind CSS v4    │  │  • Rate Limiting  │  │  • PWA Shell     │ │
│  │  • 3D Motion Engine   │  │  • AI Provider    │  │  • ServiceWorker │ │
│  └───────────────────────┘  └───────────────────┘  └──────────────────┘ │
│                                       │                      │          │
│                                       └──────────┬───────────┘          │
│                                                  │                      │
│                                       ┌──────────▼───────────┐          │
│                                       │       DATABASE       │          │
│                                       │  PostgreSQL (Prod)   │          │
│                                       │   SQLite (Local Dev) │          │
│                                       └──────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘

  Unified App Server: http://localhost:5000 (backend/src/server.js)
  Marketing Dev Server: http://localhost:3000 (frontend/dev-server.mjs)
```

---

## 🛠️ Tech Stack

### Frontend & Landing Site
- **HTML5 & CSS3** — Semantic elements, responsive layouts, ARIA accessibility landmarks.
- **Tailwind CSS v4** — Ultra-fast compile-time styling, zero CSS runtime overhead.
- **Vanilla ES6+ JavaScript** — Lightweight, high-performance DOM manipulation with `requestAnimationFrame` and `IntersectionObserver`.
- **CSS 3D Transforms** — Depth effects, tilt cards, and smooth parallax interactions.

### Backend & API
- **Node.js (v22+)** — Modern JavaScript runtime with native test runner (`node --test`).
- **Express 4.21** — ESM-native routing, security middleware, and controller layer.
- **Dual Database Architecture** — PostgreSQL 16 (with connection pooling) for production; native SQLite (`node:sqlite`) for local sandbox development.
- **Zod** — Strict runtime schema validation for incoming request payloads and query parameters.
- **Security & Crypto** — `jose` (JWT), `bcryptjs` (password hashing), secure HTTP-only cookies, SHA-256 token hashing, and CSRF origin verification.
- **Web Push** — Push notification subscription management with payload delivery for due reminders.
- **AI Engine** — Groq API integration (LLM summarization, title generation, tag suggestion, streaming chat) with keyless deterministic mocks for testing.

### Authentication & App Shell
- **TipTap 2.27 (ProseMirror)** — Headless, extensible rich-text editing experience with custom formatting extensions.
- **esbuild** — High-speed bundling and minification for client assets.
- **Service Worker & PWA** — Offline asset caching, background push notifications, and deep linking.
- **IndexedDB** — Client-side persistent note snapshots for resilient offline reading.

---

## ✨ Features

### 📝 Core Note-Taking & Editing
- **TipTap Rich-Text Editor** — Headings (H1–H3), bold, italics, underline, strike, blockquotes, checklists, code blocks, hyperlinks.
- **Bi-Directional `[[ Note ]]` Linking** — Type `[[` to open an autocomplete link picker; notes automatically surface incoming backlinks and outgoing mentions.
- **Force-Directed Knowledge Graph** — Interactive 2D graph visualizing note relationships and linkages with draggable nodes.
- **Attachments & Media** — Drag-and-drop or paste images (PNG/JPEG/WebP/GIF), audio notes, and PDF viewer attachments with strict magic-byte validation.
- **Focus Writing Mode** — Distraction-free full-screen writing view (`Ctrl+Shift+F`) that hides sidebars and navigation.
- **Trash-First Delete** — Safety-first deletion lifecycle with 6-second undo toast before permanent deletion.
- **Multi-Format Export** — Export any note instantly as Markdown (`.md`), plain text (`.txt`), or formatted HTML.

### ⏰ Per-Note Reminders & Web Push (WP-REM-001)
- **Schedule Due Dates** — Attach specific reminder timestamps to any note directly from the editor toolbar.
- **Central Reminders View** — Dedicated navigation view listing active, overdue, and upcoming reminders sorted chronologically.
- **Quick Snooze & Complete** — 1-click 10-minute snooze, completion toggle, and direct deep-link jump into the corresponding note.
- **Web Push Integration** — Service worker listener receives push payloads and launches notifications that navigate directly to the note.

### 🤖 AI Writing Assistant
- **Smart Summarization** — Generates concise bulleted executive summaries of long notes.
- **AI Title & Tag Generator** — Analyzes note contents to suggest punchy titles and relevant tags.
- **Ask AI (Global Search)** — Ask questions across your notes with citations linked to source notes.
- **In-Editor Assistant** — Quick prompts to rewrite, shorten, expand, or adjust writing tone on highlighted selections.

### 🔒 Enterprise-Grade Security
- **JWT Rotation** — 15-minute ephemeral memory access tokens paired with rotating HTTP-only refresh tokens.
- **Fail-Closed Design** — Server strictly refuses to start in production if insecure default keys or placeholder secrets are detected.
- **Anti-Brute Force** — Exponential lockout ladders on failed sign-in attempts and OTP request rate limits.
- **Zero Raw Tokens** — Public share tokens and refresh cookies are stored exclusively as SHA-256 hashes.

---

## 📁 Project Structure

```
Notin/
├── .github/
│   └── workflows/              # GitHub Actions CI (CodeQL, Docker, E2E)
├── ci/
│   ├── check-csp.mjs           # Content Security Policy & asset checker
│   └── checks.sh               # Local pre-push validation script
├── docker-compose.yml          # Multi-container orchestration (API + Postgres)
├── Dockerfile                  # Multi-stage production container build
│
├── frontend/                   # 🎨 MARKETING SITE
│   ├── index.html              # Green Edition landing page
│   ├── index-neon.html         # Neon Edition landing page
│   ├── context.html            # About & roadmap page
│   ├── styles.css              # Compiled production CSS (Green)
│   ├── styles-neon.css         # Compiled production CSS (Neon)
│   ├── script.js               # 3D motion engine & interaction logic
│   ├── dev-server.mjs          # Local dev server with API proxying
│   └── assets/                 # Brand assets, icons, and 3D graphics
│
├── backend/                    # ⚙️ REST API BACKEND
│   ├── src/
│   │   ├── server.js           # Server bootstrap & middleware setup (Port 5000)
│   │   ├── config/             # DB connection pool (db.js) & Sentry
│   │   ├── controllers/        # Express handlers (notes, reminders, auth, AI)
│   │   ├── routes/             # REST route definitions
│   │   ├── middleware/         # Auth, CSRF, rate-limiter middlewares
│   │   ├── lib/                # JWT helpers, Zod validation schemas, AI driver
│   │   └── db/migrate.js       # SQL database migrations (Postgres + SQLite)
│   ├── tests/
│   │   ├── unit/               # Fast Node unit tests (db, jwt, reminders, validation)
│   │   └── e2e/                # Playwright browser automation suites
│   └── package.json
│
└── authentication/             # 🔐 PWA & APP SHELL
    ├── app.html                # Main application UI
    ├── app.js                  # Frontend client state & TipTap integration
    ├── app.css                 # Dark Evernote-inspired shell styles
    ├── app.bundle.js           # Bundled & minified client bundle
    ├── sw.js                   # Service Worker (offline cache + Web Push)
    ├── manifest.webmanifest    # PWA web manifest
    └── login.html / index.html # Authentication login & signup screens
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v20.x or v22.x+
- **npm** v10+

### Option A: Local Sandbox Mode (Zero Setup, SQLite)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/bruce12-glitch/Notin.git
   cd Notin
   ```

2. **Install all dependencies:**
   ```bash
   # Install auth dependencies
   cd authentication && npm install

   # Install backend dependencies
   cd ../backend && npm install
   ```

3. **Initialize the local SQLite database:**
   ```bash
   npm run db:migrate
   ```

4. **Start the unified server:**
   ```bash
   npm start
   ```
   Open **`http://localhost:5000`** in your browser. The app runs on local SQLite with demo OTP authentication enabled out of the box!

---

### Option B: Production Setup (PostgreSQL)

1. Create your environment file:
   ```bash
   cd backend
   cp .env.example .env
   ```
2. Configure your production variables in `.env`:
   - `DATABASE_URL` — `postgresql://user:password@localhost:5432/notin`
   - `JWT_ACCESS_SECRET` — 32+ character random secret
   - `JWT_REFRESH_SECRET` — 32+ character random secret
   - `OTP_PEPPER` — 32+ character random pepper
3. Run migrations and start:
   ```bash
   npm run db:migrate
   npm start
   ```

---

## 📡 API Endpoints

### 🔑 Authentication (`/api/auth`)
| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/otp/request` | Request 6-digit email OTP challenge | Public |
| `POST` | `/api/auth/otp/verify` | Atomically verify OTP & return JWT access token | Public |
| `POST` | `/api/auth/refresh` | Rotate refresh token cookie & issue new access token | Cookie |
| `POST` | `/api/auth/logout` | Revoke active refresh session & clear cookie | Cookie |
| `GET` | `/api/auth/sessions` | List active user device sessions | Bearer |
| `POST` | `/api/auth/sessions/revoke-others` | Invalidate all sessions except current device | Bearer |
| `POST` | `/api/auth/password-strength` | Evaluate password strength against security policy | Public |

### 📝 Notes Management (`/api/notes`)
| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/notes` | List notes (search `?q=`, tag `?tag=`, pagination) | Bearer |
| `POST` | `/api/notes` | Create a new note | Bearer |
| `PUT/PATCH`| `/api/notes/:id` | Update note title, content, or metadata | Bearer |
| `POST` | `/api/notes/:id/trash` | Move note to trash with undo safety | Bearer |
| `POST` | `/api/notes/:id/restore` | Restore trashed note | Bearer |
| `DELETE` | `/api/notes/:id` | Permanently delete note | Bearer |
| `POST` | `/api/notes/:id/share` | Generate secure 32-byte public share link | Bearer |

### ⏰ Reminders & Push (`/api/reminders`)
| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/reminders` | List all active reminders for user | Bearer |
| `POST` | `/api/reminders` | Create or update reminder on note | Bearer |
| `PATCH` | `/api/reminders/:id` | Update reminder (snooze or mark completed) | Bearer |
| `DELETE` | `/api/reminders/:id` | Delete a reminder | Bearer |
| `POST` | `/api/reminders/subscribe`| Register Web Push subscription object | Bearer |

### 🤖 AI Writing Tools (`/api/notes`)
| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/notes/:id/summarize` | Generate note summary | Bearer |
| `POST` | `/api/notes/:id/suggest-title` | AI suggested title generation | Bearer |
| `POST` | `/api/notes/:id/suggest-tags` | AI smart tag categorization | Bearer |
| `POST` | `/api/notes/:id/chat` | Chat conversation with note context | Bearer |
| `POST` | `/api/notes/:id/chat/stream` | Server-Sent Events (SSE) streaming chat | Bearer |
| `POST` | `/api/notes/:id/assist` | Inline writing assistant actions | Bearer |

---

## 🧪 Testing & Quality Gates

The codebase includes automated unit and end-to-end test suites:

### Running Unit Tests
Fast execution using Node's native test runner (zero external test runner dependencies):
```bash
cd backend
npm run test:unit
```
**Covers:** SQL rewrite adapters, JWT claims & rotation, password complexity policies, throttle/lockout ladders, Zod input validation, and reminder schemas.

### Running Security & CSP Audits
```bash
node ci/check-csp.mjs
```
Ensures strict Content Security Policy compliance with zero inline scripts or unverified third-party assets.

### Running End-to-End Tests
Comprehensive browser automation using Playwright across full user lifecycles:
```bash
cd backend
npm run test:e2e
```

---

## 🔒 Security Hardening

| Protection | Implementation Detail |
|---|---|
| **Memory-Only Tokens** | Short-lived 15-minute JWTs kept exclusively in application memory (never written to `localStorage`). |
| **HTTP-Only Cookies** | Refresh tokens stored in strict `SameSite=Lax`, `HttpOnly`, `Secure` cookies with SHA-256 database hashing. |
| **Fail-Closed Startup** | Production refuses to boot if placeholder secrets or missing encryption keys are detected. |
| **Password Complexity** | Strict 3-of-4 character class validation, sequential character checks, and 10,000-entry common password blocklist. |
| **Dual SQL Protection** | Parameterized queries on all paths preventing SQL injection across both PostgreSQL and SQLite. |
| **Attachment Safety** | Magic-byte file header validation ensuring files match allowable MIME types (PNG, JPEG, WebP, GIF, PDF). |

---

## 🔁 CI/CD & DevOps

The repository utilizes **GitHub Actions** for continuous integration and automated quality gates:

- **`.github/workflows/e2e.yml`** — Runs linting, bundle freshness checks, unit tests, and Playwright browser suites against a live PostgreSQL 16 container.
- **`.github/workflows/codeql.yml`** — Automated static code analysis and semantic security vulnerability scanning.
- **`.github/workflows/docker.yml`** — Builds multi-stage production Docker containers and executes startup smoke checks.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for full details.

Developed with precision by **[Inbasekaran S](https://github.com/bruce12-glitch)**.