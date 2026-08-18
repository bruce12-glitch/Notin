# CODING AGENT MASTER PROMPT — Notin · ALL FURTHER DEVELOPMENT
## Phase 2 Completion → Phase 3 → Production Readiness

> **HOW TO USE:** This is the roadmap-level master prompt. One work package (WP)
> per agent session — never two at once. For each WP, paste the referenced spec
> file into a fresh coding-agent session. Where a spec lives INSIDE this file
> (PART 5 and PART 6), paste the whole file as the spec.
> If this file and `PROJECT_BIBLE.md` ever disagree, **this file wins**.
> **DO NOT execute the whole queue in one session.** That is the #1 way this
> project would break.

**Ground truth audited live against `main` @ `c8a380c` on 2026-08-17.**
Nothing below is aspirational — every "shipped" claim was verified in the code.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI note-taking
web app. The product has a shipped marketing site (Green + Neon editions), a
shipped unified API with custom JWT auth, a shipped TipTap-based notes app with
notebooks/tags/attachments/shares, and two shipped AI features (summarize,
suggest-title). The foundation is real and E2E-guarded.

Your mission across this roadmap: **finish Phase 2 (AI layer), close the
acquisition funnel, sync the schema docs, and pass every deploy gate** — in the
locked order, one WP per session, without breaking anything that already works.

Operating principles:
1. **Read before writing.** Every WP spec lists its files; read them first.
2. **Match the house style.** Plain ES-module JavaScript, comment style
   `// WP-XXX-000 — ...`. No TypeScript conversion. No framework migration.
3. **Nothing new unless listed.** Zero new npm dependencies. Zero new services.
   Zero architectural decisions — every decision you need is already made.
4. **Verify everything you claim.** Run each WP's verification commands before
   reporting. "It should work" is not a report.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-17, main @ c8a380c)

```
Notin/
├── backend/                        ← Node 22 + Express 4.21 (ESM), unified API :5000
│   ├── src/server.js               ← mounts routes; serves authentication/ statically
│   ├── src/config/db.js            ← dual driver: pg.Pool OR node:sqlite; $n placeholders
│   ├── src/db/migrate.js           ← migrations BOTH dialects — schema source of truth
│   ├── src/middleware/auth.js      ← Bearer JWT guard → req.userId
│   ├── src/lib/jwt.js              ← jose access tokens + helpers
│   ├── src/lib/ai/provider.js      ← summarizeText() + suggestTitle() (Groq/mock)  [EXTEND for AI WPs]
│   ├── src/lib/ai/prompts.js       ← SUMMARIZE_* / TITLE_* constants              [EXTEND for AI WPs]
│   ├── src/controllers/            ← note/notebook/tag/attachment/share/account/auth/user/ai
│   │   └── aiController.js         ← summarizeNote + suggestNoteTitle             [EXTEND for AI WPs]
│   ├── src/routes/noteRoutes.js    ← router.use(auth); AI endpoints + rate limits [EXTEND for AI WPs]
│   ├── tests/e2e/                  ← mvp-smoke + ai-smoke + ai-title-smoke        [ADD one spec per WP]
│   └── prisma/schema.prisma        ← DOCU-ONLY, drifted (WP-SCHEMA-001)
├── authentication/                 ← THE APP (served by the API on :5000)
│   ├── app.html                    ← editor markup; action bar hosts summarizeBtn etc.
│   ├── app.js                      ← ~2,050 LOC app logic — edit through listed hooks only
│   ├── app.bundle.js               ← esbuild output — NEVER hand-edit; `npm run build:app`
│   ├── app.css                     ← app styling (WP- sections)
│   ├── sw.js                       ← service worker — CACHE_NAME currently 'notin-shell-v7'
│   └── package.json                ← script: build:app (esbuild)
├── frontend/                       ← marketing site, Green + Neon (PR #14 polish landed 2026-08-16)
│   ├── index.html / index-neon.html← 26 × href="#" dead CTAs per edition (WP-FUNNEL-001)
│   └── dev-server.mjs              ← dev server; proxies /api/* + /auth/* → :5000
└── docs/                           ← GitHub Pages mirror of frontend/ (do not expand)
```

**Critical conventions (break one and you break the app):**

- **Dual-driver SQL.** `db.query(text, params)` with `$1,$2,...`. Never repeat a
  placeholder in one statement. Booleans need dialect care — check existing
  controllers; plain nullable TEXT columns need none.
- **Ownership checks.** Every note query: `WHERE id = $1 AND "userId" = $2` →
  foreign access returns **404** (not 403). Copy `suggestNoteTitle` in
  `aiController.js`.
- **Errors.** try/catch everything; JSON `{ message: '...' }`; never leak
  provider/DB error text. `AI_PROVIDER_ERROR` → 503
  `'AI is busy right now — try again in a moment'`.
- **Rate limiting.** One `const xLimit = rateLimit({ windowMs: 15*60*1000, limit: N,
  standardHeaders: true, legacyHeaders: false })` per AI endpoint, in `noteRoutes.js`.
- **AI provider pattern (locked).** Groq REST to
  `https://api.groq.com/openai/v1/chat/completions`, model `llama-3.1-8b-instant`,
  global fetch + AbortController 20 000 ms, ALL failures →
  `throw new Error('AI_PROVIDER_ERROR')`, one log line, **never log note content**.
  No `GROQ_API_KEY` ⇒ deterministic mock — every feature must be fully usable and
  E2E-verifiable keyless.
- **Client AI-component pattern.** Hidden-by-default element; re-hidden on every
  view/selection change at the same call sites as `hideAiSummary()`/`hideAiTitle()`;
  background suggestions fail silently; user-initiated actions may surface the
  server `message`. All API calls via `fetchWithAuth()` only.
- **Bundle + service worker coupling.** After ANY change to `app.js`/`app.css`/
  `app.html`: `cd authentication && npm run build:app`, then bump `CACHE_NAME` in
  `sw.js` one step above current (`notin-shell-v7` → `v8` at time of writing).
- **E2E-locked selectors.** Every ID/class locked by prior specs (see each WP's
  list) must survive untouched. Chromium is unavailable in Arena sandboxes —
  write the specs anyway; they run in CI (WP-DEPLOY-001) or a dev machine.

---

## PART 3 — THE COMPLETE REMAINING QUEUE (locked execution order)

| # | WP | What it delivers | Spec location | Status | Exit criteria (summary) |
|---|----|------------------|---------------|--------|-------------------------|
| 1 | **WP-UI-NOTES-3D-001** | Smooth + tasteful 3D depth for the notes experience (hover-only tilt, keyframes, staggered list-in, press physics, reduced-motion switch) | `CODING_AGENT_MASTER_PROMPT_WP-UI-NOTES-3D.md` | ✅ Spec ready · not executed (verified code-clean 2026-08-17) | All 3 existing E2E specs pass unchanged; transform-at-rest rule honored; bundle rebuilt; SW bumped; PR opened |
| 2 | **WP-AI-002b** | Smart tag suggestions — server proposes 3–5 chips, user applies via existing tag write path | `CODING_AGENT_MASTER_PROMPT_WP-AI-002B.md` | ✅ Spec ready · not executed | `POST /api/notes/:id/suggest-tags` live w/ guards + rate limit; chips apply through `POST /api/tags` + `PUT :id {tagIds}`; new E2E `ai-tags-smoke` written; existing specs pass |
| 3 | **WP-FUNNEL-001** | Wire the 26 dead `href="#"` CTAs per landing edition to the real auth/app journey | `CODING_AGENT_MASTER_PROMPT_WP-FUNNEL-001.md` | ✅ Spec ready · **MUST re-verify selectors against post-PR-#14 landing markup first** (26 dead links confirmed present 2026-08-17) | Every CTA resolves to auth/app/download section on both editions; zero `href="#"` remains except intentional anchors; landing still pixel-clean on desktop + mobile |
| 4 | **WP-AI-003** | **Chat with note** — Q&A against the open note, session-only, mock-safe | **PART 5 of this file** | 🆕 Spec authored 2026-08-17 | Full PART 5 acceptance list green |
| 5 | **WP-SCHEMA-001** | Sync `backend/prisma/schema.prisma` to migrate.js reality (documentation-only; no behavior change) | **PART 6.1 of this file** | 🆕 Spec authored 2026-08-17 | All 10 tables + drift note present; no code touched; no prisma dependency added |
| 6 | **WP-DEPLOY-001** | Production gates: fail-closed prod boot, CORS lockdown, CI (Playwright Chromium), backup/restore drill | **PART 6.2 of this file** | 🆕 Spec authored 2026-08-17 — **starts only after WP 1–4 are merged** | All gates in 6.2 pass; green CI run on the WP's own PR |
| 7 | **Housekeeping** | Close PR #2 with a salvage-notes comment | PART 6.3 | Open since 2026-08-06, partially superseded | PR closed, salvage list recorded in the comment |

**Why this order (locked, do not renegotiate mid-build):**
3D first because it is the only WP touching shared visual chrome and must land on
the current pre-AI-002b tree, exactly as scheduled when it was specced.
Then 002b completes the note-level AI trio on proven plumbing. FUNNEL then fixes
acquisition on the final app/landing markup. AI-003 (the flagship AI feature)
lands on a stable, funnel-complete product. Schema sync and deploy gates are
deliberately last: they gate shipping, not building.

**After every WP:** open one PR per WP, report with the PART 7 format, update
`PROJECT_BIBLE.md`, and only then start the next WP from the fresh `main`.

---

## PART 4 — EXPLICITLY NOT NOW (deferred — scope enforcement)

Do NOT start any of these, in any session, before the PART 3 queue is merged:

- **WP-AI-003b — streaming chat.** WP-AI-003 ships non-streaming deliberately
  (matches WP-AI-001/002 plumbing, deterministic E2E). Streaming upgrades after.
- **WP-AI-004 — writing assistant** (continue/rephrase/shorten/expand).
- **Full-text search** (Postgres `tsvector` / SQLite FTS5) — current `?q=`
  substring search is sufficient for MVP.
- **Note version history**, **pgvector semantic search / related notes**,
  **export to Markdown/PDF**, **import from Evernote/Notion**.
- **`docs/` ↔ `frontend/` consolidation**, **legacy `:8787` server retirement**
  (handle at WP-DEPLOY-001, not before — it is a deploy-cutover decision).
- Any new dependency, framework, build tool, databases, or third-party service.

If a session uncovers a defect in shipped code while executing a WP: fix it ONLY
if it blocks that WP; otherwise record it in the report under "Technical debt"
and continue.

---

## PART 5 — FULL SPEC: WP-AI-003 — CHAT WITH NOTE

> Self-contained task spec. When this WP's turn comes, paste this PART (plus
> PARTS 1–2 for context) into a fresh agent session.

### 5.1 CONTEXT (what already exists)

- WP-AI-001 and WP-AI-002 are merged: `provider.js` exports `summarizeText`,
  `suggestTitle`; `prompts.js` holds system prompts + input caps;
  `aiController.js` holds `summarizeNote`/`suggestNoteTitle`; `noteRoutes.js`
  mounts them under `router.use(auth)` with per-endpoint rate limits (5/15min).
- Editor AI surfaces in `app.js`: `#summarizeBtn` in the action bar,
  `#aiSummaryCard` (with `#aiSummaryText/#aiSummaryMeta/#aiSummaryDismiss`),
  `#aiTitleBar` — hidden-by-default components re-hidden via `hideAiSummary()` /
  `hideAiTitle()` at every view/selection change (`setViewChrome`,
  `updateEditorForSelection`, trashed/readOnly handling).
- E2E pattern: see `backend/tests/e2e/ai-title-smoke.spec.js` — signup via API,
  Bearer headers, guard matrix (401/404 foreign/400 trashed/400 short), mock-safe
  assertions (`provider` ∈ `['groq','mock']`, deterministic content checks only
  `if (payload.provider === 'mock')`).
- **No DB table or persistence exists for chat — and none may be added.** Chat
  history is session-only client memory; the server is stateless.

### 5.2 TASK (what to build)

**`POST /api/notes/:id/chat`** — answers a user's question about one of their
own notes, plus the client chat panel in the editor.

### 5.3 FILES

**Create:**
- `backend/tests/e2e/ai-chat-smoke.spec.js` (new spec, house pattern)

**Modify:**
- `backend/src/lib/ai/prompts.js` — add `CHAT_SYSTEM`, `chatUserPrompt()`,
  `MAX_CHAT_MESSAGE_LEN = 1000`, `MAX_CHAT_HISTORY_TURNS = 12`,
  `MAX_CHAT_REPLY_CHARS = 600`, `MAX_CHAT_HISTORY_ENTRY_CHARS = 2000`.
- `backend/src/lib/ai/provider.js` — add `chatWithNote(noteText, message, history)`
  → `{ reply, provider }` (Groq/mock, exact WP-AI-001 plumbing).
- `backend/src/controllers/aiController.js` — add `chatAboutNote(req, res)`.
- `backend/src/routes/noteRoutes.js` — add `chatLimit` (15 min / **10** requests —
  chat is multi-turn, 5 is too tight) and `router.post('/:id/chat', chatLimit, chatAboutNote)`.
- `authentication/app.html` — add `#chatBtn` to the editor action bar beside
  `#summarizeBtn`, and the chat card markup (below).
- `authentication/app.css` — new `/* WP-AI-003 — chat */` section.
- `authentication/app.js` — chat card lifecycle + send flow (below).
- `authentication/sw.js` — bump `CACHE_NAME` one step.
- Rebuild: `cd authentication && npm run build:app`.

### 5.4 EXACT API SPECIFICATION

**Method/Route:** `POST /api/notes/:id/chat` · Auth: required (existing
`router.use(auth)`).

**Request body (JSON):**
```json
{ "message": "string, required, 1–1000 chars after trim",
  "history": [ { "role": "user|assistant", "content": "string" } ] /* optional, ≤ 12 entries */ }
```

**Validation & guards (exact order, exact messages):**
1. Note lookup `WHERE id = $1 AND "userId" = $2` → missing ⇒ **404** `{message:'Note not found'}`.
2. Trashed ⇒ **400** `{message:'Restore the note first'}`.
3. `message` missing/not string/empty after trim ⇒ **400** `{message:'Message is required'}`.
4. `message.length > 1000` ⇒ **400** `{message:'Message is too long (max 1000 characters)'}`.
5. `history` present and not an array, or array longer than 12 ⇒ **400**
   `{message:'History is too long (max 12 turns)'}`.
6. Source text: `contentText` if non-empty else `description`; trimmed length
   `< 100` ⇒ **400** `{message:'Note is too short to chat about (needs at least 100 characters)'}`.

Sanitize, never reject: drop malformed history entries (non-object, role not in
`user|assistant`, non-string content); slice each kept entry's content to 2000
chars; keep only the LAST 12.

**Success 200:** `{ reply: string /* ≤ 600 chars */, provider: 'groq' | 'mock' }`.
**Provider failure:** `AI_PROVIDER_ERROR` ⇒ **503** `{message:'AI is busy right now — try again in a moment'}`.
**Other:** 500 `{message:'Could not answer that question'}` with one `console.error(error)`.

### 5.5 PROVIDER SPECIFICATION (`chatWithNote`)

- Truncate note text to existing `MAX_INPUT_CHARS` (6000) before prompting.
- **Groq path** (when `process.env.GROQ_API_KEY`): same constants/plumbing as
  `summarizeWithGroq` — URL, model `llama-3.1-8b-instant`, AbortController
  20 000 ms, all failure modes normalized to `AI_PROVIDER_ERROR`.
  `temperature: 0.4`, `max_tokens: 450`. Messages exactly TWO:
  - `system`: `CHAT_SYSTEM` =
    `'You answer questions about a single note. Answer ONLY from the NOTE CONTENT provided in the user message. If the answer is not in the note, say so in one sentence. Plain prose, no markdown, no headings. Keep answers under 80 words.'`
  - `user`: `chatUserPrompt(noteText, message, history)` assembling:
    `NOTE CONTENT:\n"""\n{noteText}\n"""\n\nPRIOR CHAT:\n{historyLines or '(none)'}\n\nQUESTION:\n{message}`
    where historyLines renders each turn as `User: …` / `Assistant: …`.
- **Mock path** (keyless, deterministic — E2E depends on it):
  1. Split note into sentences (`/[^.!?]*[.!?]+/g`, fallback: whole text).
  2. Tokenize the message into lowercase words, drop stopwords
     (`the a an is are was were what who how why when where which and or of to in on for with about this that it its as at by from`).
  3. Score each sentence by count of shared tokens; take top 2, in note order.
  4. If any matched: reply = `Based on this note: {s1} {s2}` sliced to 600 chars.
  5. If none matched: reply = `'I could not find anything about that in this note. The note starts with: "{first 80 chars of the note}…"'` sliced to 600 chars.
- Never log note content or message content.

### 5.6 COMPONENT BEHAVIOR (client)

**Entry point — `#chatBtn`:** label `💬 Ask AI`, placed in the action bar beside
`#summarizeBtn`. Visibility rule: `chatBtn.hidden = !noteOpen || isTrashed ||
readOnly` (unlike the summarize button, it does NOT depend on text selection).
Clicking toggles the chat card open/closed; opening focuses `#aiChatInput`.

**Chat card markup (hidden by default):**
```html
<div id="aiChatCard" hidden>
  <div id="aiChatHeader">…"Ask about this note"… + #aiChatClose (×)</div>
  <div id="aiChatMessages" aria-live="polite"></div>
  <form id="aiChatForm">
    <textarea id="aiChatInput" rows="2" maxlength="1000"
      placeholder="Ask a question about this note…"></textarea>
    <button id="aiChatSend" type="submit">Send</button>
  </form>
</div>
```
Place the card immediately after `#aiTitleBar`'s container in the editor meta
area (same vertical stack as the summary card), inside the editor scroll region.

**State:** one in-memory array per open note: `chatHistory = []`, reset to `[]`
whenever a different note is opened. Rendered as bubbles: user right-aligned,
assistant left-aligned, via `textContent` only (never `innerHTML` with AI or
user text).

**Send flow:** Enter submits, Shift+Enter newline. On submit:
1. Push `{role:'user', content}` to history and render the bubble; clear input.
2. Disable send; append a pending assistant bubble with text `Thinking…`.
3. `fetchWithAuth(POST …/chat, body: { message, history: chatHistory.slice(-13, -1) })`
   (history excludes the just-added message; hard-capped at 12).
4. On 200: replace pending bubble text with `reply`; push
   `{role:'assistant', content: reply}` to history. If `provider === 'mock'`,
   set the card meta line to `Demo answers (no AI key configured)` — same copy
   convention as the summary card.
5. On any non-200: replace the pending bubble text with the response `message`
   (user-initiated action → surfacing errors IS correct here, unlike background
   suggestions); do NOT push to history.
6. Re-enable send; focus input; scroll `#aiChatMessages` to bottom on each render.

**Lifecycle:** define `hideAiChat()` (hides card, does NOT clear history) and call
it at every call site where `hideAiSummary()`/`hideAiTitle()` are called.
History clears only on note switch, never on card close. Chat card works on
mobile widths via the same responsive rules as the summary card (full-width,
above the editor body — no new breakpoints).

**Styling:** mirror the `.app-ai-summary` family: `.app-ai-chat`, `.app-ai-chat-msg`,
`.app-ai-chat-msg-user`, `.app-ai-chat-msg-ai`, `.app-ai-chat-form`. Dark surface
consistent with `#1C1C1C` chrome; user bubbles use the existing green accent.

### 5.7 DATA FLOW

Editor render → user opens a note → `chatHistory=[]` → user clicks 💬 Ask AI →
types question → client sends `{message, history≤12}` → API validates, loads
owned note → provider answers from truncated `contentText` → client renders
reply bubble and appends to local history → everything dies with the page
session. Server writes nothing.

### 5.8 E2E SPEC (`ai-chat-smoke.spec.js`)

Mirror `ai-title-smoke.spec.js` exactly in structure. Distinctive fixture body
must contain the sentence
`"The release checklist now requires a rollback rehearsal before any editor change ships to production."`
API assertions:
- unauthenticated ⇒ 401 · foreign user ⇒ 404 · trashed note ⇒ 400
  `'Restore the note first'` · short note (<100 chars) ⇒ 400 · empty message ⇒
  400 `'Message is required'` · 1001-char message ⇒ 400 · 13-entry history ⇒ 400.
- happy path: question `"What does the release checklist require?"` ⇒ 200;
  `reply` is a string ≤ 600 chars; `provider` ∈ `['groq','mock']`;
  **if mock ⇒ reply contains `rollback rehearsal`**; history echo works (second
  turn passes one prior turn without validation error).
UI journey (same structure as the title spec's UI section): authed user opens a
note with that body → `#chatBtn` visible → opens card → submits question →
user bubble appears → assistant bubble resolves to non-`Thinking…` text →
(if mock) contains `rollback rehearsal`; switch to another note and back ⇒
`#aiChatMessages` is empty (history reset).

### 5.9 DO NOT

- Do NOT stream responses (that is deferred WP-AI-003b).
- Do NOT persist chat anywhere — no table, no column, no Redis, no localStorage.
- Do NOT add any dependency. Do NOT touch `frontend/`, `docs/`, or marketing markup.
- Do NOT change existing selectors, endpoints, or the summarize/title behaviors.
- Do NOT run chat on trashed or shared-with-me notes; no public/unauthed path.
- Do NOT hand-edit `app.bundle.js`; do NOT skip the `CACHE_NAME` bump.
- Do NOT render model output with `innerHTML`; no markdown rendering.
- Do NOT log note or message content anywhere.

### 5.10 ACCEPTANCE CRITERIA

□ Endpoint exactly per 5.4, guards in order, messages verbatim.
□ Provider per 5.5; keyless mock path deterministic and capped at 600 chars.
□ Rate limit 10/15min on the chat route only; summarize/title limits untouched.
□ Chat UI per 5.6 incl. visibility rule, per-note history reset, error surfacing.
□ `ai-chat-smoke.spec.js` written per 5.8; `mvp-smoke`, `ai-smoke`,
  `ai-title-smoke` specs unmodified.
□ `cd authentication && npm run build:app` run; `sw.js` bumped one step.
□ `cd backend && npm start` boots clean; manual curl happy-path + 401 verified
  against the running server (paste commands + output in the report).
□ No TypeScript… (project is JS) — no new console errors; no `console.log` left
  in app.js.

### 5.11 AFTER THIS TASK — report with:

Files created/modified · curl outputs · E2E status (and where they ran) · any
unspecified decisions · any debt found. Then update `PROJECT_BIBLE.md`.

---

## PART 6 — COMPACT SPECS

### 6.1 WP-SCHEMA-001 — prisma/schema.prisma drift sync (documentation-only)

**Context:** `backend/prisma/schema.prisma` claims source-of-truth status but
drifted: it lacks `Notebook`, `Tag`, `NoteTag`, `Attachment`, `NoteShare`,
`otp_challenges`, `refresh_tokens`, `password_reset_tokens` parity, and `Note`
lacks `notebookId`/`isPinned`/`summary`. The REAL source of truth is
`backend/src/db/migrate.js`.
**Task:** rewrite `schema.prisma` so every table/column matches migrate.js
exactly (all 10 tables, both `User` optional-auth columns, Note's full column
set). Keep the `datasource db { provider = "postgresql" }` block; add a header
comment: `// DOCUMENTATION MIRROR of src/db/migrate.js — migrate.js is the
source of truth. prisma CLI is intentionally NOT a dependency.`
**Rules:** touch ONLY that one file; no `prisma` devDependency; no code change;
no migration.
**Acceptance:** file parses (`npx --yes prisma@5 validate --schema
backend/prisma/schema.prisma` — download-only, not saved); table/column list
diffed line-by-line against migrate.js with zero misses; report shows the diff.

### 6.2 WP-DEPLOY-001 — production readiness gates (starts ONLY after WPs 1–4 merge)

Four gates, one PR:
1. **Fail-closed production boot.** In `server.js` at startup, when
   `NODE_ENV === 'production'`: require `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `OTP_PEPPER` to be set and not equal to their `.env.example` defaults, and
   require `DATABASE_URL` to be Postgres — print one clear message per failure
   then `process.exit(1)`. In `db.js`: no SQLite fallback in production.
   In auth routes: demo OTP and reset-token echo are already SMTP-gated —
   additionally hard-disable BOTH when `NODE_ENV === 'production'` regardless
   of SMTP state.
2. **CORS lockdown.** Production ⇒ allowlist exactly `APP_ORIGIN`
   (comma-separated list support); dev keeps the current permissive echo.
3. **CI workflow.** `.github/workflows/e2e.yml`: on push/PR to `main` — Node 22,
   `npm ci` in `backend/` and `authentication/`, `npm run db:migrate`, boot API,
   `npx playwright install --with-deps chromium`, `npm run test:e2e` (all four
   specs by then), upload Playwright report artifact on failure.
4. **Backup drill.** Append to `RUNBOOK.md`: exact commands to dump/restore the
   Postgres DB (`pg_dump`/`psql`) and to tar/restore `backend/uploads/`, plus a
   restore-verification checklist (sign in, open a note, open an attachment,
   regenerate a summary).
**Acceptance:** booting with `NODE_ENV=production` and missing secrets exits 1
with the messages; full matrix green in CI on the WP's own PR; drill commands
executed once in a sandbox (SQLite-equivalent proof is acceptable for the drill
markdown, noted as such).

### 6.3 Housekeeping — PR #2

Close PR #2 (open since 2026-08-06, partially superseded by PR #7+) with a
comment listing its salvaged-vs-superseded items (refresh-token families,
replay detection, CSRF) and linking the follow-up issue for anything still
wanted. Closes a 10-day-old open thread.

---

## PART 7 — STANDING RULES (every WP, every session)

1. One WP per session. One PR per WP. Sequential: branch from fresh `main` each time.
2. Before starting an AI WP: confirm the previous WP's code is actually IN the
   tree (grep, don't assume).
3. Rebuild the bundle + bump SW cache whenever shell assets change. No exceptions.
4. All four E2E suites must be unmodified-green at WP handoff (new specs ADD,
   never relax existing assertions).
5. Demo keyless mode must always work: no feature may require `GROQ_API_KEY`.
6. Never log secrets, tokens, note content, or message content.
7. **Per-WP report format (mandatory):**
   - Files created / modified (list)
   - Verification commands run + pasted output
   - E2E status: which specs, where run (sandbox CI/dev), result
   - Deviations from the spec (each justified) — if none: state "none"
   - Technical debt discovered (each with severity)
   - Suggested `PROJECT_BIBLE.md` delta
8. If any spec and the tree disagree (e.g. PR #14 moved landing markup before
   WP-FUNNEL-001): the TREE wins for selectors/markup; adapt the spec minimally
   and record every adaptation in the report.

---

## IMMEDIATE NEXT ACTION

**Queue head — run TODAY:** open a fresh agent session and paste
`CODING_AGENT_MASTER_PROMPT_WP-UI-NOTES-3D.md` (WP-UI-NOTES-3D-001).
When it merges → `CODING_AGENT_MASTER_PROMPT_WP-AI-002B.md` →
`CODING_AGENT_MASTER_PROMPT_WP-FUNNEL-001.md` → this file § PART 5 → § PART 6.
That is the complete path from this commit to a deployed, AI-differentiated MVP.
