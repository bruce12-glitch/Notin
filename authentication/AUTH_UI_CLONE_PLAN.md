# AUTH UI — Evernote Exact Clone Plan (Action-Only)

**Status:** PLAN ONLY — do not implement until you send the refine prompt.  
**Goal:** Pixel- and flow-match Evernote Accounts UI (`accounts.evernote.com`) with Notin branding.  
**Primary references (live):**
- Signup: https://accounts.evernote.com/registration  
- Login: https://accounts.evernote.com/login  
- Splash asset: https://accounts.evernote.com/splash.svg  
- Help screenshot: https://cdn1.evernote.com/support-assets/en/evernote-login-page.jpg  

**Current Notin baseline:** `authentication/index.html` + `styles.css` + `script.js` (single signup screen, simulated OTP, CSS shape approximations).

---

## 0. Success definition (what “exact clone” means)

| Criterion | Pass condition |
|-----------|----------------|
| Visual | Side-by-side vs Evernote registration/login at 1440×900 & 390×844 differs only by brand name/logo/copy |
| Structure | Same sections, order, hierarchy, and empty/filled/disabled/error states |
| Flow | Same multi-step progression (email → password/OTP → success) |
| Motion | Same hover/focus/disabled transitions; no extra flashy effects |
| Responsive | Same breakpoint behavior (right splash hides / form stacks like Evernote) |
| A11y | Labels, focus rings, keyboard path, `aria-*` for steps/errors |
| Brand swap | “Evernote” → “Notin”; elephant → Notin mark; greens stay Evernote family (`#00A82D` / `#8FE333`) |

**Out of scope for UI plan (backend later):** real hCaptcha keys, real Google/Apple OAuth secrets, production SMTP. UI must still show the controls and states.

---

## 1. Capture & lock the Evernote source of truth

### Action 1.1 — Reference pack (do first)
1. Open Evernote in a clean browser profile (logged out).
2. Capture **full-page** + **viewport** screenshots at:
   - Desktop: `1440×900`, `1280×800`
   - Tablet: `768×1024`
   - Mobile: `390×844`, `360×800`
3. Capture these **screens** (each state):
   - **A. Registration — empty**
   - **B. Registration — email filled, Continue enabled**
   - **C. Registration — email invalid error**
   - **D. Registration — after Continue (password / next step if shown)**
   - **E. Login — empty**
   - **F. Login — email filled**
   - **G. Login — password step**
   - **H. Login — error (wrong credentials)**
   - **I. “Can’t sign in” / recovery entry**
   - **J. Mobile versions of A + E**
4. Save assets into:
   ```
   authentication/reference/
     screenshots/
       signup-empty-1440.png
       signup-filled-1440.png
       signup-error-1440.png
       signup-step2-*.png
       login-empty-1440.png
       login-password-1440.png
       login-error-1440.png
       mobile-signup-390.png
       mobile-login-390.png
     splash.svg                    # download from accounts.evernote.com/splash.svg
     evernote-login-help.jpg       # from help CDN if available
     tokens.json                   # filled in Action 1.2
   ```
5. Optional but high-value: use DevTools → **Inspect** on key nodes; export computed styles for:
   - `h1`, subtitle, email input, Continue button (disabled + enabled)
   - Google/Apple buttons
   - legal text + links
   - footer / language control
   - splash container

### Action 1.2 — Extract design tokens into `tokens.json`
Record exact values from DevTools (do not guess):

```json
{
  "colors": {
    "bg": "#FFFFFF",
    "textPrimary": "",
    "textSecondary": "",
    "textMuted": "",
    "borderInput": "",
    "borderInputFocus": "",
    "btnDisabledBg": "",
    "btnDisabledText": "",
    "btnPrimaryBg": "",
    "btnPrimaryText": "",
    "link": "",
    "error": "",
    "highlightFill": "",
    "highlightStroke": "",
    "brandGreen": "#00A82D",
    "brandLime": "#8FE333"
  },
  "type": {
    "fontFamily": "",
    "h1Size": "",
    "h1Weight": "",
    "h1LetterSpacing": "",
    "h1LineHeight": "",
    "subtitleSize": "",
    "inputSize": "",
    "btnSize": "",
    "legalSize": "",
    "heroPhraseSize": ""
  },
  "layout": {
    "leftPanePercentOrPx": "",
    "formMaxWidth": "",
    "leftPadding": "",
    "inputHeight": "",
    "primaryBtnHeight": "",
    "socialBtnHeight": "",
    "radiusInput": "",
    "radiusBtn": "",
    "gapAfterLogo": "",
    "gapAfterSubtitle": "",
    "gapOrDivider": ""
  },
  "copy": {
    "signupTitle": "Welcome to Evernote!",
    "signupSubtitle": "Sign up and start taking notes.",
    "loginTitle": "Sign in",
    "loginSubtitle": "to continue to your Evernote account.",
    "emailPlaceholder": "",
    "continue": "Continue",
    "or": "or",
    "google": "Continue with Google",
    "apple": "Continue with Apple",
    "legal": "By creating an account, you are agreeing to our Terms of Service and acknowledging receipt of our Privacy Policy.",
    "haveAccount": "Already have an account? Log in",
    "noAccount": "Don’t have an account? Sign up",
    "cantSignIn": "Can't sign in? Click here"
  }
}
```

### Action 1.3 — Map Evernote → Notin copy (lock wording)
| Evernote | Notin (proposed — refine later) |
|----------|----------------------------------|
| Welcome to Evernote! | Welcome to Notin! |
| Sign up and start taking notes. | Sign up and start taking notes. *(keep exact)* |
| Sign in / to continue to your Evernote account. | Sign in / to continue to your Notin account. |
| Terms / Privacy URLs | Notin placeholder routes or `#` until legal pages exist |
| Splash “Your second brain” | Keep phrase; Notin brand |

---

## 2. Information architecture & routes

Evernote uses **two primary URLs** + multi-step within each. Clone that.

### Action 2.1 — Define Notin auth routes (static or tiny router)
```
/authentication/index.html          → Signup step 1 (email)     [Evernote /registration]
/authentication/login.html          → Login step 1 (email)      [Evernote /login]
  OR single page with ?mode=signup|login and history API
/authentication/ (hash/query steps)
  ?step=email|password|otp|success
```

**Recommended structure (simplest exact clone):**
```
authentication/
  index.html              # SIGNUP shell (default landing for “Start for free”)
  login.html              # LOGIN shell
  styles.css              # shared
  script.js               # shared state machine
  assets/
    logo.svg
    splash.svg            # traced/adapted from Evernote splash (or licensed recreation)
    google.svg
    apple.svg
  partials/ or JS templates for steps
  reference/              # not shipped to prod
  AUTH_UI_CLONE_PLAN.md   # this file
```

### Action 2.2 — Screen inventory (build every screen)

#### SIGNUP flow (Evernote registration parity)
| ID | Screen | UI elements | Notes |
|----|--------|-------------|-------|
| S0 | Email entry | Logo, H1, subtitle, email, Continue, or, Google, Apple, legal, “Log in” link, splash, footer/lang | **Current page ≈ S0 only** |
| S1 | Password create | Back/email chip, password field, show/hide, strength (if EN has it), Continue | Capture if Evernote shows this after email |
| S2 | Verify email / OTP | “Enter code sent to {email}”, 6 boxes or one field, Resend, Continue | Matches our Auth API design |
| S3 | Captcha interstitial | hCaptcha widget placeholder | Visual only until keys |
| S4 | Success / redirect | Brief “You’re in” or immediate redirect to app | |

#### LOGIN flow (Evernote login parity)
| ID | Screen | UI elements |
|----|--------|-------------|
| L0 | Email entry | “Sign in”, subtitle, email, Continue, or, Google, Apple, “Sign up”, “Can’t sign in?” |
| L1 | Password entry | Password, show/hide, Continue, forgot password |
| L2 | OTP / 2SV (if enabled) | Code entry |
| L3 | Error banners | Inline under field + optional top alert |
| L4 | Recovery entry | Link-out style matching “Can’t sign in?” |

### Action 2.3 — Flow diagram (implement as explicit state machine)
```
[Landing CTA]──Start free──► S0 ──Continue──► S1/S2 ──success──► /app
                 Log in ──► L0 ──Continue──► L1 ──success──► /app
S0 ◄──► L0   (Already have account? / Don’t have account?)
S0/L0 ──Google──► OAuth popup/redirect ──► (optional OTP) ──► /app
S0/L0 ──Apple──► stub or real SIWA later
```

---

## 3. Layout anatomy (pixel structure)

### Action 3.1 — Rebuild page chrome to match Evernote grid
From live Evernote registration structure:

```
┌────────────────────────────────────────────────────────────┐
│ body #fff, overflow handled per EN                         │
│ ┌─────────────────────────┬──────────────────────────────┐ │
│ │ LEFT PANE (~form col)   │ RIGHT PANE (splash)          │ │
│ │  logo                   │  decorative shapes +         │ │
│ │  h1                     │  giant “Your / second /      │ │
│ │  subtitle               │  brain” wordmark             │ │
│ │  [email input]          │  (splash.svg composition)    │ │
│ │  [Continue]             │                              │ │
│ │  ── or ──               │                              │ │
│ │  [Google] [Apple]       │                              │ │
│ │  legal                  │                              │ │
│ │  Already have account?  │                              │ │
│ │  footer / lang          │                              │ │
│ └─────────────────────────┴──────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Actions:**
1. Measure Evernote left/right split (%, min-width, max form width).
2. Replace our hard-coded `52% / 48%` with measured values.
3. Match left padding (`px` / `vw`) from reference — not approximate `8.5vw`.
4. Right pane: **prefer real `splash.svg`** over CSS `clip-path` shapes (current shapes are approximations).
5. Confirm whether footer is left-pane only vs full-width; language control position (Evernote shows `EN` control).

### Action 3.2 — Right-pane splash (critical visual)
Evernote serves `splash.svg` (not pure CSS).

**Actions:**
1. Download `splash.svg` into `authentication/assets/`.
2. Decide legally:
   - **Option A (fastest visual match):** recolor/adapt shapes, replace any Evernote wordmarks; keep geometric language.
   - **Option B (safest):** recreate shapes in Figma from screenshots (same colors: lime green burst, purple blob, blue burst, orange circles) as original SVG.
3. Position “Your / **second** / brain”:
   - Three lines
   - “second” has mint highlight bar + lime border (Evernote signature)
   - Measure font-size (`clamp`), weight (800), letter-spacing (very tight ~`-0.09em`), line-height (~0.9)
4. Remove incorrect layering bugs (our CSS uses `.highlight-wrapper` in HTML but `.highlight-container` in CSS — fix during rebuild).
5. Z-index: shapes behind wordmark; wordmark never clipped oddly at edges.

### Action 3.3 — Left-pane form vertical rhythm
For each element, set **exact** margin-bottom from tokens:
1. Logo size (Evernote elephant ~40–48px → Notin diamond/mark same box)
2. H1 → subtitle gap
3. Subtitle → email gap
4. Email → Continue gap
5. Continue → `or` gap
6. `or` → social row gap
7. Social → legal gap
8. Legal → “Already have account?” gap
9. Footer distance from bottom

---

## 4. Component-level clone checklist

Build/rebuild as **named components** (even in vanilla HTML) so QA is 1:1.

### Action 4.1 — `AuthLogo`
- [ ] SVG mark only (no text wordmark next to it on EN signup)
- [ ] Click → marketing home (`/frontend/index.html` or `/`)
- [ ] Size + margin match tokens

### Action 4.2 — `AuthHeading` + `AuthSubtitle`
- [ ] Signup: `Welcome to Notin!` (Evernote bolds/emphasizes product name — match weight pattern)
- [ ] Login: `Sign in` + muted subtitle line
- [ ] Letter-spacing negative on H1 like Evernote

### Action 4.3 — `EmailField`
- [ ] Placeholder exact
- [ ] Height, radius, border 1px, padding
- [ ] Focus ring/border color (lime/green — measure)
- [ ] Invalid: red border + helper text under field (copy from EN if present)
- [ ] `autocomplete="email"`, `inputmode="email"`, `name="email"`
- [ ] Disable browser ugly outlines; use EN-like focus

### Action 4.4 — `PrimaryButton` (Continue)
- [ ] Full width of form column
- [ ] Disabled: gray bg (`#cecece`-class), white text, `not-allowed`, no hover lift
- [ ] Enabled: near-black bg (`#151515`-class), white text, pointer
- [ ] Loading: label → spinner or “Please wait…”, `aria-busy`, prevent double submit
- [ ] Height ~56–60px (measure)
- [ ] Font weight bold ~700

### Action 4.5 — `OrDivider`
- [ ] Flex line + centered lowercase `or`
- [ ] Line color + thickness + side gaps measured
- [ ] Max-width = form width

### Action 4.6 — `SocialButton` row
- [ ] Two equal columns, small gap (~8–10px)
- [ ] White bg, 1px gray border, medium radius
- [ ] Left icon + label (“Continue with Google/Apple”)
- [ ] **Real multicolor Google G** SVG (we have partial — verify 18×18 paths)
- [ ] **Real Apple logo** path (current placeholder circle is wrong — replace)
- [ ] Hover: subtle border darken / bg `#fafafa` (match EN, not big translate if EN doesn’t)
- [ ] Focus visible for keyboard
- [ ] `aria-label` includes “Opens in new tab” if EN does external OAuth

### Action 4.7 — `LegalText`
- Exact sentence structure:
  > By creating an account, you are agreeing to our **Terms of Service** and acknowledging receipt of our **Privacy Policy**.
- Link color blue-violet (measure EN link color — our `#4b63c6` is close; verify)
- Links underline on hover only if EN does

### Action 4.8 — `SwitchAuthLink`
- Signup page: `Already have an account? Log in`
- Login page: `Don’t have an account? Sign up`
- Login only: `Can't sign in? Click here` (separate line/style)
- Centered or left-aligned? **Measure** (EN is typically left under legal)

### Action 4.9 — `AuthFooter` / language
- Evernote: language selector `EN` (and long list)
- Our current: `© 2026 Notin` + Security / Legal / Privacy  
  **Decide in refine prompt:**
  - **Match EN:** language control, minimal footer
  - **Keep Notin:** copyright + legal links  
  Default recommendation: **language control optional stub + thin legal links** without breaking EN density

### Action 4.10 — `PasswordField` (S1/L1)
- [ ] Label or placeholder per EN
- [ ] Show/hide eye toggle
- [ ] Caps-lock hint if EN has it
- [ ] Error text slot

### Action 4.11 — `OtpField` (S2/L2)
- [ ] 6-digit UX (single input or 6 boxes — pick after screenshot; EN may use email magic differently; **our product uses OTP** — design OTP screen in EN visual language even if EN uses password)
- [ ] Resend with cooldown timer (30–60s)
- [ ] Mask email `a***@gmail.com`

### Action 4.12 — `ErrorBanner` / inline errors
- [ ] Field-level vs form-level
- [ ] Icon optional
- [ ] Live region `aria-live="polite"`

### Action 4.13 — `CaptchaSlot`
- [ ] Reserve space matching hCaptcha checkbox height to avoid layout jump
- [ ] Hidden until backend requires; or always show disabled placeholder in dev

---

## 5. Interaction & state matrix (must implement)

### Action 5.1 — Email step states
| State | Continue | Input | Message |
|-------|----------|-------|---------|
| Empty | disabled | default border | — |
| Invalid format | disabled or enabled+error on submit | error border | “Enter a valid email” (confirm EN copy) |
| Valid | enabled black | focus styles | — |
| Submitting | disabled + loading | readonly | — |
| Server error | enabled | error | server message |
| Existing email on signup | → switch to login or show EN-equivalent message | | Capture EN behavior |

### Action 5.2 — Keyboard / a11y
1. Tab order: logo skip → email → continue → google → apple → legal links → switch link
2. Enter in email submits when valid
3. Escape clears errors (optional)
4. Prefer `label` visually hidden or aria-label on inputs
5. `prefers-reduced-motion`: no shape animation if any
6. Contrast check on muted legal text

### Action 5.3 — Motion policy (clone, don’t invent)
- Only replicate Evernote’s subtle hovers
- **Do not** add 3D tilt / magnetic buttons on auth (those belong to marketing site)
- Focus transitions ≤150ms

---

## 6. Multi-page / multi-step implementation plan

### Action 6.1 — Choose architecture
**Recommendation:** one shared CSS + JS, two HTML entrypoints (`index.html` signup, `login.html` login), steps swapped via JS templates.

### Action 6.2 — JS state machine (pseudo)
```js
// modes: 'signup' | 'login'
// steps: 'email' | 'password' | 'otp' | 'success'
state = { mode, step, email, challengeId, loading, errors }
transitions:
  SUBMIT_EMAIL → validate → API → PASSWORD or OTP or ERROR
  SUBMIT_PASSWORD → ...
  SUBMIT_OTP → tokens → redirect
  OAUTH_GOOGLE → redirect to Auth API /auth/google
  SWITCH_MODE → navigate signup↔login preserving email query ?email=
```

### Action 6.3 — URL sync
- `login.html?email=a@b.com`
- `index.html?step=otp&challenge=...&email=...` (matches Auth API callback already designed)
- Support Auth API redirect:
  `/?auth=otp&challenge=...&email=...` → map onto OTP step view

### Action 6.4 — Wire points (UI only stubs first, then API)
| UI event | Dev stub | Later real API |
|----------|----------|----------------|
| Continue (signup email) | go to OTP mock | `POST` notes signup or auth challenge |
| Continue (login email) | go to password step | lookup + password |
| Google | `window.location = AUTH_API + '/auth/google'` | already in script |
| Apple | toast “Coming soon” or hide if not shipping | SIWA |
| OTP verify | accept `000000` in dev | `POST /auth/otp/verify` |
| Resend | 30s timer | `POST /auth/otp/resend` |

---

## 7. CSS rebuild plan (replace approximations)

### Action 7.1 — File strategy
```
styles.css
  1. tokens (:root)
  2. reset
  3. layout (shell, panes)
  4. splash
  5. form controls
  6. social
  7. legal/footer
  8. steps (password/otp)
  9. states (error/loading)
  10. responsive
  11. reduced-motion
```

### Action 7.2 — Kill known mismatches in current code
| Issue | Action |
|-------|--------|
| CSS `.highlight-container` vs HTML `.highlight-wrapper` | Unify class names |
| CSS `.login-prompt` vs HTML `.login-text` | Unify |
| Apple icon is fake circle | Replace with real Apple glyph path |
| Shapes are CSS clip-path guesses | Replace with splash.svg composition |
| Google font via CSS `@import` | Prefer `<link rel=preconnect>` in HTML like marketing site; match EN font stack (Inter/system) |
| `overflow: hidden` on body | Verify EN scroll behavior on short laptop heights — form must remain usable |
| Fixed footer may overlap form on small heights | Match EN: in-flow footer or safe padding-bottom |

### Action 7.3 — Responsive breakpoints (measure, then code)
1. When right splash disappears (our `900px` — verify EN)
2. Form padding mobile
3. Social buttons: stay row or stack on 320px? Measure
4. Hero text never shows on mobile if EN hides it
5. Safe-area insets for notched phones

---

## 8. Asset production checklist

### Action 8.1 — Create/adapt assets
- [ ] `logo.svg` — Notin mark at EN elephant optical size
- [ ] `splash.svg` — full right-pane art
- [ ] `google-g.svg` — official 4-color
- [ ] `apple.svg` — monochrome black logo
- [ ] Favicon for auth pages
- [ ] Optional: `og` image not required for auth

### Action 8.2 — Asset QA
- [ ] No Evernote elephant / wordmark left in final
- [ ] SVG optimized, no external image hotlinks
- [ ] Retina crisp (SVG preferred over PNG)

---

## 9. Content & microcopy sheet (fill during refine)

| Key | Evernote | Notin final |
|-----|----------|-------------|
| page_title_signup | Create a new Evernote account | Create a new Notin account |
| page_title_login | Login to your Evernote account | Log in to your Notin account |
| h1_signup | Welcome to Evernote! | Welcome to Notin! |
| h1_login | Sign in | Sign in |
| sub_signup | Sign up and start taking notes. | *(same)* |
| sub_login | to continue to your Evernote account. | to continue to your Notin account. |
| btn_continue | Continue | Continue |
| btn_google | Continue with Google | Continue with Google |
| btn_apple | Continue with Apple | Continue with Apple |
| legal | (EN sentence) | (same structure, Notin links) |
| switch_to_login | Already have an account? Log in | *(same)* |
| switch_to_signup | Don’t have an account? Sign up | *(same)* |
| cant_sign_in | Can't sign in? Click here | *(same or Notin help URL)* |
| error_invalid_email | *(capture)* | |
| error_generic | *(capture)* | |
| otp_title | *(our addition in EN style)* | Check your email |
| otp_help | | Enter the 6-digit code we sent to {email} |

---

## 10. QA protocol (definition of done)

### Action 10.1 — Visual diff
1. Overlay Notin vs Evernote screenshots at 50% opacity (desktop + mobile).
2. Checklist per component (Section 4) = all green.
3. Tolerance: ≤2px spacing, ≤1 shade color on non-brand surfaces.

### Action 10.2 — Functional QA
- [ ] Signup email validation
- [ ] Login ↔ signup switch preserves email
- [ ] Google button hits Auth API base URL
- [ ] OTP step reads `challenge` + `email` from query
- [ ] Loading prevents double submit
- [ ] Keyboard-only complete path
- [ ] 320 / 390 / 768 / 1280 / 1440 widths
- [ ] No horizontal scroll
- [ ] Lighthouse a11y ≥ 95 on auth pages

### Action 10.3 — Cross-link from marketing
- Landing **Log in** → `authentication/login.html`
- Landing **Start for free** → `authentication/index.html`
- After success → future `/app` (placeholder OK)

---

## 11. Phased action order (execution sequence)

Do **in this order** when you approve implementation:

### Phase P0 — Research lock (no product code)
1. Action 1.1 screenshots  
2. Action 1.2 tokens.json  
3. Action 1.3 copy table freeze  
4. Download splash.svg + social icons  

### Phase P1 — Shell clone (static visual)
1. Restructure HTML to EN DOM order  
2. Rebuild CSS tokens + layout  
3. Integrate splash.svg + hero type  
4. Logo, heading, email, continue, or, social, legal, switch link, footer  
5. Visual diff S0 vs Evernote registration  

### Phase P2 — Login twin
1. `login.html` from same system  
2. Copy/subtitle/links per L0  
3. “Can’t sign in?” row  
4. Visual diff vs Evernote login  

### Phase P3 — Step screens
1. Password step UI  
2. OTP step UI (EN visual language)  
3. Error + loading components  
4. Empty/invalid/success states  

### Phase P4 — Behavior
1. State machine + URL query sync  
2. Stub APIs + dev OTP  
3. Google redirect hook  
4. Marketing CTAs point here  

### Phase P5 — Polish
1. Mobile parity  
2. A11y pass  
3. Reduced motion  
4. Final overlay QA + screenshot pack in `screenshots/auth/`  

### Phase P6 — API integration (after UI sign-off)
1. Connect Auth API + Notes API  
2. Unify user store decision (separate plan)  
3. Production captcha decision  

---

## 12. File-level work list (when implementing)

| File | Action |
|------|--------|
| `authentication/index.html` | Rewrite DOM to EN signup structure + step roots |
| `authentication/login.html` | **Create** EN login structure |
| `authentication/styles.css` | Full rebuild from tokens; delete rough clip-path-only approach once splash lands |
| `authentication/script.js` | Replace alerts with state machine |
| `authentication/assets/*` | **Create** logo, splash, google, apple |
| `authentication/reference/*` | Store screenshots + tokens (gitkeep; large PNGs optional LFS) |
| `frontend/index.html` | Point Log in / Start free → auth pages |
| `frontend/index-neon.html` | Same CTA targets |
| `authentication/README.md` | Document routes + dev stubs |

---

## 13. Current gap score (so refine prompt can prioritize)

| Area | Now | Target |
|------|-----|--------|
| Signup S0 layout | ~75% | 100% |
| Splash art fidelity | ~55% (CSS approx) | 100% (SVG) |
| Typography/spacing tokens | ~70% | 100% |
| Social icons | Google OK / Apple fail | 100% |
| Login page L0 | 0% (link only) | 100% |
| Password step | 0% | 100% |
| OTP step UI | 0% (alert only) | 100% |
| Errors/loading | ~20% | 100% |
| Marketing CTA wiring | partial | 100% |
| Real API wiring | ~10% | 100% (P6) |

---

## 14. Risks & decisions YOU should settle in the refine prompt

Reply / refine with choices on:

1. **Splash art:** recreate original SVG vs adapt Evernote `splash.svg` shapes?  
2. **Apple button:** ship real SIWA later, or show button as disabled/coming soon, or hide?  
3. **Password vs OTP-first:** Evernote is mostly email+password (+ Google). Our backend is Google+OTP and/or Notes API password signup.  
   - **EN-faithful:** email → password  
   - **Product-faithful:** email → OTP  
   - **Hybrid:** password for email users + OTP after Google *(recommend hybrid)*  
4. **Captcha:** visual placeholder only vs real hCaptcha?  
5. **Language selector:** include EN-style `EN` dropdown stub?  
6. **Footer:** Evernote-minimal vs Notin © + Security/Legal/Privacy?  
7. **Single URL vs `/login` + `/signup` files?**  
8. **Post-auth destination:** placeholder page or wait for editor?  
9. **Should Neon theme get a dark auth variant** or always light like Evernote Accounts? *(EN accounts is light-only — recommend light-only)*  

---

## 15. Suggested refine-prompt template (copy/paste for me later)

```
Refine the AUTH UI clone plan and then implement Phase P0–P5.

Decisions:
- Splash: [recreate / adapt]
- Apple: [real later / disabled / hide]
- Auth path: [EN password / OTP-first / hybrid]
- Captcha: [placeholder / real]
- Language: [yes stub / no]
- Footer: [EN-minimal / Notin legal]
- Routes: [two HTML files / one SPA]
- After login go to: [url]
- Dark auth: [no / yes]

Priorities:
1) ...
2) ...

Also attach/drop Evernote screenshots into authentication/reference/screenshots/
```

---

## 16. One-page action summary

1. **Screenshot + token-lock** Evernote registration & login (all states).  
2. **Freeze copy** Evernote→Notin.  
3. **Rebuild shell** left form + right splash.svg (not CSS-only shapes).  
4. **Clone components** logo, fields, continue, or, Google/Apple, legal, switch links.  
5. **Add login page** twin.  
6. **Add steps** password + OTP + errors/loading in EN visual language.  
7. **State machine** + URL query (`email`, `step`, `challenge`).  
8. **Wire marketing CTAs**; stub APIs.  
9. **Overlay QA** until ≤2px.  
10. **Only then** connect real Auth/Notes APIs.

---

*End of plan. No UI code was changed in this step — ready for your refine prompt.*
