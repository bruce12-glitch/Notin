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

```bash
# 1. Backend + app (unified server on http://localhost:5000)
cd backend
npm ci
cp .env.example .env   # edit values; SQLite fallback works with defaults for local dev
npm run db:migrate
npm start

# 2. Marketing site with live API (separate terminal, http://localhost:3000)
cd frontend
npm install
PORT=3000 API_TARGET=http://localhost:5000 node dev-server.mjs
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