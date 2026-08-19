# CODING AGENT MASTER PROMPT — Notin · Task WP-SEC-002

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `bbb53c1`
> (post-PR-#22) **plus** the delivered WP-AI-004b and WP-SEC-001 diffs this WP
> stacks on. **Queue rule (locked):** TWO merges must land before you branch —
> PR #23 (WP-AI-004b) and the WP-SEC-001 session PR. Your base then has
> `authentication/sw.js` = `notin-shell-v14` **and**
> `backend/tests/e2e/auth-refresh-replay.spec.js` on `main`. If either is
> missing, you branched too early: stop and re-branch. Owner CI
> (`.github/workflows/e2e.yml`) may still be pending — never touch `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin** — Node 22 + Express 4 ESM
unified API on :5000, dual-driver pg/SQLite, vanilla ES-module app. Session
model after WP-SEC-001: 15-min jose access token in memory (sent as
`Authorization: Bearer`) + 30-day **rotating httpOnly refresh cookie**
(`notin_refresh`, rotation families with replay detection).

Your single task: **WP-SEC-002 — signed CSRF protection + trusted-origin
enforcement on cookie-carried mutations** (PR #2 salvage item **#2**; item #1
already shipped in WP-SEC-001).

Architectural fact that scopes everything: **exactly two endpoints in the
entire system authenticate by cookie** — `POST /auth/refresh` and
`POST /auth/logout` (mounted twice: `/api/auth/…` and legacy `/auth/…`).
Every other route authorizes via the Bearer header, which cross-site pages
cannot forge — those routes stay untouched BY DESIGN. Your enforcement:

- **Layer A — trusted origin:** mutating methods (`POST/PUT/PATCH/DELETE`)
  on the auth router whose `Origin` header is present and not allowlisted →
  `403 { "error": "Invalid origin" }`. Absent `Origin` (curl, Playwright
  request specs) → pass. This mirrors the WP-DEPLOY-001 CORS allowlist.
- **Layer B — signed double-submit CSRF:** a second, NON-httpOnly cookie
  `notin_csrf` (value `rand.hmac`, HMAC-SHA256 keyed by a derivative of the
  refresh secret), minted alongside every refresh-token mint and rotated
  with it. The client echoes it verbatim in the `x-notin-csrf` header. On
  `refresh`/`logout`, when the refresh cookie is present, require:
  cookie present ∧ header present ∧ equal ∧ HMAC valid — else
  `403 { "error": "Invalid CSRF token" }`. No refresh cookie → skip the
  check (the SEC-001 `401 { "error": "Invalid session" }` path owns it).

Operating rules:
1. **Zero drift on existing contracts.** 200 shapes, 401 bodies, cookie
   names/options already shipped — unchanged. The only new outward signals
   are the two 403 bodies above and the new `notin_csrf` cookie.
2. **Single source of truth for origins.** No duplicated allowlist logic.
3. **Zero new npm dependencies.** node:crypto + jose-era helpers only.
4. **Non-browser flows keep working.** Request-only E2E specs send no
   Origin and must pass after adding only the CSRF header where a cookie is
   carried.

---

## PART 2 — REPO GROUND TRUTH (verified on main @ `bbb53c1` + WP-SEC-001 spec)

```
backend/src/server.js
  L26  const origin = process.env.APP_ORIGIN || 'http://localhost:4173';
  L30  allowList = origin.split(',').map(trim).filter(Boolean)
  CORS middleware (hand-rolled, ~L80-99): prod echoes allowlisted origins
    else canonical; non-prod echoes request Origin; headers:
      Access-Control-Allow-Headers: Content-Type, Authorization   ← add X-Notin-CSRF
      Access-Control-Allow-Credentials: true · Vary: Origin · OPTIONS→204
  then express.static(authStaticPath) → express.json → cookieParser → routes
  Mounts: app.use('/api/auth', authRoutes); app.use('/auth', authRoutes);
  (+ aliases /api/auth/signup · /api/auth/signin direct to userController)

backend/src/routes/authRoutes.js
  router.use(strict)  (30/15min, all auth routes)  → then routes:
  POST /otp/resend · /otp/demo-request · /otp/verify · /forgot-password
  (resetStrict) · /reset-password (resetStrict) · /refresh · /logout ·
  GET /google · /google/callback · /health

backend/src/lib/jwt.js
  crypto-only helpers: createAccessToken · hashToken (sha256hex) ·
  randomToken(bytes=32, base64url) · access/refresh secrets at module scope.

backend/src/controllers/authController.js
  cookieOpts/cookieOptsLegacy @ L32-44 (httpOnly, lax, paths /api/auth,/auth)
  refresh-token MINT sites: otpVerify ~L259-267 · refresh() success tail
  (SEC-001 shape: single response tail minting successor + 2 cookies) ·
  replay-nuke path clears refresh cookie ×2 (cookieOpts + legacy).
  logout(): clearCookie ×2 → 204.

backend/src/controllers/userController.js
  signup ~L42-50 · signin ~L99-107 — mint refresh + both cookie paths inline.

authentication/app.js  (post-WP-SEC-001 naming)
  readCookie helper does NOT exist yet (cookies for refresh are httpOnly).
  bootstrapTokenCore() — fetch POST /api/auth/refresh then fallback
    POST /auth/refresh (credentials:'include'); wrapped by single-flight.
  logoutBtn handler @ ~L2470-2477 — direct POST /api/auth/logout then
    /auth/logout, both try{}catch{}, then local cleanup + redirectToLogin().

backend/tests/e2e/auth-refresh-replay.spec.js  (WP-SEC-001; on main already)
  rawRefreshCookie(response) helper + ~12 cookie-carrying /api/auth calls —
  EVERY one now needs the CSRF header. mvp-smoke.spec.js L406 posts a
  cookie-less refresh expecting 401 — must stay passing UNTOUCHED.

authentication/server.js  — LEGACY standalone dev server with its OWN
  /auth/refresh + /auth/logout (L322/L355). Dev tooling, separate process.
  OUT OF SCOPE. Do not edit; do not “align” it. Mention in honest-gaps.
```

---

## PART 3 — THE WORK

### Spec 1 — NEW `backend/src/lib/httpSecurity.js` (single source of truth)

```js
// WP-SEC-002 — trusted-origin decisions, shared by the CORS middleware
// (server.js) and the auth-router originGuard (authRoutes.js).
const origin = process.env.APP_ORIGIN || 'http://localhost:4173';
export const allowList = origin.split(',').map((s) => s.trim()).filter(Boolean);
export const canonicalOrigin = allowList[0] || origin;
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function isOriginAllowed(originHeader) {
  if (!originHeader) return true; // non-browser callers are handled elsewhere
  if (allowList.includes(originHeader)) return true;
  if (process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(originHeader)) return true;
  return false;
}
```

### Spec 2 — `server.js` CORS block refactor (behavior-identical) + header

1. Import `{ allowList, canonicalOrigin, isOriginAllowed }` from
   `./lib/httpSecurity.js`; DELETE the local `origin`/`allowList`
   construction (keep one `canonicalOrigin` usage in the CORS echo).
2. In the CORS middleware keep today's echo semantics exactly
   (prod: allowlisted origin else canonical; non-prod: echo request Origin)
   but derive decisions from `isOriginAllowed`. Only outward change:
   ```js
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Notin-CSRF');
   ```
3. Everything else (statics, json limit, parsers, mounts): untouched.

### Spec 3 — `jwt.js` gains signed CSRF helpers (zero deps)

```js
// WP-SEC-002 — signed double-submit CSRF tokens (cookie-carried mutations only).
// Not httpOnly: the client must read + echo it. Signature defeats value forgery.
const csrfKey = crypto.createHash('sha256').update(`csrf:${refreshSecret}`).digest();
export function mintCsrfToken() {
  const rand = randomToken(24);
  return `${rand}.${crypto.createHmac('sha256', csrfKey).update(rand).digest('hex')}`;
}
export function verifyCsrfToken(token) {
  if (typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const expected = crypto.createHmac('sha256', csrfKey).update(token.slice(0, dot)).digest('hex');
  const sig = Buffer.from(token.slice(dot + 1));
  const exp = Buffer.from(expected);
  return sig.length === exp.length && crypto.timingSafeEqual(sig, exp);
}
```

### Spec 4 — mint/rotate/clear the `notin_csrf` cookie (both controllers)

1. `authController.js`, beside cookieOpts:
   ```js
   // WP-SEC-002 — readable double-submit cookie; root path covers both mounts
   const csrfCookieOpts = { httpOnly: false, secure: isProduction, sameSite: 'lax', path: '/' };
   ```
2. At EVERY refresh-mint response — otpVerify, signup (userController),
   signin (userController), and the SEC-001 `refresh()` single response tail
   (covers both rotate and grace-sibling) — add immediately before the JSON
   response:
   ```js
   res.cookie('notin_csrf', mintCsrfToken(), { ...csrfCookieOpts, maxAge: 30 * 86400000 });
   ```
   (userController defines its own inline options there — mirror the same
   shape; `mintCsrfToken` import added to both controllers.)
3. `logout()`: after the two existing clearCookie calls add
   `res.clearCookie('notin_csrf', csrfCookieOpts);`
4. SEC-001 replay-nuke path: after its two clearCookie calls add the same
   `res.clearCookie('notin_csrf', csrfCookieOpts);`

### Spec 5 — `authRoutes.js` guards

After `router.use(strict);` and BEFORE the route table:
```js
// WP-SEC-002 — trusted-origin enforcement on mutating auth routes. Absent
// Origin = non-browser caller → allowed (CORS already governs browsers).
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function originGuard(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  const originHeader = req.headers.origin;
  if (!originHeader || isOriginAllowed(originHeader)) return next();
  return res.status(403).json({ error: 'Invalid origin' });
}
// WP-SEC-002 — signed double-submit CSRF for the ONLY cookie-authenticated
// mutations. No refresh cookie → the SEC-001 generic-401 path owns it.
function csrfGuard(req, res, next) {
  if (!req.cookies?.notin_refresh) return next();
  const cookieToken = req.cookies?.notin_csrf;
  const headerToken = req.headers['x-notin-csrf'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken || !verifyCsrfToken(cookieToken)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}
router.use(originGuard);
```
Then wire the two routes:
```js
router.post('/refresh', csrfGuard, refresh);
router.post('/logout', csrfGuard, logout);
```
No other route gains middleware. (Signup/signin ALIASES mounted directly in
server.js `/api/auth/signup|signin` bypass this router by design — they read
no cookies; say so in the PR.)

### Spec 6 — `authentication/app.js` client (4 call sites)

1. New helpers (near bootstrapTokenCore):
   ```js
   // WP-SEC-002 — echo the signed double-submit cookie on cookie-carried mutations
   function readCookie(name){
     const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
     return m ? decodeURIComponent(m[1]) : '';
   }
   function csrfHeaders(){
     const t = readCookie('notin_csrf');
     return t ? { 'x-notin-csrf': t } : {};
   }
   ```
2. bootstrapTokenCore: both refresh fetches →
   `{ method:'POST', credentials:'include', headers: csrfHeaders() }`.
3. logoutBtn handler: both logout fetches → same option addition.
4. Nothing else. If a refresh response 403s (expired/missing CSRF), the
   existing failure → redirectToLogin path handles it — do not add UX.

### Spec 7 — shell bookkeeping

`cd authentication && npm run build:app` (esbuild; never hand-edit the
bundle) and `authentication/sw.js`: `notin-shell-v14` → `notin-shell-v15`.

### Spec 8 — E2E

**NEW `backend/tests/e2e/auth-csrf.spec.js`** (house style; signup via
`POST /api/users/signup`; unique emails; extend the replay spec's
`rawRefreshCookie` idea into a generic `rawCookie(response, name)` local
helper and read BOTH `notin_refresh` and `notin_csrf`):
a. **Bad origin:** valid session; refresh with `Origin: https://evil.example`
   → 403 body EXACTLY `{ "error": "Invalid origin" }`; then refresh with NO
   Origin → 200 (session unharmed).
b. **Dev origin:** `Origin: http://localhost:4173` → 200.
c. **Missing CSRF:** valid session, no header → 403 `{ "error": "Invalid CSRF token" }` (exact).
d. **Mismatch:** header = cookie + `'x'` → 403.
e. **Forged but equal:** set `notin_csrf` cookie to `aaa.bbb` and echo
   `aaa.bbb` in the header (equal, unsigned) → 403.
f. **Genuine rotation of both cookies:** verbatim cookie+header → 200, and
   the response sets a NEW `notin_csrf` (assert present); immediately
   re-refresh with the NEW pair → 200.
g. **Logout matrix:** without header → 403; with valid pair → 204.
h. **No-cookie refresh (no Origin, no CSRF):** → 401 EXACTLY
   `{ "error": "Invalid session" }` — the WP-SEC-001 contract; proves the
   guards sit BEHIND the session path. mvp-smoke L406 must stay untouched.

**UPDATE `backend/tests/e2e/auth-refresh-replay.spec.js`:** generalize
`rawRefreshCookie` → `rawCookie(response, name)`; capture both cookies at
signup; EVERY cookie-carrying call (chains, clean-context replays, bursts,
logout) sends `headers: { Cookie: notin_refresh=…; notin_csrf=… }`-style or
context cookies PLUS `x-notin-csrf`. Asserted semantics unchanged
(replay still 401-with-generic-body — now PROVEN reachable only with a
valid CSRF pair; add one line noting this hardening).

### Spec 9 — PROJECT_BIBLE.md

One dated entry (house style): the two-layer design, why Bearer routes are
untouched by design, the two 403 contracts, cookie mint/rotate/clear points,
client echo + preflight header addition, shell v14→v15 — and update the
salvage scoreboard to `1 ✅ · 2 ✅ · remaining 3 lockout · 4 token-versioning
· 5 device inventory · 6 password policy · 7 Express 5`. PWA line cache name
→ `notin-shell-v15`.

---

## PART 4 — VERIFICATION (run all; paste outputs in the PR)

1. Keyless, fresh API on :5000 → full `npx playwright test tests/e2e` green
   (new spec + updated replay spec + mvp-smoke untouched).
2. curl matrix (paste outputs): bad-origin 403 · missing-CSRF 403 ·
   forged-equal 403 · genuine 200-with-new-csrf-cookie · cookie-less 401
   exact body.
3. Preflight proof: `curl -i -X OPTIONS …/api/auth/refresh -H
   'Origin: http://localhost:4173' -H 'Access-Control-Request-Headers: x-notin-csrf'`
   → 204 and Allow-Headers contains X-Notin-CSRF.
4. `git diff --name-only` shows EXACTLY these 12 paths:
   `backend/src/lib/httpSecurity.js` (new) · `backend/src/server.js` ·
   `backend/src/routes/authRoutes.js` · `backend/src/lib/jwt.js` ·
   `backend/src/controllers/authController.js` ·
   `backend/src/controllers/userController.js` · `authentication/app.js` ·
   `authentication/app.bundle.js` (generated) · `authentication/sw.js` ·
   `backend/tests/e2e/auth-csrf.spec.js` (new) ·
   `backend/tests/e2e/auth-refresh-replay.spec.js` · `PROJECT_BIBLE.md`.
5. Oracle grep: diff must not alter `Invalid session`, any 200 body, or any
   existing cookie option.

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ origin allowlist single-sourced; CORS echo behavior byte-preserved
□ 403 bodies exact; guards ordered strict→originGuard→(csrfGuard on 2 routes)
□ notin_csrf minted at all 4 mint sites, rotated with refresh, cleared at
  logout AND replay-nuke
□ client echoes header at all 4 fetch sites; build:app; shell v15
□ new spec green; replay spec updated and green; mvp-smoke untouched+green
□ BIBLE entry + scoreboard; PR title
  `WP-SEC-002: signed CSRF + trusted-origin enforcement on cookie-carried auth mutations`

**Hard NO list:** no new npm deps · no changes outside the 12 paths · no
middleware on note/notebook/tag/share/attachment routes · no cookie renames
or option changes on existing cookies · no env knobs (allowlist source
stays APP_ORIGIN; the 30 s→nothing, there IS no second constant) · no edits
to `authentication/server.js` · no `.github/` changes · no UX prompts for
CSRF failures (silent → existing login redirect).

**Honest-gaps clause:** final message must include (a) PART 4 evidence
verbatim, and (b) a NOT-done list — explicitly: sibling-subdomain
cookie-tossing is bounded but not eliminated (path-scoped refresh cookie +
signature; full fix = `__Host-` prefix once the app is served apex-only —
note it); legacy dev-server endpoints unguarded by design; absent-Origin
callers trusted (standard for non-browser clients); plus anything else you
deferred. An empty gaps list reads as a red flag.
