# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-004

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> CTO-final 2026-08-18 · authored against `main` @ `bd0c0a1` (post-PR-#17)
> and re-verified by the CTO. **Queue rule (locked):** this session starts
> only AFTER the WP-AI-003, WP-SCHEMA-001, and WP-DEPLOY-001 PRs merge into
> `main`. Branch your work from then-current `main`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Shipped and verified on
`main`: notes engine, auth, attachments, shares, notebooks, tags, pins,
WP-AI-001/002/002b, WP-UI-NOTES-3D-001, WP-FUNNEL-001 — with WP-AI-003
(chat), WP-SCHEMA-001 (schema mirror), and WP-DEPLOY-001 (production gates +
E2E CI) merging immediately ahead of you in the locked queue.

Your single task is **WP-AI-004 — writing assistant**: three actions —
**continue**, **rephrase**, **shorten** — driven from the editor. The server
only SUGGESTS text; the user consents via an explicit Apply, and the
suggestion persists through the existing 900 ms autosave (exactly the
WP-AI-002 title-suggestion consent pattern). The note is never written by the
AI endpoint itself. Non-streaming. Deterministic mock when `GROQ_API_KEY` is
blank.

Operating rules:
1. **Reuse proven plumbing.** WP-AI-001/002/002b/003 provider / controller /
   route / client patterns verbatim: `AI_PROVIDER_ERROR` normalization,
   ownership checks, per-endpoint 5/15 min limiter, `fetchWithAuth`,
   `textContent` only, `setError()` for user-initiated errors.
2. **Server suggests, user consents.** No endpoint in this WP writes the
   note. Apply → editor mutation → `onEdit()` (dirty + autosave). That line
   is a hard rule, not a style.
3. **Break nothing.** Every E2E-locked selector below survives, including
   everything WP-AI-003 added.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18)

```
backend/src/lib/ai/prompts.js       ← SUMMARIZE_* / TITLE_* / TAGS_* / CHAT_*   (EXTEND)
backend/src/lib/ai/provider.js      ← summarizeText/suggestTitle/suggestTags/
                                      chatWithNote — Groq llama-3.1-8b-instant,
                                      20 s abort, mock when keyless              (EXTEND)
backend/src/controllers/aiController.js ← + module-local isTrashed() helper     (EXTEND)
backend/src/routes/noteRoutes.js    ← aiLimit/titleLimit/tagsLimit/chatLimit
                                      = 5 per 15 min, identical shape           (EXTEND)
backend/tests/e2e/                  ← mvp, ai-smoke, ai-title, ai-tags,
                                      ai-chat                                    (ADD ONE)
authentication/app.html             ← editor actions row ~L219: summarizeBtn,
                                      (WP-AI-003 adds askNoteBtn), shareBtn @229;
                                      AI bars: aiSummaryCard @252, aiTitleBar
                                      @258, aiTagBar @267, (WP-AI-003 inserts
                                      aiChatPanel), tagRow @273                 (EDIT)
authentication/app.js               ← TipTap Editor @ ~L872 on #tiptapEditor;
                                      onUpdate → onEditorUpdate(); toolbar
                                      #toolbar data-cmd delegation; onEdit()
                                      marks dirty + schedules 900 ms autosave
                                      (PUT /api/notes/:id)                       (EDIT)
authentication/app.css              ← .app-ai-* families; kill-switch LAST rule (EDIT)
authentication/sw.js                ← bump CACHE_NAME exactly ONE step above
                                      whatever main carries at branch time
                                      (expected notin-shell-v10 → v11 — verify)
authentication/app.bundle.js        ← NEVER hand-edit; build via npm run build:app
```

**Editor facts you will build on (verified):**
- `editor` is a module-level TipTap `Editor` (StarterKit + Underline +
  TaskList/TaskItem + Placeholder), `editor.getText()` = plain text.
- Selection: `editor.state.selection` → `{ from, to, empty }`; selected plain
  text via `editor.state.doc.textBetween(from, to, ' ')`.
- Insert: `editor.chain().focus().insertContentAt(pos, …).run()` works with a
  number, a `{from,to}` range, and node-JSON content.
- Consent-persistence path (same as AI title Apply): mutate editor → call
  `onEdit()` → autosave PUTs within ~900 ms. Trashed notes short-circuit the
  autosave guard already (`onUpdate` early-returns).

**E2E-locked (do not rename/remove):** everything from prior WPs —
`summarizeBtn`, `aiSummaryCard`, `aiSummaryText`, `aiSummaryMeta`,
`aiSummaryDismiss`, `aiTitleBar`, `aiTitleText`, `aiTitleApply`,
`aiTitleDismiss`, `aiTagBar`, `aiTagChips`, `aiTagDismiss`, `tagRow`,
`tagChips`, `tagAddSelect`, `shareBtn`, the 3D motion surface, plus WP-AI-003's
`askNoteBtn`, `aiChatPanel`, `aiChatLog`, `aiChatForm`, `aiChatInput`,
`aiChatSend`, `aiChatClose`, and all `mvp-smoke` selectors.
**You ADD as new locked selectors:** `assistBtn`, `assistMenu`,
`aiAssistBar`, `aiAssistLabel`, `aiAssistText`, `aiAssistApply`,
`aiAssistDismiss`.

**Plumbing to copy:** controller skeleton ownership (404) → trashed (400) →
guards (400) → provider → 200 · `AI_PROVIDER_ERROR` → **503**
`{message:'AI is busy right now — try again in a moment'}` · else one
`console.error` + 500 · reuse `isTrashed()` · never log note content, prompts,
or suggestions · log one line `[AI] assist via ${provider}`.

---

## PART 3 — THE TASK: WP-AI-004 — WRITING ASSISTANT

### What the user experiences
With a note open: a **✍ Assist** button sits in the editor actions row. Click
→ a small menu: *Continue writing* / *Rephrase selection* / *Shorten
selection*. Choosing one calls the API; the suggestion appears in a review
bar above the note with **Apply** / **Dismiss**. Apply inserts or replaces
text in the editor and the normal autosave persists it. Dismiss discards.
Nothing is ever written without Apply.

### Files to CREATE
1. `backend/tests/e2e/ai-assist-smoke.spec.js`

### Files to MODIFY
1. `backend/src/lib/ai/prompts.js`
2. `backend/src/lib/ai/provider.js`
3. `backend/src/controllers/aiController.js`
4. `backend/src/routes/noteRoutes.js`
5. `authentication/app.html`
6. `authentication/app.js`
7. `authentication/app.css`
8. `authentication/sw.js` (one-step bump)
9. `authentication/app.bundle.js` (rebuild only)
10. `PROJECT_BIBLE.md` (mark WP-AI-004 complete)

**No database migration. No new npm dependencies. No streaming.**

### Spec 1 — Prompts (`backend/src/lib/ai/prompts.js`)

Append:
```js
export const ASSIST_ACTIONS = ['continue', 'rephrase', 'shorten'];
export const ASSIST_SYSTEM = {
  continue: 'You continue a note. Write 1 or 2 sentences that naturally continue the text. Match the tone. Plain prose, no headings, no preamble, do not repeat the note.',
  rephrase: 'You rewrite text. Return a clearer rephrasing that keeps the exact same meaning and roughly the same length. Plain prose, no preamble.',
  shorten: 'You shorten text. Return only the single most important point, at most half the original length. Plain prose, no preamble.',
};
export function assistUserPrompt(action, text) {
  return `${action.toUpperCase()}:\n${text}`;
}
export const MAX_ASSIST_CONTEXT_CHARS = 3000; // continue: tail of the note
export const MAX_ASSIST_INPUT_CHARS = 2000;   // rephrase/shorten: selection
export const MAX_ASSIST_OUTPUT_CHARS = 800;
export const MIN_ASSIST_NOTE_CHARS = 40;      // continue guard
```

### Spec 2 — Provider (`backend/src/lib/ai/provider.js`)

Add `export async function assistWrite(action, text)` → `{ suggestion, provider }`:

- Normalize `input = String(text ?? '').trim()`;
  `continue` slices to `MAX_ASSIST_CONTEXT_CHARS`, others to
  `MAX_ASSIST_INPUT_CHARS`. (Empty input is rejected by the controller.)
- **Groq path** (key set): same URL / model / 20 s abort. Messages:
  `[{ role:'system', content: ASSIST_SYSTEM[action] },
    { role:'user', content: assistUserPrompt(action, input) }]`.
  `temperature: 0.4` for `continue`, `0.2` otherwise; `max_tokens: 300`.
  Non-2xx / timeout / empty → `AI_PROVIDER_ERROR`. Return
  `{ suggestion: content.trim().slice(0, MAX_ASSIST_OUTPUT_CHARS), provider:'groq' }`.
- **Mock path** (no key), deterministic — split sentences on
  `/[^.!?]+[.!?]+/g` (fallback: whole input as one sentence):
  - `continue`: last sentence, first 80 chars as `tail`; suggestion =
    `'Next step: revisit "' + tail.trim() + '" and turn it into one concrete, dated action.'`
  - `rephrase`: same sentences in REVERSE order, whitespace-normalized,
    joined with single spaces.
  - `shorten`: first `Math.ceil(sentences.length / 2)` sentences, joined.
  - Cap at `MAX_ASSIST_OUTPUT_CHARS`; return `{ suggestion, provider:'mock' }`.
- Log exactly `[AI] assist via ${provider}`.

### Spec 3 — Controller (`backend/src/controllers/aiController.js`)

Add exactly `export async function assistNoteController(req, res)`. Guard
order matches the family:

1. Ownership load (same SELECT shape as `summarizeNote`) — missing → **404**
   `{message:'Note not found'}`.
2. Trashed via `isTrashed()` → **400**
   `{message:'Restore the note before using AI'}`.
3. `action` from the body must be in `ASSIST_ACTIONS` → else **400**
   `{message:'Unknown assist action'}`.
4. Source text:
   - `continue`: server-derived — trimmed `contentText` else trimmed
     `description`; `< MIN_ASSIST_NOTE_CHARS` → **400**
     `{message:'Note is too short to continue (needs at least 40 characters)'}`;
     pass the LAST `MAX_ASSIST_CONTEXT_CHARS` chars.
   - `rephrase` / `shorten`: `req.body.text` must be a string, non-empty
     after trim, ≤ `MAX_ASSIST_INPUT_CHARS` → else **400**
     `{message:'Select some text first (1–2000 characters)'}`.
5. `const { suggestion, provider } = await assistWrite(action, sourceText);`
6. **200** `{ suggestion, action, provider }`. **Do NOT UPDATE the note.**
7. `AI_PROVIDER_ERROR` → **503** `{message:'AI is busy right now — try again in a moment'}`;
   else one `console.error` + **500** `{message:'Could not assist with that text'}`.

### Spec 4 — Route (`backend/src/routes/noteRoutes.js`)

Next to the other AI limiters/routes, exactly:
```js
const assistLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/assist', assistLimit, assistNoteController);
```
Add to the existing aiController import. No `/api/ai`. No middleware changes.

### Spec 5 — UI markup (`authentication/app.html`)

Inside `div.app-editor-actions`, immediately BEFORE `#shareBtn` (i.e. AFTER
`#askNoteBtn`, which WP-AI-003 added):
```html
<button type="button" class="app-ai-btn" id="assistBtn" hidden>✍ Assist</button>
```

Immediately AFTER the `.app-editor-actions` container:
```html
<div class="app-ai-assist-menu" id="assistMenu" hidden>
  <button type="button" data-action="continue">Continue writing</button>
  <button type="button" data-action="rephrase">Rephrase selection</button>
  <button type="button" data-action="shorten">Shorten selection</button>
</div>
```

Immediately AFTER the `#aiChatPanel` block and BEFORE `#tagRow`:
```html
<div class="app-ai-assist" id="aiAssistBar" hidden>
  <div class="app-ai-assist-head">
    <span id="aiAssistLabel">✍ AI suggestion</span>
    <span class="app-ai-assist-actions">
      <button type="button" id="aiAssistApply">Apply</button>
      <button type="button" id="aiAssistDismiss">Dismiss</button>
    </span>
  </div>
  <p id="aiAssistText"></p>
</div>
```

### Spec 6 — UI logic (`authentication/app.js`)

1. Refs + state: the seven new ids; `let assistAction = null;`,
   `let assistRange = null;` (`{ from, to }` captured before the request —
   clicking the menu collapses the selection), `let assistInFlight = false;`.
2. `hideAiAssist()` hides the bar AND the menu and clears
   `assistAction`/`assistRange` (never the editor content). Call it at every
   site where `hideAiTags()` is called.
3. Show `assistBtn` under the same conditions as `summarizeBtn` (note
   selected AND not trashed AND not `offlineReadOnly`); hide otherwise.
4. `assistBtn` click → toggle `#assistMenu`. Close the menu on outside click
   and on `Escape` (one document-level listener, registered once; ignore
   clicks inside the menu or on the button).
5. Menu item click:
   - `continue` → `assistRange = null`; send
     `{ action:'continue' }`.
   - `rephrase` / `shorten` → read
     `const { from, to, empty } = editor.state.selection;` and
     `const selText = empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim();`
     if `!selText` → `setError('Select some text first')` and stop (no
     request). Else `assistRange = { from, to }`; send `{ action, text: selText }`.
   - Guard `assistInFlight`; set it for the duration. POST via
     ``fetchWithAuth(`${API_BASE}/api/notes/${selectedId}/assist`, { method:'POST', body: JSON.stringify(payload) })``.
   - 200 → set `assistAction`, fill `#aiAssistLabel` with
     `✍ AI suggestion — <action label>` and `#aiAssistText` with
     `json.suggestion` via `textContent`; un-hide the bar; hide the menu.
   - 400 → `setError(json.message)`. 429 →
     `setError('AI rate limit reached — try again in a few minutes.')`.
     Other → `setError('AI is busy right now — try again in a moment.')`.
6. `aiAssistApply` click:
   - `continue` →
     `editor.chain().focus().insertContentAt(editor.state.doc.content.size, { type:'paragraph', content:[{ type:'text', text: suggestion }] }).run();`
   - `rephrase` / `shorten` → require stored `assistRange`; if the note or
     doc changed since capture (compare `selectedId`, and bail if
     `assistRange.to > editor.state.doc.content.size`), `setError('The text changed — run the assistant again')` and stop; else
     `editor.chain().focus().insertContentAt(assistRange, suggestion).run();`
   - Then `onEdit();` (dirty + autosave — this is the ONLY persistence path),
     `hideAiAssist()`.
7. `aiAssistDismiss` click → `hideAiAssist()` only.
8. Render suggestion text ONLY via `textContent`. Keep the pending suggestion
   in a plain JS variable (never in the DOM dataset, never in storage).

### Spec 7 — Styles (`authentication/app.css`)

`/* WP-AI-004 — writing assistant */` section ABOVE the kill-switch (it stays
the LAST rule). Reuse the AI token family (`#1f261a`/`#22291d` surfaces,
`#3a4632` borders, `var(--env-green)`). Menu: absolute, compact (~180px),
z-index above editor chrome. Bar: same margins/padding scale as
`.app-ai-title`; `#aiAssistText` uses `white-space: pre-wrap` with a
`max-height` (~160px) + `overflow-y:auto`. Do not restyle existing AI bars or
the chat panel.

### Spec 8 — E2E (`backend/tests/e2e/ai-assist-smoke.spec.js`)

Copy `ai-chat-smoke.spec.js` structure (request fixture, keyless, owner +
foreign signup, notes via `POST /api/notes` with `{title, contentText,
description}`). One test:

1. Owner note: `contentText` = 4+ real sentences, ≥ 300 chars, including a
   distinctive word.
2. No auth → **401** on `POST /api/notes/:id/assist`.
3. `{ action:'continue' }` with auth → **200**; mock ⇒ `suggestion` starts
   with `Next step:`; `provider` ∈ {`groq`,`mock`}.
4. `{ action:'rephrase', text: <two-sentence selection> }` → **200**;
   mock ⇒ suggestion is non-empty and DIFFERENT from input (reversed
   sentences — your fixture must have ≥ 2 sentences).
5. `{ action:'shorten', text: <same fixture> }` → **200**; mock ⇒
   `suggestion.length < text.length`.
6. `{ action:'expand' }` → **400**. `{ action:'rephrase' }` without `text` →
   **400**. Note with 20-char body + `{ action:'continue' }` → **400**.
   Foreign user → **404**. Trashed note → **400**.
7. `GET /api/notes` afterwards → note is byte-identical (no assist write).
8. Do NOT modify any existing spec.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: provider/prompts/controller/routes (all four AI families),
   `app.html` editor region, `app.js` (`initEditor`, `onEdit`, hideAi* call
   sites, title-apply consent path ~L1256–1263, chat panel logic), `sw.js`,
   `ai-chat-smoke.spec.js`.
2. Specs 1–4 (backend) → 5–7 (UI) → 8 (E2E).
3. `npm run db:migrate` clean · `npm start` · curl matrix: 401 · 200 mock ×3
   actions · 400 unknown action · 400 missing text · 400 short note ·
   400 trashed · 404 foreign · note unchanged.
4. `node --check authentication/app.js` · `cd authentication && npm run build:app`
   · bump `CACHE_NAME` one step above main's current value.
5. Grep-audit every locked selector (old + the seven new).
6. Restart the API (clean limiter buckets), then from `backend/`:
   `npx playwright test` (request-only specs must pass; UI journeys run in CI
   courtesy of WP-DEPLOY-001). Report honestly what ran where.
7. Update `PROJECT_BIBLE.md`. Report in PART 7 format.

## PART 5 — DO NOT (hard constraints)

→ Do NOT let any endpoint write the note — Apply + `onEdit()` autosave is the only write path.
→ Do NOT stream; single JSON round-trip.
→ Do NOT add a fourth action (`expand` is deliberately deferred) or a floating/bubble menu.
→ Do NOT use innerHTML for suggestions or add storage for them.
→ Do NOT add npm dependencies, chat-history coupling, or a new limiter shape.
→ Do NOT touch `frontend/`, `docs/`, auth, CORS, helmet, migrations, `prisma/`,
  the workflow file, or any existing E2E expectation.
→ Do NOT skip the bundle rebuild + one-step SW bump.
→ Do NOT start WP-AI-003b (streaming chat) or any other queued item.

## PART 6 — ACCEPTANCE CRITERIA

□ `POST /api/notes/:id/assist` 200s keyless for all three actions with the
  exact mock rules; 401/404/400-matrix per Specs 3/8; 429 after 5/15 min
□ Server never writes the note (E2E asserts byte-identical after calls)
□ Assist button only on selected non-trashed notes; menu closes on
  outside-click/Escape; rephrase/shorten refuse an empty selection client-
  and server-side
□ Apply mutates via TipTap commands + `onEdit()`; stale-range Apply shows the
  guard message; Dismiss writes nothing
□ textContent-only rendering; errors via `setError`
□ Bundle rebuilt; SW bumped exactly one step; `node --check` clean;
  kill-switch still last in `app.css`
□ All prior E2E specs pass unmodified + `ai-assist-smoke.spec.js` green
  (request-only locally; UI journeys → CI)

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-AI-004 REPORT
1. Files created/modified:  [lists]
2. Persistence check:       [confirm Apply→onEdit is the only write path]
3. Verification:            [curl matrix + spec results: where each ran]
4. Bundle/SW:               [v10 → v11, or actual]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers / debt:         [any, with severity]
7. Suggested next:          PR #2 housekeeping / landing leftovers — do NOT start.
```

## APPENDIX — QUICK COMMANDS

```bash
cd backend && npm ci && npm run db:migrate && npm start
curl -s localhost:5000/health
cd authentication && npm ci && npm run build:app
# demo login: any email + OTP 123456 (no SMTP; production-gated after WP-DEPLOY-001)
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **Housekeeping** — close PR #2 with a salvage-notes comment.
2. **Leftovers** — landing binaries/store/extension links; `docs/` mirror re-sync.
3. **WP-AI-003b** — streaming chat (AI-003 shipped non-streaming deliberately).
4. **WP-AI-004b** — `expand` action + selection-floating bubble menu.
5. Actual hosting — a human follows `RUNBOOK.md`.
