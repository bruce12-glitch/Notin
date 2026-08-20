# CODING AGENT MASTER PROMPT — Notin · Task WP-SEC-006

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-20 · audited line-by-line against `main` @ `1135524`
> **plus** the merged WP-SEC-001/002 code and the delivered WP-SEC-003/004/005
> shapes this stacks on. **Queue rule (locked):** PR #26 (WP-SEC-003), the
> WP-SEC-004 session PR, and the WP-SEC-005 session PR must ALL be MERGED
> before you branch. Base proof: `authentication/sw.js` = `notin-shell-v17`,
> `backend/src/lib/throttle.js` exists, `POST /api/users/me/logout-all` and
> `GET /api/users/me/sessions` are routed. Else: re-branch. This WP touches
> NO shell asset — do NOT bump the cache. Never touch `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Your single task:
**WP-SEC-006 — stronger password policy** (PR #2 salvage item **#6**).
Today every NEW password gate is a bare `length < 8` check in two places
(signup + reset-password). After this WP, new passwords must:

1. be **≥ 12 characters** (up from 8),
2. **not be on the locked common-password blocklist** (case-insensitive,
   trimmed),
3. **not equal the account email** (normalized compare).

Scope locks:
- **NEW passwords only.** Signin NEVER runs the policy — grandfathered
  8-char accounts keep working forever. No forced resets, no migration.
- **Per-handler response-key conventions are sacred:** signup speaks
  `400 { message: … }`; reset-password speaks `400 { error: … }`.
- **Zero new npm deps** (the blocklist is an embedded frozen Set — no
  network HaveIBeenPwned call; noted in honest-gaps).

Locked policy messages:
- `'Password must be at least 12 characters'`
- `'Choose a stronger password — that one is too common'`
- `'Password cannot be your email address'`

---

## PART 2 — REPO GROUND TRUTH (verified main @ `1135524`)

```
userController.signup: body validation order is exactly —
  400 'Email and password are required' → 400 'Invalid email' →
  400 { message: 'Password must be at least 8 characters' }  ← REPLACE THIS LINE
  → findUnique existing-user 400 → bcrypt.hash(10) → db.user.create → mints.
authController.resetPassword: order today —
  400 { error: 'Reset token required' } →
  400 { error: 'Password must be at least 8 characters' }  ← REPLACE (early check)
  → token SELECT (hash) → `invalid()` 401 {error:'Reset link is invalid or
  has expired'} (used/expired/missing) → db.user.findById → bcrypt.hash →
  updatePassword → consume token → revoke refresh family 'password-reset' →
  (SEC-004) bumpTokenVersion →
  res.json({ ok:true, message:'Password updated. Sign in with your new password.' })
  The early password check happens BEFORE the token check — preserve that
  order for length/blocklist; the EMAIL-equality rule can only run after the
  user loads (see Spec 3).
Existing suites: every e2e password is the house constant
  'SmokePassword-123!' (17 chars, not blocklisted) — policy rollout must
  require ZERO edits to existing specs. Verify by grep and report.
Client: authentication/*.html carry NO minlength attributes or "at least 8"
  hints (grep-verified) — the server message is the only surface. NO client
  edit, NO bundle rebuild, NO sw.js bump.
```

---

## PART 3 — THE WORK

### Spec 1 — NEW `backend/src/lib/passwordPolicy.js`

```js
// WP-SEC-006 — policy for NEW passwords (signup + reset). Signin never
// calls this module: legacy accounts are grandfathered by design.
export const MIN_PASSWORD_LENGTH = 12;

// Locked blocklist: worst-of-the-worst + app-specific. Case-insensitive, trimmed.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  '123456', '1234567', '12345678', '123456789', '1234567890', '123456789012',
  '123123123', 'qwerty', 'qwerty123', 'qwertyuiop', '1q2w3e4r5t',
  'letmein', 'letmein123', 'welcome', 'welcome123', 'admin', 'admin123',
  'login', 'passw0rd', 'p@ssw0rd', 'abc123', '111111', '000000',
  '654321', 'iloveyou', 'dragon', 'baseball', 'football', 'monkey',
  'shadow', 'master', 'sunshine', 'michael', 'ninja', 'mustang',
  'superman', 'batman', 'trustno1', 'starwars', 'whatever', 'changeme',
  'changeme123', 'notin123', 'notinnotes', 'evernote',
]);

export function validatePassword(password, email) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: 'Password must be at least 12 characters' };
  }
  if (COMMON_PASSWORDS.has(password.trim().toLowerCase())) {
    return { ok: false, message: 'Choose a stronger password — that one is too common' };
  }
  const normEmail = String(email || '').trim().toLowerCase();
  if (normEmail && password.trim().toLowerCase() === normEmail) {
    return { ok: false, message: 'Password cannot be your email address' };
  }
  return { ok: true };
}
```

### Spec 2 — `userController.js` signup

Replace the single `length < 8` line with:
```js
// WP-SEC-006 — new passwords must pass the shared policy
const policy = validatePassword(password, normEmail);
if (!policy.ok) return res.status(400).json({ message: policy.message });
```
(`normEmail` is already computed two lines above in this handler.) Nothing
else in signup changes.

### Spec 3 — `authController.js` resetPassword (two-phase, order-preserving)

1. Early — where the `length < 8` check is now (BEFORE the token lookup):
   ```js
   // WP-SEC-006 — length + blocklist early (email not knowable pre-token)
   const earlyPolicy = validatePassword(password);
   if (!earlyPolicy.ok) return res.status(400).json({ error: earlyPolicy.message });
   ```
2. After `const user = await db.user.findById(r.user_id); if (!user) return invalid();` add:
   ```js
   // WP-SEC-006 — email-equality needs the loaded user; 400 family preserved
   const emailPolicy = validatePassword(typeof password === 'string' ? 'x'.repeat(MIN_PASSWORD_LENGTH) : password, user.email);
   if (!emailPolicy.ok) return res.status(400).json({ error: emailPolicy.message });
   ```
   (Passing the padded literal reuses the exact rule without re-opening the
   length/blocklist checks already done; if that feels too clever, inline
   the normalized comparison instead — but the message must be identical.)
3. Everything downstream (hash, update, consume, revoke, tv bump, success
   body) untouched.

### Spec 4 — E2E `backend/tests/e2e/auth-password-policy.spec.js` (NEW)

1. signup `'Abcd1234'` (8 chars) → 400 `{ message: 'Password must be at least 12 characters' }`.
2. signup `'password1234'` → 400 `{ message: 'Choose a stronger password — that one is too common' }`.
3. signup with password === the signup email → 400 `{ message: 'Password cannot be your email address' }`.
4. signup house password → 201.
5. Reset path (demo-OTP user → forgot-password → `devResetToken` dev echo):
   reset 9-char → 400 `{ error: 'Password must be at least 12 characters' }`;
   reset `'password1234'` → 400 blocked message; reset strong → 200
   `{ ok:true, … }`; signin with the new password → 200.
6. **Order regression:** bogus token + weak password → 400 (password policy
   fires before the 401 token check — pre-existing order preserved).
7. **Signin immunity (grandfathering):** comment asserts intent; verify by
   grep that `signin` never imports the policy module, and prove a
   policy-set password signs in fine (covered by case 5).

### Spec 5 — suite-wide regression audit (report, don't sweep)

`grep -n "password" backend/tests/e2e/*.spec.js` — every signup/signin
password must be ≥12 chars and non-blocklisted (house constant
'SmokePassword-123!' everywhere today). If ANY spec violates this, change
ONLY that string to the house constant and list the touch in the PR.
Expectation is zero edits; being wrong is fine — hiding it is not.

### Spec 6 — PROJECT_BIBLE.md

One dated entry: three rules, new-passwords-only scope (signin immunity),
the two-phase reset design + why, message keys per handler, blocklist
philosophy (static list vs API), zero-suite-churn audit, no shell change;
scoreboard → `1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ · 5 ✅ · 6 ✅ · remaining: 7 Express 5
(deliberate upgrade)`. PWA line cache name unchanged (v17) — say so.

---

## PART 4 — VERIFICATION (paste outputs in PR)

1. Fresh API → new spec green → FULL `tests/e2e` green (proof of zero churn).
2. curl matrix (paste): len-8 400 · blocklisted 400 · email-as-password 400
   · strong 201 · reset-weak 400 · reset-strong 200 · signin old-flow 200.
3. `git diff --name-only` = EXACTLY 5 paths (`+` any spec strings fixed per
   Spec 5, each disclosed): `backend/src/lib/passwordPolicy.js` (new) ·
   `backend/src/controllers/userController.js` ·
   `backend/src/controllers/authController.js` ·
   `backend/tests/e2e/auth-password-policy.spec.js` (new) ·
   `PROJECT_BIBLE.md`.
4. Grep proof: `signin` contains no `validatePassword`; no
   `authentication/` file in the diff (cache stays `notin-shell-v17`).

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ passwordPolicy.js is the ONLY home of the three rules + the blocklist
□ signup + both reset phases wired; handler key conventions (message/error)
□ messages byte-exact; check order in reset preserved (400 before 401)
□ new spec 7 cases green; full suite green with zero disclosed spec edits
□ BIBLE entry + scoreboard; PR title
  `WP-SEC-006: stronger password policy (12-char minimum + blocklist)`

**Hard NO list:** no new deps · no online breach-API call · no rate-limit
tuning · no signin-path changes · no forced reset of existing accounts · no
client edits · no `.github/` · no changes to the demo OTP or Google flows.

**Honest-gaps clause:** final message includes (a) PART 4 evidence verbatim,
(b) NOT-done list — explicitly: static 47-entry blocklist, not a breach
corpus (online checks need a network call + hashing scheme; deferred);
grandfathered 8-char passwords remain valid for signin indefinitely;
passwords CONTAINING the email (not equal) still pass; no zxcvbn-style
entropy scoring (would be a new dep — forbidden); anything else deferred.
Empty gaps = red flag.
