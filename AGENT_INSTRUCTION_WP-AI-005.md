# LM ARENA AGENT INSTRUCTION
**Feature:** WP-AI-005 — Per-user AI rate limiting (replace per-IP keying)
**Phase:** 2 (AI Layer — defect repair)
**Priority:** CRITICAL — blocks any multi-user deployment

---

## CONTEXT (What already exists — verified by running the code)

This is the **Notin** repo: a unified Node 22 + Express 4.21 ESM API (`backend/`),
a vanilla-JS + TipTap app shell (`authentication/`), and a static marketing site
(`frontend/`). There is **no TypeScript, no Next.js, no Supabase, no Prisma client** —
`backend/src/db/migrate.js` applies raw SQL to Postgres (prod) or `node:sqlite` (dev).
Do not introduce any of those technologies.

Relevant files as they exist today:

- `backend/src/routes/noteRoutes.js` — mounts `router.use(auth)` at the top, then
  defines **five separate `rateLimit(...)` instances** (lines ~35–51):
  `aiLimit`, `titleLimit`, `tagsLimit`, `chatLimit`, `assistLimit`.
  Every one is declared exactly as:
  ```js
  const aiLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
  ```
  **No `keyGenerator` is supplied**, so `express-rate-limit` v8 falls back to keying
  by client IP.
- `backend/src/middleware/auth.js` — runs *before* every limiter on this router and
  sets **`req.userId`** (plus `req.userEmail`, `req.tokenPayload`). It returns
  `401 {"message":"Unauthorized"}` when the Bearer token is absent/invalid, so by
  the time a limiter executes, `req.userId` is **always a non-empty string**.
- `backend/src/server.js` line 63 — `app.set('trust proxy', 1)`.
- `backend/package.json` — `express-rate-limit: ^8.6.2` (installed: v8.x).
- E2E specs live in `backend/tests/e2e/`. `ai-assist-smoke.spec.js` line ~53 carries
  the comment *"deliberately use one IP and stay at the endpoint's 5-per-15-minute
  limit"* — the suite currently **works around** this defect instead of catching it.

## THE DEFECT (reproduced live, not theoretical)

Because the limiters key on IP, the 5-per-15-minute AI budget is **shared by every
user behind the same IP**. Reproduced against a freshly migrated database:

```
USER A burns the summarize budget:      1:200 2:200 3:429 4:429 5:429
BRAND-NEW USER C, own note, first call: HTTP 429
```

A brand-new account's **first ever AI request** is rejected. In production behind a
proxy/CDN, a corporate NAT, a university, or a mobile carrier, five requests from
anyone lock out every other customer on that egress IP for fifteen minutes. It also
makes the E2E suite order-dependent: running the AI specs twice in one window fails
four of them.

## TASK (What to build)

Key all five AI rate limiters by **authenticated user id** instead of IP, and add
an E2E test that proves two different users on the same IP get independent budgets.

Behavior after the change:
- Each of the five AI endpoints keeps its own **independent** 5-per-15-minute budget
  **per user**.
- `chatLimit` MUST remain a **single shared instance** across `POST /:id/chat` and
  `POST /:id/chat/stream` — that sharing is deliberate (streaming must not be a
  rate-limit escape hatch). Do not split it into two instances.
- The 429 response body and status stay **byte-identical** to today's
  (`express-rate-limit`'s default `Too many requests, please try again later.`).
  Do not add a custom `message` or `handler`.
- `standardHeaders: true`, `legacyHeaders: false`, `windowMs`, and `limit` values
  are unchanged.

## FILES TO MODIFY

- `backend/src/routes/noteRoutes.js` — add one shared key-generator function and
  attach it to all five existing `rateLimit(...)` calls.

## FILES TO CREATE

- `backend/tests/e2e/ai-ratelimit-smoke.spec.js` — request-only Playwright spec
  (no browser, no `page` fixture; use `request.newContext()` like
  `ai-chat-smoke.spec.js` does).

## EXACT SPECIFICATIONS

### The key generator

Define **one** function in `backend/src/routes/noteRoutes.js`, above the limiter
declarations, and pass it as `keyGenerator` to all five:

```js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// AI budgets are per-account, not per-IP: shared egress IPs (corporate NAT,
// mobile carriers, CI) must not let one user exhaust another's budget.
// `auth` runs before every limiter on this router, so req.userId is always set;
// the ipKeyGenerator fallback exists only for defence in depth and is IPv6-safe.
const aiUserKey = (req, res) => (req.userId ? `u:${req.userId}` : ipKeyGenerator(req.ip));
```

Requirements:
- You **must** use the `ipKeyGenerator` helper for the fallback. express-rate-limit v8
  emits a validation error if a custom `keyGenerator` touches `req.ip` without it
  (IPv6 subnet handling).
- Prefix user keys with `u:` so a user id can never collide with an IP string.
- Do **not** delete or reorder the existing `router.use(auth)` call — the limiters
  depend on running after it.

### Applying it

Each of the five limiters becomes exactly:

```js
const aiLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: aiUserKey });
```

…and identically for `titleLimit`, `tagsLimit`, `chatLimit`, `assistLimit`.
Keep the existing explanatory comments above each limiter.

### The E2E spec — `backend/tests/e2e/ai-ratelimit-smoke.spec.js`

Follow the existing request-only pattern in `ai-chat-smoke.spec.js`:

1. Sign up **user A** and **user B** via `POST /api/users/signup` with unique emails
   (`ratelimit-a-${Date.now()}@example.com`). Read the access token from the response
   field **`token`** (the signup response shape is `{ user, token, ... }`).
2. Each user creates one note via `POST /api/notes` with body
   `{ title: 'Untitled', contentText: <string ≥ 250 chars> }`.
   **Note:** the create endpoint reads **`contentText`**, not `content`. A note built
   with the wrong field saves empty and every AI endpoint then correctly rejects it
   with a length guard — that is not a bug, it is a wrong test payload.
3. User A calls `POST /api/notes/:id/summarize` **5 times** → assert `200` each time,
   then a **6th** → assert `429`.
4. User B — same IP, same process — calls `POST /api/notes/:id/summarize` **once** →
   assert **`200`**. This is the assertion that fails on today's code.
5. Assert user A's 6th response body is the default rate-limit text so the contract
   is pinned.

Use a `try/finally` to `dispose()` every request context, matching the existing specs.

### Length guards you must respect when writing fixtures

- `summarize` requires ≥ **200** characters of note text.
- `suggest-tags` requires ≥ **100** characters.
- `suggest-title` only runs when the title is still `'Untitled'`.
- `chat` / `chat/stream` take field **`question`** (1–500 chars) — not `message`.
- `assist` takes `{ action, text }` where `text` is 1–2000 chars — not `selection`.
  Valid actions: `continue`, `rephrase`, `shorten`, `expand`.

## DO NOT

- Do **not** change `windowMs`, `limit`, `standardHeaders`, or `legacyHeaders`.
- Do **not** add a custom 429 body, `handler`, or `message` — the existing default
  string is asserted by the new test.
- Do **not** split `chatLimit` into separate instances for the JSON and SSE routes.
- Do **not** introduce Redis, Upstash, or any new dependency. The in-memory store is
  correct for a single-instance MVP; note the multi-instance caveat in the Bible's
  technical-debt list instead.
- Do **not** touch `backend/src/middleware/auth.js`, any controller, `server.js`, or
  any file under `authentication/` or `frontend/`. This change is confined to one
  route file plus one new test file.
- Do **not** bump the service-worker cache version — no shell asset changes here.
- Do **not** rewrite the existing AI specs. The "one IP" comment in
  `ai-assist-smoke.spec.js` may be updated to say the budget is now per user, but its
  assertions must keep passing unchanged.

## ACCEPTANCE CRITERIA

The feature is complete when:

- [ ] All five AI limiters in `backend/src/routes/noteRoutes.js` pass `keyGenerator: aiUserKey`.
- [ ] `chatLimit` is still one instance shared by `/:id/chat` and `/:id/chat/stream`.
- [ ] `backend/tests/e2e/ai-ratelimit-smoke.spec.js` exists and passes.
- [ ] User B's first summarize returns **200** after user A has been 429'd on the same IP.
- [ ] The whole request-only suite still passes against a freshly migrated database:
      ```
      cd backend && rm -f prisma/notin.sqlite* && npm run db:migrate
      # start the server, then:
      PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 npx playwright test \
        ai-smoke ai-title-smoke ai-tags-smoke ai-chat-smoke \
        ai-chat-stream-smoke ai-assist-smoke ai-ratelimit-smoke \
        auth-csrf auth-refresh-replay --reporter=line
      ```
      Expected: **9 passed**.
- [ ] No express-rate-limit validation warning about `keyGenerator` / IPv6 appears in
      the server log.
- [ ] No new dependency in `backend/package.json`.
- [ ] No `console.log` left behind.

## AFTER THIS TASK

When complete, report:
1. Files created (list)
2. Files modified (list)
3. Any decisions you made that weren't specified
4. Any blockers or issues encountered

Note for the human: the browser-driven `mvp-smoke.spec.js` journey cannot run in the
Arena sandbox (Chromium binary unavailable). It must be verified in CI — which is
still inactive until `ci/e2e.yml` is moved to `.github/workflows/e2e.yml` by hand.
