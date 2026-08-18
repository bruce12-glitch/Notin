# CODING AGENT MASTER PROMPT — Notin · Task WP-LEFTOVERS-001

> **HOW TO USE:** Paste this ENTIRE file into a fresh coding-agent session.
> It is self-contained — no other context needed. One task per session.
> Do not build anything that is not in PART 3.
> If this file and any older instruction disagree, **this file wins**.
>
> CTO-final 2026-08-18 · audited line-by-line against `main` @ `2dce58b`
> (post-PR-#18). **Queue rule (locked):** this session starts only AFTER
> (a) the WP-AI-004 PR merges into `main`, and (b) the human CI-activation
> step is done (the Arena GitHub App token cannot push `.github/workflows/`;
> the repo owner moves `ci/e2e.yml` to `.github/workflows/e2e.yml`). Branch
> your work from then-current `main`. Your PR should then prove green in CI.

---

## PART 1 — YOUR IDENTITY AND MISSION

You are the implementation agent for **Notin**. Shipped and verified on
`main`: the full notes engine, auth, WP-AI-001/002/002b/003, schema mirror,
production gates, WP-UI-NOTES-3D-001, and WP-FUNNEL-001, which wired every
CTA that has an honest destination. WP-AI-004 (writing assistant) merges
immediately ahead of you.

Your single task is **WP-LEFTOVERS-001 — landing leftovers + mirror re-sync**:
give the 15 remaining placeholder `href="#"` links per landing edition an
honest disposition (wire, disable-with-label, or remove — never leave dead),
then re-sync the `docs/` GitHub Pages mirror to the post-edit `frontend/`
byte-for-byte.

Operating rules:
1. **Honesty over cosmetics.** A link must go somewhere real, be visibly
   disabled-with-explanation, or not exist. Private-company fiction (binary
   builds, store pages, extensions, blog/careers/legal pages) does not get
   fake routes.
2. **WP-FUNNEL-001 is locked.** Do not touch `data-cta` attributes/handlers,
   their `href="#"` no-JS fallbacks, `#smartDownload`/`OS_META`, or the
   `.organize-showcase__cta` state machine.
3. **Pixel keep.** Both editions must render identically except at the items
   you deliberately change. Reuse existing classes; add at most ONE tiny CSS
   rule per stylesheet.
4. **Mirror last.** `docs/` is re-synced AFTER `frontend/` edits, never
   before, and never piecemeal-edited.

---

## PART 2 — REPO GROUND TRUTH (verified 2026-08-18 on main @ 2dce58b)

```
frontend/                 ← marketing site, Green (index.html) + Neon (index-neon.html)
│   ├── dev-server.mjs    ← dev server :3000; proxies ONLY /api* + /auth* → :5000
│   ├── polish.css        ← REFERENCED by BOTH editions (1× each) and MISSING from docs/
│   └── script.js         ← WP-FUNNEL-001 wiring (do not modify — mirror copies it)
docs/                     ← GitHub Pages mirror of frontend/ — STALE & diverged:
│                             index.html 98,356B vs frontend 99,233B · script.js 41,323B
│                             vs frontend 36,852B (docs is AHEAD here — overwrite wholesale)
│                             styles*.css/input*.css also diverged · NO polish.css
└── dev-server.mjs / package.json / package-lock.json exist in both — DO NOT MIRROR these
```

**Placeholder inventory — `frontend/index.html` has exactly 26 `href="#"` lines:**

| Line(s) | Element | Status quo | Disposition (Spec) |
|---|---|---|---|
| 138 | `Enterprise` nav link | dead | **WIRE → mailto** (Spec 1) |
| 144, 145, 172, 178, 515, 697, 710, 721, 763, 782, 953 | data-cta fallbacks (Log in / Start for free / Get Notin free / hero icon / Try it free / Get started / Try Pro / Contact sales / Download Notin / Open notin.app / Contact) | **WIRED by WP-FUNNEL-001 — keep exactly as-is** | none |
| 796, 810, 824 | Download `.exe` / `.dmg` / `AppImage` | dead | **DISABLE-with-label** (Spec 2) |
| 838, 852 | `App Store` / `Google Play` | dead | **DISABLE-with-label** (Spec 2) |
| 868, 869, 870 | `Chrome` / `Firefox` / `Safari` extensions | dead | **DISABLE-with-label** (Spec 2) |
| 946, 951, 952 | `Changelog` / `Blog` / `Careers` | dead | **REMOVE** (Spec 3) |
| 957, 958, 959 | `Privacy` / `Terms` / `Security` | dead | **REMOVE** (Spec 3) |

`index-neon.html` mirrors the same 26 (Enterprise @138; downloads ~780/794/808;
stores ~822/836; extensions ~852–854; footer ~930/935/936/941–943). **Your
first act is to produce your own line-number inventory for BOTH editions and
note any drift from this table** — the tree wins if they differ; adapt
minimally and report it.

**Leftover count is 15 per edition** (1 Enterprise wire + 8 disables + 6
removals). Final `href="#"` count per edition must equal exactly the
data-cta fallback set — expected **11** on Green (26 − 15); verify Neon
separately and report both verified numbers.

---

## PART 3 — THE TASK

### Files to CREATE
None.

### Files to MODIFY
1. `frontend/index.html`
2. `frontend/index-neon.html`
3. `frontend/styles.css` — one `.is-disabled` rule (if no equivalent exists)
4. `frontend/styles-neon.css` — same
5. `docs/` — the mirrored set (Spec 4), byte-identical copies
6. `PROJECT_BIBLE.md` — mark WP-LEFTOVERS-001 complete

### Files you must NOT modify
`frontend/script.js` (only mirrored, not edited), `frontend/dev-server.mjs`,
`frontend/package*.json`, `docs/package*.json`, `docs/dev-server.mjs` (absent —
do not add), everything under `authentication/`, `backend/`, `.github/`, `ci/`.

---

### Spec 1 — Enterprise (both editions)

Change ONLY the href:
`<a href="#"` → `<a href="mailto:hello@notin.app?subject=Enterprise%20demo"`.
Keep classes and text identical. Rationale (report it): a reachable human is
an honest destination; the Contact CTA already uses this mailbox.

### Spec 2 — Downloads, stores, extensions: disable with explanation

For each of the 8 dead anchors per edition, replace the `<a>` with a `<span>`
that keeps the EXACT original class list plus `is-disabled`:

```html
<span class="<original classes> is-disabled" role="link" aria-disabled="true" title="Coming soon — the web app is live today">Download .exe</span>
```

- Labels unchanged. No `href` remains anywhere on these items.
- In `styles.css` and `styles-neon.css`, NEXT TO the existing
  `.download-link` / `.btn-sm-evernote` rules, add one rule:
  ```css
  .is-disabled{opacity:.55;cursor:not-allowed;pointer-events:none}
  ```
  If an equivalent rule already exists, reuse it and add nothing.
- Do not alter the surrounding OS cards, `#smartDownload`, or the
  `Open notin.app` (data-cta) link inside the Web card.

### Spec 3 — Footer placeholders: remove

Delete the six anchor elements (`Changelog`, `Blog`, `Careers`, `Privacy`,
`Terms`, `Security`) per edition. If removing an anchor leaves its wrapping
`<li>` empty, remove the `<li>`; if that empties a footer column, remove the
column AND its heading. Keep the `Contact` link (`data-cta`, mailto) and all
other footer content. Do not re-shuffle columns.

### Spec 4 — `docs/` mirror re-sync (after Specs 1–3 are FINAL)

Mirrored set (frontend → docs, byte-identical):
`index.html`, `index-neon.html`, `styles.css`, `styles-neon.css`,
`input.css`, `input-neon.css`, `polish.css`, `script.js`, `context.html`,
`evernote-analysis.md`, and `assets/**`.

Method: copy `frontend/<file>` over `docs/<file>` (create `docs/polish.css`).
Never hand-edit inside `docs/`. Verify with
`sha256sum frontend/<f> docs/<f>` equal for every mirrored path, and
`diff -rq frontend/assets docs/assets` clean. Do NOT copy `dev-server.mjs`,
`package.json`, or `package-lock.json`; note in your report that
`docs/package*.json` remain stale artifacts (debt, deferred).

### Spec 5 — Bible

`PROJECT_BIBLE.md`: mark WP-LEFTOVERS-001 complete (zero placeholder landing
CTAs; docs/ mirror re-synced); remove any "landing leftover links" /
"docs diverged" debt lines; keep the `docs/package*.json` debt line.

---

## PART 4 — MANDATORY WORKFLOW (in this order)

1. **Read**: the two editions' nav/download/footer regions, `script.js`
   (read-only — understand what NOT to touch), `styles*.css`
   `.download-link`/`.btn-sm-evernote` rules.
2. Produce your 26-line `href="#"` inventory for BOTH editions; paste into
   your report with the disposition of each (wired-fallback / Spec 1 / 2 / 3).
3. Specs 1 → 2 → 3 → CSS rule → dev-server boot:
   `node frontend/dev-server.mjs` and curl 200 for `/` and `/index-neon.html`.
4. Grep matrix (paste numbers):
   `grep -c 'href="#"' frontend/index.html` (expect 11 — or your verified
   fallback count), same for neon; `grep -c 'is-disabled'` per edition
   (expect ≥ 8: 8 spans + 1 CSS rule text occurrences vary — count the
   `role="link"` spans, expect exactly 8); `grep -c 'subject=Enterprise'`
   (1 each); `grep -c 'Changelog\|Careers'` (0 each).
5. Spec 4 copy + sha256/diff proof.
6. Spec 5. Report in PART 7 format. Do not edit any E2E spec; the CI
   workflow (once the owner activates it) covers regressions on your PR.

## PART 5 — DO NOT (hard constraints)

→ Do NOT touch `data-cta` wiring, `#smartDownload`, `OS_META`, mobile-menu wiring, or `.organize-showcase__cta`.
→ Do NOT create pages, routes, or products for removed items (no /privacy, no /changelog).
→ Do NOT edit `frontend/script.js` (mirror copies it verbatim after your HTML work).
→ Do NOT modify `href="#"` on the 11 data-cta fallbacks — they are the no-JS fallback by design.
→ Do NOT touch backend, `authentication/`, auth, CI files, or add dependencies.
→ Do NOT hand-edit anything inside `docs/` — copies only.
→ Do NOT attempt to push `.github/workflows/**` (the token refuses it; that step is the owner's).

## PART 6 — ACCEPTANCE CRITERIA

□ Exactly 15 placeholders per edition resolved: 1 mailto wire, 8 disabled
  spans (`role="link"`, `aria-disabled`, title), 6 removals
□ `href="#"` remainder = only the data-cta fallbacks (count reported per edition)
□ Layout identical elsewhere; ONE `.is-disabled` rule (or existing equivalent) per stylesheet
□ `docs/` mirrored set byte-identical to `frontend/` (sha256 proof); `polish.css` present in docs
□ Both editions serve 200 from `dev-server.mjs`; no console-visible broken references
□ Bible updated; no dead-link debt lines left except `docs/package*.json`

## PART 7 — REPORT FORMAT (final message must follow this)

```
WP-LEFTOVERS-001 REPORT
1. Files created/modified:  [lists]
2. Inventory:               [26-line classification per edition, with drift notes]
3. Disposition counts:      [wired / disabled / removed, before→after href="#" counts]
4. Mirror proof:            [sha256/diff outputs]
5. Verification:            [dev-server 200s, grep matrix]
6. Deviations / debt:       [each justified; docs/package*.json noted]
7. Suggested next:          WP-AI-003b or hosting — do NOT start either.
```

## APPENDIX — QUICK COMMANDS

```bash
grep -n 'href="#"' frontend/index.html frontend/index-neon.html   # the audit
node frontend/dev-server.mjs &                                    # :3000
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/
sha256sum frontend/index.html docs/index.html                     # mirror proof
```

## FUTURE QUEUE (context only — DO NOT BUILD IN THIS SESSION)

1. **WP-AI-003b** — streaming chat (AI-003 shipped non-streaming deliberately).
2. **WP-AI-004b** — `expand` action + selection-floating bubble menu.
3. **Hosting** — human follows `RUNBOOK.md` with real secrets.
4. **PR #2 follow-up** — repo owner opens the security-follow-ups issue
   (salvage list recorded in the PR #2 closing comment, 2026-08-18).
5. **Debt** — `docs/package*.json` cleanup; legacy `authentication/server.js` advisories.
