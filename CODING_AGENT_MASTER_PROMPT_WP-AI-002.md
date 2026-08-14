# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-002

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If `CODING_AGENT_MASTER_PROMPT_WP-AI-002.md` and any older instruction file
> disagree, **this file wins**.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI note-taking
web app. WP-AI-001 (note summarization) has already shipped and been verified:
a Groq/mock AI provider, note-scoped AI routes, and an editor AI card all exist.
Your single task is **WP-AI-002 — AI Title Generation**: when a note has real
content but no title, the app fetches an AI title suggestion and shows it as a
one-click-accept suggestion bar. Nothing else. No smart tags, no chat, no
summarization changes.

Operating rules:
1. **Reuse the proven plumbing.** The provider pattern, error normalization
   (`AI_PROVIDER_ERROR`), ownership checks, and rate-limit pattern from
   WP-AI-001 are the house style — copy them exactly.
2. **The user accepts the title.** The server NEVER writes the note's title.
   It only suggests; the client applies it through the existing edit/autosave flow.
3. **Break nothing.** Every E2E-locked ID/class/text in PART 2 survives untouched.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-14)

Baseline: main @ `8e7545c` **plus WP-AI-001** (commit `6cb4441`, branch
`arena/019ffe5a-notin`). If WP-AI-001 is not yet merged where you work, apply
it first or branch from it — this task builds directly on its files.

```
Notin/
├── backend/                      ← Node 22 + Express 4 (ESM) unified API, port 5000
│   ├── src/config/db.js          ← dual-driver (pg / node:sqlite); $1-style placeholders
│   ├── src/db/migrate.js         ← WP-* migrations, both dialects (NO schema change needed this task)
│   ├── src/middleware/auth.js    ← Bearer JWT → req.userId
│   ├── src/lib/ai/provider.js    ← WP-AI-001: summarizeText() Groq + mock  (EXTEND)
│   ├── src/lib/ai/prompts.js     ← WP-AI-001: SUMMARIZE_* constants          (EXTEND)
│   ├── src/controllers/aiController.js ← WP-AI-001: summarizeNote            (EXTEND)
│   ├── src/routes/noteRoutes.js  ← WP-AI-001: POST /:id/summarize + aiLimit  (EXTEND)
│   └── tests/e2e/                ← mvp-smoke.spec.js (locked) + ai-smoke.spec.js (pattern to copy)
└── authentication/               ← the APP served on :5000
    ├── app.html                  ← editor markup (WP-AI-001 added #summarizeBtn + #aiSummaryCard)
    ├── app.js                    ← vanilla JS app (EDIT) — fetchWithAuth(), setError(),
    │                                setSaveStatus(), onEdit(), notes[], selectedId, updateEditorForSelection()
    ├── app.bundle.js             ← esbuild output — NEVER hand-edit; rebuild only
    ├── app.css                   ← dark design system incl. WP-AI-001 .app-ai-btn/.app-ai-summary (EXTEND)
    ├── sw.js                     ← service worker; CACHE_NAME is currently 'notin-shell-v5'
    └── package.json              ← script: build:app
```

**WP-AI-001 plumbing you MUST reuse (read these files first):**
- `provider.js`: `summarizeText(text) → {summary, provider}` — Groq REST via
  global `fetch` (model `llama-3.1-8b-instant`, temperature 0.3, 20 000 ms
  AbortController timeout), mock mode when `GROQ_API_KEY` unset, all failures
  normalized to `throw new Error('AI_PROVIDER_ERROR')`, one log line
  `[AI] summarize via ${provider}` (never log content/keys).
- `aiController.js` `summarizeNote`: ownership SELECT (`WHERE id=$1 AND "userId"=$2`),
  trashed → 400, length guard → 400, 200 payload, `AI_PROVIDER_ERROR` → 503
  `{message:'AI is busy right now — try again in a moment'}`, else 500
  `{message:'Could not summarize this note'}`.
- `noteRoutes.js`: `const aiLimit = rateLimit({ windowMs: 15*60*1000, limit: 5, standardHeaders: true, legacyHeaders: false }); router.post('/:id/summarize', aiLimit, summarizeNote);`
- `app.js` summarize click handler: `fetchWithAuth` POST → 200/400/429/other
  branches → `setError()` messages; `hideAiSummary()` on every view/selection change.

**HARD CONSTRAINTS (E2E-locked — breaking these fails CI):**
- Every ID/class/text locked before WP-AI-001 stays locked (editor IDs, nav IDs,
  `.app-note-item` + `is-pinned`/`is-active`, asserted texts like `Saved`,
  `Link revoked`, nav labels array, empty-state copy)
- WP-AI-001 additions also locked now: `summarizeBtn`, `aiSummaryCard`,
  `aiSummaryText`, `aiSummaryMeta`, `aiSummaryDismiss` — do not repurpose or move them
- Mock mode with `GROQ_API_KEY` unset must make the whole feature work and pass E2E
- No persistent transform/behavior changes; keep all new UI dismissible

**Bundle/SW coupling (non-negotiable):** after ANY `app.js` edit →
`cd authentication && npm run build:app`, then bump `CACHE_NAME` in
`authentication/sw.js` **one step above its current value** (currently
`'notin-shell-v5'` → `'notin-shell-v6'`; if another package already moved it,
bump from whatever it is now).

---

## PART 3 — THE TASK: WP-AI-002 — AI TITLE GENERATION

### What the user experiences
Open a note whose title is empty or `Untitled` and which has ≥ 40 characters of
content → a slim suggestion bar appears under the editor header:
`✨ Suggested title: "…"  [Use] [Dismiss]`. Clicking **Use** fills the title
input and autosave persists it like any manual edit. Clicking **Dismiss** hides
it for the session. Trashed notes, titled notes, and short notes never trigger it.

### Files to CREATE
1. `backend/tests/e2e/ai-title-smoke.spec.js`

### Files to MODIFY
1. `backend/src/lib/ai/prompts.js`
2. `backend/src/lib/ai/provider.js`
3. `backend/src/controllers/aiController.js`
4. `backend/src/routes/noteRoutes.js`
5. `authentication/app.html`
6. `authentication/app.js`
7. `authentication/app.css`
8. `authentication/sw.js` (cache bump)
9. `authentication/app.bundle.js` (rebuild only)
10. `PROJECT_BIBLE.md` (mark WP-AI-002 complete)

**No database migration.** The existing `Note.title` column is sufficient —
the server never writes it in this feature.

---

### Spec 1 — Prompts (`backend/src/lib/ai/prompts.js`)

Append:
```js
export const TITLE_SYSTEM = 'You title notes. Reply with exactly one title: a single line, at most 60 characters, no quotes, no trailing punctuation, no markdown, no emoji.';
export function titleUserPrompt(text) { return `Give this note a title:\n\n${text}`; }
export const MAX_TITLE_INPUT_CHARS = 500;
export const MAX_TITLE_LEN = 60;
```

### Spec 2 — Provider (`backend/src/lib/ai/provider.js`)

Add `export async function suggestTitle(text) → { title, provider }`, mirroring
`summarizeText` structure exactly:
- Normalize: `String(text ?? '').trim().slice(0, MAX_TITLE_INPUT_CHARS)`.
- **Groq path** (when `GROQ_API_KEY` set): same endpoint/model/timeout as
  summarization, but body uses `TITLE_SYSTEM`/`titleUserPrompt`, `temperature: 0.4`,
  `max_tokens: 40`. Non-2xx / timeout / empty content → `AI_PROVIDER_ERROR`.
  Post-process the returned title: trim, strip surrounding quotes, collapse
  whitespace/newlines to single spaces, cut to `MAX_TITLE_LEN` chars.
  Empty after processing → `AI_PROVIDER_ERROR`.
- **Mock path** (no key): deterministic — take the first sentence-like segment
  (`text.split(/(?<=[.!?])\s+|\n/)[0]` fallback to the whole text), collapse
  whitespace, cut to `MAX_TITLE_LEN` chars (no ellipsis). If the result is
  < 8 chars, use `'Untitled idea'`. Never random.
- Log `[AI] title via ${provider}` only.

### Spec 3 — Controller (`backend/src/controllers/aiController.js`)

Add `export async function suggestNoteTitle(req, res)`, same skeleton as `summarizeNote`:
1. Ownership load: `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`.
   Missing → **404** `{message:'Note not found'}`. Trashed → **400** `{message:'Restore the note first'}`.
2. Existing title guard: if `note.title` trimmed is non-empty AND not
   `'Untitled'` (case-insensitive) → **400** `{message:'Note already has a title'}`.
3. Source text = trimmed `contentText`, else `description`. If length **< 40**
   → **400** `{message:'Note is too short to title (needs at least 40 characters)'}`.
4. `const { title, provider } = await suggestTitle(sourceText);`
5. **Do NOT update the database.** Respond **200** `{ title, provider }`.
6. Errors: `AI_PROVIDER_ERROR` → **503** `{message:'AI is busy right now — try again in a moment'}`;
   else `console.error` + **500** `{message:'Could not generate a title'}`.

### Spec 4 — Route (`backend/src/routes/noteRoutes.js`)

Next to the summarize route:
```js
const titleLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/suggest-title', titleLimit, suggestNoteTitle);
```
(import `suggestNoteTitle` from the existing aiController import line)

### Spec 5 — UI markup (`authentication/app.html`)

Immediately AFTER the `#aiSummaryCard` div (the WP-AI-001 summary card), add:
```html
<!-- WP-AI-002 — AI title suggestion (accept/reject; server never auto-writes titles) -->
<div class="app-ai-title" id="aiTitleBar" hidden>
  <span class="app-ai-title-label">✨ Suggested title:</span>
  <span class="app-ai-title-text" id="aiTitleText"></span>
  <span class="app-ai-title-actions">
    <button type="button" id="aiTitleApply">Use</button>
    <button type="button" id="aiTitleDismiss">Dismiss</button>
  </span>
</div>
```

### Spec 6 — UI logic (`authentication/app.js`)

Follow the summarize-card patterns exactly (`hideAiSummary`, `setViewChrome`,
`updateEditorForSelection` hooks):

1. Element refs near the WP-AI-001 block: `aiTitleBar`, `aiTitleText`,
   `aiTitleApply`, `aiTitleDismiss`.
2. State: `let aiTitleNoteId = null;` (which note the current suggestion is for)
   and `const titleSuggestedFor = new Set();` (session memory — notes already
   suggested-or-dismissed; never persisted).
3. `function hideAiTitle(){ if(aiTitleBar) aiTitleBar.hidden = true; aiTitleNoteId = null; }`
   Call `hideAiTitle()` everywhere `hideAiSummary()` is called (view switches and
   selection changes).
4. `async function maybeSuggestTitle(note)` — call from
   `updateEditorForSelection(note)` after the WP-AI-001 summary hook:
   - Guards (any fails → `hideAiTitle(); return`): note exists · not trashed ·
     not `offlineReadOnly` · `titleSuggestedFor` does not contain `note.id` ·
     title empty/`Untitled` · content length ≥ 40 ·
     `currentView === 'notes'` (do not fire in trash/other views).
   - `titleSuggestedFor.add(note.id)` BEFORE the fetch (prevents double-fire).
   - `const res = await fetchWithAuth(\`${API_BASE}/api/notes/${note.id}/suggest-title\`, { method: 'POST' });`
   - Only on `res.status === 200`: parse `{ title }`; if the SAME note is still
     selected (`selectedId === note.id`) and its title is still empty/Untitled:
     set `aiTitleText.textContent = title` (never innerHTML), `aiTitleNoteId = note.id`,
     un-hide the bar. Any other status or changed selection → silently do nothing
     (no error banner for background suggestions). Wrap in try/catch → silent.
5. `aiTitleApply` click: guard `aiTitleNoteId === selectedId`; set
   `titleInput.value = aiTitleText.textContent`; call `onEdit()` (existing
   function — marks dirty + schedules the 900 ms autosave, so the title
   persists through the normal save path); `hideAiTitle()`.
6. `aiTitleDismiss` click: `hideAiTitle()` only (Set already prevents refetch).
7. In `saveNote()`'s success path (or wherever the in-memory note's title is
   synced after save): if a suggestion was applied, nothing extra needed —
   but if the user later clears the title to empty, do NOT re-suggest in the
   same session (the Set handles this).

### Spec 7 — Styles (`authentication/app.css`)

Append near the WP-AI-001 AI styles, same visual family:
```css
.app-ai-title{display:flex;align-items:center;gap:8px;margin:0 18px 10px;padding:9px 12px;border:1px solid #3a4632;border-radius:10px;background:#1f261a;color:#d9e7cf;font-size:12.5px}
.app-ai-title-label{color:var(--env-green);font-weight:700;flex:none}
.app-ai-title-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app-ai-title-actions{display:flex;gap:6px;flex:none}
.app-ai-title-actions button{border:1px solid #3f4a3a;border-radius:7px;background:#242c20;color:#c9d9b8;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
.app-ai-title-actions button:hover{border-color:var(--env-green);color:var(--env-green)}
.app-ai-title-actions #aiTitleDismiss{background:transparent;border-color:#3a3a3a;color:#9a9a9a}
.app-ai-title-actions #aiTitleDismiss:hover{border-color:#666;color:#ddd}
```
Add the mobile tweak inside the existing `@media (max-width:560px)` block:
`.app-ai-title{flex-wrap:wrap}`.

### Spec 8 — E2E (`backend/tests/e2e/ai-title-smoke.spec.js`)

Copy the structure of `ai-smoke.spec.js` (request-fixture, no browser). Must pass
with `GROQ_API_KEY` unset. One test:
1. Signup owner + foreign user.
2. Create an **untitled** note (`title: 'Untitled'`) whose `contentText` ≥ 200 chars.
3. `POST /api/notes/:id/suggest-title` without auth → **401**.
4. With auth → **200**; `title` is a non-empty string, ≤ 60 chars; `provider` ∈ {groq, mock}.
5. `GET /api/notes` → that note's title is STILL `'Untitled'` (server must not write it).
6. Create a note titled `'Real title'` → suggest → **400** `Note already has a title`.
7. Untitled note with 20-char body → suggest → **400** too-short message.
8. Foreign user on owner's note → **404**.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read** the WP-AI-001 files listed in PART 2 (provider, prompts, controller,
   routes, ai-smoke.spec.js) plus `app.js` summarize handler + `updateEditorForSelection`.
2. Implement backend first (Specs 1–4), then UI (Specs 5–7), then the E2E spec (8).
3. `cd backend && npm run db:migrate` (no new step — just confirms clean run), then `npm start`.
4. Curl smoke: 401 · 200-mock (≤60 chars) · 400 titled · 400 short · 404 foreign ·
   note title unchanged after suggestion.
5. `node --check authentication/app.js`, then `npm run build:app`, then bump `sw.js` cache.
6. Grep-audit every PART 2 locked ID (including WP-AI-001's) still present.
7. `cd backend && npm run test:e2e` if Chromium is available; otherwise run at
   minimum `npx playwright test ai-smoke ai-title-smoke` (request-only tests work
   without a browser) and state clearly what ran. Never claim unrun tests passed.
   Note: the `/summarize` and `/suggest-title` rate limits are separate, but a
   shared test IP that spent budget earlier can cause 429s — restart the API for
   a clean limiter state before the suite if you've been curling manually.
8. Update `PROJECT_BIBLE.md` COMPLETED FEATURES with WP-AI-002.

## PART 5 — DO NOT (hard constraints)

→ Do NOT add any npm dependency.
→ Do NOT write the note's title on the server — suggestion only; the client's
  existing edit/autosave path persists accepted titles.
→ Do NOT modify `summarizeText`/`summarizeNote` behavior, the summarize route,
  or the summary card UI.
→ Do NOT build smart tag suggestions, chat, or any other AI feature — separate work packages.
→ Do NOT touch landing (`frontend/`), auth pages (`index.html`/`login.html`), or migrations.
→ Do NOT auto-fetch suggestions more than once per note per session.
→ Do NOT show error banners for background suggestion failures (silent degrade).
→ Do NOT skip the bundle rebuild + SW cache bump.
→ Do NOT rename/move any locked ID, class, or text.

## PART 6 — ACCEPTANCE CRITERIA

□ `POST /api/notes/:id/suggest-title`: 200 `{title,provider}` (mock, ≤60 chars) ·
  401 unauth · 404 foreign · 400 titled · 400 short · 400 trashed · 429 after budget
□ Note title in DB/API unchanged after a suggestion (server never writes it)
□ Opening an untitled note with ≥40 chars of content shows the suggestion bar once;
  **Use** fills the title input and autosave persists it; **Dismiss** hides it and
  it does not return that session; titled notes never trigger it
□ Bar hidden on view/note switches; silent on any failure path
□ Bundle rebuilt; `sw.js` cache bumped exactly one step; `node --check` clean
□ All locked selectors verified unchanged; `ai-smoke.spec.js` still passes;
  new `ai-title-smoke.spec.js` passes (or Chromium limits stated honestly)
□ No secrets or provider details in client code; `npm start` boots clean

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-AI-002 REPORT
1. Files created/modified:  [lists]
2. Server-write check:      [confirm title NOT written server-side]
3. Verification:            [curl matrix + test results, or Chromium unavailable]
4. Bundle/SW:               [old→new cache name]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers:                [any]
7. Suggested next:          WP-AI-002b (smart tag suggestions) — do NOT start it.
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-AI-002b** — smart tag suggestions (reuses this exact plumbing).
2. **WP-UI-NOTES-3D-001** — smooth + 3D polish (`CODING_AGENT_MASTER_PROMPT_WP-UI-NOTES-3D.md`).
3. **WP-FUNNEL-001** — wire dead landing CTAs to auth.
4. **WP-AI-003** — chat with note (streaming, 70b model).
5. Schema sync (`prisma/schema.prisma` ↔ migrate.js) + deploy-gate hardening.
