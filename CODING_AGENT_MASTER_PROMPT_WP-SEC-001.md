# CODING AGENT MASTER PROMPT — Notin · Task WP-SEC-001

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `bbb53c1`
> (post-PR-#22). **Queue rule (locked):** PR #23 (WP-AI-004b) must be **MERGED**
> before you branch — that merge sets `authentication/sw.js` to
> `notin-shell-v13`, the base this WP bumps from. If your base shows ≤ v12,
> re-branch. Owner-activated CI (`.github/workflows/e2e.yml`) may still be
> pending — do not wait for it, do not create it, never touch `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin** — Node 22 + Express 4 ESM
unified API on :5000 (`backend/`), dual-driver Postgres/node:sqlite data
layer, vanilla ES-module app (`authentication/`) holding the session as:
15-min jose access token in memory + 30-day rotating httpOnly refresh COOKIE
(`notin_refresh`, set twice: `path:/api/auth` and legacy `path:/auth`).

Your single task: **WP-SEC-001 — refresh-token rotation families with replay
detection.** This is salvage item **#1** from the closed PR #2 (CTO closing
comment on that PR is the requirements source of truth; items 2–7 are future
WPs, NOT yours).

The threat model: an attacker who steals a refresh cookie will eventually
present a token the legitimate client has already rotated away. Today that
request just 401s and the attacker keeps trying the NEXT stolen token.
After this WP, presenting a consumed token **nukes the entire rotation
family** — attacker and victim both drop to sign-in, which is exactly what
theft should cost.

Operating rules:
1. **Detect, don't alarm.** Every failure from `POST /api/auth/refresh`
   keeps the byte-exact body `{ "error": "Invalid session" }` and HTTP 401.
   The endpoint must never become an oracle for token state. Detection is
   recorded server-side (one log line) and by family revocation only.
2. **No false positives on races.** Two tabs (or parallel calls) hitting a
   rotating token simultaneously must NOT nuke a family. A locked 10-second
   rotation grace converts the benign race into a fresh family sibling.
3. **Dual-driver SQL only.** `$n` placeholders through `db.query`; both the
   pg and SQLite paths of `migrate.js` get the mirrored migration.
   `db.query` returns `rowCount` on UPDATE for both drivers (`info.changes`
   on SQLite) — you will use this for the compare-and-swap.
4. **Minimal, surgical diff.** 9 paths, listed at the end. No client
   contract changes. No new dependencies.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18 on main @ `bbb53c1`)

```
backend/src/db/migrate.js
  pg path: L181-189 creates refresh_tokens(hash TEXT PK, user_id TEXT NOT
    NULL REFERENCES "User"(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT
    NULL, revoked_at TIMESTAMPTZ, created_at …) + refresh_tokens_user_id_idx.
    Column evolution convention: `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`
    (see L41-45, L76-90).
  sqlite path: L341-349 same table (TIMESTAMPTZ→TEXT), then
    `db.exec(CREATE INDEX IF NOT EXISTS …)`. Column evolution convention:
    try{ db.exec(`ALTER TABLE … ADD COLUMN …`); }catch(e){
    if(!String(e.message).includes('duplicate column')) throw e; }  (L243+).

backend/src/lib/jwt.js
  createAccessToken(user,15) · hashToken(value)=sha256hex ·
  randomToken(bytes=32)=base64url  — crypto-only, zero deps.

backend/src/controllers/authController.js
  cookieOpts {httpOnly, secure:isProduction, sameSite:'lax', path:'/api/auth'}
  cookieOptsLegacy {…, path:'/auth'}            @ L32-44
  otpVerify mint block: INSERT (5 cols) + 2 cookies   @ ~L259-267
  refresh(req,res) @ ~L270-298 — today's shape:
    SELECT … WHERE hash=$1 AND revoked_at IS NULL AND expires_at>$2
    → unconditional UPDATE … SET revoked_at (rotation)  @ L281
    → INSERT successor (5 cols)  @ L287-291 → 2 cookies →
    res.json({ accessToken, token, user }) · catch → 401 {error:'Invalid session'}
  logout @ L300-308: by-hash revoke @ L303, clearCookie×2, 204
  resetPassword mass-revoke @ L391: UPDATE … WHERE user_id=$2 AND revoked_at IS NULL
  helpers nowIso()/futureIso() exist in this file.

backend/src/controllers/userController.js
  signup mint block @ ~L42-50 · signin mint block @ ~L99-107 — both INSERT
  (5 cols) + set both cookie paths inline (httpOnly/lax/secure:isProd).

backend/prisma/schema.prisma  (WP-SCHEMA-001 docs-only mirror)
  model RefreshToken @ L97-108: hash/userId/expiresAt/revokedAt/createdAt,
  relation, @@index([userId]), @@map("refresh_tokens").

authentication/app.js
  bootstrapToken() @ L401 — POST /api/auth/refresh, fallback POST
    /auth/refresh, sets memToken, returns token|null.
  fetchWithAuth @ L420 — on 401 calls bootstrapToken() then retries once.

ALL revoke sites (complete): authController L281 rotate · L303 logout ·
L391 password-reset mass. There are no others — grep to confirm.

ALL mint sites (complete): authController L259 otpVerify · L287 refresh
rotate · userController L42 signup · L99 signin.
```

---

## PART 3 — THE WORK

### Spec 1 — schema: `refresh_tokens` gains `family_id` + `revoke_reason`

**pg path** of `migrate.js`, immediately after the existing
`refresh_tokens_user_id_idx` line (L189):
```js
// WP-SEC-001 — refresh-token rotation families + replay detection
await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id TEXT;`);
await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoke_reason TEXT;`);
// Legacy rows: one family per user. A legacy replay then revokes that user's
// remaining legacy sessions — fail-closed by design.
await pool.query(`UPDATE refresh_tokens SET family_id = user_id WHERE family_id IS NULL;`);
await pool.query(`CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);`);
```

**sqlite path**, immediately after its `refresh_tokens_user_id_idx` exec:
```js
// WP-SEC-001 — refresh-token rotation families + replay detection
try{ db.exec(`ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
try{ db.exec(`ALTER TABLE refresh_tokens ADD COLUMN revoke_reason TEXT`); }catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }
db.exec(`UPDATE refresh_tokens SET family_id = user_id WHERE family_id IS NULL;`);
db.exec(`CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);`);
```

`revoke_reason` vocabulary (locked): `'rotation' | 'logout' | 'password-reset' | 'replay'`.

### Spec 2 — `backend/prisma/schema.prisma` (docs-only mirror)

Inside `model RefreshToken`, keeping field order alphabetical-ish with the
existing map style, add:
```prisma
  // WP-SEC-001 — rotation family + replay-detection reason (docs-only mirror of migrate.js)
  familyId     String?  @map("family_id")
  revokeReason String?  @map("revoke_reason")
```
No prisma dependency, no codegen, no behavior. One line in your PR states
this is the WP-SCHEMA-001 mirror rule being honored.

### Spec 3 — mint sites: every session starts a family

At **each** of the three non-rotate mint sites (otpVerify, signup, signin):
immediately before the existing INSERT, add `const familyId = randomToken(24);`
and widen the statement to the locked 7-column shape:
```sql
INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
-- params: [hashToken(refreshRaw), user.id, familyId, expiresAt, null, null, now]
```
Cookies, response bodies, surrounding logic: UNCHANGED. (`randomToken` is
already imported in both controllers.)

### Spec 4 — `authController.js` `refresh()` full replacement

Replace the entire `refresh` function with EXACTLY this (module-constant +
function; comment preserved):
```js
// WP-SEC-001 — rotation with family replay detection. A consumed refresh
// token being presented again means either a benign rotation race (two
// tabs/calls fired together, inside the grace window) or a stolen cookie
// replayed after rotation. The race gets a fresh family sibling; the theft
// nukes the ENTIRE family so attacker and victim both return to sign-in.
// Every failure path returns the identical 401 body — never an oracle.
const REFRESH_FAMILY_GRACE_MS = 10_000;

export async function refresh(req, res) {
  try {
    const raw = req.cookies.notin_refresh;
    if (!raw) throw new Error('No refresh');
    const now = nowIso();
    const { rows } = await db.query(
      `SELECT * FROM refresh_tokens WHERE hash = $1 LIMIT 1`,
      [hashToken(raw)]
    );
    let row = rows[0];
    if (!row) throw new Error('Invalid');
    // Dual-driver truth: pg returns Date objects, SQLite returns ISO strings.
    const toTs = (value) => value instanceof Date ? value.getTime() : Date.parse(String(value));
    const expiresTs = toTs(row.expires_at);
    if (!Number.isFinite(expiresTs) || expiresTs <= Date.parse(now)) throw new Error('Expired');

    if (!row.revoked_at) {
      // Live token — rotate via compare-and-swap so a concurrent request
      // cannot silently fork the family.
      const { rowCount } = await db.query(
        `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'rotation' WHERE hash = $2 AND revoked_at IS NULL`,
        [now, hashToken(raw)]
      );
      if (rowCount === 0) {
        // Lost the race: the row is now rotated; re-read and fall into the
        // grace evaluation below (same behavior as a sequential reuse).
        const again = await db.query(`SELECT * FROM refresh_tokens WHERE hash = $1 LIMIT 1`, [hashToken(raw)]);
        row = again.rows[0] || row;
      }
    }

    if (row.revoked_at) {
      const revokedTs = toTs(row.revoked_at);
      const inGrace = row.revoke_reason === 'rotation'
        && Number.isFinite(revokedTs)
        && (Date.parse(now) - revokedTs) <= REFRESH_FAMILY_GRACE_MS;
      if (!inGrace) {
        // REPLAY — revoke every live member of this rotation family.
        if (row.family_id) {
          await db.query(
            `UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'replay' WHERE family_id = $2 AND revoked_at IS NULL`,
            [now, row.family_id]
          );
        }
        console.error('[SECURITY] refresh-token replay detected — rotation family revoked', { userId: row.user_id });
        res.clearCookie('notin_refresh', cookieOpts);
        res.clearCookie('notin_refresh', cookieOptsLegacy);
        throw new Error('Replay');
      }
      console.warn('[SECURITY] refresh reuse inside rotation grace — sibling issued', { userId: row.user_id });
    }

    const user = await db.user.findById(row.user_id);
    if (!user) throw new Error('No user');
    const nextRaw = randomToken(48);
    const expiresAt = futureIso(30 * 86400000);
    await db.query(
      `INSERT INTO refresh_tokens (hash, user_id, family_id, expires_at, revoked_at, revoke_reason, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [hashToken(nextRaw), user.id, row.family_id, expiresAt, null, null, now]
    );
    res.cookie('notin_refresh', nextRaw, { ...cookieOpts, maxAge: 30 * 86400000 });
    res.cookie('notin_refresh', nextRaw, { ...cookieOptsLegacy, maxAge: 30 * 86400000 });
    const accessToken = await createAccessToken(user, 15);
    res.json({ accessToken, token: accessToken, user: publicUser(user) });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}
```
Design invariants you must preserve when resolving any merge noise:
- success path mints the successor with the SAME `family_id` as the consumed
  row (the chain is the family); a grace sibling is just another child.
- single CAS UPDATE is the only mutation of the presented row.
- 200/401 response shapes are byte-identical to today.

### Spec 5 — the other two revoke sites

- `logout` (L303): keep by-hash semantics, set the reason, add idempotency:
  ```sql
  UPDATE refresh_tokens SET revoked_at = $1, revoke_reason = 'logout'
  WHERE hash = $2 AND revoked_at IS NULL
  ```
  Consequence (intended): replaying a logged-out cookie is an instant
  family nuke — it is NOT sheltered by the rotation grace. State this in
  the PR description.
- `resetPassword` mass revoke (L391): add `revoke_reason = 'password-reset'`
  to the SET list. Nothing else changes there.

### Spec 6 — client single-flight + shell bookkeeping

`authentication/app.js`:
1. Rename existing `async function bootstrapToken(){` → `async function bootstrapTokenCore(){` (body untouched).
2. Immediately below it add:
   ```js
   // WP-SEC-001 — single-flight refresh: parallel 401s share ONE rotation call.
   // Without this, same-tab bursts replay a consumed cookie into the new
   // server-side family detection and sign the user out for no reason.
   let refreshFlight = null;
   function bootstrapToken(){
     if(!refreshFlight){
       refreshFlight = bootstrapTokenCore().finally(()=>{ refreshFlight = null; });
     }
     return refreshFlight;
   }
   ```
   All existing callers stay exactly as they are. (Cross-tab same-instant
   races are handled server-side by the grace window — module state cannot
   span tabs; say so in the PR.)
3. `cd authentication && npm run build:app` (esbuild rebundles; never hand-edit `app.bundle.js`).
4. `authentication/sw.js`: `notin-shell-v13` → `notin-shell-v14` (one step; your base proves #23 merged).

### Spec 7 — E2E: `backend/tests/e2e/auth-refresh-replay.spec.js` (NEW file)

Request-only spec in the established house style (boot via the shared
dev-server config like the other smokes; unique emails per run; mirrors the
signup pattern of `ai-assist-smoke.spec.js` → `POST /api/users/signup`).
Locked helper + cases:

```js
// WP-SEC-001 — refresh rotation families + replay detection (keyless; auth needs no providers)
function rawRefreshCookie(response){
  for(const h of response.headersArray()){
    if(h.name.toLowerCase() === 'set-cookie'){
      const m = /notin_refresh=([^;]+)/.exec(h.value);
      if(m && m[1]) return m[1];
    }
  }
  return null;
}
```
1. **Rotation chain happy path.** signup (context cookie jar receives T1) →
   `POST /api/auth/refresh` → 200, jar rotates to T2 → refresh again → 200
   (T3) → `GET /api/notes` with the newest access token → 200.
2. **Sequential reuse inside grace = sibling, family survives.** Capture T1
   via `rawRefreshCookie`; rotate once in the main context; from a CLEAN
   request context send `Cookie: notin_refresh=<T1>` → **200** (grace
   sibling); immediately after, the main context (holding T2) refreshes →
   **200** (family alive).
3. **Logout-then-reuse = instant family nuke, generic body.** Fresh signup
   (ctx2), rotate once (jar holds T2b) → `POST /api/auth/logout` in ctx2 →
   from a clean context reuse T2b → **401** and the body is EXACTLY
   `{ "error": "Invalid session" }` (assert deep-equality — oracle check);
   response contains a clearing `set-cookie` for `notin_refresh` (assert the
   header exists; do not assert its value).
4. **Family isolation.** After §3's nuke, the §2 main context refreshes →
   200 (other users' families untouched), and a **garbage** cookie from a
   clean context → 401 with the same exact body.
5. **Concurrent burst = every presenter gets a sibling.** Fresh signup
   (ctx3) → fire THREE `ctx3.post('/api/auth/refresh')` concurrently →
   assert EVERY status is 200 (SQLite serializes; the CAS loser re-reads
   into grace) → one more refresh from ctx3 → 200.
6. **Honesty assertion (design ceiling).** In §3, capture the access token
   issued with T2b; AFTER the family nuke, `GET /api/notes` with it →
   **200** — stateless access tokens live out their ~15 min regardless of
   family revocation. Comment in the test: closing this is salvage item #4
   (token-version invalidation), a future WP, not this one.

Rate-limit note: this spec makes ≈12 `/api/auth/*` calls, well under the
`strict` 30/15 min budget — but the limiter is in-memory and shared per
server process: run against a freshly-booted API.

### Spec 8 — PROJECT_BIBLE.md

Append ONE dated entry (house style): what families/reasons/grace do, the
CAS, the generic-401 oracle rule, audit of inserted columns + backfill,
single-flight client guard, shell v13→v14 — and close with the salvage
scoreboard: `PR #2 items — 1 ✅ (this WP) · remaining 2 CSRF · 3 lockout ·
4 token-versioning · 5 device inventory · 6 password policy · 7 Express 5
(future WP-SEC-002…; item 7 = deliberate upgrade, never drive-by)`. Update
the PWA line cache name to `notin-shell-v14`.

---

## PART 4 — VERIFICATION (run all; paste outputs in the PR)

1. `node backend/src/db/migrate.js` twice → idempotent, columns present
   (`PRAGMA table_info(refresh_tokens)` shows `family_id`, `revoke_reason`);
   backfill ran (`family_id = user_id` on pre-existing rows).
2. Keyless E2E: fresh server on :5000 →
   `npx playwright test tests/e2e/auth-refresh-replay.spec.js` green;
   then the FULL e2e dir green (untouched specs must not notice you).
3. Oracle grep: your diff MUST NOT alter the string `Invalid session`, the
   200 JSON shape, or any cookie option.
4. Server-log proof: run the §3 replay manually with curl (jar + clean
   request) → terminal shows the `[SECURITY] … replay detected` line; the
   grace case shows the `warn` line. Paste redacted output.
5. `git diff --name-only` shows EXACTLY the 9 allowed paths:
   `backend/src/db/migrate.js` · `backend/prisma/schema.prisma` ·
   `backend/src/controllers/authController.js` ·
   `backend/src/controllers/userController.js` · `authentication/app.js` ·
   `authentication/app.bundle.js` (generated) · `authentication/sw.js` ·
   `backend/tests/e2e/auth-refresh-replay.spec.js` · `PROJECT_BIBLE.md`.

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ both migrate paths idempotent; columns + index + backfill verified
□ refresh() replaced with the locked implementation (CAS + grace + nuke)
□ all 4 mint sites set `family_id`; rotate inherits parent family
□ logout/resetPassword revoke sites set their `revoke_reason`
□ 401 body byte-identical everywhere; zero response-contract drift
□ single-flight client guard; bundle rebuilt; `notin-shell-v14`
□ new E2E green incl. honesty assertion; full suite green
□ PROJECT_BIBLE.md entry incl. the PR-#2 salvage scoreboard
□ PR title `WP-SEC-001: refresh-token rotation families with replay detection`

**Hard NO list:** no new npm dependencies · no response-body or status
changes anywhere · no per-request token logging (userid-only log objects as
locked) · no grace-window env knob (the 10 s constant is the spec) · no
changes to OTP, password, or Google flows beyond the mint-site INSERTs · no
cookie-name/path/option changes · no `.github/` changes · no client feature
work beyond the single-flight guard.

**Honest-gaps clause:** final message must include (a) PART 4 evidence
verbatim, and (b) a NOT-done list — explicitly covering: stolen access
tokens usable until natural expiry (≤15 min; = salvage item 4), out-of-grace
nuke proven via the logout path rather than a 10 s sleep, and anything else
you deferred or could not run. An empty gaps list reads as a red flag.
