# CODING AGENT MASTER PROMPT — Notin · Task WP-SEC-005

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-20 · audited line-by-line against `main` @ `1135524`
> (post-PR-#25; SEC-001/002 live) **plus** the delivered WP-SEC-003/004
> shapes this stacks on. **Queue rule (locked):** PR #26 (WP-SEC-003) AND
> the WP-SEC-004 session PR must both be MERGED before you branch. Base
> proof: `authentication/sw.js` = `notin-shell-v16`,
> `backend/src/lib/throttle.js` exists, `User."tokenVersion"` exists, and
> `POST /api/users/me/logout-all` is routed. Else: re-branch. This WP
> touches shell assets → bump the cache exactly one step. Owner CI may still
> be pending — never touch `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Auth today: 15-min access
tokens carrying `tv` bound to `User.tokenVersion`, rotating refresh cookies
grouped in replay-detecting rotation **families** (`family_id`) with
reason-tagged revocations (`'rotation'|'logout'|'password-reset'|'replay'|
'logout-all'`).

Your single task: **WP-SEC-005 — device/session inventory with per-session
revocation** (PR #2 salvage item **#5**). Users must be able to SEE every
live session and kill any one of them.

Design core (locked): **a session IS a rotation family.** Inventory groups
`refresh_tokens` by `family_id`; revocation revokes the family's live
rows with a NEW reason `'session-revoke'`. One new column — `user_agent
TEXT` — is captured at every mint/rotation so rows are recognizable. No
UA-parsing dependency: the server stores the raw header (≤255 chars); the
client shows a tiny heuristic label + dates.

Operating rules:
1. **Bearer-scoped, cookie-peek only for "current".** The two new routes
   authorize via the Bearer token (middleware). They never TRUST the
   cookie; the refresh cookie is read only to flag which family is "this
   device". CSRF exempt per SEC-002 scoping — attacker can't forge Bearer.
2. **No oracles, no leaks.** Foreign `familyId` → identical
   `404 { message: 'Session not found' }`. Token hashes never leave the
   server (the API returns family ids, never `hash`).
3. **Revocation is a server-side family revoke; access tokens on a revoked
   session die within their natural ≤15-min TTL** (per-session access
   binding is a future WP — honest-gaps). Replays of a session-revoked
   cookie trip SEC-001 nuke + SEC-004 bump exactly as `'logout'` does — the
   documented theft-response tradeoff stands; reiterate it in the PR.
4. **Zero new npm dependencies.**

---

## PART 2 — REPO GROUND TRUTH (verified main @ `1135524` + SEC-003/004)

```
refresh_tokens columns (post-SEC-001): hash PK · user_id · family_id ·
  expires_at · revoked_at · revoke_reason · created_at   ← + user_agent.
mint sites (7-col INSERT today, becomes 8-col): authController otpVerify ·
  refresh() success tail (rotate/grace-sibling) · userController signup ·
  userController signin.
migrate.js column conventions both dialects (pg IF NOT EXISTS / sqlite
  try-catch 'duplicate column') — as exercised in SEC-001/003/004.
schema.prisma — docs-only mirror; `model RefreshToken` gains userAgent.
accountController.js — exportAccount · deleteAccount · (SEC-004) logoutAll;
  cookieOpts/cookieOptsLegacy/csrfCookieOpts are EXPORTED from
  authController by SEC-004. Your two handlers live here.
userRoutes.js — signup · signin · GET /me/export · DELETE /me ·
  POST /me/logout-all (all auth'd; accountLimit 20/15min on the /me ones).
app.html #accountModal — sections: Export → (SEC-004) Sign out everywhere →
  DANGER. You insert "Active sessions" between them.
app.js — openAccountModal() @ ~L2467 (resets state, focuses export button);
  SEC-004 logoutAllBtn handler shows the cleanup-then-redirect pattern to
  mirror for current-session revocation. loadSessions() is called from
  openAccountModal — every open shows fresh truth.
app.css — kill-switch is the LAST rule; new rules go BEFORE it.
E2E style: signin/signup via /api/users/*, CSRF pair echoed on refresh
  calls (SEC-002), oracle bodies deep-compared, unique emails per run.
```

---

## PART 3 — THE WORK

### Spec 1 — migration + mirror

pg section of migrate.js:
```js
// WP-SEC-005 — device labels for session inventory
await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
```
sqlite section:
```js
// WP-SEC-005 — device labels for session inventory
try{ db.exec(`ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
```
`schema.prisma` model RefreshToken: `userAgent String? @map("user_agent")`
(+ `// WP-SEC-005 mirror` comment).

### Spec 2 — capture `user_agent` at all four mint sites

At EACH 7-col INSERT site, widen to 8 columns (`user_agent` appended);
capture once per handler:
```js
// WP-SEC-005 — raw label only; client renders a heuristic device name
const userAgent = String(req.headers['user-agent'] || '').slice(0, 255) || null;
```
INSERT column list becomes `(hash, user_id, family_id, expires_at,
revoked_at, revoke_reason, created_at, user_agent)` with `…, $7, $8)` —
`userAgent` as the last param everywhere. (Rotate/grace-sibling re-captures
from the CURRENT request — devices don't change mid-rotation, and this
keeps the live row's label fresh.)

### Spec 3 — accountController handlers

```js
// WP-SEC-005 — session = rotation family. Bearer-authed; cookie peek only
// flags the current device; family ids leave the server, never token hashes.
export async function listSessions(req, res) {
  try {
    const now = new Date().toISOString();
    const { rows } = await db.query(
      `SELECT family_id,
              MIN(created_at) AS started_at,
              MAX(created_at) AS last_active,
              COUNT(*) AS rotations,
              MAX(CASE WHEN revoked_at IS NULL AND expires_at > $2 THEN 1 ELSE 0 END) AS live_count,
              (SELECT r2.user_agent FROM refresh_tokens r2
                WHERE r2.family_id = refresh_tokens.family_id AND r2.revoked_at IS NULL
                ORDER BY r2.created_at DESC LIMIT 1) AS user_agent
         FROM refresh_tokens WHERE user_id = $1 GROUP BY family_id`,
      [req.userId, now]
    );
    let currentFamily = null;
    const raw = req.cookies?.notin_refresh;
    if (raw) {
      const found = await db.query(`SELECT family_id FROM refresh_tokens WHERE hash = $1 LIMIT 1`, [hashToken(raw)]);
      currentFamily = found.rows[0]?.family_id || null;
    }
    const sessions = rows
      .filter((r) => Number(r.live_count) > 0)
      .map((r) => ({
        familyId: r.family_id,
        startedAt: r.started_at,
        lastActive: r.last_active,
        rotations: Number(r.rotations),
        userAgent: r.user_agent || null,
        current: !!currentFamily && r.family_id === currentFamily,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current));
    return res.json({ sessions });
  } catch (e) {
    console.error('listSessions', e);
    return res.status(500).json({ message: 'Could not load sessions' });
  }
}

export async function revokeSession(req, res) {
  try {
    const familyId = String(req.params.familyId || '');
    const own = await db.query(
      `SELECT 1 AS ok FROM refresh_tokens WHERE family_id = $1 AND user_id = $2 LIMIT 1`,
      [familyId, req.userId]
    );
    if (!own.rows[0]) return res.status(404).json({ message: 'Session not found' });
    const now = new Date().toISOString();
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'session-revoke' WHERE family_id = $2 AND user_id = $3 AND revoked_at IS NULL`,
      [now, familyId, req.userId]
    );
    return res.json({ ok: true, message: 'Session signed out' });
  } catch (e) {
    console.error('revokeSession', e);
    return res.status(500).json({ message: 'Could not revoke session' });
  }
}
```
(Date objects from pg serialize fine over JSON; do not reformat. Import
`hashToken` from `../lib/jwt.js`.)

### Spec 4 — routes (userRoutes.js)

```js
// WP-SEC-005 — session inventory + per-session revocation (Bearer; not cookie-authed)
router.get('/me/sessions', auth, accountLimit, listSessions);
router.delete('/me/sessions/:familyId', auth, accountLimit, revokeSession);
```

### Spec 5 — client

1. **app.html**, between the SEC-004 sign-out-everywhere section and the
   danger section:
   ```html
   <!-- WP-SEC-005 — session inventory; revoke any row from the server -->
   <section class="app-account-section">
     <h4>Active sessions</h4>
     <p>These sessions can reach your notes. Sign out any you don’t recognise.</p>
     <ul class="app-session-list" id="sessionList"></ul>
   </section>
   ```
2. **app.js:**
   - Refs: `sessionList` near the other account refs.
   - `deviceLabel(ua)` heuristic (Chrome/Edg/Firefox/Safari + Windows/macOS/
     Android/iOS/Linux first-match; fallback 'Unknown device') — ~15 lines,
     no deps.
   - `async function loadSessions(){…}` — GET `/api/users/me/sessions` via
     fetchWithAuth; render <li> per session: `deviceLabel(userAgent)` bold
     + started/lastActive (existing `formatDate`) + rotations count +
     `This device` badge when `current`; every render via textContent.
     Non-current rows get a `Sign out` button; current row gets one too
     (revoking it performs the SEC-004 logout cleanup + redirectToLogin).
     Failure → one list row 'Could not load sessions'.
   - Revoke click handler (delegated on sessionList): DELETE
     `/api/users/me/sessions/${familyId}`; on 200: if `data-current` → the
     logout cleanup pattern (memToken=null, currentUserId=null, strip the
     two sessionStorage keys, redirectToLogin); else `loadSessions()`
     re-render. Button disabled while in flight.
   - Call `loadSessions()` as the LAST statement of `openAccountModal()`.
3. **app.css** (insert BEFORE the kill-switch, which stays LAST):
   ```css
   /* WP-SEC-005 — session inventory list */
   .app-session-list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
   .app-session-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid #46543b;border-radius:8px;font-size:12px;color:#d9e7cf}
   .app-session-list .app-session-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
   .app-session-list .app-session-current{color:var(--env-green);font-weight:700}
   .app-session-list button{border:1px solid #46543b;border-radius:7px;background:#293322;color:#cfe3bc;padding:5px 9px;font:600 11.5px/1 "Inter",sans-serif;cursor:pointer;flex:none}
   .app-session-list button:hover{border-color:var(--env-green);color:var(--env-green)}
   .app-session-list button:disabled{opacity:.55;cursor:wait}
   ```
4. `cd authentication && npm run build:app`; `sw.js` **v16 → v17**.

### Spec 6 — E2E `backend/tests/e2e/auth-sessions.spec.js` (NEW)

1. signup user → signin AGAIN (second family) → GET `/me/sessions` with the
   second session's Bearer (and cookie jar) → 200, TWO families, exactly
   one `current:true` (the second), each with `userAgent` string (send a
   distinctive UA header on one signin and assert it round-trips).
2. DELETE the NON-current familyId → 200 `{ ok:true }`; that family's
   refresh cookie → `/api/auth/refresh` → 401 `{error:'Invalid session'}`;
   current session keeps working (GET notes 200). Re-GET → one session.
3. **Oracle:** DELETE with a foreign user's familyId → 404
   `{message:'Session not found'}` — byte-identical to a nonsense id.
4. Unauthenticated GET /me/sessions → 401 `{message:'Unauthorized'}`.
5. Self-revoke: DELETE current family → 200; own refresh → 401.
6. Rotation noise control: refresh a session 3× (valid CSRF pair per
   SEC-002) → still ONE inventory row for that family; `rotations` ≥ 3.

### Spec 7 — PROJECT_BIBLE.md

One dated entry: family-as-session model, user_agent capture, two routes +
exact bodies, UI section, revocation semantics incl. the ≤15-min access
tail + the nuke-on-replay tradeoff reiteration, shell v16→v17; scoreboard →
`1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ · 5 ✅ · remaining 6 password policy · 7 Express 5`.
PWA line cache → `notin-shell-v17`.

---

## PART 4 — VERIFICATION (paste outputs in PR)

1. migrate twice idempotent; `PRAGMA table_info(refresh_tokens)` shows
   `user_agent`.
2. Fresh API → `tests/e2e/auth-sessions.spec.js` green → FULL suite green.
3. curl: two signins (distinct UAs) → inventory shows both → revoke one →
   its refresh 401 (paste).
4. `git diff --name-only` = EXACTLY 13 paths: `backend/src/db/migrate.js` ·
   `backend/prisma/schema.prisma` ·
   `backend/src/controllers/authController.js` ·
   `backend/src/controllers/userController.js` ·
   `backend/src/controllers/accountController.js` ·
   `backend/src/routes/userRoutes.js` · `authentication/app.html` ·
   `authentication/app.js` · `authentication/app.css` ·
   `authentication/app.bundle.js` (generated) · `authentication/sw.js` ·
   `backend/tests/e2e/auth-sessions.spec.js` (new) · `PROJECT_BIBLE.md`.
5. Grep: no token `hash` value appears in ANY response payload
   (`grep -n "hash" accountController` returns only the import line);
   kill-switch still the LAST rule of app.css (`tail -20`).

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ migration both dialects + mirror; UA captured at all four mint sites
□ handlers byte-match spec (grouped SQL, current-flag, 404 oracle body)
□ routes registered with auth + accountLimit; no other route touched
□ modal section renders live rows; revoke works; current-revoke exits to
  login; bundle rebuilt; `notin-shell-v17`; kill-switch last
□ spec green (all six cases); mvp/replay/csrf/lockout specs untouched+green
□ BIBLE entry + scoreboard; PR title
  `WP-SEC-005: device-session inventory + per-session revocation`

**Hard NO list:** no new deps · no UA-parsing library · no IP storage · no
token-hash exposure · no tv bump on session-revoke (it is NOT a theft
signal) · no changes to SEC-001…004 mechanics beyond the INSERT widening ·
no new modals · no `.github/`.

**Honest-gaps clause:** final message includes (a) PART 4 evidence verbatim,
(b) NOT-done list — explicitly: revoked sessions keep data access until
their last access token expires ≤15 min (per-session access binding
deferred); UA labels are client heuristics over spoofable raw strings;
stolen already-revoked cookies replayed later still force the user-wide
theft response (SEC-004 tradeoff, restated not changed); IP addresses are
deliberately NOT collected; anything else deferred. Empty gaps = red flag.
