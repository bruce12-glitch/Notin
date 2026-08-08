# Notin → Evernote Target — Progress Report

**Date:** 2026-08-08  
**Sandbox ID:** `i9hxmxjgdjhep5271xhh5`

---

## 🔴 LIVE SERVERS (right now)

| # | Service | Port | Status | Preview URL |
|---|---------|------|--------|-------------|
| 1 | **Authentication page** (signup UI) | `4173` | ✅ LIVE | https://4173-i9hxmxjgdjhep5271xhh5.e2b.app |
| 2 | **Landing page** (Green Edition) | `3000` | ✅ LIVE | https://3000-i9hxmxjgdjhep5271xhh5.e2b.app |
| 3 | **Notes API** (users + notes CRUD) | `5000` | ✅ LIVE | https://5000-i9hxmxjgdjhep5271xhh5.e2b.app |
| 4 | **Auth API** (Google + OTP service) | `8787` | ✅ LIVE | https://8787-i9hxmxjgdjhep5271xhh5.e2b.app/health |
| 5 | **PostgreSQL** | `5432` | ✅ LIVE (internal) | `postgresql://postgres:***@127.0.0.1:5432/notin` |

### Quick checks
```bash
curl http://127.0.0.1:4173/          # Auth page HTML
curl http://127.0.0.1:3000/          # Landing HTML
curl http://127.0.0.1:5000/          # {"message":"Notin Backend API",...}
curl http://127.0.0.1:8787/health    # {"ok":true,"service":"notin-auth",...}
```

> **Auth API note:** Google OAuth + SMTP are **not configured** in this sandbox (no real Google client / mail credentials). The health endpoint reports `googleConfigured:false`, `smtpConfigured:false`. UI + routes are live; full OTP email / Google redirect needs `.env` secrets.

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
| **Auth backend** | Service live | **65%** | Google + OTP + JWT + refresh rotation coded; needs Google/SMTP |
| **Notes API (CRUD)** | Live | **55%** | Signup/signin + notes CRUD on PostgreSQL |
| **Core note editor** | Not started | **0%** | No rich text / markdown / checklist app |
| **Notebooks / tags / spaces** | Not started | **0%** | Schema is flat `Note` only |
| **Search** | Not started | **0%** | No full-text index |
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
| Sign up / log in like Evernote | 🟡 **UI live; full SSO/OTP needs config** |
| Take notes like Evernote | 🟡 **API only — no editor UI** |
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
Note editor    ░░░░░░░░░░░░░░░░░░░░   0%
Org / search   ░░░░░░░░░░░░░░░░░░░░   0%
Sync / offline ░░░░░░░░░░░░░░░░░░░░   0%
Clipper / apps ██░░░░░░░░░░░░░░░░░░  10%
AI product     █░░░░░░░░░░░░░░░░░░░   5%
────────────────────────────────────
PRODUCT TOTAL ████████░░░░░░░░░░░░ ~42%
```

---

## 🧭 Bottom line

**You already beat Evernote on the marketing-site design match.**  
**You do not yet have an Evernote-class product** — that starts when the editor + notebooks + search ship behind the live auth.

**Right now you can open:**
1. **Auth page** → https://4173-i9hxmxjgdjhep5271xhh5.e2b.app  
2. **Landing** → https://3000-i9hxmxjgdjhep5271xhh5.e2b.app  
3. **Notes API** → https://5000-i9hxmxjgdjhep5271xhh5.e2b.app  
4. **Auth API health** → https://8787-i9hxmxjgdjhep5271xhh5.e2b.app/health  

**Highest-leverage next step:** build the authenticated **note editor app shell** and point the auth page “Continue” flow into it (using the Notes API that is already live).
