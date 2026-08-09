# Notin → Evernote Target — Progress Report

**Date:** 2026-08-09  
**Sandbox ID:** `iwajtmd2a4l4mromh6k68`

---

## 🔴 LIVE SERVERS (right now)

| # | Service | Port | Status | Preview URL |
|---|---------|------|--------|-------------|
| 1 | **Landing page** (Green + Neon) | `3000` | ✅ LIVE | https://3000-iwajtmd2a4l4mromh6k68.e2b.app |
| 2 | **Unified API + Auth UI + Editor app** | `5000` | ✅ LIVE | https://5000-iwajtmd2a4l4mromh6k68.e2b.app |
| 3 | **Standalone Auth service** (OTP demo) | `8787` | ✅ LIVE | https://8787-iwajtmd2a4l4mromh6k68.e2b.app |
| 4 | **Database** | — | ✅ SQLite fallback (`backend/prisma/notin.sqlite`) | set `DATABASE_URL=postgresql://…` to switch to Postgres |

### Deep links
- 🌿 Green landing: https://3000-iwajtmd2a4l4mromh6k68.e2b.app
- ⚡ Neon landing: https://3000-iwajtmd2a4l4mromh6k68.e2b.app/index-neon.html
- 🔐 Sign-up UI: https://5000-iwajtmd2a4l4mromh6k68.e2b.app/  (login at `/login.html`)
- 📝 **Note editor app shell:** https://5000-iwajtmd2a4l4mromh6k68.e2b.app/app.html
- 🩺 API health: https://5000-iwajtmd2a4l4mromh6k68.e2b.app/health

### Quick checks (inside sandbox)
```bash
curl http://127.0.0.1:3000/          # Landing HTML
curl http://127.0.0.1:5000/health    # {"ok":true,"service":"notin-api",...}
curl http://127.0.0.1:8787/health    # {"ok":true,"service":"notin-auth","demoMode":true,...}
```

> **Demo auth:** SMTP/Google OAuth aren't configured, so **demo OTP mode** is on — request a code with any email, then verify with `123456`. Verified end-to-end 2026-08-09: signup → OTP verify → create note → list notes → token refresh all pass through the live preview.

> **2026-08-09 fixes this session:** (1) `frontend/dev-server.mjs` added — static landing server that **proxies `/api/*` + `/auth/*`** to the unified API, so browser code stays same-origin on preview hosts. (2) `frontend/script.js` auth base now defaults to `location.origin` over http(s). (3) Ran `npm run db:migrate` so the SQLite fallback has its tables (the API previously crashed on first request).

---

## ✅ Current MVP (end of day)

**Status: FROZEN.** Today's work packages are done, verified live, and merged-ready on `arena/019fe6e8-notin` (PR #8): WP-AUTH-001/002/003 (unified JWT, OTP UI, forgot/reset password) + WP-APP-001→007 (app shell, TipTap editor, trash, search, notebooks, tags, pin+sort).

**What works (all exercised over HTTP today):**
- **Accounts** — email+password signup/signin; OTP sign-in; unified jose JWT (15-min access token, memory-only) + httpOnly refresh rotation (30-day); logout revokes.
- **Password reset** — `POST /api/auth/forgot-password` (generic anti-enumeration response) + `POST /api/auth/reset-password`; hashed single-use tokens (60-min TTL); email via SMTP when configured, **dev-only token echo/log when not**; reset revokes all sessions; also sets a first password for OTP/Google-only accounts.
- **Editor app (`app.html`)** — TipTap rich text (bold/italic/underline, H1/H2, lists, checklist), explicit Save, trash/restore/delete-forever.
- **Organize** — notebooks (create/assign/filter, delete → notes unfiled, never deleted); tags (create, editor chips, replace-set attach, filter, delete keeps notes).
- **Search** — `?q=` over title/body (description fallback), 300 ms debounce UI, composes with trash/notebook/tag filters.
- **Pin + sort** — pin/unpin from list row or editor; pinned notes top every scoped view, preserved through trash/restore; sort dropdown Updated/Created/Title (pins always win).

**How to run:**
```bash
cd backend
npm ci
npm run db:migrate   # Postgres via DATABASE_URL, else SQLite fallback (backend/prisma/notin.sqlite)
npm start            # unified API + auth UI + editor on http://localhost:5000
```
Optional landing: `cd frontend && node dev-server.mjs` → `:3000` (proxies `/api/*` + `/auth/*` → `:5000`).

**Demo auth:** OTP code **`123456`** works **only** when `NODE_ENV !== 'production'` **and** SMTP is not configured — the server enforces this (`GET /api/auth/health` exposes `demoMode`). With SMTP configured, real codes are emailed instead.
**Forgot password (dev path):** without SMTP & not production, the reset token is echoed in the JSON response + server logs (never in production, never plaintext in the DB — only a peppered SHA-256 is stored).

**Explicitly out of scope (not built, intentionally):** attachments, PWA/offline sync, billing/Stripe, native mobile/desktop apps, Apple SIWA, captcha, nested notebooks, tag colors, note sharing — and the standalone auth server on **`:8787`** (pre-existing reference/demo only; the product uses the unified `:5000` API).

---

## 🎯 Target: Evernote-class note-taking product

Evernote is not just a landing page. The full product target includes:

| Layer | Evernote capability | Why it matters |
|-------|---------------------|----------------|
| Marketing site | Landing, pricing, download, brand | Acquisition |
| Auth | Account create / login / SSO | Gate to product |
| Core editor | Rich notes, checklists, formatting | Core value |
| Organization | Notebooks, tags, spaces | Scale of content |
| Search | Instant full-text + filters | Retrieval |
| Sync | Cross-device, offline | Daily use |
| Capture | Web clipper, mobile, desktop | Input channels |
| AI | Summarize, search, suggest | Differentiation |
| Teams / billing | Workspaces, plans | Monetization |

---

## 📊 Overall progress vs target

```
████████████████████░░░░░░░░░░░░░░░░░░░░  ~42% toward full Evernote-class app
```

| Area | Progress | Score | Notes |
|------|----------|-------|-------|
| **Landing / marketing design** | Complete | **100%** | Green + Neon; match score 100/100 vs green-note ref |
| **Brand / design system** | Complete | **100%** | Cream + `#00A82D` / `#8FE333`, type, motion |
| **Authentication UI** | UI ready | **70%** | Evernote-style signup page live; OTP/Google need secrets |
| **Auth backend** | Service live | **70%** | Google + OTP + JWT + refresh rotation coded; **forgot/reset password live (hashed single-use tokens, dev fallback)**; needs Google/SMTP secrets |
| **Notes API (CRUD)** | Live | **55%** | Unified auth+notes CRUD (SQLite/Postgres) + trash/restore |
| **Core note editor** | Live | **55%** | Tiptap rich-text editor (`app.html`): create/save, task lists, trash/restore, **pin notes + sort (WP-APP-007)** |
| **Notebooks / tags / spaces** | Minimal live | **35%** | `Notebook`+`Note.notebookId` (WP-APP-005), `Tag`+`NoteTag` replace-set (WP-APP-006); verify live ✅ |
| **Search** | Basic live | **30%** | Full-text `?q=` on title/body with Trash scoping, 300ms debounce UI (WP-APP-004); no FTS index yet |
| **Pin notes** | Live | ✅ | `Note.isPinned`, pin-first ordering composable with filters; list row + editor pin, sort dropdown (WP-APP-007) |
| **Sync / offline** | Not started | **0%** | No client store / conflict protocol |
| **Web clipper / desktop / mobile** | Marketing only | **10%** | Download section exists; no real apps |
| **AI features** | Marketing only | **5%** | Landing AI band; no AI service |
| **Billing / teams** | Marketing only | **10%** | Pricing UI on landing; no Stripe/teams |

**Weighted product readiness (rough): ~40–45%**  
(Landing is production-grade; product core is early backend.)

---

## ✅ What is done (mapped to Evernote)

### 1. Landing experience — **100% design match**
- Hero (“Your second brain”), mega-nav, 8 feature cards + infinite loop  
- Organize showcase, testimonials, pricing, download, dark CTA, FAQ, footer  
- Green Edition + Neon Edition  
- 3D motion, OS-aware download, accessibility  

**Live:** https://3000-i9hxmxjgdjhep5271xhh5.e2b.app  

### 2. Authentication page — **UI complete**
- Evernote-style split layout (“Your second brain”)  
- Email continue, Google / Apple buttons, legal, login link  
- Decorative shapes + brand green  

**Live:** https://4173-i9hxmxjgdjhep5271xhh5.e2b.app  

### 3. Auth service — **architecture complete, secrets pending**
- Google OAuth → email OTP second factor  
- Hashed OTP, 5 min expiry, 5 attempts, single-use  
- Access JWT (15m) + rotating hashed refresh cookies  
- Rate limiting, helmet, SQLite session store  

**Live health:** https://8787-i9hxmxjgdjhep5271xhh5.e2b.app/health  

### 4. Notes backend — **API complete for MVP notes**
| Endpoint | Auth | Status |
|----------|------|--------|
| `POST /api/users/signup` | public | ✅ |
| `POST /api/users/signin` | public | ✅ |
| `GET /api/notes` | Bearer JWT | ✅ |
| `POST /api/notes` | Bearer JWT | ✅ |
| `PUT /api/notes/:id` | Bearer JWT | ✅ |
| `DELETE /api/notes/:id` | Bearer JWT | ✅ |

**Live:** https://5000-i9hxmxjgdjhep5271xhh5.e2b.app  

---

## 🚧 Gaps to reach Evernote parity

### Phase A — Connect the product shell (next 1–2 weeks)
- [ ] Wire auth page → Auth API (real OTP UI, not `alert`)  
- [ ] Configure Google OAuth + SMTP  
- [ ] Unify auth (one user store: PostgreSQL, not SQLite + PG split)  
- [ ] Post-login redirect into a real **app shell**  

### Phase B — Core editor (Evernote heart)
- [ ] Note list + editor (Markdown / rich text / checklists)  
- [ ] Autosave, titles, timestamps  
- [ ] Notebooks + tags  
- [ ] Trash / archive  

### Phase C — Search & sync
- [ ] Full-text search (Postgres `tsvector` or Meilisearch)  
- [ ] Offline-capable client (IndexedDB) + sync protocol  
- [ ] Attachments  

### Phase D — Capture & platforms
- [ ] Web clipper extension  
- [ ] Mobile / desktop clients (or PWA first)  

### Phase E — AI & growth
- [ ] AI summarize / rewrite / semantic search  
- [ ] Teams / sharing  
- [ ] Stripe billing tied to pricing tiers  

---

## 📈 Scoreboard (honest)

| Milestone | Status |
|-----------|--------|
| Look like Evernote (marketing) | ✅ **Done (100/100)** |
| Sign up / log in like Evernote | 🟡 **UI live; demo OTP works; full SSO/SMTP needs config** |
| Take notes like Evernote | 🟡 **Editor shell live (Tiptap) + CRUD — no notebooks/tags yet** |
| Organize like Evernote | 🔴 Not started |
| Search like Evernote | 🔴 Not started |
| Sync like Evernote | 🔴 Not started |
| Clip the web like Evernote | 🔴 Not started |
| AI like Evernote | 🔴 Marketing only |

```
Marketing site ████████████████████ 100%
Auth UI        ██████████████░░░░░░  70%
Auth backend   █████████████░░░░░░░  65%
Notes API      ███████████░░░░░░░░░  55%
Note editor    ████████░░░░░░░░░░░░  40%
Org / search   ░░░░░░░░░░░░░░░░░░░░   0%
Sync / offline ░░░░░░░░░░░░░░░░░░░░   0%
Clipper / apps ██░░░░░░░░░░░░░░░░░░  10%
AI product     █░░░░░░░░░░░░░░░░░░░   5%
────────────────────────────────────
PRODUCT TOTAL █████████░░░░░░░░░░░ ~45%
```

---

## 🧭 Bottom line

**You already beat Evernote on the marketing-site design match.**  
**The product core is coming online** — since this report started, the stack gained a unified auth+notes API and a Tiptap editor shell. Evernote parity starts when notebooks/tags + search land behind the editor.

**Right now you can open:**
1. **Landing (Green)** → https://3000-iwajtmd2a4l4mromh6k68.e2b.app  
2. **Landing (Neon)** → https://3000-iwajtmd2a4l4mromh6k68.e2b.app/index-neon.html  
3. **Sign up / log in** → https://5000-iwajtmd2a4l4mromh6k68.e2b.app (demo code `123456`)  
4. **Note editor** → https://5000-iwajtmd2a4l4mromh6k68.e2b.app/app.html  
5. **Auth service** → https://8787-iwajtmd2a4l4mromh6k68.e2b.app  

**Highest-leverage next step:** finish wiring the landing “Get started” CTA → auth → `app.html` editor journey (auth page “Continue” already redirects there), then add notebooks/tags + full-text search.
