# CODING AGENT MASTER PROMPT — Notin · Task WP-FUNNEL-001

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI note-taking
web app. The product app (auth pages + notes app) is served by the unified API
on **port 5000**. The marketing landing (Green + Neon editions) is served on
**port 3000** by `frontend/dev-server.mjs`, which proxies ONLY `/api/*` and
`/auth/*` to :5000 — it does **not** proxy app pages.

**The problem:** every primary CTA on the landing is a dead `href="#"` —
"Log in", "Start for free", "Get Notin free", "Try it free", pricing buttons,
the mobile-menu "Log in", and more (~26 per edition). Visitors cannot reach the
product. Your single task is **WP-FUNNEL-001: wire the entire acquisition
funnel** so every CTA reaches the right auth/app page on the correct origin in
every environment (localhost, per-port preview hosts, single-origin production).

Rules:
1. **No hardcoded hosts.** Preview environments use per-port hostnames
   (`3000-xxxx.e2b.app` vs `5000-xxxx.e2b.app`), so the app origin must be
   *derived at runtime*, never written as a literal.
2. **Landing marketing stays untouched visually.** No layout, animation, theme,
   or copy changes — only destination wiring.
3. **The app, backend, and auth pages are OUT OF SCOPE.** This task touches
   `frontend/` only.

---

## PART 2 — REPO GROUND TRUTH (verified)

```
frontend/
├── index.html        ← Green edition (~26 dead href="#" CTAs; header, hero,
│                        pricing, download sections)
├── index-neon.html   ← Neon edition (same structure, ~26 dead CTAs)
├── script.js         ← landing interactions (~1,200 lines). Contains:
│   • lines ~96–104: mobile menu builds a "Log in" <a href="#"> dynamically
│   • lines ~1074–1090: an inline Google-OTP auth modal that posts to
│     `${api}/auth/*` (api = location.origin via dev-server proxy).
│     DO NOT modify this modal — it serves the ?auth=otp redirect flow.
├── dev-server.mjs    ← static server + proxy: shouldProxy() matches ONLY
│                        '/api*', '/auth*'. API_TARGET default http://127.0.0.1:5000
└── styles.css / styles-neon.css / input*.css ← themes (DO NOT TOUCH)
```

**App pages on :5000 (destinations):**
- `/` or `/index.html` → email OTP sign-in/up page (demo OTP `123456` in dev)
- `/login.html` → password login + forgot/reset flow
- `/app.html` → the notes app (redirects to login when unauthenticated)

**Environment model the solution must satisfy:**
| Environment | Landing host | App host |
|---|---|---|
| Local dev | `localhost:3000` / `127.0.0.1:3000` | same hostname, port `5000` |
| Arena preview | `3000-<sandbox>.e2b.app` | `5000-<sandbox>.e2b.app` (same suffix) |
| Production | single origin | same origin |

---

## PART 3 — THE TASK: WP-FUNNEL-001 — WIRE THE ACQUISITION FUNNEL

### Files to MODIFY
1. `frontend/script.js`
2. `frontend/index.html`
3. `frontend/index-neon.html`

### Files to CREATE
None. No new npm dependencies.

---

### Spec 1 — Runtime app-origin resolver (`frontend/script.js`)

Add near the top of the file (before first use), a single global helper:

```js
// WP-FUNNEL-001 — derive the app/auth origin for this environment.
// Local dev: same host, port 5000. Arena preview: per-port hostnames share the
// sandbox suffix, so swap the port prefix. Production: same origin.
function notinAppOrigin(){
  try{
    const override = window.NOTIN_APP_ORIGIN;
    if(override) return String(override).replace(/\/+$/, '');
    const host = location.host;
    const preview = host.match(/^\d+-(.+)$/);
    if(preview) return `${location.protocol}//5000-${preview[1]}`;
    if(/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `${location.protocol}//${location.hostname}:5000`;
    return location.origin;
  }catch{ return location.origin; }
}
```

### Spec 2 — CTA classification and wiring (both editions)

Audit EVERY `href="#"` in `index.html` and `index-neon.html` (expect ~26 each).
Add a `data-cta` attribute to each funnel element and keep `href="#"` as the
no-JS fallback; `script.js` resolves destinations on `DOMContentLoaded`:

| CTA (by visible text / context) | `data-cta` | Destination |
|---|---|---|
| Header "Log in" · hero "Already have an account? Log in" · any "Log in" link | `login` | `${origin}/login.html` |
| "Start for free" · "Get Notin free" · "Try it free" · pricing "Get started" · "Try Pro free for 14 days" · any signup-style button | `signup` | `${origin}/` |
| "Download Notin" (`#smartDownload`) | `app` | `${origin}/app.html` |
| "Contact sales" | `contact` | `mailto:hello@notin.app` (placeholder address — documented) |
| "Enterprise" and pure nav/footer links | see Spec 4 | section anchor or leave |

Binding (single delegated pass — no per-button listeners):
```js
// WP-FUNNEL-001 — resolve funnel CTAs at runtime (per-environment origin)
document.addEventListener('DOMContentLoaded', () => {
  const origin = notinAppOrigin();
  const targets = { login: '/login.html', signup: '/', app: '/app.html' };
  document.querySelectorAll('[data-cta]').forEach((el) => {
    const kind = el.getAttribute('data-cta');
    if(kind === 'contact'){ el.setAttribute('href', 'mailto:hello@notin.app'); return; }
    if(targets[kind]) el.setAttribute('href', origin + targets[kind]);
  });
});
```
Full-page navigation (not the inline modal) is the funnel path — the OTP modal
stays reserved for the `?auth=otp` Google redirect flow.

### Spec 3 — Mobile menu "Log in" (`frontend/script.js` ~lines 96–104)

The mobile panel creates `login.href = '#'` dynamically. Change it to:
```js
login.href = notinAppOrigin() + '/login.html';
```
and give the sibling signup CTA in that panel (the `cta` element) the signup
destination as well. Keep classes/text unchanged.

### Spec 4 — Nav/footer anchor audit

For remaining non-funnel `href="#"` links (nav items like Features/Pricing,
footer links): if a section with a matching id exists in the same file
(e.g., `#features`, `#pricing`), point the link at that anchor. If no target
section exists, leave the link unchanged and list it in the final report.
Do NOT invent new sections.

### Spec 5 — Neon parity

Apply identical markup changes to `index-neon.html`. Both editions share
`script.js` — confirm the Neon file actually loads `script.js` (read its
`<script>` tags); if it loads a different script file, replicate Spec 1–3 there.

### Spec 6 — Dev-server sanity (no behavior change required)

Read `frontend/dev-server.mjs` and confirm the proxy rules remain `/api*` +
`/auth*` only. Do NOT extend the proxy to serve app pages — origin derivation
(Spec 1) is the designed mechanism. No changes expected in this file; if you
believe a change is needed, stop and report it instead.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: `frontend/script.js` (mobile menu block + auth modal block),
   `frontend/index.html` + `index-neon.html` (list every `href="#"` with line
   numbers before changing anything), `frontend/dev-server.mjs`.
2. Classify all dead links into the Spec 2 table + Spec 4 anchors.
3. Implement Spec 1–3 in `script.js`, then markup changes in both editions.
4. `node --check frontend/script.js` — must pass.
5. Serve and verify:
   ```bash
   cd backend && npm start &               # :5000 (migrate first if fresh env)
   cd frontend && PORT=3000 node dev-server.mjs &
   curl -s localhost:3000/ | grep -c 'data-cta'        # > 0
   curl -s -o /dev/null -w "%{http_code}" localhost:5000/login.html   # 200
   curl -s -o /dev/null -w "%{http_code}" localhost:5000/             # 200
   ```
6. Logic-test the resolver with node (paste the function):
   - host `3000-abc.e2b.app` → `http://5000-abc.e2b.app` (protocol per input)
   - host `localhost:3000` → `http://localhost:5000`
   - host `notin.app` → same origin
7. Re-grep both HTML files: zero `href="#"` remaining on elements classified as
   funnel CTAs; any leftovers are the documented Spec 4 exceptions.
8. Update `PROJECT_BIBLE.md`: mark WP-FUNNEL-001 complete, remove "dead landing
   CTAs" from debt.

## PART 5 — DO NOT (hard constraints)

→ Do NOT touch `authentication/`, `backend/`, `docs/`, or any theme CSS.
→ Do NOT modify the inline Google-OTP modal or its `?auth=otp` flow.
→ Do NOT hardcode any sandbox/preview hostname or port-5000 literal URL in HTML —
  destinations resolve at runtime only (mailto is the one static exception).
→ Do NOT extend `dev-server.mjs` proxy rules.
→ Do NOT change visual design, copy, animations, or the `smartDownload` logic
  beyond its destination.
→ Do NOT add npm dependencies or convert the landing to a framework.
→ Do NOT build AI features or anything outside this work package.

## PART 6 — ACCEPTANCE CRITERIES

□ Every funnel CTA (login/signup/app/contact, both editions, incl. mobile menu)
  resolves at runtime to the correct destination for localhost, preview-host,
  and same-origin cases
□ `notinAppOrigin()` passes the three logic tests in PART 4 step 6
□ Landing serves 200 on :3000; `/login.html` and `/` serve 200 on :5000;
  a visitor clicking "Start for free" from a preview host lands on the
  `5000-…` OTP page (verify by construction from the derivation, or live)
□ Nav/footer links point at real section anchors where targets exist; remaining
  `href="#"` instances are explicitly listed in the report
□ No visual/layout diff (changes are attributes + one script block only)
□ `node --check` clean; OTP modal untouched; dev-server proxy unchanged

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-FUNNEL-001 REPORT
1. Files modified:          [list]
2. CTA inventory:           [count per data-cta class + leftovers with reason]
3. Resolver tests:          [3 cases pass/fail]
4. Live checks:             [landing 200, login page 200, grep counts]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers:                [any]
7. Suggested next:          WP-AI-003 (chat with note) — do NOT start it.
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-AI-003** — chat with note (streaming, llama-3.1-70b-versatile).
2. **WP-AI-004** — writing assistant (continue/rephrase/shorten, inline diff UX).
3. Schema sync (`prisma/schema.prisma` ↔ migrate.js).
4. Deploy gates: fail-closed startup, CORS lock, Postgres verification, CI with Chromium.
