# CODING AGENT MASTER PROMPT — Notin · Task WP-UI-NOTES-3D-001

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**, an Evernote-class AI note-taking
web app with a dark, premium visual language. Your single task is
**WP-UI-NOTES-3D-001: make the notes experience feel smoother and give it
tasteful 3D depth** — motion, layering, and micro-interactions inside the
**notes app only** (note list, editor, home/shortcuts/organize cards).
The landing page and authentication pages are OUT OF SCOPE.

You are a motion-literate frontend engineer. Your rules:
1. **60fps or it doesn't ship.** Animate only compositor-friendly properties
   (`transform`, `opacity`). No animating `width/height/top/left/margin`.
2. **Depth without noise.** 3D = layered shadows, subtle perspective tilt,
   press physics — NOT gratuitous spinning or parallax.
3. **Respect the user.** Every animation honors `prefers-reduced-motion`.
4. **Break nothing.** All E2E-locked selectors, classes, and texts in PART 2
   must survive untouched.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-13, main @ 8e7545c + WP-UI-NOTES-001)

```
Notin/
├── authentication/           ← the APP (served by the API on :5000)
│   ├── app.html              ← app markup (IDs are E2E-locked — do not rename)
│   ├── app.js                ← ~1,930 LOC vanilla JS (EDIT)
│   ├── app.bundle.js         ← esbuild output — NEVER hand-edit; rebuild only
│   ├── app.css               ← app design system (EDIT — main surface)
│   ├── sw.js                 ← service worker; CACHE_NAME is 'notin-shell-v5'
│   └── package.json          ← script: build:app (esbuild)
└── backend/                  ← Express API on :5000 (do NOT touch for this task)
```

**Design tokens already defined in `app.css` (`:root`):**
`--env-bg:#0e0e0e` · `--env-sidebar:#161616` · `--env-panel:#1c1c1c` ·
`--env-panel-border:#2a2a2a` · `--env-card:#242424` · `--env-card-hover:#2c2c2c` ·
`--env-line:#303030` · `--env-text:#f5f5f5` · `--env-muted:#a8a8a8` ·
`--env-faint:#767676` · `--env-green:#8fe333` (brand lime) · `--env-danger:#e05c5c`

**Surfaces you will touch (current state after WP-UI-NOTES-001):**
- `.app-note-item` — note list rows (has `::before` green accent bar when `.is-active`; classes `is-pinned`, `is-active`; children `.app-note-title/.app-note-snippet/.app-note-tags/.app-note-meta/.app-note-book`; pin control `.app-note-pin`)
- `.home-note-card`, `.shortcut-card`, `.organize-card` — card grids on Home / Shortcuts / Notebooks-Tags views
- `.app-editor`, `.app-editor-header` (28px title + `.app-editor-meta` strip), `.app-toolbar` (floating pill with `.tb-btn[data-cmd]`), `.app-editor-body > .tiptap-editor`, `.app-editor-empty`
- `.app-fab`, `.btn-new`, `.app-create-note`, `.app-save` and other action buttons
- Views swap via `hidden` attribute: `.home-view`, `.shortcuts-view`, `.organize-view`, `.editor-workspace`

**Relevant `app.js` functions you will hook (read them first):**
`renderList()` (builds `.app-note-item` rows) · `renderHome()` · `renderShortcuts()` ·
`renderOrganizeView()` · `selectNote(id)` · `goToView(view)` ·
`initEditor()` (TipTap setup) · `updateToolbar()`.

**HARD CONSTRAINTS (the E2E suite locks these — breaking them fails CI):**
- IDs: `editorTitle`, `pinBtn`, `noteNotebookSelect`, `shareBtn`, `saveStatus`, `saveBtn`, `trashBtn`, `restoreBtn`, `deleteBtn`, `sharePanel`, `shareLinkInput`, `copyShareBtn`, `revokeShareBtn`, `shareStatus`, `tagRow`, `tagChips`, `tagAddSelect`, `attachmentRow`, `attachImageBtn`, `attachmentGallery`, `toolbar`, `tiptapEditor`, `noteList`, `searchInput`, `searchClear`, `sortSelect`, `listTitle`, `noteCount`, `emptyState`, `emptyTrash`, `emptySearch`, `newNoteBtn`, `newNoteBtnEmpty`, `editorMeta`, `editorEmpty`, `scratchPad`, `homeNoteGrid`, `organizeGrid`, `shortcutsGrid`, `sidebarCollapse`, `globalSearchInput`, nav IDs (`navHome`, `navAllNotes`, `navShortcuts`, `navNotebooks`, `navTags`, `navTrash`)
- Classes asserted by tests: `.app-note-item` (+ `is-pinned`, `is-active`), `.home-note-card`, `.organize-card`, `.app-fab`, `.capture-band`, `.capture-soon`, `.scratch-panel`, `.app-nav-item`, `.nav-label`, `.home-empty-copy`
- Asserted texts: save status `Saved`, share status `Link revoked`, empty-state copy (`first idea`, `Pin notes to see them here`, `Coming soon`), `#listTitle` values, nav labels array
- **Transform-at-rest rule:** no element may carry a persistent transform that moves it away from its layout box (Playwright clicks by coordinates). All 3D transforms are hover/interaction-only and reset to identity.
- Keep every animation ≤ 400ms so test timing is unaffected.

**Bundle/SW coupling (non-negotiable — this exact mistake shipped a bug before):**
after ANY `app.js` edit → `cd authentication && npm run build:app`, then bump
`CACHE_NAME` in `authentication/sw.js` from `'notin-shell-v5'` to `'notin-shell-v6'`.

---

## PART 3 — THE TASK: WP-UI-NOTES-3D-001 — SMOOTH + 3D POLISH

### Files to MODIFY
1. `authentication/app.css` — depth system, transitions, keyframes, tilt styling, reduced-motion switch
2. `authentication/app.js` — tilt engine, stagger flag, note-open animation trigger
3. `authentication/sw.js` — cache bump to `notin-shell-v6`
4. `authentication/app.bundle.js` — rebuild only (never hand-edit)

### Files to CREATE
None. (No new files, no new dependencies.)

---

### Spec 1 — Depth token system + global motion switch (`app.css`)

Add to the `:root` block:
```css
--depth-1: 0 1px 2px rgba(0,0,0,.32), 0 2px 8px rgba(0,0,0,.22);
--depth-2: 0 4px 12px rgba(0,0,0,.34), 0 10px 28px rgba(0,0,0,.28);
--depth-3: 0 8px 20px rgba(0,0,0,.40), 0 18px 44px rgba(0,0,0,.34);
--ease-out-soft: cubic-bezier(.2,.8,.2,1);
--ease-spring: cubic-bezier(.34,1.4,.4,1);
```

Append at the END of `app.css` (master kill-switch — must stay last):
```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}
}
```

### Spec 2 — Keyframes (`app.css`, new `WP-UI-NOTES-3D-001` section)

```css
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes viewIn{from{opacity:0;transform:translateY(8px) scale(.995)}to{opacity:1;transform:none}}
@keyframes noteOpen{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes fabIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
```

### Spec 3 — View transitions (pure CSS)

Views are toggled via `hidden`; CSS animations replay each time an element
becomes visible. Add:
```css
.home-view,.shortcuts-view,.organize-view{animation:viewIn .28s var(--ease-out-soft)}
.editor-workspace{animation:viewIn .24s var(--ease-out-soft)}
.app-fab{animation:fabIn .3s var(--ease-spring)}
```

### Spec 4 — 3D depth on cards and rows (`app.css`)

Layered shadows + hover lift with perspective (still transform-only):
```css
.home-note-card,.shortcut-card,.organize-card{box-shadow:var(--depth-1);transform-style:preserve-3d}
.home-note-card:hover,.shortcut-card:hover,.organize-card:hover{box-shadow:var(--depth-2)}
.app-note-item{box-shadow:var(--depth-1)}
.app-note-item:hover{box-shadow:var(--depth-2)}
.app-note-item.is-active{box-shadow:var(--depth-2)}
.editor-workspace,.home-view,.shortcuts-view,.organize-view{box-shadow:var(--depth-3), inset 0 1px 0 rgba(255,255,255,.045)}
.app-toolbar{box-shadow:var(--depth-2), inset 0 1px 0 rgba(255,255,255,.05)}
```

Tilt hook class (JS drives the transform; CSS provides the glide back):
```css
.tilt-3d{transition:transform .35s var(--ease-out-soft), box-shadow .25s var(--ease-out-soft)}
.tilt-3d.is-tilting{transition:box-shadow .25s var(--ease-out-soft)}
```

### Spec 5 — Tilt engine (`app.js`)

One global, delegation-based pointer-tilt for elements with class `.tilt-3d`
(cards get this class — see Spec 6). Exact behavior:
- Enable only when `matchMedia('(pointer: fine)').matches` AND NOT
  `matchMedia('(prefers-reduced-motion: reduce)').matches`. Otherwise do nothing.
- `document.addEventListener('pointermove', handler)` with `e.target.closest('.tilt-3d')`.
- On enter/first hit: `el.classList.add('is-tilting')` (kills the glide transition
  so tilt tracks the pointer 1:1).
- Compute inside `requestAnimationFrame` (store the id; cancel before new frame —
  never queue frames):
  ```js
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
  const py = (e.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(700px) rotateX(${(-py*5).toFixed(2)}deg) rotateY(${(px*5).toFixed(2)}deg) translateY(-2px)`;
  ```
  Max rotation ±5deg. Keep the handler allocation-free per frame (no closures created inside).
- On `pointerout` leaving the element (and on `pointercancel`/`blur`): remove
  `.is-tilting`, clear the rAF, and `el.style.transform = ''` — the CSS transition
  glides it home. Identity at rest is mandatory (see PART 2 transform rule).
- Place this engine at the bottom of `app.js` in an IIFE labeled
  `// WP-UI-NOTES-3D-001 — pointer tilt engine`. No globals leak.

### Spec 6 — Apply the tilt class (`app.js` renderers)

Add class `tilt-3d` to the elements created in:
- `renderHome()` — the `home-note-card` elements (both note cards and the create card)
- `renderShortcuts()` — `shortcut-card` elements
- `renderOrganizeView()` — `organize-card` elements
Do NOT tilt `.app-note-item` rows (list rows tilt feels noisy) — rows get
lift-by-shadow only (Spec 4). Do not change any other markup, text, or data.

### Spec 7 — Staggered list entrance (`app.js` + `app.css`)

Animate rows only when the list's *context* changes (view/filter/search/select),
never on every autosave re-render:
- `app.js`: add module flag `let listAnimateNext = false;`. Set it `true` in
  `goToView(...)`, in the search handlers, and wherever notebook/tag filters are
  applied (the code paths that change `currentView`/`currentFilter`/`currentQuery`/
  `currentNotebookId`/`currentTagId`).
- In `renderList()`: if `listAnimateNext`, add class `is-animating` to `listEl`,
  set `btn.style.setProperty('--i', String(Math.min(index, 14)))` per row, then
  `setTimeout(()=> listEl.classList.remove('is-animating'), 700)` and reset the
  flag. Guard against overlapping timers with a stored handle.
- `app.css`:
  ```css
  .app-list-items.is-animating .app-note-item{animation:rise .3s var(--ease-out-soft) both;animation-delay:calc(var(--i)*18ms)}
  ```
  Max delay 14×18ms = 252ms.

### Spec 8 — Note-open transition (`app.js` + `app.css`)

When a note is selected, the editor content glides in:
- `app.css`:
  ```css
  .app-editor.note-open .app-editor-header{animation:noteOpen .22s var(--ease-out-soft)}
  .app-editor.note-open .app-toolbar{animation:noteOpen .26s var(--ease-out-soft)}
  .app-editor.note-open .app-editor-body{animation:noteOpen .3s var(--ease-out-soft)}
  ```
- `app.js` inside `selectNote(id)` AFTER the editor content is set:
  restart the animation cleanly:
  ```js
  // WP-UI-NOTES-3D-001 — note-open glide (restart-safe)
  const editorPane = document.querySelector('.app-editor');
  if(editorPane){ editorPane.classList.remove('note-open'); void editorPane.offsetWidth; editorPane.classList.add('note-open'); }
  ```
  Skip the reflow-restart when `prefers-reduced-motion` matches (guard in the same
  matchMedia flags used by the tilt engine).

### Spec 9 — Micro-interactions (`app.css`)

Press physics and state morphs (all transform/opacity only):
```css
.btn-new,.app-create-note,.app-save,.home-pen,.app-attach-btn{transition:transform .12s var(--ease-out-soft), box-shadow .2s var(--ease-out-soft), background .14s}
.btn-new:active,.app-create-note:active,.app-save:active,.home-pen:active{transform:translateY(1px) scale(.98)}
.tb-btn{transition:background .13s, color .13s, transform .1s var(--ease-out-soft)}
.tb-btn:active{transform:scale(.92)}
.app-note-pin{transition:opacity .14s, background .14s, color .14s, transform .14s var(--ease-spring)}
.app-note-pin:active{transform:scale(.85)}
.app-pin-toggle{transition:border-color .14s, color .14s, background .14s, transform .12s}
.app-pin-toggle:active{transform:scale(.95)}
.app-save-status{transition:color .18s, background .18s, border-color .18s}
.app-fab{transition:transform .16s var(--ease-spring), background .14s, box-shadow .2s}
.app-fab:hover{box-shadow:var(--depth-3)}
.app-note-item{transition:border-color .14s, background .14s, box-shadow .2s var(--ease-out-soft)}
```
Do not duplicate rules destructively — extend the existing section where a rule
already exists if that is cleaner; final rendered behavior must match the spec.

### Spec 10 — Smooth scrolling feel (`app.css`)

```css
.app-list-items,.app-editor-body,.home-view,.shortcuts-view,.organize-view,.app-nav{scroll-behavior:smooth}
```
(The reduced-motion block already forces `scroll-behavior:auto`.)

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: `authentication/app.css` (tokens + notes section), `authentication/app.js`
   (`renderList`, `renderHome`, `renderShortcuts`, `renderOrganizeView`, `selectNote`,
   `goToView`, search/filter handlers), `authentication/app.html` (IDs), `authentication/sw.js`.
2. **Implement** CSS first (Specs 1–4, 7-css, 8-css, 9, 10), then JS (Specs 5, 6, 7, 8).
3. `node --check authentication/app.js` — must pass.
4. `cd authentication && npm run build:app` — bundle must rebuild.
5. Bump `sw.js` `CACHE_NAME` to `'notin-shell-v6'`.
6. Boot/verify the app serves (`GET /app.html`, `/app.css`, `/sw.js`, `/app.bundle.js` on :5000 all 200; start backend with `cd backend && npm ci && npm run db:migrate && npm start` if not running).
7. Grep-audit: confirm every ID/class/text listed in PART 2 still exists unchanged.
8. `cd backend && npm run test:e2e` if Chromium is available; if not, say so
   explicitly in the report (do not claim E2E passed).
9. Update `PROJECT_BIBLE.md`: add WP-UI-NOTES-3D-001 to COMPLETED FEATURES, note the v6 cache bump.

## PART 5 — DO NOT (hard constraints)

→ Do NOT add any npm dependency (no GSAP, Framer Motion, three.js, lottie).
→ Do NOT touch `frontend/` (landing), `index.html`/`login.html` (auth), or `backend/` code.
→ Do NOT rename/move any ID, class, or asserted text listed in PART 2.
→ Do NOT animate layout properties (width/height/top/left/margin/padding).
→ Do NOT leave any element with a transform at rest (identity only outside interaction).
→ Do NOT exceed 400ms for any animation; total stagger ≤ ~300ms.
→ Do NOT tilt the note list rows or add scroll-jacking/parallax.
→ Do NOT skip the `sw.js` cache bump or hand-edit the bundle.
→ Do NOT build AI features, CTAs, or anything outside this work package.

## PART 6 — ACCEPTANCE CRITERIA

□ Depth tokens + reduced-motion kill-switch present; kill-switch is the last rule in app.css
□ View switch (Home↔Notes↔editor) plays a ≤300ms fade-rise; replays every switch
□ Home/Shortcuts/Organize cards tilt ≤±5deg toward the pointer, glide back to identity on leave, and sit perfectly still at rest
□ Note list rows stagger in only on context change (never on autosave), ≤252ms total delay
□ Selecting a note glides header/toolbar/body in ≤300ms; repeated selections re-trigger cleanly
□ Buttons show press physics; FAB hover raises shadow; save-status pill color morphs
□ With OS "reduce motion" enabled: zero visible animation (CSS + JS guards both honored)
□ Bundle rebuilt; `sw.js` at `notin-shell-v6`; `node --check` clean on app.js and bundle
□ All PART 2 locked IDs/classes/texts verified unchanged
□ E2E passes, or Chromium-unavailable stated honestly with the audit results

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-UI-NOTES-3D-001 REPORT
1. Files modified:        [list]
2. Bundle/SW:             [old size → new size · cache v6 confirmed]
3. Motion inventory:      [each spec 1–10 → done/skipped+why]
4. Reduced-motion:        [CSS kill-switch + JS guards confirmed]
5. Locked-selector audit: [pass/fail]
6. E2E:                   [pass/fail counts, or Chromium unavailable]
7. Perf notes:            [any tradeoffs]
8. Unspecified decisions: [should be none or trivial]
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-AI-001** — AI note summarization (`AGENT_INSTRUCTION_WP-AI-001.md`).
2. **WP-FUNNEL-001** — wire landing CTAs to auth.
3. **WP-AI-002/003** — title/tag suggestions, chat-with-note.
