# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-003

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> Reconciled 2026-08-18 against post-PR-#16 main + WP-FUNNEL-001
> (`arena/01a0123a-notin`). `CODING_AGENT_MASTER_PROMPT_FURTHER_DEVELOPMENT.md`
> does not exist in this repo; this file IS the WP-AI-003 spec.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI note-taking
web app. Shipped and verified: **WP-AI-001** summarize · **WP-AI-002** title ·
**WP-AI-002b** smart tags · **WP-FUNNEL-001** landing CTAs.

Your single task is **WP-AI-003 — Chat with note**: session-only, **non-streaming**
Q&A against the open note, with a deterministic mock when `GROQ_API_KEY` is
blank. The model may answer only from that note's text. History lives in the
browser for the session and is never written to the database.

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

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18)

```
Notin/
├── backend/                        ← Node 22 + Express 4 ESM, unified API :5000
│   ├── src/lib/ai/provider.js      ← summarizeText + suggestTitle + suggestTags
│   │                                  GROQ_MODEL = llama-3.1-8b-instant, 20s abort
│   ├── src/lib/ai/prompts.js       ← SUMMARIZE_* + TITLE_* + TAGS_*
│   ├── src/controllers/aiController.js ← summarizeNote + suggestNoteTitle + suggestNoteTags
│   ├── src/routes/noteRoutes.js    ← POST /:id/summarize|suggest-title|suggest-tags
│   └── tests/e2e/                  ← ai-smoke, ai-title-smoke, ai-tags-smoke, mvp-smoke
└── authentication/                 ← the APP, served by :5000
    ├── app.html                    ← editor: #summarizeBtn, #aiSummaryCard,
    │                                  #aiTitleBar, #aiTagBar (insert chat AFTER tag bar)
    ├── app.js                      ← vanilla JS; fetchWithAuth; hideAiSummary/Title/Tags
    ├── app.bundle.js               ← NEVER hand-edit; rebuild via npm run build:app
    ├── app.css                     ← .app-ai-* families
    └── sw.js                       ← CACHE_NAME = 'notin-shell-v9'  → bump to v10
```

**WP-AI plumbing to copy:**
- Groq REST: global `fetch`, `llama-3.1-8b-instant`, AbortController 20 000 ms,
  every failure → `throw new Error('AI_PROVIDER_ERROR')`, one log line, never
  log note content or the key.
- Controller skeleton: ownership SELECT → trashed 400 → length/question guard
  400 → provider → 200 · `AI_PROVIDER_ERROR` → 503
  `{message:'AI is busy right now — try again in a moment'}` · else 500.
- Route: per-endpoint
  `rateLimit({ windowMs: 15*60*1000, limit: 5, standardHeaders: true, legacyHeaders: false })`.
- Client: hidden-by-default panel; hide on every view/selection change at the
  same call sites as `hideAiTags()`; user-initiated errors via `setError()`.

**E2E-locked (do not rename/remove):**
`summarizeBtn`, `aiSummaryCard`, `aiSummaryText`, `aiSummaryMeta`,
`aiSummaryDismiss`, `aiTitleBar`, `aiTitleText`, `aiTitleApply`,
`aiTitleDismiss`, `aiTagBar`, `aiTagChips`, `aiTagDismiss`, `tagRow`,
`tagChips`, `tagAddSelect`, `shareBtn`, plus all pre-AI Home/notes selectors
in `mvp-smoke.spec.js`.

**Bundle/SW rule:** after any `app.js` edit → `cd authentication && npm run build:app`,
then bump `CACHE_NAME` in `authentication/sw.js` from `notin-shell-v9` →
`notin-shell-v10`.

**Do not touch:** `frontend/` (landing, just wired by WP-FUNNEL-001),
`docs/`, auth/JWT/cookies/CORS/helmet, `dev-server.mjs`, migrations.

---

## PART 3 — THE TASK: WP-AI-003 — CHAT WITH NOTE

### What the user experiences
Open a note with enough body text. An **Ask this note** button sits next to
✨ Summarize. Click → a compact panel opens under the tag/AI bars: a message
list, a question field, Send. Each answer is a single JSON round-trip (no
stream). Switching notes or views clears the transcript. Reload clears it.
Trashed / empty notes never open the panel.

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

---

### Spec 1 — Prompts (`backend/src/lib/ai/prompts.js`)

Append:
```js
export const CHAT_SYSTEM = 'You answer questions about one note. Use ONLY the note content. If the answer is not in the note, say you cannot find it there. Plain prose. No markdown headings, no preamble, no invented facts.';
export function chatUserPrompt(noteText, question) {
  return `NOTE:\n${noteText}\n\nQUESTION:\n${question}`;
}
export const MAX_CHAT_NOTE_CHARS = 6000;
export const MAX_CHAT_QUESTION_CHARS = 500;
export const MAX_CHAT_ANSWER_CHARS = 800;
export const MAX_CHAT_HISTORY = 6; // client+server: last N {role,content} turns
```

### Spec 2 — Provider (`backend/src/lib/ai/provider.js`)

Add `export async function chatWithNote(noteText, question, history = []) → { answer, provider }`:

- Normalize: `note = String(noteText??'').trim().slice(0, MAX_CHAT_NOTE_CHARS)`,
  `q = String(question??'').trim().slice(0, MAX_CHAT_QUESTION_CHARS)`.
  Empty question after trim → the controller rejects before calling you.
- Sanitize `history` to an array of at most `MAX_CHAT_HISTORY` objects
  `{role:'user'|'assistant', content:string}` (drop anything else; slice content
  to 500 chars).
- **Groq path** (key set): same URL / `GROQ_MODEL` / 20s abort as summarize.
  Messages: `[{role:'system', content: CHAT_SYSTEM}, ...history,
  {role:'user', content: chatUserPrompt(note, q)}]`.
  `temperature: 0.2`, `max_tokens: 400`. Non-2xx / timeout / empty content →
  `AI_PROVIDER_ERROR`. Return
  `{ answer: content.trim().slice(0, MAX_CHAT_ANSWER_CHARS), provider: 'groq' }`.
- **Mock path** (no key), deterministic:
  1. Lowercase the question and the note.
  2. Take question words matching `/[a-z][a-z0-9'-]{2,}/g` (drop
     `the|and|for|with|this|that|what|when|where|who|how|does|did|can|you`).
  3. Split the note on `/[^.!?]+[.!?]+/g`. Find the first sentence that
     contains any remaining keyword (case-insensitive). If none, use the first
     sentence of the note.
  4. Answer = `'Based on the note: ' + sentence`. If no sentence at all:
     `'I cannot find that in this note.'`
  5. Cap at `MAX_CHAT_ANSWER_CHARS`. Return `{ answer, provider: 'mock' }`.
- Log exactly `[AI] chat via ${provider}`. Never log the question, answer, or note.

### Spec 3 — Controller (`backend/src/controllers/aiController.js`)

Add `export async function chatWithNoteController(req, res)` (name it
`chatWithNote` if you prefer — just don't clash with the provider export):

1. Body: `{ question, history }`. `question` must be a non-empty string after
   trim, length ≤ `MAX_CHAT_QUESTION_CHARS` → else **400**
   `{message:'Ask a question (1–500 characters)'}`.
2. Ownership load:
   `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`.
   Missing → **404** `{message:'Note not found'}`.
   Trashed → **400** `{message:'Restore the note before chatting'}`.
3. Source text = trimmed `contentText`, else `description`. Length **< 40** →
   **400** `{message:'Note is too short to chat about (needs at least 40 characters)'}`.
4. `const { answer, provider } = await chatWithNote(sourceText, question, history);`
5. **200** `{ answer, provider }`.
6. **Do NOT UPDATE the note. Do NOT insert any chat row.**
7. Errors: `AI_PROVIDER_ERROR` → **503**
   `{message:'AI is busy right now — try again in a moment'}`; else log + **500**
   `{message:'Could not answer that question'}`.

### Spec 4 — Route (`backend/src/routes/noteRoutes.js`)

Next to the other AI routes:
```js
const chatLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/chat', chatLimit, chatWithNote /* controller */);
```
Inherits the router-level `auth` middleware. Do NOT create `/api/ai`.

### Spec 5 — UI markup (`authentication/app.html`)

Inside `div.app-editor-actions`, immediately AFTER `#summarizeBtn` and BEFORE
`#shareBtn`:
```html
<button type="button" class="app-ai-btn" id="askNoteBtn" hidden>Ask this note</button>
```

Immediately AFTER the `#aiTagBar` block, BEFORE `#tagRow` (or whatever currently
follows the tag bar — keep tag row / share panel order unchanged):
```html
<div class="app-ai-chat" id="aiChatPanel" hidden>
  <div class="app-ai-chat-head">
    <span>Ask this note</span>
    <button type="button" id="aiChatClose" aria-label="Close chat">×</button>
  </div>
  <div class="app-ai-chat-log" id="aiChatLog" role="log" aria-live="polite"></div>
  <form class="app-ai-chat-form" id="aiChatForm">
    <label class="visually-hidden" for="aiChatInput">Question</label>
    <input id="aiChatInput" type="text" maxlength="500" autocomplete="off" placeholder="Ask about this note…">
    <button type="submit" id="aiChatSend">Send</button>
  </form>
</div>
```
If `.visually-hidden` does not exist, use the file's existing sr-only pattern
or `class` that matches other hidden labels — do not invent a new a11y system.

### Spec 6 — UI logic (`authentication/app.js`)

1. Refs: `askNoteBtn`, `aiChatPanel`, `aiChatLog`, `aiChatForm`, `aiChatInput`,
   `aiChatSend`, `aiChatClose`.
   State: `let chatNoteId = null;` and `let chatHistory = [];` (session only).
2. `function hideAiChat()` — hide panel, disable nothing permanently, do **not**
   wipe history unless the selected note id changed (see 3). Call `hideAiChat()`
   at every site where `hideAiTags()` is called.
3. On note/view change (`updateEditorForSelection` / `setViewChrome`):
   - Show `askNoteBtn` under the same conditions as `summarizeBtn`
     (note selected AND not trashed AND not `offlineReadOnly`).
   - If `selectedId !== chatNoteId`, set `chatHistory = []`, clear `#aiChatLog`,
     `chatNoteId = selectedId`, hide the panel.
4. `askNoteBtn` click → un-hide panel, focus `#aiChatInput`. Close button → hide
   panel (keep history for that note until selection changes).
5. Submit handler:
   - Guard no `selectedId` / empty question / in-flight.
   - Append a user bubble via `createElement` + `textContent` (never innerHTML).
   - Disable send; label `'Thinking…'`.
   - `fetchWithAuth(\`${API_BASE}/api/notes/${selectedId}/chat\`, {
        method:'POST',
        body: JSON.stringify({ question, history: chatHistory.slice(-6) })
     })`.
   - 200 → append assistant bubble with `answer` via textContent; push
     `{role:'user', content: question}` then `{role:'assistant', content: answer}`
     onto `chatHistory` (cap 6 turns = 12 messages).
   - 400 → `setError(json.message)`.
     429 → `setError('AI rate limit reached — try again in a few minutes.')`.
     Other → `setError('AI is busy right now — try again in a moment.')`.
   - `finally` → re-enable send, restore `'Send'`, clear the input.
6. Empty log state: if you show a hint, use a static text node
   `'Questions stay on this device until you switch notes.'` — no network.

### Spec 7 — Styles (`authentication/app.css`)

Append next to the other `.app-ai-*` blocks, same token family (Evernote-dark
editor: olive borders, `#1f261a` surfaces, `--env-green` accent). Keep it
compact: max-height log (~220px) with overflow auto, user bubbles slightly
brighter, assistant bubbles muted. Do not restyle summarize/title/tag bars.

### Spec 8 — E2E (`backend/tests/e2e/ai-chat-smoke.spec.js`)

Copy `ai-title-smoke.spec.js` structure (request fixture, keyless). One test:

1. Signup owner + foreign user.
2. Owner note with `contentText` ≥ 200 chars of real sentences that include a
   distinctive word (e.g. `rollback`).
3. `POST /api/notes/:id/chat` without auth → **401**.
4. With auth, body `{ question: 'What about rollback?', history: [] }` → **200**,
   non-empty string `answer`, `provider` ∈ {`groq`,`mock`}. In mock mode the
   answer must include `Based on the note:` (or `cannot find` only if the
   keyword truly misses — your fixture must hit).
5. `GET /api/notes` → the note is unchanged (same title/content; no new fields
   required). Chat must not have written a `summary` or anything else.
6. Empty / missing question → **400**. 20-char note → **400**. Foreign user →
   **404**. Trashed note → **400**.
7. Do not modify existing `mvp-smoke` / `ai-smoke` / `ai-title-smoke` /
   `ai-tags-smoke` expectations.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: `provider.js`, `prompts.js`, `aiController.js`, `noteRoutes.js`,
   `app.html` editor/AI block, `app.js` (`fetchWithAuth`, `hideAiTags` call
   sites, summarize click handler), `sw.js`, `ai-title-smoke.spec.js`.
2. Implement Specs 1–4 (backend) → 5–7 (UI) → 8 (E2E).
3. `cd backend && npm run db:migrate` (must stay clean — no new step) · `npm start`.
4. Curl matrix: 401 · 200 mock · 400 empty question · 400 short note · 400
   trashed · 404 foreign · note body unchanged after chat.
5. `node --check authentication/app.js` · `cd authentication && npm run build:app`
   · bump `sw.js` to `notin-shell-v10`.
6. Grep-audit every locked selector in PART 2.
7. Tests: restart API for a clean rate-limit bucket, then
   `npx playwright test ai-smoke ai-title-smoke ai-tags-smoke ai-chat-smoke`
   (request-only). Full `npm run test:e2e` if Chromium exists. Report honestly.
8. Update `PROJECT_BIBLE.md`: mark WP-AI-003 complete; next = WP-SCHEMA-001.

## PART 5 — DO NOT (hard constraints)

→ Do NOT add any npm dependency (no groq-sdk, openai, sse libs).
→ Do NOT stream. One JSON in, one JSON out.
→ Do NOT persist chat (no table, no column, no localStorage, no IndexedDB).
→ Do NOT create `/api/ai` or change summarize/title/tag behavior.
→ Do NOT use innerHTML for questions or answers.
→ Do NOT touch `frontend/`, `docs/`, auth, JWT, cookies, CORS, helmet, migrations.
→ Do NOT skip bundle rebuild + SW cache bump (`v9` → `v10`).
→ Do NOT implement writing-assistant (continue/rephrase) — that is WP-AI-004.
→ Do NOT modify existing E2E expectations.

## PART 6 — ACCEPTANCE CRITERIA

□ `POST /api/notes/:id/chat` returns `200 {answer, provider}` with
  `GROQ_API_KEY` unset; 401 unauth · 404 foreign · 400 trashed · 400 short
  note · 400 bad question · 429 after 5/15 min
□ Server never writes the note or any chat row
□ Ask-this-note button visible only for a selected, non-trashed note; panel
  clears when the note changes; reload starts a blank transcript
□ Answers render via textContent; errors use the existing banner
□ Bundle rebuilt; `sw.js` is `notin-shell-v10`; `node --check` clean
□ Previous AI E2E specs still pass; new `ai-chat-smoke.spec.js` passes
  (or Chromium-unavailable stated honestly with curl matrix)
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
