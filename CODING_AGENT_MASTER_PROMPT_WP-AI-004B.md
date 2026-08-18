# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-004b

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task = one session = one PR.
> Do not build anything that is not in PART 3.
> If this file and any code comment, older prompt, or your own instinct disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `3e15462`
> (post-PR-#21). **Queue rule (locked):** #22 WP-AI-003b (streaming chat)
> must be **MERGED** before you branch — after that merge, `authentication/sw.js`
> is `notin-shell-v12` and `PROJECT_BIBLE.md` records the `/chat/stream`
> endpoint. If you see shell version ≤ v11 on your base, you branched too
> early: stop and re-branch. The owner-activated E2E CI
> (`.github/workflows/e2e.yml`) may still be pending — do not wait for it, do
> not create it, and do not touch anything under `.github/`.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin** — an Evernote-class AI note app:
vanilla ES-module frontend (`authentication/`), Node 22 + Express 4 ESM unified
API on :5000 (`backend/`), dual-driver Postgres/node:sqlite data layer.

Shipped and verified on `main`: auth (JWT + rotating refresh + OTP), full notes
CRUD/trash/share, offline PWA shell, the AI quartet — summarize, suggest-title,
suggest-tags, chat-with-note (+ its streaming sibling via #22) — and
**WP-AI-004: the writing assistant** with three actions on
`POST /api/notes/:id/assist` (`continue`, `rephrase`, `shorten`).

Your single task: **WP-AI-004b — finish the assistant.** Two halves:

1. **Backend (the core of this WP):** the promised fourth action **`expand`** —
   selection-based like rephrase/shorten — landed through the EXISTING
   endpoint, limiter, contract, and mock/groq split. The controller does not
   change by one line.
2. **Client (thin, zero-dependency):** a floating **selection bubble menu**
   (Rephrase / Shorten / Expand) that surfaces when the user selects text in
   the editor, plus the new `Expand selection` entry in the existing ✍ Assist
   dropdown. Both UIs call ONE shared action runner — no forked logic.

Operating rules:
1. **Extend, don't replace.** The `/assist` request/response contract is
   frozen (`200 {suggestion, action, provider}`; locked 400/404/429/503
   messages). You only widen the action vocabulary.
2. **Zero new npm dependencies.** No `@tiptap/extension-bubble-menu`, no
   floating-ui, nothing. The bubble is hand-rolled DOM positioned with
   `editor.view.coordsAtPos()` from the already-bundled `@tiptap/core`.
3. **One shared budget.** `expand` rides the SAME `assistLimit`
   (5/15 min/IP). Same file-and-forget rule as streaming chat: a new action
   is not a rate-limit escape hatch.
4. **Determinism is sacred.** Keyless mock mode must answer `expand` with a
   byte-exact string the E2E asserts. No randomness, no timers.
5. **Consent has exactly one path.** The server suggests; only the client's
   Apply button mutates the editor, via `insertContentAt` → `onEdit()` → the
   existing 900 ms autosave. The bubble menu must funnel into the SAME runner
   and the SAME Apply bar as the dropdown.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18 on main @ `3e15462`)

```
backend/src/lib/ai/prompts.js  (WP-AI-004 block, tail of file)
  export const ASSIST_ACTIONS = ['continue', 'rephrase', 'shorten'];
  export const ASSIST_SYSTEM  = { continue:…, rephrase:…, shorten:… };
  export function assistUserPrompt(action, text) `${ACTION}:\n${text}`
  MAX_ASSIST_CONTEXT_CHARS=3000 · MAX_ASSIST_INPUT_CHARS=2000
  MAX_ASSIST_OUTPUT_CHARS=800  · MIN_ASSIST_NOTE_CHARS=40

backend/src/controllers/aiController.js  @ ~L167
  assistNoteController(req, res):
    ownership SELECT … WHERE id=$1 AND "userId"=$2 → 404 'Note not found'
    isTrashed guard → 400 'Restore the note before using AI'
    !ASSIST_ACTIONS.includes(action) → 400 'Unknown assist action'
    action==='continue' → note-derived tail (≥40 chars else locked 400)
    ELSE → req.body.text trimmed, 1–2000 chars else
           400 'Select some text first (1–2000 characters)'
    → assistWrite(action, sourceText) → 200 {suggestion, action, provider}
    AI_PROVIDER_ERROR → 503 {'AI is busy right now — try again in a moment'}
    other error → console.error + 500 'Could not assist with that text'
  ▸ ALLOWLIST IS DATA-DRIVEN. Adding 'expand' to ASSIST_ACTIONS puts
    'expand' through the selection branch with zero controller edits.

backend/src/lib/ai/provider.js
  mockAssist(action, input)      @ ~L369  — continue / rephrase / generic-shorten
  assistWithGroq(action, input)  @ ~L381  — GROQ_URL, GROQ_MODEL, AbortController
        REQUEST_TIMEOUT_MS (20 000), temperature (0.4 continue else 0.2),
        max_tokens 300, system = ASSIST_SYSTEM[action]  ▸ DO NOT RETUNE
  assistWrite(action, text)      @ ~L415  — trims+caps input, picks
        groq-if-GROQ_API_KEY-else-mock, slices output to 800, logs '[AI] assist via …'

backend/src/routes/noteRoutes.js  (tail)
  const assistLimit = rateLimit({ windowMs: 15*60*1000, limit: 5, standardHeaders: true, legacyHeaders: false });
  router.post('/:id/assist', assistLimit, assistNoteController);
  ▸ THIS FILE DOES NOT CHANGE IN THIS WP.

backend/tests/e2e/ai-assist-smoke.spec.js
  One big authenticated-owner test: signup → note → guard matrix
  (401 unauth / 400 unknown action / 400 empty selection / 400 >2000 /
   400 short-note continue / 400 trashed / 404 foreign) + mock byte-exact
  assertions — rephrase on fixture 'The checklist is clear. The rehearsal
  happens Friday.' ⇒ 'The rehearsal happens Friday. The checklist is clear.';
  shorten ⇒ 'The checklist is clear.'  + suggestion length ≤ 800 checks.
  Helper at top asserts 200 & suggestion ∈ (0, 800].

authentication/app.html
  #assistBtn (✍ Assist, toolbar) @ ~L232
  #assistMenu (absolute dropdown) @ ~L240 — three <button data-action=…>
  #aiAssistBar / #aiAssistLabel / #aiAssistText / #aiAssistApply / #aiAssistDismiss @ ~L294

authentication/app.js
  state: assistBtn/assistMenu/… refs @ ~L117, assistAction/assistRange/
         assistInFlight/assistSuggestion/assistNoteId @ ~L124
  hideAiAssist() @ ~L507 · called on every view/selection change (~L472/557/648/1167)
  editor config (L951+): onUpdate @ ~L967,
        onSelectionUpdate: () => updateToolbar(),  @ ~L974
  setAssistControlsPending(pending) @ ~L1393 — disables assistBtn, menu
        buttons, Apply, Dismiss
  assistMenu click handler @ ~L1407 — ENTIRE request flow (guards →
        fetchWithAuth POST {action[,text]} → bar fill, labels by ternary,
        messages:
          200 empty suggestion → 'AI is busy right now — try again in a moment.'
          400 → payload.message || 'Could not create a writing suggestion'
          429 → 'AI rate limit reached — try again in a few minutes.'
          else → 'AI is busy right now — try again in a moment.')
  Apply handler @ ~L1473 — stale-note guard (selectedId!==assistNoteId),
        stale-range guard (assistRange.to > doc size → hide),
        continue → insertContentAt(end-of-doc), else insertContentAt(assistRange),
        then onEdit(); hideAiAssist(); focus.

authentication/app.css
  .app-ai-assist-menu {…}      L727–730  (dropdown styles — reuse palette)
  .app-ai-assist {…}           L731–739  (apply-bar styles)
  ▸ The prefers-reduced-motion KILL-SWITCH is the LAST rule of this file and
    MUST REMAIN LAST. Insert anything new before it.

authentication/sw.js           CACHE_NAME = 'notin-shell-v12' (post-#22)
authentication/app.bundle.js   esbuild artifact — NEVER hand-edit
```

Line numbers above were audited at `3e15462`; after #22 merges, re-locate
anchors by symbol name — everything you touch is outside the streaming diff
except `app.js` chat state (leave it alone).

---

## PART 3 — THE WORK

### Spec 1 — `backend/src/lib/ai/prompts.js` (backend core)

1. Widen the action vocabulary, keeping order locked:
   ```js
   export const ASSIST_ACTIONS = ['continue', 'rephrase', 'shorten', 'expand'];
   ```
2. Append the fourth system prompt (tone matches the other three — plain,
   single-purpose, no markdown):
   ```js
   expand: 'You expand text. Rewrite the given text with more detail: keep every original point, add at most two supporting sentences, and end with one concrete next step. Plain prose, no headings, no preamble.',
   ```
3. NOTHING else in this file changes. Caps (`MAX_ASSIST_INPUT_CHARS` 2000 →
   selection branch; `MAX_ASSIST_OUTPUT_CHARS` 800) already fit `expand`.

### Spec 2 — `backend/src/lib/ai/provider.js` (backend core)

1. In `mockAssist`, insert the `expand` branch AFTER the `rephrase` branch
   and BEFORE the generic shorten tail (order matters — the tail is the
   fall-through). Exact code:
   ```js
   if (action === 'expand') {
     return `${sentences[0]} Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.`;
   }
   ```
   On the E2E fixture `The checklist is clear. The rehearsal happens Friday.`
   this deterministically returns:
   `The checklist is clear. Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.`
2. Do NOT touch `assistWithGroq` (temperature, `max_tokens: 300`,
   `REQUEST_TIMEOUT_MS`, headers) or `assistWrite` — `ASSIST_SYSTEM[action]`
   picks the new prompt up automatically.
3. One comment line above the branch: `// WP-AI-004b — expand action (deterministic mock)`.

### Spec 3 — `backend/src/controllers/aiController.js` & `noteRoutes.js`

**DO NOT EDIT EITHER FILE.** Verify by reading that `assistNoteController`'s
allowlist reads `ASSIST_ACTIONS` and that the `else` branch handles
selection-based actions generically. If you find yourself editing these
files, you are off-spec — stop and re-read PART 2. (Mention this negative
confirmation in your PR description.)

### Spec 4 — Client (`authentication/`)

#### 4a — `app.html`
1. In `#assistMenu`, after the `shorten` button, add:
   ```html
   <button type="button" data-action="expand">Expand selection</button>
   ```
2. Immediately after the `#aiAssistBar` div (≈ L303), add the bubble:
   ```html
   <!-- WP-AI-004b — zero-dependency floating selection menu; same runner, same Apply bar -->
   <div class="app-ai-assist-bubble" id="aiBubbleMenu" role="menu" hidden>
     <button type="button" role="menuitem" data-action="rephrase">Rephrase</button>
     <button type="button" role="menuitem" data-action="shorten">Shorten</button>
     <button type="button" role="menuitem" data-action="expand">Expand</button>
   </div>
   ```
   `continue` is deliberately NOT in the bubble — it is a note-level action
   that needs no selection; it stays dropdown-only.

#### 4b — `app.js`
1. Ref + state: `const aiBubbleMenu = document.getElementById('aiBubbleMenu');`
   beside the other assist refs (~L117).
2. Extract the ENTIRE assistMenu click-handler body (~L1407–1471) into
   `async function runAssist(action){ … }` — guards, fetch, status branches,
   bar fill: behavior byte-identical. Then:
   ```js
   if(assistMenu) assistMenu.addEventListener('click', (event)=>{
     const control = event.target.closest('button[data-action]');
     if(!control || !assistMenu.contains(control)) return;
     runAssist(control.dataset.action);
   });
   if(aiBubbleMenu) aiBubbleMenu.addEventListener('mousedown', (event)=>event.preventDefault()); // keep editor focus + selection
   if(aiBubbleMenu) aiBubbleMenu.addEventListener('click', (event)=>{
     const control = event.target.closest('button[data-action]');
     if(!control || assistInFlight) return;
     aiBubbleMenu.hidden = true;
     runAssist(control.dataset.action);
   });
   ```
3. Inside `runAssist`: widen the allowlist line to
   `if(!['continue','rephrase','shorten','expand'].includes(action)) return;`
   and replace the label ternary with a lookup:
   ```js
   const ASSIST_LABELS = { continue:'✍ Continue suggestion', rephrase:'✍ Rephrase suggestion', shorten:'✍ Shorten suggestion', expand:'✍ Expand suggestion' };
   ```
4. Visibility engine — add `function syncAssistBubble(){…}` implementing
   EXACTLY these rules:
   ```js
   function syncAssistBubble(){
     if(!aiBubbleMenu || !editor) return;
     const note = notes.find(item=>item.id===selectedId);
     const selection = editor.state.selection;
     const selText = selection.empty ? '' : editor.state.doc.textBetween(selection.from, selection.to, ' ').trim();
     if(assistInFlight || currentView !== 'notes' || !note || note.isTrashed || offlineReadOnly || !selText){
       aiBubbleMenu.hidden = true;
       return;
     }
     const rect = editor.view.coordsAtPos(selection.to); // @tiptap/core — no new deps
     aiBubbleMenu.style.top = `${Math.max(8, rect.bottom + 8)}px`;
     aiBubbleMenu.style.left = `${Math.max(8, rect.left)}px`;
     aiBubbleMenu.hidden = false;
     // clamp off-viewport right edge after layout
     const w = aiBubbleMenu.offsetWidth;
     if(w && rect.left + w > window.innerWidth - 8){
       aiBubbleMenu.style.left = `${Math.max(8, window.innerWidth - w - 8)}px`;
     }
   }
   ```
   Wire it: change the editor config line to
   `onSelectionUpdate: () => { updateToolbar(); syncAssistBubble(); },`
   and add a sibling `onBlur: () => { if(aiBubbleMenu) aiBubbleMenu.hidden = true; },`
   (the mousedown-preventDefault above makes blur rare and keeps clicks safe).
   Also hide on Escape:
   ```js
   document.addEventListener('keydown', (event)=>{
     if(event.key === 'Escape' && aiBubbleMenu && !aiBubbleMenu.hidden) aiBubbleMenu.hidden = true;
   });
   ```
   Add ONE passive `scroll` listener on the editor column's scroll container
   (locate it in `app.html` — the element that actually scrolls
   `#tiptapEditor`) that hides the bubble: stale coordinates are worse than
   a re-select. Finally: call `if(aiBubbleMenu) aiBubbleMenu.hidden = true;`
   inside `hideAiAssist()` so every existing view-change reset kills the
   bubble too.
5. `setAssistControlsPending`: add
   `aiBubbleMenu?.querySelectorAll('button').forEach(button=>{ button.disabled = pending; });`
6. Apply path: ZERO changes. Selection-based `expand` replaces the selection
   exactly like rephrase/shorten — that is the intent of the action.

#### 4c — `app.css`
Insert BEFORE the reduced-motion kill-switch (which stays LAST):
```css
/* WP-AI-004b — floating selection bubble menu (zero-dependency positioning) */
.app-ai-assist-bubble{position:fixed;z-index:30;display:flex;gap:4px;padding:5px;border:1px solid #46543b;border-radius:10px;background:#1b2118;box-shadow:0 12px 30px rgba(0,0,0,.34)}
.app-ai-assist-bubble button{border:0;border-radius:7px;background:transparent;color:#d9e7cf;padding:7px 10px;font:600 12px/1.2 "Inter",sans-serif;cursor:pointer}
.app-ai-assist-bubble button:hover,.app-ai-assist-bubble button:focus-visible{outline:0;background:#2a3324;color:var(--env-green)}
.app-ai-assist-bubble button:disabled{opacity:.5;cursor:wait}
```
Palette is copied from `.app-ai-assist-menu` (L727–730) — do not invent colors.

#### 4d — Shell bookkeeping
```bash
cd authentication && npm run build:app     # esbuild rebundles; never hand-edit app.bundle.js
```
Bump `CACHE_NAME` in `authentication/sw.js`: `notin-shell-v12` →
`notin-shell-v13` (exactly one step; confirms you branched post-#22).

### Spec 5 — E2E (`backend/tests/e2e/ai-assist-smoke.spec.js`)

EXTEND the existing big test — do not restructure it. After the `shorten`
byte-exact assertion add, using the SAME selection fixture text:
1. `expand` request ⇒ 200, and
   ```js
   expect(expandPayload.suggestion).toBe('The checklist is clear. Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.');
   expect(expandPayload.provider).toBe('mock');           // keyless run
   expect(expandPayload.suggestion.length).toBeLessThanOrEqual(800);
   ```
2. Guard rows for `expand` mirroring the existing pattern: empty `text` →
   400 `'Select some text first (1–2000 characters)'`; 2001-char `text` →
   400 same message; unknown action still 400 `'Unknown assist action'`.
3. Do not touch the streaming spec, other smoke specs, or the API-first
   boot helpers. New comment header: `// WP-AI-004b — expand action`.

### Spec 6 — PROJECT_BIBLE.md (living doc)

Append ONE entry in the established style (mirror the WP-AI-003b entry's
shape), covering: expand action backend (data-driven allowlist, locked mock
string), zero-dep bubble menu (coordsAtPos, onBlur/Escape/scroll hides),
shared `assistLimit` unchanged, consent still only via Apply→`onEdit()`,
shell v12→v13. Update the PWA line's cache name to `notin-shell-v13` and the
AI capability line's `/assist` note to read `(continue/rephrase/shorten/expand)`.

---

## PART 4 — VERIFICATION (run all, paste outputs in your PR)

1. **Keyless E2E** (no `GROQ_API_KEY`; in-memory limiters ⇒ restart the API
   process first): migrate DB, boot server on :5000, then
   `npx playwright test tests/e2e/ai-assist-smoke.spec.js` (+ the chat-stream
   and ai-chat smokes untouched-by-you must still pass). Request-only specs
   — Arena-class sandboxes may block browser installs.
2. **Deterministic mock proof**: `node --input-type=module -e` one-liner
   calling `assistWrite('expand', fixture)` twice → identical locked string.
3. **Negative confirmation**: `git diff --name-only` MUST NOT list
   `aiController.js`, `noteRoutes.js`, `provider.js`'s groq block.
4. **Shell build**: `cd authentication && npm run build:app` exits 0;
   `grep -n "notin-shell-v13" sw.js` hits once; `grep -c "kill-switch"` —
   reduced-motion rule is still the LAST rule of `app.css` (`tail -20`).
5. **Manual UAT script** (describe step results in PR): open a note ≥
   40 chars → select a sentence → bubble appears below-right of selection →
   click **Expand** → Working… → suggestion bar titled `✍ Expand suggestion`
   → **Apply** → selection replaced inline → save status flips → reload →
   text persisted (proof the only write path is Apply→autosave) → Dismiss
   path leaves the doc untouched → collapsed selection shows no bubble →
   trash view shows no bubble.

---

## PART 5 — SHIP RULES

**Definition of Done** — every box or do not open the PR:
□ `expand` works end-to-end keyless with the locked mock string
□ no diff in `aiController.js` / `noteRoutes.js`; groq block byte-untouched
□ same `assistLimit`, same budget, same messages — no new limiter anywhere
□ bubble + dropdown share `runAssist`; both end at the SAME Apply bar
□ persist path unchanged: Apply → `insertContentAt` → `onEdit()`; server
  never writes the note
□ zero new dependencies (`git diff authentication/package.json` empty)
□ E2E green; bundle rebuilt; `notin-shell-v13`; kill-switch last in app.css
□ PROJECT_BIBLE.md appended; PR title
  `WP-AI-004b: expand action + zero-dependency selection bubble menu`

**Hard NO list:** no BubbleMenu extension package · no floating-ui · no innerHTML
(anywhere — suggestion fills via `textContent`) · no streaming · no persistence
of suggestions · no second limiter or budget raise · no edits to the chat,
streaming, summary, title, or tags flows · no `.github/` changes · no new
files beyond the two test edits already listed (there are none — you edit 8
existing files total: prompts.js, provider.js, app.html, app.js, app.css,
sw.js, app.bundle.js ✱generated, ai-assist-smoke.spec.js, PROJECT_BIBLE.md).

**Honest-gaps clause:** your final message must include (a) the evidence
outputs from PART 4 verbatim, and (b) a "NOT done" list — anything deferred,
skipped, or guessed, including UAT steps you could not physically run. A
clean-looking PR with an empty gaps list is treated as a red flag.
