╔══════════════════════════════════════════════════════════════╗
║ LM ARENA AGENT INSTRUCTION                                   ║
║ Feature: WP-AI-001 — AI Note Summarization                   ║
║ Phase: 2 (AI Layer) · Priority: Critical · Est: 1 session    ║
╚══════════════════════════════════════════════════════════════╝

# WP-AI-001 — AI Note Summarization

## CONTEXT (What already exists — do not rebuild any of this)

> **STATE NOTE (2026-08-11):** repo has advanced to commit `8e7545c` (PR #11 —
> Evernote dark Home shell). Your editor-action anchors (`#shareBtn`,
> `#saveStatus`, `div.app-editor-actions`, `#sharePanel`, `#tagRow`) were
> re-verified present in the new `app.html` (now ~lines 213–238). This
> instruction also **fixes a live bug**: PR #11 changed `app.bundle.js`
> WITHOUT bumping the SW cache name, so PWA users are pinned to the stale
> bundle. Your mandatory `notin-shell-v4 → v5` bump repairs that.

You are working in the **Notin** monorepo: an Evernote-class note app.
Stack: **Node 22 + Express 4 (ESM)**, PostgreSQL with a **SQLite dev fallback**
(`node:sqlite`), vanilla-JS app shell with **TipTap** editor, Playwright E2E.
Everything runs through ONE unified API on **port 5000** (`backend/src/server.js`),
which also serves the app UI from `authentication/`.

Relevant existing files:

- `backend/src/server.js` — Express app. Routes mounted at lines 76–93. Auth UI static serving, CORS, helmet already handled.
- `backend/src/middleware/auth.js` — Bearer-JWT guard; sets `req.userId`. Apply via `router.use(auth)`.
- `backend/src/config/db.js` — data layer. Use `db.query(sql, params)` with **`$1`-style placeholders** (auto-converted to `?` for SQLite). Boolean columns: Postgres uses `TRUE/FALSE`, SQLite uses `1/0`. `db.usePostgres` tells you which driver is active.
- `backend/src/db/migrate.js` — sequential migrations for BOTH dialects: `migratePostgres(pool)` and `migrateSqlite(path)`. Column-add pattern for Postgres: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`; for SQLite: `try { ALTER TABLE ... ADD COLUMN ... } catch(e){ if(!String(e.message).includes('duplicate column')) throw e; }`.
- `backend/src/controllers/noteController.js` + `backend/src/routes/noteRoutes.js` — notes CRUD. The note-scoped action pattern you must copy is `POST /api/notes/:id/share` (see `backend/src/controllers/shareController.js`): ownership check via `SELECT ... FROM "Note" WHERE id = $1 AND "userId" = $2`.
- `backend/src/routes/authRoutes.js` — rate-limiter pattern: `rateLimit({ windowMs: 15*60*1000, limit: N, standardHeaders: true, legacyHeaders: false })` (`express-rate-limit` is already a dependency).
- `backend/.env.example` — env template; `.env` is gitignored.
- `authentication/app.html` — app markup. The editor action bar is the `div.app-editor-actions` block (~lines 179–194) containing `#pinBtn`, `#noteNotebookSelect`, `#shareBtn`, `#saveStatus`, `#saveBtn`, `#trashBtn`…
- `authentication/app.js` — 1,900-line app logic. Key helpers you MUST reuse: `fetchWithAuth(url, opts)` (handles Bearer token + 401→refresh→retry), `setSaveStatus(text, className)`, `setError(msg)`, the `notes` array in memory, `selectedId` (currently open note id). After editing `app.js` you MUST rebuild the bundle: `cd authentication && npm run build:app`.
- `authentication/sw.js` — service worker caches `app.bundle.js`; cache name is currently `'notin-shell-v4'` and MUST be bumped to `'notin-shell-v5'` when the bundle changes.
- `backend/tests/e2e/mvp-smoke.spec.js` — E2E patterns: `requestFactory`, signup via `POST /api/users/signup` returning `accessToken`, Playwright `request` contexts.

**The `Note` table columns today:** `id, title, description, contentJson, contentText, isTrashed, isPinned, trashedAt, notebookId, userId, createdAt, updatedAt`. There is NO `summary` column yet. There is NO AI code anywhere in the repo.

## TASK (What to build — ONE feature, fully specified)

Users can click **"Summarize"** on an open note; the backend generates a 3–5
sentence AI summary of the note's text, stores it in a new `Note.summary`
column, and the UI shows it in a card above the editor. Re-clicking
regenerates. The summary persists and reappears whenever the note is opened.

The AI provider is **Groq** (OpenAI-compatible REST) when `GROQ_API_KEY` is
set, and a **deterministic mock** when it is not — the entire feature must
work end-to-end (and pass E2E) with no API key.

## FILES TO CREATE

1. `backend/src/lib/ai/provider.js`
2. `backend/src/lib/ai/prompts.js`
3. `backend/src/controllers/aiController.js`
4. `backend/tests/e2e/ai-smoke.spec.js`

## FILES TO MODIFY

1. `backend/src/db/migrate.js` — add the `summary` column (both dialects)
2. `backend/src/config/db.js` — include `summary` in the 4 note SELECT/RETURNING column lists (`note.create`, `note.findMany`, `note.findFirst`, `note.update`) and allow setting it via `note.update`
3. `backend/src/routes/noteRoutes.js` — mount `POST /:id/summarize`
4. `backend/src/server.js` — nothing needed IF the route lives under `/api/notes` (preferred — it already mounts `noteRoutes`)
5. `backend/.env.example` — document `GROQ_API_KEY`
6. `authentication/app.html` — Summarize button + summary card markup
7. `authentication/app.js` — wiring (spec below)
8. `authentication/sw.js` — bump cache name to `notin-shell-v5`
9. `backend/src/controllers/accountController.js` — include `summary` in the export payload's note objects
10. `PROJECT_BIBLE.md` — mark WP-AI-001 done in COMPLETED FEATURES

## EXACT SPECIFICATIONS

### 1. Migration (`backend/src/db/migrate.js`)

Add a new labeled step `// WP-AI-001 — AI summary column on Note` in **both** functions:

- In `migratePostgres`, immediately AFTER the WP-APP-007 `isPinned` block
  (the `CREATE INDEX IF NOT EXISTS "Note_isTrashed_idx"` line, ~line 87):
  ```js
  await pool.query(`ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS summary TEXT;`);
  ```
- In `migrateSqlite`, immediately AFTER the `Note_isTrashed_idx` index line
  (~line 251, before the WP-APP-005 Notebook block):
  ```js
  try { db.exec(`ALTER TABLE "Note" ADD COLUMN summary TEXT`); } catch (e) { if (!String(e.message).includes('duplicate column')) throw e; }
  ```
Must be idempotent — running `npm run db:migrate` twice must not fail.

### 2. Data layer (`backend/src/config/db.js`)

- Add `summary` to the SELECT/RETURNING column lists in exactly 4 places:
  `note.create` (the RETURNING clause), `note.findMany`, `note.findFirst`,
  `note.update` (the RETURNING clause). Place it after `"contentText"`.
- In `note.update`, support `if (data.summary !== undefined) { sets.push(\`summary = $${idx++}\`); params.push(data.summary); }` — accept `null` (clears it).
- No mapping/coercion needed — `summary` is plain nullable TEXT.

### 3. Prompts (`backend/src/lib/ai/prompts.js`)

```js
export const SUMMARIZE_SYSTEM = 'You summarize notes. Reply with 3 to 5 sentences of plain prose that capture the note\'s key points. No markdown, no headings, no bullet points, no preamble.';
export function summarizeUserPrompt(text) { return `Summarize this note:\n\n${text}`; }
export const MAX_INPUT_CHARS = 6000; // truncate input before sending
```

### 4. Provider (`backend/src/lib/ai/provider.js`)

Export `async function summarizeText(text) → { summary, provider }`.

- Normalize: trim, truncate to `MAX_INPUT_CHARS`.
- **If `process.env.GROQ_API_KEY` is set**: POST to
  `https://api.groq.com/openai/v1/chat/completions` using global `fetch`:
  headers `Authorization: Bearer <key>`, `Content-Type: application/json`;
  body `{ model: 'llama-3.1-8b-instant', temperature: 0.3, max_tokens: 300,
  messages: [{role:'system',...},{role:'user',...}] }`.
  Use `AbortController` with a **20 000 ms** timeout. On non-2xx, timeout, or
  network error → `throw new Error('AI_PROVIDER_ERROR')`. Parse
  `choices[0].message.content`, trim; if empty → throw. Return
  `{ summary, provider: 'groq' }`. Do NOT use any SDK — no new dependencies.
- **Else (mock mode)**: deterministic, no randomness: take the input, split
  into sentences on `/[^.!?]*[.!?]+/g` matches (fallback: the raw text),
  take the first 3 non-empty sentences, join with spaces; if the result is
  under 80 chars, append `' This note is still short — keep writing to get richer summaries.'`; hard-cap at 500 chars. Return `{ summary, provider: 'mock' }`.
- Log one line: `console.log(\`[AI] summarize via ${provider}\`)`. Never log the note content.

### 5. Controller (`backend/src/controllers/aiController.js`)

Export `summarizeNote`:

1. `req.userId` + `req.params.id` come pre-authenticated (route uses `auth`).
2. Load the note with ownership check:
   `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`.
   Not found → **404** `{ message: 'Note not found' }`. Trashed → **400** `{ message: 'Restore the note before summarizing' }`.
3. Source text = `contentText` if non-empty after trim, else `description`.
   If trimmed length **< 200** → **400** `{ message: 'Note is too short to summarize (needs at least 200 characters)' }`.
4. `const { summary, provider } = await summarizeText(sourceText);`
5. Persist: `UPDATE "Note" SET summary = $1, "updatedAt" = $2 WHERE id = $3 AND "userId" = $4`.
6. Respond **200** `{ summary, provider }`.
7. Catch: if `error.message === 'AI_PROVIDER_ERROR'` → **503** `{ message: 'AI is busy right now — try again in a moment' }`. Anything else → `console.error` + **500** `{ message: 'Could not summarize this note' }`. Never send the provider's error text to the client.

### 6. Route (`backend/src/routes/noteRoutes.js`)

After the existing restore line (`router.post('/:id/restore', restoreNote);`):

```js
import { summarizeNote } from '../controllers/aiController.js';
import rateLimit from 'express-rate-limit';
const aiLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/:id/summarize', aiLimit, summarizeNote);
```

### 7. Env (`backend/.env.example`)

Append a section:
```
# ── AI (Phase 2) ──
# Groq API key (https://console.groq.com). Leave blank to run AI features in
# deterministic mock mode (no network calls) — used by E2E and local dev.
GROQ_API_KEY=
```

### 8. UI markup (`authentication/app.html`)

- Inside `div.app-editor-actions`, immediately BEFORE the `#shareBtn` button, add:
  ```html
  <button type="button" class="app-ai-btn" id="summarizeBtn" hidden>✨ Summarize</button>
  ```
- Immediately AFTER the closing `</div>` of the `#sharePanel` panel (~line 202, before the `#tagRow` div), add:
  ```html
  <div class="app-ai-summary" id="aiSummaryCard" hidden>
    <div class="app-ai-summary-head"><span>✨ AI summary</span><button type="button" id="aiSummaryDismiss" aria-label="Dismiss summary">×</button></div>
    <p id="aiSummaryText"></p>
    <small id="aiSummaryMeta"></small>
  </div>
  ```
- Add minimal styles to `authentication/styles.css` for `.app-ai-btn` (ghost button matching `.app-share-btn` style) and `.app-ai-summary` (soft card, 1px border, rounded, small text; `#aiSummaryMeta` muted). Follow existing tokens in the file.

### 9. UI logic (`authentication/app.js`)

Wire the button exactly like existing editor actions:

1. Grab elements by id at the top with the other `getElementById` block: `summarizeBtn`, `aiSummaryCard`, `aiSummaryText`, `aiSummaryMeta`, `aiSummaryDismiss`.
2. **Visibility**: wherever the existing code shows/hides `shareBtn` for an open non-trashed note, show `summarizeBtn` under the same conditions (visible when a note is selected AND not trashed; `hidden` otherwise). When a note opens, if `note.summary` is non-empty render the card immediately with meta text `'Saved summary — regenerate after edits.'`; otherwise keep the card hidden.
3. **Click handler** on `summarizeBtn`:
   - Guard: no `selectedId` → return. Disable the button, set its text to `'Summarizing…'`.
   - `const res = await fetchWithAuth(\`${API_BASE}/api/notes/${selectedId}/summarize\`, { method: 'POST' });`
   - On 200: parse JSON; update the in-memory note object in `notes` (`n.summary = summary`); set `aiSummaryText.textContent = summary` (never innerHTML); meta = `provider === 'mock' ? 'Demo summary (no AI key configured)' : 'Generated just now'`; un-hide the card; setSaveStatus untouched.
   - On 400: read `message` from JSON and show it via `setError(message)`.
   - On 429: `setError('AI rate limit reached — try again in a few minutes.')`.
   - On 503/other: `setError('AI is busy right now — try again in a moment.')`.
   - `finally`: re-enable button, restore label `'✨ Summarize'`.
4. `aiSummaryDismiss` click → hide the card (does NOT clear the stored summary).
5. When switching notes or views, hide the card, then re-apply step 2 for the newly opened note.

Then run `cd authentication && npm run build:app` and bump the SW cache name in `authentication/sw.js` from `notin-shell-v4` to `notin-shell-v5` (both the const and the key-prefix logic already use it).

### 10. Export (`backend/src/controllers/accountController.js`)

In `exportAccount`'s notes SELECT, add `n.summary`, and include `summary: note.summary || null` in each exported note object.

### 11. E2E (`backend/tests/e2e/ai-smoke.spec.js`)

API-level test (no browser needed — use the `request` fixture exactly like the account test in `mvp-smoke.spec.js`; same `baseURL` config). Steps:

1. Signup a fresh unique user; take `accessToken`.
2. Create a note whose `contentText` is ≥ 300 chars of real sentences.
3. `POST /api/notes/:id/summarize` without auth → expect **401**.
4. With auth → expect **200**, body has non-empty string `summary` and `provider` ∈ {`groq`,`mock`}.
5. `GET /api/notes` → the note object contains the same `summary`.
6. Create a second note with a 50-char body → summarize → expect **400**.
7. Signup a second user, have them POST summarize on the first user's note → expect **404**.
8. Reuse the playwright config (`webServer` already boots the API). The test MUST pass with `GROQ_API_KEY` unset (mock mode).

## DATA FLOW (summary)

```
[✨ Summarize] → fetchWithAuth POST /api/notes/:id/summarize
  → auth middleware (JWT → req.userId)
  → rate limit 5/15min
  → aiController: ownership check → length check → provider.summarizeText()
      ├─ GROQ_API_KEY set  → Groq REST (20s timeout)
      └─ unset             → deterministic mock
  → UPDATE "Note" SET summary ...
  → 200 {summary, provider} → UI renders card + updates in-memory note
```

## TYPESCRIPT / CODE STANDARDS (this repo is JS ESM — adapt accordingly)

- ESM imports/exports, matching existing file style (see noteRoutes.js).
- No new npm dependencies. `fetch` is global in Node 22.
- Every async path wrapped in try/catch; responses always `{ message }` or the documented shapes.
- Validate everything; no trust of client input.
- No `console.log` of note content, tokens, or keys.

## DO NOT

→ Do NOT add any npm dependency (no groq-sdk, no openai, no axios).
→ Do NOT touch auth flows, JWT handling, token storage, cookie paths, ports, or CORS config.
→ Do NOT create a separate `/api/ai` router — the endpoint lives under the existing `/api/notes` router.
→ Do NOT use Postgres-only SQL (no `ILIKE`, no `ON CONFLICT` extras) in new queries without a SQLite-compatible form.
→ Do NOT store the summary in localStorage/IndexedDB beyond what the existing note-cache code already persists automatically.
→ Do NOT auto-regenerate summaries on note edit — regeneration is manual-only in v1.
→ Do NOT stream the response — plain JSON for v1.
→ Do NOT implement title generation, tag suggestions, or chat — those are separate work packages.
→ Do NOT delete or modify existing E2E expectations in `mvp-smoke.spec.js`.

## ACCEPTANCE CRITERIA

□ `npm run db:migrate` succeeds twice in a row on SQLite AND the Postgres branch is syntactically valid (`ADD COLUMN IF NOT EXISTS`)
□ `POST /api/notes/:id/summarize` with auth returns 200 + `{summary, provider:'mock'}` when `GROQ_API_KEY` is unset
□ 401 unauthenticated · 404 foreign or missing note · 400 trashed note · 400 note < 200 chars · 429 after 5 calls in 15 min
□ `GET /api/notes` rows now include `summary`; opening a note with a saved summary shows the card without clicking
□ Button hidden for trashed notes; disabled with "Summarizing…" while in flight; errors surface via the existing error banner, never as raw provider text
□ Account export includes `summary`
□ `npm run build:app` executed; `sw.js` cache bumped to `notin-shell-v5`
□ New `ai-smoke.spec.js` passes AND `mvp-smoke.spec.js` still passes: `cd backend && npm run test:e2e`
□ Server boots clean (`npm start`), `/health` reports ok, no secrets in any client-served file

## AFTER THIS TASK — REPORT BACK

1. Files created (list)
2. Files modified (list)
3. Any decisions you made that weren't specified
4. E2E results (pass/fail counts)
5. Any blockers encountered
