# CODING AGENT MASTER PROMPT — Notin · Task WP-SEC-004

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-19 · audited line-by-line against `main` @ `1135524`
> (post-PR-#25), which already contains WP-SEC-001 and WP-SEC-002.
> **Queue rule (locked):** the WP-SEC-003 session PR must be **MERGED**
> before you branch (it touches `userController.js`/`authController.js`;
> queue law is sequential merges). Base proof: `authentication/sw.js` =
> `notin-shell-v15` and `backend/tests/e2e/auth-lockout.spec.js` on `main`.
> This WP touches shell assets → you WILL bump the cache. Owner CI may still
> be pending — never touch `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Auth today: 15-min jose
access tokens (Bearer) + rotating httpOnly refresh cookies in theft-detecting
families (SEC-001) + signed CSRF/origin guards (SEC-002) + signin lockout
ladder / OTP throttle (SEC-003).

Your single task: **WP-SEC-004 — token-version invalidation** (PR #2 salvage
item **#4**). Access tokens are stateless; today they outlive every
server-side revocation until natural expiry (≤15 min) — SEC-001's own E2E
asserts that honestly. Close it:

1. `User` gains `tokenVersion` (int, default 0); access JWTs carry `tv`.
   The auth middleware ALREADY re-reads the user row per request
   (`db.user.findById` — "account no longer exists" guard) — you extend
   THAT SAME READ: version mismatch → 401. Zero added queries.
2. **Bump points (all three, locked):** password reset success · the new
   "sign out everywhere" endpoint · **the replay-nuke in `refresh()`**
   (a detected theft must kill the stolen access token instantly — this
   legitimately flips SEC-001's honesty assertion; update that spec).
3. New authenticated endpoint `POST /api/users/me/logout-all` + one Account
   modal button wired to it.

Operating rules:
1. **Legacy tokens = tv 0.** `payload.tv ?? 0` vs column default 0 — old
   tokens keep working until the first bump, then die. No migration of live
   sessions, no forced re-login on deploy.
2. **Every 401 stays byte-identical** (`{ message: 'Unauthorized' }`).
3. **Zero new npm deps.** Cookie options objects get EXPORTED from
   authController rather than duplicated — one source of truth.

---

## PART 2 — REPO GROUND TRUTH (verified main @ `1135524`)

```
backend/src/config/db.js — user model (explicit column lists everywhere):
  findUnique L219-223 · findById L224-227 · findByGoogleSub L228-232 ·
  create L236-246 (INSERT … RETURNING …) · updatePassword L248-252
  (UPDATE … RETURNING …). Every SELECT/RETURNING lists:
  id, username, email, password, google_sub as "googleSub", "createdAt",
  "updatedAt"   ← you add "tokenVersion" to ALL of these lists (5 sites).
backend/src/lib/jwt.js — createAccessToken(user, 15) builds
  SignJWT({ sub, email, type:'access' }) … HS256.
backend/src/middleware/auth.js — after verify (+ legacy fallback):
  req.userId = payload.sub || payload.id … then
  const user = await db.user.findById(req.userId);
  if (!user) throw 'Account no longer exists' → catch → 401 {'Unauthorized'}.
backend/src/controllers/authController.js —
  resetPassword success (~L449-455): updatePassword → used_at consume →
    UPDATE refresh_tokens … revoke_reason='password-reset' … →
    res.json({ok:true, message:'Password updated. Sign in with your new password.'})
  refresh() replay-nuke (~L320-330): family UPDATE …console.error
    '[SECURITY] refresh-token replay detected — rotation family revoked'…
    clearCookie×3 (incl. notin_csrf) → throw → generic 401.
  cookieOpts / cookieOptsLegacy / csrfCookieOpts declared near L32-50
    (currently private consts — you will EXPORT them).
  revoke_reason vocabulary comment (SEC-001) lists 4 values — extend with
  'logout-all' where you touch code, and note it in the PR.
backend/src/controllers/accountController.js — exportAccount @L23,
  deleteAccount @L110 (auth'd via userRoutes, accountLimit 20/15min).
backend/src/routes/userRoutes.js — signup · signin ·
  GET /me/export · DELETE /me (auth+accountLimit). You ADD the logout-all
  route here.
backend/prisma/schema.prisma — model User must mirror the new column
  (WP-SCHEMA-001 docs-only rule; camelCase field, no @map needed —
  column IS camelCase quoted like "createdAt").
authentication/app.html — #accountModal @L351: export section (.app-account
  -section, button.app-account-export#exportDataBtn) then DANGER section.
  You insert the new section BETWEEN them.
authentication/app.js — refs ~L152-154; logout handler @ ~L2470-2479 does:
  both /logout fetches tolerant try{}catch{} → memToken=null →
  sessionStorage.removeItem('notin_email' | 'notin_offline_user_id') →
  redirectToLogin(). Mirror that cleanup pattern.
backend/tests/e2e/auth-refresh-replay.spec.js — SEC-001 spec; its final
  "honesty assertion" (access token 200 AFTER family nuke) FLIPS to 401
  under this WP (replay-nuke now bumps tv). Update it + its comment.
DEV reset flow: forgotPassword echoes devResetToken when !production && !SMTP
  (L415-419) — your E2E uses that echo, nothing else.
```

---

## PART 3 — THE WORK

### Spec 1 — migration (both dialects) + prisma mirror

`migrate.js` pg section (near the other User column adds, L41-54):
```js
// WP-SEC-004 — token-version invalidation (bump kills all live access tokens)
await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;`);
```
sqlite section (same convention block, L243+ style):
```js
// WP-SEC-004 — token-version invalidation
try{ db.exec(`ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
```
`schema.prisma` model User: `tokenVersion Int @default(0)` (comment:
`// WP-SEC-004 mirror — migrate.js is authoritative`).

### Spec 2 — plumb the column through `db.js` + `jwt.js`

1. `db.js`: add `"tokenVersion"` to ALL FIVE User column lists (4 SELECTs +
   create's RETURNING) and to `updatePassword`'s RETURNING — that's 6 list
   edits; grep them all: `"createdAt", "updatedAt"` →
   `"createdAt", "updatedAt", "tokenVersion"`.
2. Add the bump helper inside the `user` model:
   ```js
   // WP-SEC-004 — one bump invalidates every live access token instantly
   async bumpTokenVersion(id) {
     await query(`UPDATE "User" SET "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = $1 WHERE id = $2`, [new Date().toISOString(), id]);
   },
   ```
3. `jwt.js` createAccessToken claims become
   `{ sub: user.id, email: user.email, type: 'access', tv: Number(user?.tokenVersion ?? 0) }`
   — the ONLY change to that function.

### Spec 3 — middleware/auth.js: version check on the EXISTING read

After the `if (!user) throw new Error('Account no longer exists');` line:
```js
// WP-SEC-004 — token-version binding. Zero added queries: this reuses the
// existence read above. Legacy tokens carry no tv → treated as 0.
if (Number(user.tokenVersion ?? 0) !== Number(req.tokenPayload.tv ?? 0)) {
  throw new Error('Token superseded');
}
```
Catch already responds 401 `{ message: 'Unauthorized' }` — do NOT fork the
body for this case (no oracle).

### Spec 4 — bump at the three sites

1. `resetPassword` (authController): immediately after
   `await db.user.updatePassword(user.id, hashed);` add
   `await db.user.bumpTokenVersion(user.id); // WP-SEC-004 — old access tokens die now, not in 15 min`
2. replay-nuke inside `refresh()`: immediately BEFORE the
   `console.error('[SECURITY] refresh-token replay detected …')` line add
   `await db.user.bumpTokenVersion(row.user_id); // WP-SEC-004 — theft kills live access tokens too`
3. NEW `logoutAll` in accountController (and EXPORT the three cookie-option
   consts from authController for it):
   ```js
   // WP-SEC-004 — global sign-out: bump tv (access dies instantly) + revoke
   // every refresh family + clear this device's cookies.
   export async function logoutAll(req, res) {
     const now = new Date().toISOString();
     await db.user.bumpTokenVersion(req.userId);
     await db.query(`UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'logout-all' WHERE user_id = $2 AND revoked_at IS NULL`, [now, req.userId]);
     res.clearCookie('notin_refresh', cookieOpts);
     res.clearCookie('notin_refresh', cookieOptsLegacy);
     res.clearCookie('notin_csrf', csrfCookieOpts);
     res.json({ ok: true, message: 'Signed out everywhere' });
   }
   ```
   authController: `const cookieOpts` → `export const cookieOpts` (same for
   cookieOptsLegacy, csrfCookieOpts; imports added where needed).

### Spec 5 — route (userRoutes.js)

```js
// WP-SEC-004 — global sign-out (Bearer-authed; NOT a cookie mutation → no CSRF guard needed, per SEC-002 scoping)
router.post('/me/logout-all', auth, accountLimit, logoutAll);
```
Import `logoutAll` from accountController.

### Spec 6 — client (app.html + app.js)

1. app.html, between the export section and the danger section:
   ```html
   <!-- WP-SEC-004 — global session invalidation (token-version bump server-side) -->
   <section class="app-account-section">
     <h4>Sign out everywhere</h4>
     <p>Ends every session on every device, including this one. You can sign straight back in.</p>
     <button type="button" class="app-account-export" id="logoutAllBtn">Sign out everywhere</button>
   </section>
   ```
   (No new CSS — `app-account-export` styling is reused deliberately.)
2. app.js: ref beside exportDataBtn; handler mirroring the logout cleanup:
   ```js
   // WP-SEC-004 — server invalidates; client just drops local state and exits
   if(logoutAllBtn) logoutAllBtn.addEventListener('click', async ()=>{
     try{ await fetchWithAuth(`${API_BASE}/api/users/me/logout-all`, { method:'POST' }); }catch{}
     memToken = null;
     currentUserId = null;
     try{ sessionStorage.removeItem('notin_email'); sessionStorage.removeItem('notin_offline_user_id'); }catch{}
     redirectToLogin();
   });
   ```
3. `cd authentication && npm run build:app`; `sw.js` v15 → **v16**.

### Spec 7 — E2E

**NEW `backend/tests/e2e/auth-token-version.spec.js`:**
1. signup (password user) → `GET /api/notes` 200 with access token A1.
2. `POST /api/users/me/logout-all` (Bearer A1) → 200 `{ok:true}`.
3. **Headline assertion:** same A1 → `GET /api/notes` → **401**
   `{message:'Unauthorized'}` (instant invalidation, not 15-min wait).
4. Old refresh cookie → `/api/auth/refresh` → 401 `{error:'Invalid session'}`.
5. Fresh signin (same creds) → works; new token → 200 (bump ≠ brick).
6. **Reset path:** `forgot-password` (dev echo → `devResetToken`) →
   `reset-password` success → the PRE-reset access token → 401; old password
   signin → 401 'Invalid credentials'; new password signin → 200.
7. **Second device:** signin twice (sessions A, B) → logout-all from A →
   B's access token → 401 as well (all-sessions claim proven).

**UPDATE `auth-refresh-replay.spec.js`:** flip the final honesty case —
after the logout-reuse nuke, the captured access token now yields **401**
(theft bump); update the comment to `// closed by WP-SEC-004 — replay nuke
bumps tokenVersion; remaining gap: plain logout keeps access valid ≤15 min
by design`. All other cases unchanged.

### Spec 8 — PROJECT_BIBLE.md

One dated entry: tv column + claim, zero-added-query middleware check, the
three bump points (reset / logout-all / replay-nuke), legacy-token
compatibility (tv 0), new endpoint + modal section, shell v15→v16,
scoreboard → `1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ · remaining 5 device inventory ·
6 password policy · 7 Express 5`. PWA line cache → `notin-shell-v16`.

---

## PART 4 — VERIFICATION (all outputs pasted in PR)

1. migrate twice idempotent; `"tokenVersion"` in `PRAGMA table_info("User")`.
2. Fresh API → new spec green → `auth-refresh-replay.spec.js` green with the
   flipped assertion → FULL `tests/e2e` green.
3. Proof-of-instant: curl — issue token, logout-all, replay token → 401
   within the same second (paste timestamps).
4. `git diff --name-only` = EXACTLY 15 paths: `backend/src/db/migrate.js` ·
   `backend/src/config/db.js` · `backend/src/lib/jwt.js` ·
   `backend/src/middleware/auth.js` ·
   `backend/src/controllers/authController.js` ·
   `backend/src/controllers/accountController.js` ·
   `backend/src/routes/userRoutes.js` · `backend/prisma/schema.prisma` ·
   `authentication/app.html` · `authentication/app.js` ·
   `authentication/app.bundle.js` (generated) · `authentication/sw.js` ·
   `backend/tests/e2e/auth-token-version.spec.js` (new) ·
   `backend/tests/e2e/auth-refresh-replay.spec.js` · `PROJECT_BIBLE.md`.
5. Oracle grep: `Unauthorized` and `Invalid session` bodies untouched;
   createAccessToken gains ONLY the tv claim.

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ column + mirror + all six column lists plumbed; bump helper in db.js
□ middleware reuses the existing read; single shared 401 body
□ three bump sites exact; replay-nuke bump PRECEDES the security log line
□ endpoint + modal section + handler; bundle rebuilt; `notin-shell-v16`
□ new spec green (headline 401-instant case); replay spec flip green
□ BIBLE entry + scoreboard; PR title
  `WP-SEC-004: token-version invalidation + sign-out-everywhere`

**Hard NO list:** no new deps · no per-request caching layer (this scale
needs none — PK read, already happening) · no changes to token TTLs · no
changes to SEC-001/002 guards · no cookie renames · no new CSS · no client
polling of version · no `.github/` · no edits to other specs beyond the ONE
flipped assertion.

**Honest-gaps clause:** final message includes (a) PART 4 evidence verbatim,
(b) NOT-done list — explicitly: plain single-device logout still leaves
access valid ≤15 min (BY DESIGN — not a theft signal; say it); replay-nuke
bump is user-wide (an attacker forcing replays signs the victim out — the
theft response IS sign-out; availability hit acknowledged vs. secrecy win);
legacy `jsonwebtoken`-era 7d tokens without tv read as 0 (die at first
bump — intended); anything else deferred. Empty gaps = red flag.
