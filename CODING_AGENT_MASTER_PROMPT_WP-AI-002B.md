# CODING AGENT MASTER PROMPT — Notin · Task WP-AI-002b

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI note-taking
web app. Shipped and verified so far: **WP-AI-001** (note summarization —
Groq/mock provider, `AI_PROVIDER_ERROR` normalization, note-scoped AI routes)
and **WP-AI-002** (AI title suggestions). The note engine already has a full
tag system: `Tag` table, `NoteTag` junction, `PUT /api/notes/:id { tagIds }`
atomic replace-set with ownership validation, and an editor tag row with chips
plus an add-tag dropdown.

Your single task is **WP-AI-002b — Smart Tag Suggestions**: for notes that
have content but few tags, the app suggests 3–5 tags as clickable chips.
Clicking a chip applies the tag through the EXISTING, already-tested tag
write path. Nothing else.

Operating rules:
1. **Reuse proven plumbing.** Copy the WP-AI-001/002 provider/controller/route
   patterns exactly — same error normalization, ownership checks, rate limiting.
2. **The server never writes tags.** It only suggests. The client applies via
   the existing `POST /api/tags` + `PUT /api/notes/:id { tagIds }` flows —
   user consent on every tag, zero new write paths.
3. **Break nothing.** Every E2E-locked selector below survives untouched.

---

## PART 2 — REPO GROUND TRUTH

**Required baseline:** main containing WP-AI-001 + WP-AI-001's UI (PR #12)
**and WP-AI-002** (`provider.js` must already contain `suggestTitle`). If your
tree lacks any of it, branch from a commit that has it — this task extends those
files directly.

```
Notin/
├── backend/                        ← Node 22 + Express 4 (ESM), unified API :5000
│   ├── src/config/db.js            ← dual-driver; $1 placeholders; tag helpers
│   ├── src/middleware/auth.js      ← req.userId
│   ├── src/lib/ai/provider.js      ← summarizeText() + suggestTitle()          (EXTEND)
│   ├── src/lib/ai/prompts.js       ← SUMMARIZE_* + TITLE_* constants           (EXTEND)
│   ├── src/controllers/aiController.js ← summarizeNote + suggestNoteTitle      (EXTEND)
│   ├── src/controllers/tagController.js  ← getTags/createTag/deleteTag (READ — reuse rules)
│   ├── src/routes/noteRoutes.js    ← /:id/summarize, /:id/suggest-title        (EXTEND)
│   └── tests/e2e/                  ← ai-smoke + ai-title-smoke patterns        (ADD ONE)
└── authentication/
    ├── app.html                    ← editor markup (#tagRow/#tagChips/#tagAddSelect exist;
    │                                  #aiTitleBar exists from WP-AI-002)
    ├── app.js                      ← vanilla JS (EDIT): tags[] state, renderTagChips(),
    │                                  tag-add handler, fetchWithAuth(), setError(),
    │                                  hideAiSummary/hideAiTitle + setViewChrome/
    │                                  updateEditorForSelection hooks (copy pattern)
    ├── app.bundle.js               ← NEVER hand-edit; rebuild via build:app
    ├── app.css                     ← .app-ai-summary/.app-ai-title families     (EXTEND)
    └── sw.js                       ← CACHE_NAME — bump ONE step above current
```

**Tag system facts you MUST honor (existing behavior — do not change):**
- `POST /api/tags {name}` → 201 tag · 400 empty/>50 chars · **409 case-insensitive duplicate**
- `PUT /api/notes/:id { tagIds: string[] }` → atomic REPLACE-SET; `[]` clears;
  every id ownership-validated → 400 on unknown ids
- `GET /api/notes` rows carry `tags: [{id,name}]`
- Tag names: trimmed, inner whitespace collapsed, ≤ 50 chars (server enforces)
- Editor: `#tagChips` renders current tags with × remove buttons; `#tagAddSelect`
  dropdown adds an EXISTING tag. Read the existing add/remove handlers in
  `app.js` and mirror their update logic (they refresh in-memory note + re-render).

**WP-AI plumbing to copy (from WP-AI-001/002 files):**
- Groq REST: global fetch, `llama-3.1-8b-instant`, AbortController 20 000 ms,
  every failure → `throw new Error('AI_PROVIDER_ERROR')`, one log line, no content logged
- Controller skeleton: ownership SELECT → trashed 400 → length guard 400 →
  provider call → 200 · `AI_PROVIDER_ERROR` → 503
  `{message:'AI is busy right now — try again in a moment'}` · else 500
- Route: per-endpoint `rateLimit({ windowMs: 15*60*1000, limit: 5, standardHeaders: true, legacyHeaders: false })`
- Client AI-component pattern: hidden-by-default element, hidden again on every
  view/selection change (the `hideAiSummary()`/`hideAiTitle()` call sites),
  silent background failure (no error banner), session-once guard via a `Set`

**E2E-locked (breaking these fails CI):** every ID/class/text locked before
WP-AI-001, plus WP-AI-001's (`summarizeBtn`, `aiSummaryCard`, `aiSummaryText`,
`aiSummaryMeta`, `aiSummaryDismiss`) and WP-AI-002's (`aiTitleBar`, `aiTitleText`,
`aiTitleApply`, `aiTitleDismiss`), plus the tag UI itself (`tagRow`, `tagChips`,
`tagAddSelect`, `.app-chip` behavior).

**Bundle/SW rule (non-negotiable):** after any `app.js` edit →
`cd authentication && npm run build:app`, then bump `CACHE_NAME` in
`authentication/sw.js` one step above whatever it currently is.

---

## PART 3 — THE TASK: WP-AI-002b — SMART TAG SUGGESTIONS

### What the user experiences
Open a note with ≥ 100 characters of content and fewer than 3 tags → a bar
appears under the tag row: `✨ Suggested tags: [meeting notes] [planning] [draft] [Dismiss]`.
Clicking a chip adds that tag to the note instantly (existing-tag shortcut or
create-then-attach for new names) and the chip disappears. Dismiss hides the
bar for the session. Trashed/short/well-tagged notes never trigger it.

### Files to CREATE
1. `backend/tests/e2e/ai-tags-smoke.spec.js`

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
10. `PROJECT_BIBLE.md` (mark WP-AI-002b complete)

**No database migration.** `Tag`/`NoteTag` already exist; the server writes neither.

---

### Spec 1 — Prompts (`backend/src/lib/ai/prompts.js`)

Append:
```js
export const TAGS_SYSTEM = 'You suggest tags for notes. Reply with ONLY a JSON array of 3 to 5 tags. Each tag is a short lowercase phrase, at most 25 characters, no leading #. Example: ["meeting notes","ideas","q3 planning"]';
export function tagsUserPrompt(text, existingTags) {
  const existing = existingTags.length ? `The user already uses these tags: ${existingTags.join(', ')}. Reuse relevant ones and add complementary ones.\n\n` : '';
  return `${existing}Suggest tags for this note:\n\n${text}`;
}
export const MAX_TAGS_INPUT_CHARS = 3000;
export const MAX_TAGS_COUNT = 5;
export const MAX_TAG_LEN = 25;
```

### Spec 2 — Provider (`backend/src/lib/ai/provider.js`)

Add `export async function suggestTags(text, existingTags = []) → { tags, provider }`:
- Normalize text: trim, slice to `MAX_TAGS_INPUT_CHARS`.
- **Groq path** (key set): same endpoint/model/timeout; body uses `TAGS_SYSTEM` /
  `tagsUserPrompt`, `temperature: 0.4`, `max_tokens: 120`. Non-2xx/timeout →
  `AI_PROVIDER_ERROR`. Parse `choices[0].message.content`:
  strip code fences, extract the first `[...]` block, `JSON.parse`. If parsing
  fails, regex-fallback: collect double- or single-quoted strings from the content.
  Normalize each item: `String(item).trim().toLowerCase().replace(/^#+/, '')`,
  collapse whitespace, slice to `MAX_TAG_LEN`, drop empties and non-strings,
  dedupe (first occurrence wins), cap at `MAX_TAGS_COUNT`. Zero valid tags →
  `AI_PROVIDER_ERROR`. Return `{ tags, provider: 'groq' }`.
- **Mock path** (no key), deterministic: scan the text for words matching
  `/[a-z][a-z0-9-]{3,15}/gi` on the lowercased text, keep first 3 DISTINCT
  matches in order of appearance; pad with `['notes','ideas','draft']` entries
  (skipping duplicates) until 3 items; cap 5, each ≤ 25 chars. Return
  `{ tags, provider: 'mock' }`.
- Log `[AI] tags via ${provider}` only.

### Spec 3 — Controller (`backend/src/controllers/aiController.js`)

Add `export async function suggestNoteTags(req, res)`:
1. Ownership load: `SELECT id, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`.
   Missing → **404** `{message:'Note not found'}` · trashed → **400** `{message:'Restore the note first'}`.
2. Source text = trimmed `contentText`, else `description`; length **< 100** →
   **400** `{message:'Note is too short to tag (needs at least 100 characters)'}`.
3. Load the user's existing tag names:
   `SELECT name FROM "Tag" WHERE "userId" = $1 ORDER BY name` → array of names.
4. `const { tags, provider } = await suggestTags(sourceText, existingNames);`
5. Map suggestions against existing tags (case-insensitive name match):
   respond **200** `{ tags: tags.map(name => ({ name, existing: matchedId || null })), provider }`.
6. **Do NOT create or attach anything.** Errors: `AI_PROVIDER_ERROR` → **503**
   `{message:'AI is busy right now — try again in a moment'}`; else log + **500**
   `{message:'Could not suggest tags'}`.

### Spec 4 — Route (`backend/src/routes/noteRoutes.js`)

Next to the other AI routes:
```js
const tagsLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/suggest-tags', tagsLimit, suggestNoteTags);
```

### Spec 5 — UI markup (`authentication/app.html`)

Immediately AFTER the `#aiTitleBar` div, add:
```html
<!-- WP-AI-002b — AI tag suggestions (each chip applies via the existing tag write path) -->
<div class="app-ai-tags" id="aiTagBar" hidden>
  <span class="app-ai-tags-label">✨ Suggested tags:</span>
  <span class="app-ai-tags-chips" id="aiTagChips"></span>
  <button type="button" class="app-ai-tags-dismiss" id="aiTagDismiss" aria-label="Dismiss tag suggestions">×</button>
</div>
```

### Spec 6 — UI logic (`authentication/app.js`)

Mirror the WP-AI-002 title-bar patterns exactly:

1. Refs: `aiTagBar`, `aiTagChips`, `aiTagDismiss`. State: `let aiTagNoteId = null;`
   and `const tagsSuggestedFor = new Set();` (session-only).
2. `function hideAiTags(){ if(aiTagBar) aiTagBar.hidden = true; if(aiTagChips) aiTagChips.innerHTML=''; aiTagNoteId = null; }`
   Call `hideAiTags()` at every site where `hideAiTitle()` is called.
3. `async function maybeSuggestTags(note)` — call from `updateEditorForSelection`
   after the WP-AI-002 title hook. Guards (any fails → `hideAiTags(); return`):
   note exists · not trashed · not `offlineReadOnly` · `currentView === 'notes'` ·
   not in `tagsSuggestedFor` · content length ≥ 100 · `(note.tags||[]).length < 3`.
   Add to the Set BEFORE fetching. `fetchWithAuth(\`${API_BASE}/api/notes/${note.id}/suggest-tags\`, { method:'POST' })`.
   On 200 only: if the same note is still selected, render one button per
   suggestion into `aiTagChips`: `<button type="button" class="app-ai-tag-chip" data-existing="{id|''}">`
   with `textContent = name` (build via createElement/textContent — never
   innerHTML with the tag name); store the suggestion list on `aiTagBar` via a
   `Map` keyed by name for the click handler; un-hide the bar. Any other status
   or changed selection → silent no-op. try/catch → silent.
4. Chip click handler (delegate on `aiTagChips`):
   - Resolve the suggestion (`name`, `existing` id). Disable that chip, label `Adding…`.
   - **Existing tag:** `newIds = [...current tag ids, existing]`.
   - **New tag:** `POST /api/tags {name}` → 201 gives `id`. On **409** (name
     created meanwhile): `GET /api/tags`, find the case-insensitive match, use
     its id. Then `newIds = [...current, id]`.
   - Apply: `PUT /api/notes/:id { tagIds: newIds }` via `fetchWithAuth` (mirror
     exactly what the existing tag-add dropdown handler does to update state).
     On 200: update the in-memory note's `tags`, re-render the editor tag chips
     via the existing `renderTagChips(note)`, remove the clicked suggestion chip.
   - Failures: `setError()` with a short friendly message (429 → rate-limit text);
     re-enable the chip.
5. `aiTagDismiss` → `hideAiTags()` only (Set prevents refetch).
6. Never re-suggest within the session, including after the user removes tags manually.

### Spec 7 — Styles (`authentication/app.css`)

Append near the other AI styles, same family:
```css
.app-ai-tags{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 18px 10px;padding:9px 12px;border:1px solid #3a4632;border-radius:10px;background:#1f261a;color:#d9e7cf;font-size:12.5px}
.app-ai-tags-label{color:var(--env-green);font-weight:700;flex:none}
.app-ai-tags-chips{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0}
.app-ai-tag-chip{border:1px solid #3f4a3a;border-radius:999px;background:#242c20;color:#c9d9b8;padding:4px 11px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:border-color .14s,color .14s}
.app-ai-tag-chip:hover{border-color:var(--env-green);color:var(--env-green)}
.app-ai-tag-chip:disabled{opacity:.5;cursor:wait}
.app-ai-tags-dismiss{border:0;background:transparent;color:#9bad91;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
.app-ai-tags-dismiss:hover{color:#fff}
```

### Spec 8 — E2E (`backend/tests/e2e/ai-tags-smoke.spec.js`)

Copy the `ai-title-smoke.spec.js` structure (request-fixture, keyless). One test:
1. Signup owner + foreign user.
2. Owner note with `contentText` ≥ 250 chars, no tags.
3. `POST /api/notes/:id/suggest-tags` no auth → **401**.
4. With auth → **200**: `provider` ∈ {groq, mock}; `tags` is an array of 3–5
   objects `{name, existing}`; every `name` non-empty, ≤ 25 chars; `existing`
   is `null` or a string id.
5. `GET /api/notes` → the note's `tags` is STILL empty (server must not attach).
6. Create one tag `'planning'`; suggest again on a second long note → any
   suggestion whose name equals `'planning'` (case-insensitive) carries that
   tag's id in `existing`.
7. 30-char note → **400** too-short message · foreign user → **404**.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: WP-AI-001/002 AI files, `tagController.js`, the existing tag
   add/remove handlers in `app.js`, `app.html` tag row, `ai-title-smoke.spec.js`.
2. Implement backend (Specs 1–4) → UI (5–7) → E2E (8).
3. `cd backend && npm run db:migrate` (no new step — must stay clean) · `npm start`.
4. Curl matrix: 401 · 200 mock (3–5 tags ≤25 chars) · 400 short · 404 foreign ·
   400 trashed · note tags unchanged after suggestion · existing-name mapping works.
5. `node --check authentication/app.js` · `npm run build:app` · bump `sw.js` cache one step.
6. Grep-audit ALL locked selectors from PART 2 (including WP-AI-001/002 additions).
7. Tests: restart the API for a clean rate-limit state, then
   `npx playwright test ai-smoke ai-title-smoke ai-tags-smoke` (request-only —
   run without Chromium); full `npm run test:e2e` if Chromium exists. Report honestly.
8. Update `PROJECT_BIBLE.md` COMPLETED FEATURES with WP-AI-002b.

## PART 5 — DO NOT (hard constraints)

→ Do NOT add any npm dependency.
→ Do NOT create or attach tags on the server — suggestion only; the client uses
  the existing `POST /api/tags` + `PUT tagIds` paths.
→ Do NOT modify summarization or title-suggestion behavior/UI.
→ Do NOT fire suggestions for notes that already have ≥ 3 tags, more than once
  per note per session, or outside the notes view.
→ Do NOT show error banners for background suggestion failures (silent degrade).
→ Do NOT render tag names via innerHTML (textContent/createElement only).
→ Do NOT touch landing/auth/migrations.
→ Do NOT skip bundle rebuild + SW cache bump.

## PART 6 — ACCEPTANCE CRITERIA

□ `POST /api/notes/:id/suggest-tags`: 200 `{tags:[{name,existing}],provider}` ·
  401 unauth · 404 foreign · 400 short · 400 trashed · 429 after budget
□ Note's tags in DB/API unchanged by a suggestion; existing tag names map to ids
□ Opening an under-tagged ≥100-char note shows 3–5 clickable chips once; clicking
  adds the tag through the existing write path (visible in `#tagChips` immediately)
  and removes the chip; Dismiss hides for the session
□ 409-duplicate race handled (fallback to GET /api/tags lookup)
□ Bundle rebuilt; cache bumped one step; `node --check` clean
□ All locked selectors verified unchanged; previous AI E2E specs still pass;
  new `ai-tags-smoke.spec.js` passes (or Chromium limits stated honestly)
□ No secrets/provider details client-side; `npm start` boots clean

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-AI-002b REPORT
1. Files created/modified:  [lists]
2. Server-write check:      [confirm tags NOT created/attached server-side]
3. Verification:            [curl matrix + test results, or Chromium unavailable]
4. Bundle/SW:               [old→new cache name]
5. Unspecified decisions:   [should be none or trivial]
6. Blockers:                [any]
7. Suggested next:          WP-UI-NOTES-3D-001 — do NOT start it.
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-UI-NOTES-3D-001** — smooth + 3D polish (`CODING_AGENT_MASTER_PROMPT_WP-UI-NOTES-3D.md`).
2. **WP-FUNNEL-001** — wire dead landing CTAs to auth.
3. **WP-AI-003** — chat with note (streaming, 70b model).
4. Schema sync + deploy-gate hardening.
