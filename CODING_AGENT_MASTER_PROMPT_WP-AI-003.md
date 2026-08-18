# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-003

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `b090804`
> (post-PR-#16). Prerequisite per the locked queue: PR #17 (WP-FUNNEL-001)
> merges first — it touches only `frontend/` + `PROJECT_BIBLE.md`, zero file
> overlap with this task. Branch your work from then-current `main`.
> `CODING_AGENT_MASTER_PROMPT_FURTHER_DEVELOPMENT.md` does not exist on main;
> this file IS the complete WP-AI-003 spec.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI
note-taking web app. Shipped and verified on `main`: **WP-AI-001** (summarize)
· **WP-AI-002** (title) · **WP-AI-002b** (smart tags) · **WP-UI-NOTES-3D-001**
(3D motion). **WP-FUNNEL-001** (landing CTAs, PR #17) is approved and lands
ahead of you; it modifies only `frontend/`, which you do not touch.

Your single task is **WP-AI-003 — Chat with note**: session-only,
**non-streaming** Q&A against the open note, with a deterministic mock when
`GROQ_API_KEY` is blank. The model may answer only from that note's text.
History lives in the browser for the session and is never written to the
database.

Operating rules:
1. **Reuse proven plumbing.** Copy WP-AI-001/002/002b provider / controller /
   route / client patterns — same `AI_PROVIDER_ERROR` normalization, ownership
   checks, rate limiting, `fetchWithAuth`, `textContent` (never innerHTML).
2. **No new write paths.** The server does not persist answers, transcripts,
   or a chat table. The note is read-only for this feature.
3. **Non-streaming.** One JSON request → one JSON response. Do not implement
   SSE, chunked transfer, or a typing-token loop. Older CTO notes that mention
   streaming / `llama-3.1-70b-versatile` are overridden by this file.
4. **Break nothing.** Every E2E-locked selector below survives untouched.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18 on main @ b090804)

```
Notin/
├── backend/                        ← Node 22 + Express 4 ESM, unified API :5000
│   ├── src/lib/ai/provider.js      ← summarizeText + suggestTitle + suggestTags
│   │                                  GROQ_MODEL = llama-3.1-8b-instant, 20s abort
│   ├── src/lib/ai/prompts.js       ← SUMMARIZE_* + TITLE_* + TAGS_*
│   ├── src/controllers/aiController.js ← summarizeNote + suggestNoteTitle
│   │                                  + suggestNoteTags (+ module-local isTrashed()
│   │                                  helper — reuse it)
│   ├── src/routes/noteRoutes.js    ← aiLimit / titleLimit / tagsLimit
│   │                                  (all identical: 5 per 15 min)
│   └── tests/e2e/                  ← ai-smoke, ai-title-smoke, ai-tags-smoke, mvp-smoke
└── authentication/                 ← the APP, served by :5000
    ├── app.html                    ← editor: #summarizeBtn @228 · #shareBtn @229
    │                                  #aiSummaryCard @252 · #aiTitleBar @258
    │                                  #aiTagBar @267 · #tagRow @273
    ├── app.js                      ← vanilla JS; fetchWithAuth (~396); setError (~197);
    │                                  hideAiSummary/hideAiTitle/hideAiTags;
    │                                  updateEditorForSelection; setViewChrome (~598)
    ├── app.bundle.js               ← NEVER hand-edit; rebuild via npm run build:app
    ├── app.css                     ← .app-ai-* families (lines ~364–370, ~644+);
    │                                  LAST rule is the reduced-motion kill-switch
    └── sw.js                       ← CACHE_NAME = 'notin-shell-v9'  → bump to v10
```

**WP-AI plumbing to copy:**
- Groq REST: global `fetch`, `llama-3.1-8b-instant`, AbortController 20 000 ms,
  every failure → `throw new Error('AI_PROVIDER_ERROR')`, one log line, never
  log note content or the key.
- Controller skeleton: ownership SELECT (404) → trashed (400) → guards (400) →
  provider → 200 · `AI_PROVIDER_ERROR` → 503
  `{message:'AI is busy right now — try again in a moment'}` · else 500 with
  one `console.error`.
- Route: per-endpoint limiter, matching the family exactly:
  `rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false })`.
- Client: hidden-by-default panel; hide on every view/selection change at the
  same call sites as `hideAiTags()`; user-initiated errors via the existing
  `setError()` banner.

**E2E-locked (do not rename/remove):**
`summarizeBtn`, `aiSummaryCard`, `aiSummaryText`, `aiSummaryMeta`,
`aiSummaryDismiss`, `aiTitleBar`, `aiTitleText`, `aiTitleApply`,
`aiTitleDismiss`, `aiTagBar`, `aiTagChips`, `aiTagDismiss`, `tagRow`,
`tagChips`, `tagAddSelect`, `shareBtn`, the WP-UI-NOTES-3D-001 motion surface
(tilt engine in app.js, `.tilt-3d`/depth/ease tokens in app.css, the
kill-switch as the LAST rule of app.css), plus every pre-AI Home/notes
selector in `mvp-smoke.spec.js`.
**You ADD `askNoteBtn`, `aiChatPanel`, `aiChatLog`, `aiChatForm`,
`aiChatInput`, `aiChatSend`, `aiChatClose` as new locked selectors.**

**Bundle/SW rule:** after any `app.js` edit → `cd authentication && npm run build:app`,
then bump `CACHE_NAME` in `authentication/sw.js` from `notin-shell-v9` →
`notin-shell-v10`.

**Do not touch:** `frontend/` (funnel wiring lands via PR #17), `docs/`,
auth/JWT/cookies/CORS/helmet, `dev-server.mjs`, migrations, `prisma/`.

---

## PART 3 — THE TASK: WP-AI-003 — CHAT WITH NOTE

### What the user experiences
Open a note with enough body text. An **Ask this note** button sits next to
✨ Summarize. Click → a compact panel opens under the AI bars: a message log, a
question field, Send. Each answer is a single JSON round-trip (no stream).
Switching notes or views clears the transcript. Reload clears it. Trashed /
too-short notes never see the panel open.

### Files to CREATE
1. `backend/tests/e2e/ai-chat-smoke.spec.js`

### Files to MODIFY
1. `backend/src/lib/ai/prompts.js`
2. `backend/src/lib/ai/provider.js`
3. `backend/src/controllers/aiController.js`
4. `backend/src/routes/noteRoutes.js`
5. `authentication/app.html`
6. `authentication/app.js`
7. `authentication/app.css`
8. `authentication/sw.js` (`notin-shell-v9` → `v10`)
9. `authentication/app.bundle.js` (rebuild only)
10. `PROJECT_BIBLE.md` (mark WP-AI-003 complete)

**No database migration. No new npm dependencies.**

### Spec 1 — Prompts (`backend/src/lib/ai/prompts.js`)

Append (exact constant names and values):
```js
export const CHAT_SYSTEM = 'You answer questions about one note. Use ONLY the note content. If the answer is not in the note, say you cannot find it there. Plain prose. No markdown headings, no preamble, no invented facts.';
export function chatUserPrompt(noteText, question) {
  return `NOTE:\n${noteText}\n\nQUESTION:\n${question}`;
}
export const MAX_CHAT_NOTE_CHARS = 6000;
export const MAX_CHAT_QUESTION_CHARS = 500;
export const MAX_CHAT_ANSWER_CHARS = 800;
export const MAX_CHAT_HISTORY = 6; // client+server: keep at most the last 6 {role,content} messages
```

### Spec 2 — Provider (`backend/src/lib/ai/provider.js`)

Add `export async function chatWithNote(noteText, question, history = [])`
returning `{ answer, provider }`:

- Normalize: `note = String(noteText ?? '').trim().slice(0, MAX_CHAT_NOTE_CHARS)`,
  `q = String(question ?? '').trim().slice(0, MAX_CHAT_QUESTION_CHARS)`.
  (An empty question is rejected by the controller before reaching you.)
- Sanitize `history` to an array of at most `MAX_CHAT_HISTORY` objects
  `{ role: 'user' | 'assistant', content: string }` — drop anything else;
  slice each kept content to 500 chars; keep the LAST entries when over the cap.
- **Groq path** (`GROQ_API_KEY` set): same URL / `GROQ_MODEL` / 20s abort as
  summarize. Messages: `[{ role:'system', content: CHAT_SYSTEM },
  ...cleanHistory, { role:'user', content: chatUserPrompt(note, q) }]`.
  `temperature: 0.2`, `max_tokens: 400`. Non-2xx / timeout / empty content →
  `AI_PROVIDER_ERROR`. Return
  `{ answer: content.trim().slice(0, MAX_CHAT_ANSWER_CHARS), provider: 'groq' }`.
- **Mock path** (no key), deterministic:
  1. Lowercase the question and the note.
  2. Question words matching `/[a-z][a-z0-9'-]{2,}/g`, minus the stopwords
     `the|and|for|with|this|that|what|when|where|who|how|does|did|can|you`.
  3. Split the note on `/[^.!?]+[.!?]+/g`. Take the first sentence that
     contains any remaining keyword (case-insensitive); if none matches, take
     the first sentence of the note.
  4. `answer = 'Based on the note: ' + sentence`. If there is no sentence at
     all: `'I cannot find that in this note.'`
  5. Cap at `MAX_CHAT_ANSWER_CHARS`. Return `{ answer, provider: 'mock' }`.
- Log exactly `[AI] chat via ${provider}`. Never log the question, answer, or note.

### Spec 3 — Controller (`backend/src/controllers/aiController.js`)

Add exactly `export async function chatWithNoteController(req, res)`.
(This name is MANDATORY — the provider exports `chatWithNote`, so naming the
controller the same forces an import alias. No aliases. No alternate names.)

Guard order matches the sibling handlers exactly:

1. Ownership load (same SELECT shape as `summarizeNote`):
   `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`.
   Missing → **404** `{message:'Note not found'}`.
2. Trashed (reuse the module's existing `isTrashed()` helper — handles the
   pg/sqlite boolean/int difference) → **400**
   `{message:'Restore the note before chatting'}`.
3. `question` from the body must be a string, non-empty after trim, and
   ≤ `MAX_CHAT_QUESTION_CHARS` → else **400**
   `{message:'Ask a question (1–500 characters)'}`.
4. Source text = trimmed `contentText` if non-empty, else trimmed
   `description`. Length < 40 → **400**
   `{message:'Note is too short to chat about (needs at least 40 characters)'}`.
5. `const { answer, provider } = await chatWithNote(sourceText, question, history);`
6. **200** `{ answer, provider }`.
7. **Do NOT UPDATE the note. Do NOT insert any chat row.**
8. Errors: `AI_PROVIDER_ERROR` → **503**
   `{message:'AI is busy right now — try again in a moment'}`; else one
   `console.error` + **500** `{message:'Could not answer that question'}`.

### Spec 4 — Route (`backend/src/routes/noteRoutes.js`)

Next to the other AI limiters/routes, exactly:
```js
const chatLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/chat', chatLimit, chatWithNoteController);
```
Add `chatWithNoteController` to the existing aiController import. The router
already has `router.use(auth)` — do NOT create `/api/ai`.

### Spec 5 — UI markup (`authentication/app.html`)

Inside `div.app-editor-actions` (~line 219), immediately AFTER `#summarizeBtn`
(@228) and BEFORE `#shareBtn` (@229):
```html
<button type="button" class="app-ai-btn" id="askNoteBtn" hidden>Ask this note</button>
```

Immediately AFTER the `#aiTagBar` block (@267) and BEFORE `#tagRow` (@273),
keeping tag row / share panel order unchanged:
```html
<div class="app-ai-chat" id="aiChatPanel" hidden>
  <div class="app-ai-chat-head">
    <span>Ask this note</span>
    <button type="button" id="aiChatClose" aria-label="Close chat">×</button>
  </div>
  <div class="app-ai-chat-log" id="aiChatLog" role="log" aria-live="polite"></div>
  <form class="app-ai-chat-form" id="aiChatForm">
    <input id="aiChatInput" type="text" maxlength="500" autocomplete="off" placeholder="Ask about this note…" aria-label="Question">
    <button type="submit" id="aiChatSend">Send</button>
  </form>
</div>
```
Accessibility note: this app has NO `<label>` pairing and NO sr-only /
visually-hidden class — inputs use `aria-label` directly (see
`globalSearchInput`, `newTagInput`, `tagAddSelect`). Use exactly that pattern;
do not invent a new a11y class system.

### Spec 6 — UI logic (`authentication/app.js`)

1. Refs beside the other AI refs (~lines 88–101): `askNoteBtn`, `aiChatPanel`,
   `aiChatLog`, `aiChatForm`, `aiChatInput`, `aiChatSend`, `aiChatClose`.
   State: `let chatNoteId = null;` and `let chatHistory = [];` — session memory
   only (NO localStorage, NO IndexedDB, NO cookie).
2. `function hideAiChat()` — hide the panel; do NOT wipe history here (history
   clears only on note change, see 3). Call `hideAiChat()` at every site where
   `hideAiTags()` is called (`updateEditorForSelection`, `setViewChrome`, and
   the tag-suggestion flow guard).
3. On note/view change (`updateEditorForSelection` / `setViewChrome`):
   - Un-hide `askNoteBtn` under the same conditions as `summarizeBtn`
     (note selected AND not trashed AND not `offlineReadOnly`); hide it
     otherwise.
   - If `selectedId !== chatNoteId`: `chatHistory = []`, clear `#aiChatLog`,
     `chatNoteId = selectedId`, hide the panel.
4. `askNoteBtn` click → un-hide panel, focus `#aiChatInput`.
   `aiChatClose` click → hide panel (keep history for that note until the
   selection changes).
5. Submit handler on `#aiChatForm` (preventDefault):
   - Guard: no `selectedId` / empty trimmed question / request in flight.
   - Append a user bubble via `createElement` + `textContent` (never innerHTML).
   - Disable send; label `'Thinking…'`.
   - ``fetchWithAuth(`${API_BASE}/api/notes/${selectedId}/chat`, { method:'POST', body: JSON.stringify({ question, history: chatHistory.slice(-6) }) })``
   - 200 → append the assistant bubble with `json.answer` via textContent; push
     `{role:'user', content: question}` then `{role:'assistant', content: answer}`
     onto `chatHistory` (cap at 12 entries = 6 exchanges).
   - 400 → `setError(json.message)`.
     429 → `setError('AI rate limit reached — try again in a few minutes.')`.
     Other → `setError('AI is busy right now — try again in a moment.')`.
   - `finally` → re-enable send, restore the `'Send'` label, clear the input.
6. Optional empty-log hint as a static text node only:
   `'Questions stay on this device until you switch notes.'` — no network.

### Spec 7 — Styles (`authentication/app.css`)

Add a compact `.app-ai-chat*` block under a clearly-commented
`/* WP-AI-003 — chat */` section placed ABOVE the final
`@media (prefers-reduced-motion:reduce)` kill-switch — that kill-switch MUST
remain the last rule in the file. Same token family as
`.app-ai-summary` / `.app-ai-title` (Evernote-dark editor: `#1f261a`/`#22291d`
surfaces, `#3a4632` borders, `var(--env-green)` accents). Log:
`max-height` ≈ 220px with `overflow-y:auto`. User bubbles slightly brighter,
assistant bubbles muted. Do not restyle the summarize / title / tag bars.

### Spec 8 — E2E (`backend/tests/e2e/ai-chat-smoke.spec.js`)

Copy `ai-title-smoke.spec.js` structure (playwright `request` fixture, keyless,
signup via `/api/users/signup` returning a token, notes created via
`POST /api/notes` with `{ title, contentText, description }`). One test:

1. Signup owner + foreign user.
2. Owner note with `contentText` ≥ 200 chars of real sentences containing a
   distinctive keyword (e.g. `rollback`).
3. `POST /api/notes/:id/chat` without auth → **401**.
4. With auth, `{ question: 'What about rollback?', history: [] }` → **200**,
   non-empty string `answer`, `provider` ∈ {`groq`,`mock`}. In mock mode the
   answer MUST include `Based on the note:` — your fixture must guarantee a
   sentence actually matches the keyword.
5. `GET /api/notes` → the note is unchanged (same title / contentText; no
   `summary` written by chat, no new fields).
6. Missing/empty question → **400**. Note with ~20-char body → **400**.
   Foreign user → **404**. Trashed note → **400** (trash via the existing
   `POST /api/notes/:id/trash`).
7. Do NOT modify the expectations of any existing spec
   (`mvp-smoke`, `ai-smoke`, `ai-title-smoke`, `ai-tags-smoke`).

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: `provider.js`, `prompts.js`, `aiController.js`, `noteRoutes.js`,
   `app.html` editor/AI block, `app.js` (`fetchWithAuth`, `setError`,
   `hideAiTags` call sites, summarize/tag click handlers), `sw.js`,
   `ai-title-smoke.spec.js`.
2. Implement Specs 1–4 (backend) → 5–7 (UI) → 8 (E2E).
3. `cd backend && npm run db:migrate` (must stay clean — no new migration step
   is added) · `npm start`.
4. Curl matrix: 401 · 200 mock · 400 empty question · 400 short note ·
   400 trashed · 404 foreign · note body unchanged after chat.
5. `node --check authentication/app.js` · `cd authentication && npm run build:app`
   · bump `sw.js` to `notin-shell-v10`.
6. Grep-audit every locked selector in PART 2 (existing AND newly added).
7. Tests: restart the API for a clean rate-limit bucket (limiters are
   in-memory and persist across re-runs), then
   `npx playwright test ai-smoke ai-title-smoke ai-tags-smoke ai-chat-smoke`
   from `backend/` (request-only). Run the full `npm run test:e2e` too; if
   Chromium is unavailable in your sandbox, say so honestly and report the
   curl matrix plus every request-only spec result.
8. Update `PROJECT_BIBLE.md`: mark WP-AI-003 complete; next = WP-SCHEMA-001.

## PART 5 — DO NOT (hard constraints)

→ Do NOT add any npm dependency (no groq-sdk, openai, sse libs).
→ Do NOT stream. One JSON in, one JSON out.
→ Do NOT persist chat (no table, no column, no localStorage, no IndexedDB).
→ Do NOT create `/api/ai` or change summarize/title/tag behavior.
→ Do NOT rename the controller (`chatWithNoteController`) or the provider
  function (`chatWithNote`), and do NOT use innerHTML for questions or answers.
→ Do NOT touch `frontend/`, `docs/`, auth, JWT, cookies, CORS, helmet, migrations.
→ Do NOT skip bundle rebuild + SW cache bump (`v9` → `v10`).
→ Do NOT implement writing-assistant (continue/rephrase) — that is WP-AI-004.
→ Do NOT modify existing E2E expectations.

## PART 6 — ACCEPTANCE CRITERIA

□ `POST /api/notes/:id/chat` returns `200 {answer, provider}` with
  `GROQ_API_KEY` unset; 401 unauth · 404 foreign · 400 trashed · 400 short
  note · 400 bad question · 429 after 5 requests / 15 min
□ Server never writes the note or any chat row
□ Ask-this-note button visible only for a selected, non-trashed note; panel
  clears when the note changes; reload starts a blank transcript
□ Answers render via textContent; errors use the existing `setError` banner
□ Chat input uses `aria-label="Question"` (no invented label/a11y system)
□ Bundle rebuilt; `sw.js` is `notin-shell-v10`; `node --check` clean;
  kill-switch still the LAST rule of `app.css`
□ Previous AI E2E specs still pass; new `ai-chat-smoke.spec.js` passes
  (or Chromium-unavailable stated honestly with the curl matrix)
□ `npm start` boots clean; no secrets in client-served files

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-AI-003 REPORT
1. Files created/modified:  [lists]
2. Persistence check:       [confirm no DB/local write of chat]
3. Verification:            [curl matrix + test results, or Chromium unavailable]
4. Bundle/SW:               [v9 → v10]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers:                [any]
7. Suggested next:          WP-SCHEMA-001 — do NOT start it.
```

## APPENDIX — QUICK COMMANDS

```bash
cd backend && npm ci && npm run db:migrate && npm start
curl -s localhost:5000/health
cd authentication && npm ci && npm run build:app
# demo login: any email + OTP 123456 (no SMTP)
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-SCHEMA-001** — sync `prisma/schema.prisma` with `migrate.js`.
2. **WP-DEPLOY-001** — fail-closed production boot, CORS lock, CI + Chromium.
3. **WP-AI-004** — writing assistant (continue / rephrase / shorten, inline diff).
4. Leftover landing links (binaries / stores / extensions) + `docs/` mirror re-sync.
