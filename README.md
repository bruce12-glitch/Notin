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

## Tech Stack

| Layer | Technologies |
|---|---|
| Marketing | Static HTML, Tailwind CSS v4, vanilla JS, three.js |
| App | Vanilla JS, TipTap 2.27, esbuild |
| Backend | Node.js 22, Express 4.21, Zod validation |
| Database | PostgreSQL 16 (production), SQLite fallback (development only) |
| Auth | JWT (jose), bcryptjs, email OTP, Google OAuth |
| AI | Groq API (live) with deterministic mock when no key is set |
| Tests | Playwright E2E, Node unit tests, ESLint, GitHub Actions CI |

## Project Structure

```
notin/
├── frontend/         # Marketing site (index.html, index-neon.html, context.html, legal pages)
├── backend/          # API server (src/server.js, routes, controllers, migrations)
├── authentication/   # Sign-up/login pages + notes app (app.html, app.js, sw.js)
├── deploy/           # Reverse-proxy example config
├── ci/               # CI workflow mirror (active copy in .github/workflows/)
├── RUNBOOK.md        # Operations: setup, backup/restore, health checks, production list
└── ARCHITECTURE_DIAGRAM.md  # System architecture reference
```

## Quick Start

Requirements: Node.js 22.5+, npm.

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