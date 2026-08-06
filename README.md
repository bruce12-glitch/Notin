<div align="center">

<!-- 3D animated title with layered glow -->
<a href="https://github.com/bruce12-glitch/Notin">
  <img src="https://readme-typing-svg.demolab.com?font=IBM+Plex+Sans&weight=700&size=42&duration=2800&pause=300&color=8FE333&center=true&vCenter=true&width=600&lines=📝+Notin+—+Your+Second+Brain;Green+Edition+🌿;Neon+Edition+⚡;3D+Motion+Design+🎨" alt="Notin — Your Second Brain" />
</a>

<!-- 3D floating logo/icon -->
<p>
  <img src="https://raw.githubusercontent.com/bruce12-glitch/Notin/main/frontend/assets/notin-icon-nav.png" width="90" alt="Notin 3D icon" />
</p>

<!-- animated 3D badges (shields.io with custom colors) -->
<p>
  <img src="https://img.shields.io/badge/Edition-Green-8FE333?style=for-the-badge&logo=leaflet&logoColor=white" />
  <img src="https://img.shields.io/badge/Edition-Neon-8FE333?style=for-the-badge&logo=lightning&logoColor=black" />
  <img src="https://img.shields.io/badge/3D-Interactions-8FE333?style=for-the-badge&logo=threedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-v4-8FE333?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>
<p>
  <img src="https://img.shields.io/github/repo-size/bruce12-glitch/Notin?style=flat-square&label=Repo%20Size&color=8FE333" />
  <img src="https://img.shields.io/github/last-commit/bruce12-glitch/Notin?style=flat-square&label=Last%20Commit&color=8FE333" />
  <img src="https://img.shields.io/github/license/bruce12-glitch/Notin?style=flat-square&label=License&color=8FE333" />
  <img src="https://img.shields.io/badge/status-🚀%20Active-8FE333?style=flat-square" />
</p>

<!-- subtle divider with glow -->
<p><img src="https://readme-typing-svg.demolab.com?font=IBM+Plex+Sans&size=16&duration=4000&color=8FE333&center=true&width=500&lines=✨+A+beautiful,+Evernote-inspired+note-taking+web+experience+with+3D+motion+design+✨" alt="tagline" /></p>

</div>

---

## ✨ Overview

**Notin** is a premium note-taking experience with a polished landing site and a working, security-focused account service. It ships in **two complete themes** — a warm **Green Edition** and a bold **Neon Edition** — plus verified signup, hardened login, rotating sessions, password recovery, device-session management, and protected notes.

> 🎯 Goal: combine a production-quality SaaS presentation with a practical, tested authentication and data layer.

---

## 🚀 Quick Start

```bash
# 1) Open the site (no build needed — everything is pre-compiled)
open frontend/index.html        # Green Edition
open frontend/index-neon.html   # Neon Edition

# 2) Rebuild CSS after editing a theme source
cd frontend
npm install
npx @tailwindcss/cli -i input.css       -o styles.css      --minify   # Green
npx @tailwindcss/cli -i input-neon.css  -o styles-neon.css --minify   # Neon

# 3) Initialize and run authentication + SQLite
cd ../authentication
npm install
npm run setup
npm start
```

> The root `notin/index.html` redirects to the frontend — deploy the whole folder to any static host (Netlify / Vercel / GitHub Pages).

---

## 🗂️ Project Structure

```
notin/
├── index.html                  ← entry point (redirects to frontend)
├── README.md                   ← you are here
├── frontend/                   ← ALL frontend code
│   ├── index.html              ← Green Edition landing page
│   ├── index-neon.html         ← Neon Edition landing page
│   ├── context.html            ← About / roadmap / what-we-built
│   ├── input.css               ← Green theme source (Tailwind v4 + tokens)
│   ├── input-neon.css          ← Neon theme source
│   ├── styles.css              ← compiled Green CSS (offline-ready)
│   ├── styles-neon.css         ← compiled Neon CSS
│   ├── script.js               ← interactions & motion engine (documented)
│   ├── evernote-analysis.md    ← deep design analysis of the reference
│   ├── evernote-match-score.md ← Notin ↔ Evernote match breakdown
│   └── assets/                 ← video, 3D logo, Lottie, images, icons
├── backend/                    ← future sync/service expansion
├── authentication/             ← hardened Express + SQLite account service
│   ├── server.js               ← auth, sessions, recovery, protected notes
│   ├── db.js                   ← connection, schema migrations, health checks
│   ├── security.js             ← CSRF, origins, and secure cookie policy
│   ├── models/                 ← user, OTP, refresh/reset persistence
│   ├── public/                 ← secure account UI + minimal 3D motion
│   ├── scripts/                ← setup and startup preflight
│   └── test-auth.js            ← isolated security/integration suite
└── screenshots/                ← design verification captures
```

---

## 🎨 Design System

### 🌿 Green Edition (light)
| Token | Value |
|---|---|
| Background | `#F4EEE5` warm cream |
| Accent green | `#8FE333` (extracted from reference) |
| Text | `#141414` / `#292929` |
| Dark sections | `#141414` |

### ⚡ Neon Edition (dark)
| Token | Value |
|---|---|
| Background | `#0F0F0F` near-black |
| Accent green | `#8FE333` neon lime |
| Text | `#FFFFFF` / `#8F8F8F` |
| Glows | `rgba(143,227,51,…)` |

### 🔤 Typography
| Role | Font |
|---|---|
| Display / headings | **IBM Plex Sans** |
| Body / UI | **Inter** |
| Tags / metadata | **JetBrains Mono** |
| System fallback | SF Pro stack |

---

## 🧊 Features

- **Split hero** — full-viewport, perfectly centered, with a 1920×1200 product video (guaranteed playback + play-enforcer)
- **3D floating assets** — mouse-parallax note cards, glowing AI badge, rotating ring
- **CardsShowcase** — Evernote's exact 8 feature cards (Template → AI Features), circle designs on hover/click, seamless infinite loop with autoplay
- **Organize showcase** — layered notebook / task / info popups, floating category labels, 60px display heading
- **Dark CTA** — "Your productivity, supercharged" in neon lime
- **Mega-menu navigation** — Features / Explore / Plans dropdowns + mobile accordion
- **3D depth everywhere** — pricing, download, testimonial, and feature cards tilt in 3D on hover
- **Evernote-faithful buttons** — `rounded-md`, solid dark→green / outline / small utility variants
- **Theme switcher** — one click between Green ⇄ Neon from the navbar
- **Motion engine** — scroll progress, back-to-top, counters, magnetic buttons, parallax, staggered reveals
- **Accessible** — `prefers-reduced-motion` respected, focus rings, aria labels, semantic HTML
- **Verified accounts** — two-step email OTP signup with resend cooldown and attempt limits
- **Hardened login** — bcrypt, account lockout, constant-work unknown-user checks, and strict password policy
- **Secure sessions** — constrained JWTs, HttpOnly cookies, CSRF defense, refresh rotation, replay detection, and device revocation
- **Recovery and data** — single-use password reset links and validated user-scoped notes CRUD
- **Operational startup** — generated local secrets, SQLite migrations, preflight, readiness, and graceful shutdown
- **Honest content** — no fake stats, prices, or versions

---

## 🛠️ Tech Stack

| Layer | Choice |
|---|---|
| Styling | **Tailwind CSS v4** (pre-compiled, no CDN) |
| Fonts | IBM Plex Sans · Inter · JetBrains Mono (Google Fonts) |
| Video | Native HTML5 `<video>` + JS play-enforcer |
| JS | Vanilla ES6 (modular IIFEs, documented) |
| 3D/Motion | CSS `perspective` + `transform3d` + `requestAnimationFrame` |
| Authentication API | Node.js 22 · Express 5 · Zod · Helmet |
| Database | Built-in `node:sqlite` · migrations · WAL · foreign keys |
| Account security | bcrypt · JWT · signed CSRF · rotating token families |
| Email | Nodemailer SMTP with explicit development fallback |

---

## 🔍 Code Quality

- HTML validated (no unclosed tags, single `h1` per page, no broken anchors)
- JS syntax-checked; all modules guard missing elements
- CSS organized with a table of contents and source/compiled mirrors kept synchronized
- Authentication setup and database preflight run before startup
- 47 isolated security/integration checks cover CSRF, OTP, lockout, session replay, recovery, and scoped notes
- Dependency audit currently reports zero known vulnerabilities
- No fake numbers anywhere — every value is real or part of the design replica

---

## 📄 License

© Notin. Personal / portfolio project. The Evernote Lottie asset is the property of Evernote and is used here for design reference only.

---

<div align="center">

<!-- 3D animated footer -->
<img src="https://readme-typing-svg.demolab.com?font=IBM+Plex+Sans&size=20&duration=3000&color=8FE333&center=true&width=450&lines=Made+with+💚+by+the+Notin+team;Green+🌿+%26+Neon+⚡+editions;Thanks+for+visiting+✨" alt="footer" />

</div>
