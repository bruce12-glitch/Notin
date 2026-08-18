# CODING AGENT MASTER PROMPT — Notin · Task WP-FUNNEL-001
## Wire the acquisition funnel (reconciled 2026-08-18 against post-PR-#14/#15/#16 main)

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
"Download" items, and more — **exactly 26 per edition** (verified 2026-08-18 in
`frontend/index.html` AND `frontend/index-neon.html`). Visitors cannot reach
the product. Your single task is **WP-FUNNEL-001: wire the entire acquisition
funnel** so every real CTA reaches the right auth/app page on the correct
origin in every environment (localhost, per-port preview hosts, single-origin
production).

Rules:
1. **No hardcoded hosts.** Preview environments use per-port hostnames
   (`3000-xxxx.e2b.app` vs `5000-xxxx.e2b.app`), so the app origin must be
   *derived at runtime*, never written as a literal.
2. **Landing marketing stays visually untouched.** No layout, animation, theme,
   or copy changes — destination wiring and two small behavior fixes only.
3. **The app, backend, and auth pages are OUT OF SCOPE.** This task touches
   `frontend/` only.
4. **Honesty over coverage.** Buttons for artifacts that do not exist (native
   binaries, store apps, browser extensions) are NOT wired to fake
   destinations — they are documented leftovers.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18, post-PR-#14/#15/#16 main)

```
frontend/
├── index.html        ← Green edition — 26 dead href="#" (exact inventory below)
├── index-neon.html   ← Neon edition — 26 dead href="#", SAME inventory,
│                        loads the SAME script.js (line ~989: <script src="script.js">)
├── script.js         ← landing runtime. THREE blocks matter:
│   • ~L93–102: mobile menu builds "Log in" + "Start for free" <a href="#"> dynamically
│   • ~L700–810: organize-showcase CTA state machine — SCOPED to
│     .organize-showcase__cta only. WORKING today (href="#pricing" exists);
│     it preventDefaults, shows loading, scrolls, toasts success. DO NOT TOUCH.
│   • END OF FILE: inline Google-OTP auth modal. CRITICAL: it hijacks clicks
│     by TEXT — see Spec 4. The modal itself serves the ?auth=otp Google
│     redirect flow and must keep working.
├── dev-server.mjs    ← static server + proxy: '/api*' + '/auth*' only. UNCHANGED.
└── styles.css / styles-neon.css / input*.css / polish.css ← DO NOT TOUCH
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

**Exact 26-item inventory (identical in both editions):**
1. Nav `Enterprise` ×1 → **leftover** (no section; list it)
2. Header `Log in` ×1 → **login**
3. Nav pill `Start for free` ×1 → **signup**
4. Hero `Get Notin free` ×1 → **signup**
5. Hero `Already have an account? Log in` ×1 → **login** (class `.hero-login`)
6. `Try it free` ×1 → **signup**
7. `Get started` ×1 → **signup** (plain bordered button; NOT the organize-showcase CTA)
8. Pricing `Try Pro free for 14 days` ×1 → **signup**
9. Pricing `Contact sales` ×1 → **contact**
10. `Download Notin` — this is **`#smartDownload`** → **UNTOUCHED-BY-DESIGN**:
    script.js OS_META logic already sets it to `#windows/#macos/#linux/#ios/#android/#web`
    and all six platform cards exist with those exact ids (`#web` L~771,
    `#windows` L~785, `#macos` L~799, `#linux` L~813, `#ios` L~827, `#android` L~841).
    The OS-aware scroll flow works — do not rewire.
11. Platform `.download-link` ×6:
    - `Open notin.app` (inside `#web` card) → **app**
    - `Download .exe`, `Download .dmg`, `Download AppImage`, `App Store`,
      `Google Play` → **leftovers** (no artifacts exist; list them; add to debt)
12. Browser `.btn-sm-evernote` ×3 (Chrome/Firefox/Safari) → **leftovers**
    (no extensions exist; list them)
13. Footer ×7: `Changelog`, `Blog`, `Careers`, `Contact`, `Privacy`, `Terms`,
    `Security` → `Contact` → **contact** (mailto); other six → **leftovers**

**Also working today (do not count as dead, do not touch):**
- `.organize-showcase__cta` "Try it for free" → `href="#pricing"` via its own
  state machine (both editions, verified).
- Mega-menu links (`#features`, `#capture`, `#organize`, `#pricing`, `#ai-tools`
  — all section ids exist).
- Mobile menu builds 2 more funnel links dynamically (`Log in`, `Start for free`)
  — these are covered by Spec 3, not the 26.

**Mirror note:** `docs/index.html` (GitHub Pages mirror) has the same 26 dead
links. It is OUT OF SCOPE (mirror sync happens at deploy) — but the final
report MUST state this divergence explicitly.

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

Add a `data-cta` attribute to each funnel element and keep `href="#"` as the
no-JS fallback; `script.js` resolves destinations on `DOMContentLoaded`:

| Elements (per PART 2 inventory) | `data-cta` | Destination |
|---|---|---|
| Header "Log in" · hero "Already have an account? Log in" | `login` | `${origin}/login.html` |
| "Start for free" · "Get Notin free" · "Try it free" · "Get started" · "Try Pro free for 14 days" | `signup` | `${origin}/` |
| "Open notin.app" (`.download-link` inside `#web` card only) | `app` | `${origin}/app.html` |
| "Contact sales" · footer "Contact" | `contact` | `mailto:hello@notin.app` |

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
Full-page navigation (not the inline modal) is the funnel path.

**Classify ONLY the elements listed.** Do not add `data-cta` to
`#smartDownload`, `.organize-showcase__cta`, mega-menu links, or any leftover.

### Spec 3 — Mobile menu links (`frontend/script.js` ~lines 93–102)

The mobile panel builds `login.href = '#'` and `cta.href = '#'` dynamically.
Change them to real destinations at creation time:
```js
login.href = notinAppOrigin() + '/login.html';
cta.href   = notinAppOrigin() + '/';
```
Keep their classes and text unchanged.

### Spec 4 — Neutralize the modal's click hijack (PRESERVE the modal)

At the END of `script.js`, the auth-modal module contains this block:
```js
const authLabels = new Set(['log in', 'start for free', 'get notin free', 'try it free', 'get started', 'try pro free for 14 days']);
document.querySelectorAll('a').forEach((a) => {
  if (authLabels.has(a.textContent.trim().toLowerCase())) {
    a.addEventListener('click', (e) => { e.preventDefault(); open(); });
  }
});
```
It intercepts every primary funnel CTA by text content and swallows the click
into the Google-only modal (which returns 503 while OAuth is unconfigured) —
**it would break Spec 2 wiring. DELETE this binding block (all six lines).**

What you must NOT touch in that module: the modal DOM/panel, the
`?auth=otp` auto-open branch, the Google button (`${api}/auth/google`), the
verify/resend handlers, and the `api` origin constant. After your edit the
modal still auto-opens for `?auth=otp` and opens never otherwise. This is the
one intended behavioral change of this WP; document it in the report.

### Spec 5 — Leftovers (do not wire)

Leave these `href="#"` exactly as-is and list them in the report:
`Enterprise` nav · `Download .exe` · `Download .dmg` · `Download AppImage` ·
`App Store` · `Google Play` · `Chrome` · `Firefox` · `Safari` · `Changelog` ·
`Blog` · `Careers` · `Privacy` · `Terms` · `Security` (15 per edition).
Add one line to the report confirming each exists as a documented leftover.

### Spec 6 — Neon parity

`index-neon.html` loads the same `script.js` (verified line ~989) — no script
replication. Apply the identical `data-cta` markup changes to the Neon file's
matching elements (same inventory, same class names, `hero-login` is
`text-[16px]` there — match by text and context, not by exact class strings).

### Spec 7 — Dev-server sanity (no behavior change)

Read `frontend/dev-server.mjs` and confirm the proxy rules remain `/api*` +
`/auth*` only. Do NOT extend the proxy to serve app pages — origin derivation
(Spec 1) is the designed mechanism. No changes expected; if you believe one is
needed, stop and report instead.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: `frontend/script.js` (mobile menu block, organize-showcase CTA
   block, auth-modal block), both HTML editions (list every `href="#"` with
   line numbers FIRST — expect exactly 26 per file), `frontend/dev-server.mjs`.
2. Confirm each of the 26 against the PART 2 inventory; flag any drift in the
   report and classify by text/context (never guess silently).
3. Implement Specs 1–4 in `script.js`, then markup in both editions.
4. `node --check frontend/script.js` — must pass.
5. Resolver logic test with node (paste the function in a REPL/test harness):
   - host `3000-abc.e2b.app` → `http(s)://5000-abc.e2b.app`
   - host `localhost:3000` → `http://localhost:5000`
   - host `notin.app` → same origin (`https://notin.app`)
6. Serve and verify:
   ```bash
   cd backend && npm start &               # :5000 (migrate first if fresh env)
   cd frontend && PORT=3000 node dev-server.mjs &
   curl -s localhost:3000/ | grep -c 'data-cta'           # ≥ 9
   curl -s -o /dev/null -w "%{http_code}" localhost:5000/login.html   # 200
   curl -s -o /dev/null -w "%{http_code}" localhost:5000/             # 200
   curl -s localhost:3000/script.js | grep -c 'authLabels'            # 0 (hijack gone)
   curl -s localhost:3000/script.js | grep -c "auth=otp"              # ≥ 1 (modal flow intact)
   ```
7. Re-grep both HTML files: `grep -c 'href="#"'` must drop from 26 → **15**
   (the documented leftovers) in EACH file.
8. Update `PROJECT_BIBLE.md`: mark WP-FUNNEL-001 complete; remove "Landing CTAs
   dead" from KNOWN TECHNICAL DEBT; add "Platform binaries/store/extension
   downloads are dead links by design (no artifacts) — Low".

## PART 5 — DO NOT (hard constraints)

→ Do NOT touch `authentication/`, `backend/`, `docs/`, or any theme CSS.
→ Do NOT modify the OTP modal's DOM, verify/resend/Google handlers, or its
  `?auth=otp` auto-open — only the `authLabels` binding block is removed.
→ Do NOT touch the `.organize-showcase__cta` state machine or `#smartDownload`
  / OS_META logic — both work today.
→ Do NOT wire the leftover download/browser/footer links to fake destinations.
→ Do NOT hardcode any sandbox/preview hostname or port-5000 literal in HTML —
  destinations resolve at runtime only (mailto is the one static exception).
→ Do NOT extend `dev-server.mjs` proxy rules. Do NOT add npm dependencies.
→ Do NOT change visual design, copy, animations, or tokens.
→ Do NOT build anything outside this work package.

## PART 6 — ACCEPTANCE CRITERIA

□ 26→15 `href="#"` per edition (exactly the Spec 5 leftovers), both files
□ `data-cta` on exactly 9 static elements per edition: 2 login, 5 signup,
  1 app, 2 contact (1 sales + 1 footer)
□ Mobile menu's two dynamic links resolve via `notinAppOrigin()` at creation
□ `authLabels` binding removed; `?auth=otp` modal path preserved; clicking a
  wired CTA navigates full-page (no modal opens)
□ Resolver passes the three logic cases; no host literals anywhere in HTML
□ Landing 200 on :3000; `/login.html` + `/` 200 on :5000; by construction a
  preview-host visitor clicking "Start for free" lands on `5000-<suffix>/`
□ `#smartDownload` still OS-driven; organize CTA still scrolls with its state
  machine; mega-menu anchors unaffected
□ `node --check` clean; zero visual diff; dev-server proxy unchanged
□ Report lists the 15 leftovers + the docs/ mirror divergence explicitly

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-FUNNEL-001 REPORT
1. Files modified:          [list]
2. CTA inventory:           [26→15 per edition; counts per data-cta class;
                             leftovers listed; docs/ divergence noted]
3. Hijack removal:          [authLabels block removed; ?auth=otp preserved — evidence]
4. Resolver tests:          [3 cases pass/fail]
5. Live checks:             [landing 200, auth pages 200, grep counts]
6. Unspecified decisions:   [should be none or trivial]
7. Blockers:                [any]
8. Suggested next:          WP-AI-003 (chat with note) — do NOT start it.
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-AI-003** — chat with note (full spec: `CODING_AGENT_MASTER_PROMPT_FURTHER_DEVELOPMENT.md` § PART 5).
2. **WP-SCHEMA-001** → **WP-DEPLOY-001** (same file § PART 6), then deploy.
3. Leftover-link debt: platform binaries / store apps / browser extensions.
4. docs/ mirror re-sync at deploy time.
