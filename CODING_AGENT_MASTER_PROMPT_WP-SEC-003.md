# CODING AGENT MASTER PROMPT — Notin · Task WP-SEC-003

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-19 · audited line-by-line against `main` @ `a65cc1f`
> (post-PR-#23) **plus** the delivered WP-SEC-001/002 shapes this stacks on.
> **Queue rule (locked):** TWO merges must land before you branch — PR #24
> (WP-SEC-001) and the WP-SEC-002 session PR. Base then shows
> `authentication/sw.js` = `notin-shell-v15`, `refresh_tokens.family_id`,
> and `backend/src/lib/httpSecurity.js` on `main`. Else: re-branch. This WP
> touches NO shell asset — do NOT bump the cache. Owner CI may still be
> pending — never touch `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Shipped: OTP + Google +
password auth, rotating refresh families with replay detection (SEC-001),
signed CSRF + trusted-origin guards on cookie-carried mutations (SEC-002).

Your single task: **WP-SEC-003 — account lockout / progressive backoff**
(PR #2 salvage item **#3**). Two brute-force surfaces exist today:

1. **Password signin** (`POST /api/users/signin` + alias `/api/auth/signin`)
   has NO attempt limiter — bcrypt cost is the only brake. After this WP:
   per-email progressive lockout — every 5 consecutive failures locks the
   credential stage for 1 → 5 → 15 → 60 minutes (escalating cap).
2. **OTP challenge issuance** (`otpResend`, `otpDemoRequest`) destroys prior
   challenges on issue (`DELETE … WHERE user_id=…` inside `issueOtp`), so a
   per-challenge attempts cap NEVER accumulates — an attacker mints fresh
   codes forever. After this WP: per-email sliding-window throttle
   (5 issues / 15 min).

Operating rules:
1. **Availability-preserving lockout (locked design).** A lock never blocks
   the *correct* password: on a locked account we still run bcrypt; a match
   succeeds and CLEARS the row; a miss → 429. An attacker who knows the
   victim's email therefore cannot keep the real user out — while every
   wrong guess still costs a request and extends escalation. Say exactly
   this in the PR description.
2. **No new oracles, no cosmetic tightening.** Existing responses stay
   byte-identical (404 `User not found`, 401 `Invalid credentials`, OTP
   anti-enumeration `{ok:true}`). The signin 404 enumeration debt is
   pre-existing — do NOT "fix" it here; note it in honest-gaps for a future
   WSecurity WP. Lockout/throttle signals are 429 + `Retry-After` and are
   per-handler conventions below.
3. **Unknown emails never create rows** (signin half). Attacker-crafted
   emails can't fill the table or punish strangers. (OTP half keys by email
   pre-existence, because `otpDemoRequest` auto-creates dev users; the
   per-IP `strict` limiter 30/15min still caps random-email spam. Both
   facts go in the PR.)
4. **Zero new npm deps.** node:crypto-free even — timestamps + SQL.

Locked constants (in `backend/src/lib/throttle.js`, the only home):
```js
const LOCK_STEP_FAILURES   = 5;
const LOCK_BACKOFF_MINUTES = [1, 5, 15, 60]; // escalating, capped at 60
const OTP_WINDOW_MS        = 15 * 60 * 1000;
const OTP_MAX_REQUESTS     = 5;
```

---

## PART 2 — REPO GROUND TRUTH (verified main @ `a65cc1f` + SEC-001/002)

```
userController.signin (route /api/users/signin + server.js alias
  /api/auth/signin — SAME handler; NO rate limiter attaches):
  404 {message:'User not found'} → unknown email (unchanged, no row)
  401 {message:'Invalid credentials — please use Google sign-in…'} passwordless
  401 {message:'Invalid credentials'} bcrypt mismatch
  success: mint access+refresh cookies (SEC-002 also mints notin_csrf) → json
authController.otpResend: validates email → db.user.findUnique → anti-
  enumeration `{ ok:true, message:'If the account exists…' }`; only existing
  users get issueOtp (or the no-mailer dev demo branch). Failures use {error:…}.
authController.otpDemoRequest: dev-only (404 prod / 403 when mailer),
  AUTO-CREATES user when unknown, then challenge (demo code 123456).
authController.helpers: nowIso()/futureIso() module-scope.
db layer: dual-driver db.query; UPDATE→{rowCount} both drivers; INSERT…
  ON CONFLICT…RETURNING passes pgToSqliteQuery (RETURNING branch exists in
  querySqlite; SQLite ≥3.35 inside Node 22 supports it).
migrate.js conventions (both dialects) — as exercised by SEC-001:
  pg: ALTER/CREATE … IF NOT EXISTS · sqlite: try/catch 'duplicate column',
  CREATE INDEX IF NOT EXISTS.
prisma/schema.prisma — docs-only mirror (WP-SCHEMA-001 rule: migrate.js wins;
  new tables get mirrored models; no prisma dep).
Suite budget honesty: `strict` counts ALL /api/auth/* per IP (30/15min).
  Across merged specs (replay ≈12, csrf ≈10, mvp ≈2) your OTP loop must be
  small, and a full-suite re-run against a LONG-LIVED server can flake at
  429 — the fix is a fresh server, never a higher budget.
```

---

## PART 3 — THE WORK

### Spec 1 — migration (both dialects) + mirror

pg section of `migrate.js` (after the refresh-token family block):
```js
// WP-SEC-003 — account lockout / OTP issue throttle (per-email, scoped)
await pool.query(`
  CREATE TABLE IF NOT EXISTS auth_throttle (
    email TEXT NOT NULL,
    scope TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ,
    lock_level INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (email, scope)
  );
`);
```
sqlite section: same table with `TEXT` time columns,
`updated_at TEXT NOT NULL DEFAULT (datetime('now'))`, same PK — inside the
`db.exec` style (CREATE TABLE IF NOT EXISTS needs no try/catch; index not
required — PK covers lookups).
`backend/prisma/schema.prisma`: add docs-only `model AuthThrottle`
(`@@map("auth_throttle")`, composite `@@id([email, scope])`,
`count Int @default(0)`, `windowStart DateTime?`, `lockLevel Int @default(0)`,
`lockedUntil DateTime?`, `updatedAt DateTime @default(now())`, all `@map`ped
snake_case; comment `// WP-SEC-003 mirror — migrate.js is authoritative`).

### Spec 2 — NEW `backend/src/lib/throttle.js`

Constants per PART 1, then EXACTLY these helpers (dual-driver timestamp
parsing inline like SEC-001: `const toTs = v => v instanceof Date ? v.getTime() : Date.parse(String(v));`):

```js
// WP-SEC-003 — per-email auth throttle: signin lockout + OTP issue window.
// Table `auth_throttle` is created by migrate.js (both dialects). All times
// ISO; rows are keyed (email, scope) with scope ∈ {'signin','otp'}.
import db from '../config/db.js';

async function getRow(email, scope) {
  const { rows } = await db.query(
    `SELECT * FROM auth_throttle WHERE email = $1 AND scope = $2 LIMIT 1`, [email, scope]);
  return rows[0];
}
export async function clearThrottle(email, scope) {
  await db.query(`DELETE FROM auth_throttle WHERE email = $1 AND scope = $2`, [email, scope]);
}

// — signin half —
export async function signinLockState(email) {
  const row = await getRow(email, 'signin');
  if (!row?.locked_until) return { locked: false };
  const left = Math.ceil((toTs(row.locked_until) - Date.now()) / 1000);
  return left > 0 ? { locked: true, retryAfterSec: left } : { locked: false };
}
export async function recordSigninFail(email) {
  const now = nowIsoLocal();
  const { rows } = await db.query(
    `INSERT INTO auth_throttle (email, scope, count, window_start, lock_level, locked_until, updated_at)
     VALUES ($1, 'signin', 1, NULL, 0, NULL, $2)
     ON CONFLICT (email, scope) DO UPDATE SET count = auth_throttle.count + 1, updated_at = $2
     RETURNING count, lock_level`, [email, now]);
  const { count, lock_level } = rows[0];
  if (count % LOCK_STEP_FAILURES !== 0) return { locked: false, count };
  const idx = Math.min(lock_level, LOCK_BACKOFF_MINUTES.length - 1);
  const lockedUntil = new Date(Date.now() + LOCK_BACKOFF_MINUTES[idx] * 60000).toISOString();
  await db.query(
    `UPDATE auth_throttle SET lock_level = $1, locked_until = $2, updated_at = $3
     WHERE email = $4 AND scope = 'signin'`, [lock_level + 1, lockedUntil, now, email]);
  return { locked: true, retryAfterSec: LOCK_BACKOFF_MINUTES[idx] * 60, count };
}

// — otp half (sliding window) —
export async function otpRequestAllowed(email) {
  const now = Date.now();
  const row = await getRow(email, 'otp');
  const windowStartTs = row?.window_start ? toTs(row.window_start) : NaN;
  const fresh = !row || !Number.isFinite(windowStartTs) || (now - windowStartTs) > OTP_WINDOW_MS;
  if (fresh) {
    await db.query(
      `INSERT INTO auth_throttle (email, scope, count, window_start, lock_level, locked_until, updated_at)
       VALUES ($1, 'otp', 1, $2, 0, NULL, $2)
       ON CONFLICT (email, scope) DO UPDATE SET count = 1, window_start = $2, updated_at = $2`,
      [email, new Date(now).toISOString()]);
    return { allowed: true };
  }
  const nextCount = row.count + 1;
  await db.query(`UPDATE auth_throttle SET count = $1, updated_at = $2 WHERE email = $3 AND scope = 'otp'`,
    [nextCount, new Date(now).toISOString(), email]);
  if (nextCount <= OTP_MAX_REQUESTS) return { allowed: true };
  const retryAfterSec = Math.max(1, Math.ceil((windowStartTs + OTP_WINDOW_MS - now) / 1000));
  return { allowed: false, retryAfterSec };
}
```
`nowIsoLocal()` = `new Date().toISOString()` — declare it once in this file
(do NOT import from controllers; controllers keep their own helpers).

### Spec 3 — `userController.js` signin wiring

Exact placement (keep everything else byte-identical):
1. After `const user = await db.user.findUnique(…)` + the 404 + the
   passwordless-401 guards — i.e., we now KNOW a password-bearing user
   exists — insert:
   ```js
   // WP-SEC-003 — availability-preserving: even locked, a CORRECT password
   // passes (and clears the row); only misses see the 429.
   const lockState = await signinLockState(normEmail);
   const isValid = await bcrypt.compare(String(password), user.password);
   if (!isValid) {
     const fail = await recordSigninFail(normEmail);
     if (lockState.locked || fail.locked) {
       const secs = fail.retryAfterSec || lockState.retryAfterSec || 60;
       res.setHeader('Retry-After', String(secs));
       return res.status(429).json({ message: 'Too many failed attempts — try again later' });
     }
     return res.status(401).json({ message: 'Invalid credentials' });
   }
   await clearThrottle(normEmail, 'signin'); // any success resets the ladder
   ```
   Delete the OLD `bcrypt.compare` block this replaces. Lock behavior matrix
   (lock it in the PR description): fails 1–4 → 401 exactly as today ·
   5th (and each 5-step boundary) → 429 + Retry-After · during-lock wrong →
   429 (counter keeps climbing, so escalation continues during the lock) ·
   during-lock correct → normal success + ladder cleared.
2. Success path otherwise untouched (mints, cookies — incl. SEC-002's CSRF).

### Spec 4 — `authController.js` OTP wiring

1. `otpResend`: inside `if (user) { … }`, BEFORE `issueOtp`:
   ```js
   // WP-SEC-003 — per-email issue throttle (per-challenge caps cannot
   // accumulate: issueOtp deletes prior challenges)
   const gate = await otpRequestAllowed(email);
   if (!gate.allowed) {
     res.setHeader('Retry-After', String(gate.retryAfterSec || 900));
     return res.status(429).json({ error: 'Too many codes requested — try again later' });
   }
   ```
   (Anti-enumeration intentionally yields to the 429 for known accounts —
   locked tradeoff; unknown emails still always `{ok:true}` and make NO row.)
2. `otpDemoRequest`: after email validation, BEFORE user lookup/create —
   same gate block (`{ error: … }` shape), keyed pre-existence by design.

### Spec 5 — E2E `backend/tests/e2e/auth-lockout.spec.js` (NEW)

House conventions (fresh unique emails; signup via `POST /api/users/signup`;
OTP section uses demo-request — dev-gated, keyless ✓). Locked cases:
1. **Ladder:** wrong ×4 → each 401 `{ message:'Invalid credentials' }`
   exactly; 5th → 429, exact message, integer `Retry-After` ≥ 1 and ≤ 65.
2. **Escalation without sleeping:** keep failing; assert SOME subsequent
   429 carries `Retry-After` > 120 (stage-2 = 5 min; proves progression).
3. **Availability preservation:** while locked, submit the CORRECT password
   → 200 success shape as today; then wrong ×4 → 401 (ladder reset proven),
   5th → 429.
4. **No oracle shift:** unknown email wrong ×6 → 404 `User not found` every
   time; never 429; comment: enumeration fix deferred (future WP).
5. **OTP gate:** demo-request same email ×5 → 200 `{ok:true}`; 6th → 429
   exact `{error:'Too many codes requested — try again later'}` +
   Retry-After; a SECOND email → 200 (per-email isolation). Keep this section
   to ≤ 7 `/api/auth/*` calls (strict-budget respect).
6. **Cross-user isolation:** while user A sits locked, user B wrong
   password → 401 (not 429).
Note honestly in-file: the 15-min OTP window slide and 60-min cap tail are
review-verified, not test-waited.

### Spec 6 — PROJECT_BIBLE.md

One dated entry: design (availability-preserving lockout + why), constants,
the two surfaces fixed, the deleted-history OTP insight, Retry-After/429
contracts, no-oracle-shift statement, no shell change (cache stays v15);
scoreboard → `1 ✅ · 2 ✅ · 3 ✅ · remaining 4 token-versioning · 5 device
inventory · 6 password policy · 7 Express 5`.

---

## PART 4 — VERIFICATION (run all; paste outputs in PR)

1. `node backend/src/db/migrate.js` twice idempotent; table present in
   SQLite (`PRAGMA table_info(auth_throttle)`).
2. Fresh server → `npx playwright test tests/e2e/auth-lockout.spec.js`
   green → FULL `tests/e2e` green (declare the run order; if a strict-429
   flake appears in OTHER files, restart the API and re-run — say so).
3. Manual curl ladder (paste): 4×401 → 429 (+header) → locked-correct →
   200 → 401 again.
4. `git diff --name-only` = EXACTLY 7 paths: `backend/src/db/migrate.js` ·
   `backend/prisma/schema.prisma` · `backend/src/lib/throttle.js` (new) ·
   `backend/src/controllers/userController.js` ·
   `backend/src/controllers/authController.js` ·
   `backend/tests/e2e/auth-lockout.spec.js` (new) · `PROJECT_BIBLE.md`.
   NO `authentication/*` file — hence NO sw.js bump. Confirm v15 untouched.
5. Oracle grep: diff must not alter `Invalid credentials`, `User not found`,
   or the `{ ok: true }` anti-enumeration payload except via the new 429s.

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ migration both dialects idempotent; prisma mirror +1 model
□ throttle.js is the ONLY home of the 4 constants; helpers byte-match spec
□ signin: ladder, escalation, correct-password-wins, success-clears — all
  four behaviors implemented exactly per matrix
□ OTP gate on both issue paths; unknown-email anti-enumeration intact
□ spec green incl. escalation-without-sleep; full suite green (fresh server)
□ BIBLE entry + scoreboard; PR title
  `WP-SEC-003: account lockout ladder + OTP issue throttle`

**Hard NO list:** no new deps · no limiter/budget changes anywhere
(`strict`, `resetStrict`, `accountLimit` untouched) · no response-shape
changes outside the locked 429 bodies · no per-IP lockout semantics (this is
per-email by design) · no waiting-based tests · no edits to refresh/logout/
CSRF code paths (SEC-001/002 ground) · no client changes, no shell bump ·
no `.github/`.

**Honest-gaps clause:** final message includes (a) PART 4 evidence verbatim,
(b) NOT-done list — explicitly: window-slide/cap-tail review-verified only;
signin 404 enumeration deferred; random-email demo spam bounded by IP
`strict` only; distributed multi-IP brute force softened (per-email ladder)
not eliminated; anything else deferred. An empty gaps list reads as a red
flag.
