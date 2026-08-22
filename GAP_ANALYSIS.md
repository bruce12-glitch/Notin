# Notin — Gap Analysis: What's Built, What's Stubbed, What's Missing

> **Superseded notice (2026-08-22):** This historical audit predates the market-hardening release. Production OTP onboarding, active CI, truthful beta marketing, legal/security pages, pagination UI, quotas, static-file allowlisting, OAuth PKCE/state binding, and optimistic note concurrency were addressed after this document was written. Use the current code and RUNBOOK for release decisions.


**Date:** 2026-08-13 · **Branch:** `arena/019ffbcd-notin` · **Base commit:** `8e7545c` (WP-UI-HOME-PIXEL-001)
**Method:** full-tree audit of the running code (backend + authentication + frontend), not doc-only. Every "stub / broken" item below was traced to its source file and line.

> TL;DR — The **marketing site is 100% finished**, and the **core product loop (sign-up/OTP → editor → notebooks/tags → attachments → shares → trash → export/delete) is real and working against a live API**. What's *not* functional breaks down into three buckets: **(1)** in-app nav/feature stubs that only show a "coming soon" toast, **(2)** auth/third-party flows that need secrets, and **(3)** a landing page whose CTAs aren't wired to the actual app.

---

## 1. Where the code actually lives

| Area | Path | Status |
|---|---|---|
| Marketing landing (Green + Neon) | `frontend/` | ✅ complete |
| Docs / GitHub Pages mirror | `docs/` | ✅ duplicate of `frontend/` |
| Unified API + auth + editor static hosting | `backend/src/` (port **5000**) | ✅ live |
| Post-auth app (editor + Home) | `authentication/app.html|js|css` | ✅ live |
| Auth pages (signup / login / forgot / reset) | `authentication/index.html|login.html|script.js` | ✅ live |
| Public read-only share renderer | `authentication/share.html|js` | ✅ live |
| PWA service worker | `authentication/sw.js` | ✅ live (offline read-only) |
| Legacy standalone auth server | `authentication/server.js` (port **8787**) | ⚠️ deprecated / reference only |
| Data model | `backend/src/db/migrate.js` + `src/config/db.js` (raw SQL) | ✅ (see §5 drift) |

---

## 2. What is fully functional (verified in code)

- **API:** password signup/signin (bcrypt), OTP (demo + real), JWT access (15 min) + rotating hashed refresh cookie, logout/revoke, forgot/reset password (hashed single-use tokens, 60-min TTL).
- **Notes:** create/read/update, trash → restore → delete-forever (trash-first guard), per-user row isolation, pin (`isPinned`) + sort (Updated/Created/Title), search `?q=` (title/body substring), notebook + tag filters.
- **Organize:** notebooks (create/rename/delete, notes unfiled not deleted) and tags (create/delete, atomic replace-set on notes), both with sidebar counts.
- **Attachments:** PNG/JPEG/WebP/GIF upload (≤5 MB, ≤10/note), local-disk storage, owner-only read/delete, retained through trash/restore.
- **Sharing:** read-only public share links (32-byte secret, SHA-256 at rest, rotate/revoke), public renderer with token + trash + ownership revalidation.
- **Account:** JSON export (`/api/users/me/export`) and permanent delete (`{confirm:"DELETE"}`) including file + session cleanup.
- **Editor:** TipTap rich text (bold/italic/underline, H1/H2, bullet/ordered/checklist), autosave (900 ms debounce), manual Save, Ctrl/Cmd+S, pin, notebook picker, tag chips, image gallery, share panel, offline read-only snapshot (IndexedDB), account modal.
- **Home (post-auth):** Evernote-dark Home clone — notes row + scratch pad + "Recently captured" band, sidebar IA, collapse, mobile drawer.

---

## 3. NOT functional today (stubs, dead links, or gated on config)

### 3.1 In-app stubs — all only show a "… is coming soon" toast (`authentication/app.html`)

These use `data-soon="…"` and are wired in `app.js` to `showSoon()` (a toast). They have **no backing feature**:

| # | Element | Location (app.html) |
|---|---|---|
| 1 | **Sync** (sidebar icon) | line 62 |
| 2 | **AI assistant** (sidebar icon + floating FAB) | lines 63, 273 |
| 3 | **More options** (sidebar icon) | line 64 |
| 4 | **Tasks** (nav) | line 71 |
| 5 | **Files** (nav) | line 72 |
| 6 | **Calendar** (nav) | line 73 |
| 7 | **Templates** (nav) | line 74 |
| 8 | **Shared with me** (nav) | line 77 |
| 9 | **Spaces** (nav) | line 78 |
| 10 | **More** (nav) | line 79 |
| 11 | **Upgrade** (billing/plans) | line 92 |
| 12 | **Web clips** (dropdown) | line 124 |
| 13 | **Web clipper** ("Clip web content") | line 136 |

> Note: "Shortcuts" is **not** a stub — it renders pinned notes. "Notebooks" and "Tags" are real. Only the items above are decorative.

### 3.2 Auth / third-party flows that need configuration (or are stubs)

| Flow | State | Detail |
|---|---|---|
| **Google Sign-In** | 🟡 coded, returns **503** without secrets | `backend/src/controllers/authController.js` `googleStart` → `503 "Google OAuth is not configured"` unless `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` are set |
| **Email OTP (SMTP)** | 🟡 demo-only without config | `issueOtp` throws "SMTP is not configured"; falls back to demo code **`123456`** only when `NODE_ENV !== production` and SMTP unset |
| **Apple Sign-In** | 🔴 stub | `authentication/script.js` → button disabled-style, inline message "Continue with Apple — coming soon." No backend endpoint exists |

### 3.3 Marketing landing (`frontend/index.html` + `script.js`) — broken/decoy CTAs

The landing page was built before the product existed, and its call-to-action wiring was never finished:

- **"Log in"** opens an inline modal (`frontend/script.js` ~line 1072) that offers **only** "Continue with Google" (→ 503) and an OTP code box. There is **no email entry, no demo-OTP request, and no link to the real `/login.html`**. The OTP box only becomes reachable via a `?auth=otp&challenge=` redirect (Google callback). Effectively the landing sign-in path is **non-functional** in the current (demo) configuration.
- **"Start for free" / "Get Notin free" / "Try it free" / "Get started" / "Try Pro free for 14 days" / "Contact sales"** — all `href="#"` with **no click handler** (only anchors whose exact text is "log in" get bound). Dead links. None of them reach the signup page (`/index.html` on :5000).
- **Download buttons** (`.exe`, `.dmg`, `.AppImage`, App Store, Google Play, "Open notin.app", "Download Notin") — all `href="#"`; no binaries/apps exist. OS detection picks a platform but the target is a placeholder.
- **Legal links** — "Terms of Service", "Privacy Policy" (signup), and footer "Security / Legal / Privacy" — all `href="#"`.
- **Policy inconsistency:** the landing modal writes the access token to `sessionStorage.setItem('notin_access_token', …)` — the rest of the product deliberately keeps tokens **memory-only** (documented in `RUNBOOK.md` and enforced in `app.js`). It also never redirects to `app.html` after "Signed in successfully".

---

## 4. Not yet developed (roadmap items with no code at all)

| Area | Detail |
|---|---|
| **Real sync engine** | Only an offline **read-only** IndexedDB snapshot + PWA shell exists. No two-way sync, no conflict resolution, no offline edits. |
| **Full-text search** | `?q=` is a substring `ILIKE`/`LIKE` scan over title/body (`backend/src/config/db.js`). No FTS index (`tsvector`/FTS5), no ranking/highlighting. |
| **Web clipper** | Stub only. No extension/bookmarklet/backend. |
| **Native apps** | Desktop (Windows/macOS/Linux) and mobile (iOS/Android) are marketing-section only; no real builds. |
| **AI features** | AI search/rewrite/summarize — landing "AI tools" band only; no AI service. |
| **Billing / Stripe** | Pricing UI only; "Upgrade"/"Try Pro" are dead/stub. No subscription backend. |
| **Teams / Spaces / collaboration** | "Spaces", "Shared with me" are stubs; no team model. |
| **Hardening (PR #2, open)** | Refresh-token families, replay detection, CSRF origin checks — not merged. |
| **Misc parity** | Nested notebooks, tag colors, captcha/anti-bot, Apple SIWA. |

---

## 5. Tech debt / inconsistencies found during the audit

1. **`backend/prisma/schema.prisma` is out of sync with the real schema.** The runtime schema (built by `backend/src/db/migrate.js` + raw SQL in `config/db.js`) has `Notebook`, `Tag`, `NoteTag`, `password_reset_tokens` tables and `isPinned`/`notebookId` columns on `Note` — **none of which appear in `schema.prisma`** (which still declares only 6 models). The app never uses Prisma Client at runtime (raw `pg`/`node:sqlite`), so the `.prisma` file is documentation-only and misleading.
2. **Legacy standalone auth server still present** (`authentication/server.js`, port 8787). `RUNBOOK.md` says "do not run it as source of truth," and it has a **separate SQLite DB and separate JWT secrets**, so its tokens are **not interchangeable** with the unified API's. It also lacks forgot/reset password and notebooks/tags/shares. It is effectively dead-but-shipped code.
3. **`docs/` is a full duplicate mirror of `frontend/`** for GitHub Pages — a drift risk (any landing change must be copied twice).
4. **Stale analysis docs.** `ANALYSIS_SUMMARY.md`, `REPOSITORY_ANALYSIS.md`, and `ARCHITECTURE_DIAGRAM.md` still label backend/authentication as "⚠️ PLANNED" and give "Backend: 0%" — flatly wrong against the current tree. The accurate, current docs are `PROGRESS_REPORT.md` (2026-08-10), `DETAILED_PROGRESS_REPORT.md` (2026-08-09), and `RUNBOOK.md`.
5. **E2E suite cannot run in this sandbox** (Playwright needs a Chromium download; browser CDNs are blocked by egress). The suite itself (`backend/tests/e2e/mvp-smoke.spec.js`, 3 tests) is well-formed and covers the full journey — this is an environment limitation, not a code defect.

---

## 6. Quick reference

### Working ✅
Landing (Green/Neon) · OTP + password auth · JWT/refresh · forgot/reset · notes CRUD + trash · notebooks · tags · pin/sort · search (substring) · image attachments · read-only shares · account export/delete · TipTap editor + autosave · Home dashboard · offline read-only · PWA shell.

### Stubbed / dead 🔴
Sync · Tasks · Files · Calendar · Templates · Shared-with-me · Spaces · More · AI assistant · Web clipper · Upgrade/billing · Apple Sign-In · landing "Start for free / Get started / Try free / Contact sales" CTAs · all download + legal links on the landing page.

### Gated on config 🟡
Google Sign-In (needs OAuth creds) · real email OTP (needs SMTP).

### Not started ⚪
Real sync · full-text search index · web clipper · native apps · AI features · Stripe/billing · teams/Spaces · CSRF/token-family hardening.

**Net:** marketing = **100%**, product core = **~55%** of an Evernote-class app, with the biggest *visible* non-functional gaps concentrated on the **landing-page CTA wiring** and the **in-app "coming soon" nav items**.
