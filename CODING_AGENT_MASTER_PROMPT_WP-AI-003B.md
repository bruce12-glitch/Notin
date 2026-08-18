# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-003b

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `b076476`
> (post-PR-#20). **Queue rule (locked):** WP-AI-004 is merged; WP-LEFTOVERS-001
> has its own prompt and runs on a parallel frontend track. This session needs
> the owner-activated E2E CI (`.github/workflows/e2e.yml`) to be live so your
> PR rides the gate. Branch from then-current `main`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Shipped and verified on
`main`: everything through WP-AI-004, including **WP-AI-003 chat** — which
deliberately shipped **non-streaming** (one JSON in, one JSON out). Your
single task is **WP-AI-003b — streaming chat**: answers now arrive as
server-sent events (SSE) with token-ish deltas, while the existing JSON
endpoint remains fully intact as the fallback transport.

Operating rules:
1. **Extend, don't replace.** `POST /api/notes/:id/chat` (JSON) keeps today's
   exact contract and behavior. You ADD `POST /api/notes/:id/chat/stream`.
2. **Determinism is sacred.** Keyless mock mode must produce the SAME answer
   text via stream and via JSON (assembled deltas == `mockChatAnswer` output).
   No artificial delays in mock mode.
3. **One shared budget.** Both chat routes share the existing `chatLimit`
   limiter instance (5/15 min total) — streaming is not a rate-limit escape
   hatch.
4. **Backend-first.** The server work is the task. The client change is a
   thin receiver on the existing chat panel — no new UI, no new selectors.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18 on main @ b076476)

```
backend/src/lib/ai/provider.js
  ├─ chatWithNote(noteText, question, history) @ ~L342 → { answer, provider }
  ├─ chatWithGroq(note, q, turns, apiKey) — AbortController REQUEST_TIMEOUT_MS
  │    (20 000), GROQ_URL/GROQ_MODEL consts, temperature 0.2, max_tokens 400,
  │    messages [system CHAT_SYSTEM, ...turns, user chatUserPrompt]; non-2xx /
  │    empty → throw new Error('AI_PROVIDER_ERROR')
  ├─ mockChatAnswer(note, q) — deterministic sentence-overlap answer
  └─ sanitizeChatHistory(history) — ≤6 kept, 500-char entries        (EXTEND)
backend/src/controllers/aiController.js
  └─ chatWithNoteController @ ~L124 — guard order: ownership 404 → trashed 400
     → question 400 → short-note 400 → provider → 200 · 503 · 500   (EXTEND)
backend/src/routes/noteRoutes.js
  └─ chatLimit (5/15 min, standardHeaders, legacyHeaders) @ ~L37,
     POST /:id/chat @ L38                                             (EXTEND)
authentication/app.js
  ├─ chat state: chatNoteId ~L113, chatHistory ~L114, chatInFlight ~L115
  ├─ bubble builder ~L538-546: className 'app-ai-chat-msg' + is-user/is-assistant,
  │    textContent-only, scrollTop sync
  └─ send handler: aiChatForm submit @ ~L1351 (its header comment says
     "no streaming" — you update that comment)                        (EDIT)
authentication/app.html / app.css   ← UNCHANGED (no new markup/styles needed)
authentication/sw.js                ← 'notin-shell-v11' on main → v12 (one step)
authentication/dev-server.mjs + design-server.mjs + design.html
                                    ← added by PR #20 (design tooling) — do not touch
backend/tests/e2e/ai-chat-smoke.spec.js ← stays byte-identical & green
```

**Locked plumbing (copy exactly):** `AI_PROVIDER_ERROR` normalization; one log
line `[AI] chat via ${provider}`/per-request equivalent; never log prompts,
questions, answers, or notes; ownership `WHERE id=$1 AND "userId"=$2`; 503 body
`{message:'AI is busy right now — try again in a moment'}`.

**E2E-locked:** all prior selectors (no renames), and `ai-chat-smoke.spec.js`
expectations are untouchable.

---

## PART 3 — THE TASK: WP-AI-003b — STREAMING CHAT

### Files to CREATE
1. `backend/tests/e2e/ai-chat-stream-smoke.spec.js`

### Files to MODIFY
1. `backend/src/lib/ai/provider.js`
2. `backend/src/controllers/aiController.js`
3. `backend/src/routes/noteRoutes.js`
4. `authentication/app.js`
5. `authentication/sw.js` (one-step bump)
6. `authentication/app.bundle.js` (rebuild only)
7. `PROJECT_BIBLE.md` (mark WP-AI-003b complete)

**No app.html / app.css changes. No new npm dependencies (no sse libs — raw
`res.write`). No database changes.**

### Spec 1 — Provider (`backend/src/lib/ai/provider.js`)

Add `export async function chatWithNoteStream(noteText, question, history = [])`
returning `{ stream, provider }` where `stream` is an async iterable of
string deltas:

- Normalize/sanitize EXACTLY like `chatWithNote` (same slices, same
  `sanitizeChatHistory`).
- **Groq path** (`GROQ_API_KEY` set): same URL/headers/model/messages as
  `chatWithGroq`, but body adds `stream: true` (keep `temperature: 0.2`,
  `max_tokens: 400`). Abort budget: the same `REQUEST_TIMEOUT_MS` for the
  whole response. Non-2xx → `AI_PROVIDER_ERROR`. Parse upstream SSE frames:
  lines starting `data: `; JSON-parse each (`choices[0].delta.content` may be
  absent — skip); terminal `data: [DONE]`; yield each content delta.
  Implementation note: buffer partial lines across chunks; on upstream JSON
  parse failure skip that frame (do not abort the stream).
- **Mock path** (no key): compute the deterministic answer via the existing
  `mockChatAnswer(note, q)` (cap at `MAX_CHAT_ANSWER_CHARS`), split it into
  word-group chunks (~6 words per delta, on word boundaries), and yield them
  in order with `await new Promise(r => setImmediate(r))` between yields.
  No timers, no randomness.
- **Both paths:** the generator must have a `finally` that cancels the
  upstream reader (mock loop: just returns) so abandoned client connections
  don't leak fetches. Yield nothing beyond the `MAX_CHAT_ANSWER_CHARS` total.
- Log exactly ONE line per request: `[AI] chat-stream via ${provider}` when
  the stream STARTS (not per delta).

### Spec 2 — Controller (`backend/src/controllers/aiController.js`)

Add exactly `export async function chatWithNoteStreamController(req, res)`:

1. Run the SAME guards as `chatWithNoteController`, in the same order, with
   the same messages/stati (ownership SELECT → 404 → trashed 400 → question
   400 → short-note 400). You may extract a tiny shared helper ONLY if the
   JSON controller's outward behavior stays byte-identical — when in doubt,
   duplicate the guard block instead.
2. Only after guards pass:
   ```js
   res.writeHead(200, {
     'Content-Type': 'text/event-stream',
     'Cache-Control': 'no-cache, no-transform',
     'Connection': 'keep-alive',
     'X-Accel-Buffering': 'no',
   });
   ```
3. `const { stream, provider } = await chatWithNoteStream(sourceText, question, req.body?.history);`
   then `for await (const delta of stream) res.write(\`data: ${JSON.stringify({ delta })}\n\n\`);`
   and finally `res.write('data: [DONE]\n\n'); res.end();`
4. Failure handling:
   - Guards/provider setup failing BEFORE `writeHead` → the existing JSON
     errors (4xx / 503 family bodies).
   - Failure AFTER headers are sent →
     `res.write(\`data: ${JSON.stringify({ error: 'AI is busy right now — try again in a moment' })}\n\n\`)`
     → `data: [DONE]` → `res.end()`. One `console.error` if it was not an
     `AI_PROVIDER_ERROR`. Never `res.status` after headers.
5. `req.on('close', …)` → stop iterating (`break`); rely on the provider
   `finally` to cancel upstream. Do NOT write after close.
6. **Still zero persistence** — no note UPDATE, no transcript rows.

### Spec 3 — Route (`backend/src/routes/noteRoutes.js`)

```js
router.post('/:id/chat/stream', chatLimit, chatWithNoteStreamController);
```
Reuse the existing `chatLimit` instance (shared 5/15 min budget across both
chat transports — deliberate; note it in the report). One import addition.

### Spec 4 — Client (`authentication/app.js`, send path only)

Inside the existing `aiChatForm` submit handler (~L1351), replace the
single-JSON fetch with stream-first logic, same guards (`chatInFlight`,
empty question, `selectedId`), same bubble helpers:

1. User bubble as today; send button `'Thinking…'`; create an EMPTY assistant
   bubble and keep a reference.
2. POST `${API_BASE}/api/notes/${selectedId}/chat/stream` with the same JSON
   body via `fetchWithAuth`.
3. If the response is NOT 2xx with `content-type` containing
   `text/event-stream` **and no delta has been applied yet** → discard the
   empty bubble and run today's JSON path unchanged (fallback; also covers
   guard-triggered 4xx JSON bodies — surface `json.message`/`setError` as
   today).
4. Else read `response.body.getReader()` + `TextDecoder`; split on `\n\n`;
   for each `data: ` frame: `[DONE]` ends; else `JSON.parse` →
   `{delta}` → `bubble.textContent += delta` (+ keep scrollTop sync) ·
   `{error}` → if the bubble is still empty remove it and
   `setError(error)`, else stop and `setError('Answer may be incomplete.')`.
5. On clean `[DONE]`: push `{role:'user',…}` + `{role:'assistant', content:
   finalAssembled}` onto `chatHistory` (same 12-entry cap as today).
6. `finally`: re-enable Send, restore label, clear input, `chatInFlight=false` —
   on BOTH paths. Malformed frames are skipped, never fatal.
7. Update the header comment above the handler: streaming transport with JSON
   fallback; transcript still session-only.

### Spec 5 — E2E (`backend/tests/e2e/ai-chat-stream-smoke.spec.js`)

Copy `ai-chat-smoke.spec.js` structure (request fixture, keyless, owner +
foreign; real-sentence note ≥200 chars with a distinctive keyword):

1. Unauth `POST /:id/chat/stream` → **401** (JSON error, not SSE).
2. Auth stream request → **200**, content-type `text/event-stream`; body
   contains ≥1 `data: {"delta"...}` frame and ends with `data: [DONE]`.
3. **Parity:** assemble all `delta` strings from the stream and compare to a
   same-question call to the JSON endpoint's `answer` — in mock mode they
   MUST be equal (this is the determinism lock).
4. Guard matrix mirrors the JSON spec: 400 empty question · 400 short note ·
   404 foreign · 400 trashed — all as JSON (guards precede the upgrade).
5. `ai-chat-smoke.spec.js` itself is NOT modified and must still pass.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: provider (chat + assist families), controller chat guard region,
   noteRoutes limiters, the app.js chat block (~L105-115, ~L516-550,
   ~L1341-end), `sw.js`, `ai-chat-smoke.spec.js`.
2. Specs 1→2→3 backend → curl matrix: 401 · 200 event-stream mock (watch
   deltas arrive) · guard 4xx JSONs · JSON endpoint unchanged · client-close
   mid-stream leaves no dangling fetch (observe server log).
3. Spec 4 client → Spec 5 spec.
4. `node --check authentication/app.js` · `cd authentication && npm run build:app`
   · bump `CACHE_NAME` one step above main's (expected v11 → v12).
5. Restart API (clean limiter buckets) → `npx playwright test ai-chat-smoke
   ai-chat-stream-smoke ai-assist-smoke` request-only · then full
   `npm run test:e2e` if Chromium exists; else state honestly — CI covers UI.
6. Selector grep audit (all locked ids incl. chat + assist sets).
7. `PROJECT_BIBLE.md`; report in PART 7 format.

## PART 5 — DO NOT (hard constraints)

→ Do NOT change the JSON chat endpoint's contract, messages, or order of guards.
→ Do NOT add a second limiter or raise the budget — streams share `chatLimit`.
→ Do NOT persist anything; transcript remains memory-only.
→ Do NOT add `app.html`/`app.css` changes, new selectors, deps, or SSE/EventSource libs.
→ Do NOT buffer-then-send (that defeats streaming) and do NOT add heartbeat frames.
→ Do NOT touch `frontend/`, `docs/`, auth/CORS/helmet, migrations, `prisma/`,
  design/dev servers, or any existing spec.
→ Do NOT skip bundle rebuild + one-step SW bump.
→ Do NOT start WP-LEFTOVERS-001 / WP-AI-004b / hosting work.

## PART 6 — ACCEPTANCE CRITERIA

□ `POST /:id/chat/stream` streams SSE keyless with deterministic chunked mock;
  parity with JSON answer asserted by the new spec
□ Guards return plain JSON 4xx (pre-upgrade); post-headers failures are
  in-band `{"error":...}` frames + `[DONE]`
□ Client: stream-first, empty-bubble fill via `textContent +=`, JSON fallback
  intact, session-only history once complete
□ JSON `ai-chat-smoke.spec.js` untouched & green; all prior request-only specs green
□ Bundle rebuilt; SW one step up; `node --check` clean
□ One log line per streamed request; zero content logging
□ Reported against CI when active (or honestly noted)

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-AI-003b REPORT
1. Files created/modified:  [lists]
2. Transport proof:         [SSE frames + parity + guard matrix outputs]
3. Fallback check:          [JSON path exercised; byte-unchanged spec green]
4. Bundle/SW:               [v11 → v12, or actual]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers / debt:         [any, with severity]
7. Suggested next:          WP-LEFTOVERS-001 (its prompt exists) — do NOT start it.
```

## APPENDIX — QUICK COMMANDS

```bash
cd backend && npm ci && npm run db:migrate && npm start
# watch a keyless stream live:
curl -N -X POST localhost:5000/api/notes/<id>/chat/stream \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"question":"What about rollback?","history":[]}'
cd authentication && npm ci && npm run build:app
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-LEFTOVERS-001** — landing leftovers + docs/ mirror (prompt delivered).
2. **WP-AI-004b** — `expand` action + selection bubble menu.
3. **Hosting** — human follows `RUNBOOK.md`; CI already gates it.
4. **Security follow-ups** — PR #2 salvage list (owner opens the issue first).
