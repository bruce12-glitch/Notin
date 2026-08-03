# 🔍 Deep Code Analysis — Evernote Landing Page (Target Website)

**Source analyzed:** Full 4.4MB saved homepage (`Best Note Taking App - Organize Your Notes with Evernote.html`) + 12-page PDF capture + 11 devtools screenshots.

---

## 1. Tech Stack Overview

| Layer | Technology | Evidence |
|---|---|---|
| Framework | **Next.js (App Router)** | `/_next/static/chunks/app/[locale]/(prismic)/page-*.js`, `next-size-adjust` meta, `data-nimg` on images |
| Styling | **Tailwind CSS v4** | `bg-bg-primary`, `text-text-primary`, `border-stroke-cards`, `dark:` variants, arbitrary values `md:p-[120px]` |
| CMS | **Prismic** | Route segment `(prismic)`, all copy lives in Prismic fields |
| Animation | **Lottie (lottie-web SVG renderer)** | `__lottie_element_*` ids, `<clipPath>`, `<mask>`, inline base64 frames, `<linearGradient>` |
| Monitoring | **Sentry** | Every component: `data-sentry-component` + `data-sentry-source-file` |
| Icons | **Inline SVG** (`Arrow45`, `LongArrowIcon`, etc.) | 79 SVGs, feather-style paths |
| Bot protection | **hCaptcha** | `js.hcaptcha.com/1/api.js` |

**Key insight:** The page is **fully server-rendered** (all content in the HTML), with ~29 JS chunks loaded async — content visible instantly, interactivity hydrates later.

---

## 2. Page Architecture (Component Tree)

```
<body>
├── <header>  NavigationDesktop / NavigationMobile (mega menus)
├── <section> HeaderVertical ──────────────── HERO (split + Lottie)
├── <section> CardsShowcase ───────────────── feature cards carousel
│              ├── slick-slider (3 clones of 8 cards)
│              └── PrevArrow / NextArrow
├── <section> CallToAction ────────────────── dark AI band
├── <section> SplitContent (Organize) ─────── alternating row 1
├── <section> SplitContent (Recall) ───────── alternating row 2
├── <section> IntervalSection ─────────────── AI tools promo
├── <section> SplitContent (Share) ────────── alternating row 3
├── <section> SplitContent (Capture) ──────── alternating row 4
├── <section> DownloadCards ───────────────── desktop / mobile / web-clipper
└── <footer>  Footer + LegalSection
```

Every section is a **self-contained component** named after its job (`CardsShowcase`, `SplitContent`, `CallToAction`, `IntervalSection`, `DownloadCards`) — this naming convention is the blueprint to copy.

---

## 3. Head & SEO Implementation

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="color-scheme" content="light">
<title>Best Note Taking App - Organize Your Notes with Evernote</title>   ← keyword-first + benefit
<meta name="description" content="Our note taking app helps you capture and prioritize ideas…">
<meta name="keywords" content="evernote">
<meta name="language" content="en-us">
<link rel="canonical" href="https://evernote.com/">
<meta name="twitter:card" content="summary_large_image">
```

**Font strategy:** two `preload`-ed `.woff2` files (`8e9860b6…-s.p.woff2`, `d9fef5bf…-s.p.woff2`) — self-hosted, `font-display: swap`, preloaded with high priority so text renders instantly without CLS.

**Performance pattern:** critical CSS inlined / preloaded (`_next/static/css/*.css`), JS chunks `preload` with `fetchpriority="low"`, images `loading="lazy" decoding="async"`.

---

## 4. Header & Navigation

**Desktop:** `NavigationDesktop` → `NavLink` items + `NavLinkDropDown` mega menus.

Menu structure (observed):
- **AI Features** → AI Transcribe, AI Rewrite, AI Text To Speech, AI Meeting Note Taker, AI Diagrams, AI Detector
- **Explore** → Solutions (Why Evernote, Note Taking, Self organization, Productivity, Collaboration, Web Clipper, Advanced search, Document scanning, Personalization, Tasks, Calendar, Ecosystem)
- **Plans** → Free / Personal / Professional / Teams (via dropdown)
- **Enterprise** → standalone link

Actions: `Log in` (ghost) · `Download` (secondary) · `Start for free` (primary, green)

**Mobile:** `NavigationMobile` → hamburger (`MenuIcon` / `BorderedCrossIcon`) → collapsible accordion (`NavLinkCollapse`) — the mega menus become expandable groups.

**Replication for Notin:** mega-menu dropdown = a `<details>`-style panel or hover dropdown listing sub-features; keep CTA stack `Log in / Download / Get started` on the right.

---

## 5. Hero — `HeaderVertical` (the "video" section)

```
<section class="md:section relative">
  ├── copy block  (rich-wrapper--hero-vertical, centered, text-text-primary)
  │     ├── h1: "Your second brain"
  │     └── p:  "Remember everything and tackle any project…"
  ├── CTA: "Get Evernote free" (green) + "Already have an account? Log in"
  └── visual:
        ├── <figure class="block md:hidden">  ← MOBILE-ONLY image
        │     <img loading="lazy" srcset="…w=1080 1x, …w=1920 2x">
        └── <div class="h-[350px] md:h-[250px] lg:h-[320px] xl:h-[420px] 2xl:h-[480px] flex items-end">
              <svg viewBox="0 0 349 390" …>   ← LOTTIE SVG renderer
```

### The Lottie "video" — how it works (from the devtools screenshots)

The screenshots show the **lottie-web SVG renderer** internals:
- `<svg viewBox="0 0 349 390">` with `preserveAspectRatio="xMidYMid meet"`
- `<defs>` containing `<clipPath id="__lottie_element_10553">` with `<rect>`/`<path>` masks
- Hundreds of `<g transform="matrix(a,b,c,d,e,f)">` groups — one per animation layer, with `opacity`
- `<path fill="rgb(32,32,32)" d="M-9.05…">` — vector shapes (the app UI drawn in vectors!)
- `<image href="data:image/png;base64,…">` — raster frames for complex parts
- `<linearGradient id="__lottie_element_8887" gradientUnits="userSpaceOnUse">` with `<stop>` colors

**How it's implemented:** the site ships a `.json` Lottie file (exported from After Effects via Bodymovin); `lottie-web` parses it and renders animated SVG. The animation draws the **note-taking app UI** (notebooks sidebar, note cards, checklist ticks) in a continuous loop.

**Responsive heights** (the key trick): the container height changes by breakpoint (`350px → 250px → 320px → 420px → 480px`) while the SVG scales with `width:100%; height:100%` — the animation is **cropped/scaled** per device instead of re-rendered.

**Replication for Notin:**
1. Go to lottiefiles.com → create/export a Lottie JSON (or export from AE with Bodymovin)
2. Load with the CDN player:
   ```html
   <div id="lottie" class="h-[350px] md:h-[250px] lg:h-[320px]"></div>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
   <script>
     lottie.loadAnimation({ container: document.getElementById('lottie'),
       renderer: 'svg', loop: true, autoplay: true, path: 'assets/hero-anim.json' });
   </script>
   ```
3. `lottie.setSpeed(0.8)` to slow it; add `prefers-reduced-motion` guard.

*(Our current Notin hero uses a pure CSS/JS demo — a drop-in swap point for a real Lottie file.)*

---

## 6. CardsShowcase — the feature carousel

```
<section class="section overflow-hidden p-6 md:p-[120px] md:pb-[170px] relative">
  ├── header: "Make the most of your ideas—and your time"
  └── <div class="slick-slider slick-initialized">   ← Slick carousel
        ├── 3x clones of the 8-card list (slick duplicates for infinite loop)
        ├── PrevArrow: absolute bottom-center, 56px circle, rotate-180
        └── NextArrow
```

**One feature card (full anatomy):**

```html
<div class="relative flex h-full min-h-[160px] md:min-h-[210px] w-[70vw] flex-col rounded-lg
            p-8 md:w-[300px] overflow-hidden justify-end
            bg-white shadow-showcaseCard md:shadow-none
            md:group-hover:shadow-showcaseCard
            transition-all duration-300
            dark:bg-black-secondary dark:border dark:border-white-stroke-cards
            md:group-hover:translate-y-[-12px]"
     data-sentry-component="CardContent">
  <!-- 1. decorative shape, appears on hover -->
  <img class="absolute … opacity-100 md:opacity-0 md:group-hover:opacity-100
              md:-top-16 md:-right-24 md:rotate-90 md:scale-50
              md:group-hover:translate-x-[-20px] md:group-hover:translate-y-[20px]
              md:group-hover:rotate-0 md:group-hover:scale-100"
       src="shape-6.svg">
  <!-- 2. icon -->
  <img class="mb-10" width="58" height="58" src="template.svg">
  <!-- 3. title + arrow -->
  <h5 class="headline headline--5 font-semibold">Template</h5>
  <Arrow45 />  <!-- diagonal arrow, mobile only -->
  <!-- 4. description -->
  <p class="text-r16 text-text-tertiary">Get further faster with ready-made note structures</p>
</div>
```

**The 8 features:** Template · Notebooks & Spaces · Search · Tasks · Calendar · Web Clipper · Collaborate · AI Features.

**Replication recipe:**
- Card width `w-[70vw]` on mobile (peek carousel) → `md:w-[300px]`
- **Hover = the star:** card lifts `translate-y-[-12px]`, gains `shadow-showcaseCard`, and a decorative shape rotates/scales in from the top-right corner — all via `group-hover` + `transition-all duration-300`
- Infinite loop via Slick; arrows are 56px circular buttons bottom-center
- Cards show **only on hover on desktop** (image `md:opacity-0 md:group-hover:opacity-100`) but always visible on mobile (tap-friendly)

---

## 7. CallToAction — dark band

```
<section class="section bg-bg-secondary bg-cover bg-center bg-no-repeat
                background-image--v11-dark-2 dark border-y border-black">
  <div class="container text-center">
    "Your productivity, supercharged"  →  "Discover more" link
```

- Uses a **dark variant** of the theme (`dark` class + `background-image--v11-dark-2` custom bg)
- `border-y border-black` gives the hard top/bottom edge seen across the design

---

## 8. SplitContent — the alternating rows (×4)

Structure (each ~2.5KB — intentionally lean):

```
Organize  → "Bring order to everything you do" + copy + "Try it for free"
Recall    → "Find what you need, fast" + synced-devices visual
Share     → "Unlock seamless collaboration" + chat visual
Capture   → "Save anything, in any form" + record/transcribe/scan visual
```

Each: **eyebrow label (Organize/Recall/Share/Capture) → bold headline → 1–2 line copy → green CTA**. Alternating image side. These are the workhorses of the page — one component, four content instances (Prismic-driven).

---

## 9. IntervalSection (promo band)

"Want to give AI a try?" — standalone AI tools (Upload, Record, Transcribe image/video/audio) with a "Try it for free" CTA. Wrapped in `bg-bg-secondary border border-stroke-cards` — a **card-like band** rather than full-bleed.

---

## 10. DownloadCards

Three platform groups with SVG brand icons (`AppleIcon`, `MicrosoftIcon`, `MobileIcon`, `GoogleIcon`, `ChromeIcon`, `FirefoxIcon`, `SafariIcon`):

1. **Desktop** — "Get the power of Evernote on your desktop" · Release Notes · Download for Mac · Download for Windows
2. **Mobile** — App Store · Google Play
3. **Web Clipper Extension** — Chrome · Firefox · Safari

**Replication:** platform cards = icon (brand SVG) + platform name + store link; grouped by category with a short pitch line each.

---

## 11. Footer (mega footer)

Three columns of link groups:
- **Solutions** — Why Evernote, Note taking, Self organization, Productivity, Enterprise, Students, Compare plans
- **Explore** — AI features, Collaboration, Web Clipper, Advanced search, Document scanning, Personalization, Calendar, Tasks, Integrations, Sitemap
- **Resources** — Evernote news, Product Updates, Release Notes, Help & learning, Templates, Forum, Find an Expert, Developers
- **Get Started** — Contact us, Careers, About, Bending Spoons

Plus: language selector, `© 2026 Bending Spoons US Inc.` + **Cookie Preferences / Security / Legal / Privacy** (LegalSection). Social icons (`FacebookIcon`, `TwitterIcon`, `MediumIcon`, `InstagramIcon`, `YoutubeIcon`) appear in the page header area (mobile) too.

---

## 12. Design System (from class usage)

| Token family | Examples | Purpose |
|---|---|---|
| `bg-*` | `bg-bg-primary`, `bg-bg-secondary`, `bg-white`, `bg-black-secondary` | Surfaces |
| `text-*` | `text-text-primary`, `text-text-tertiary` | Type hierarchy |
| `border-*` / `stroke-*` | `border-stroke-cards`, `border-white-stroke-cards` | Borders |
| `shadow-*` | `shadow-showcaseCard` | Card lift |
| `headline headline--5`, `text-r16` | Typography scale | Consistent type |
| `dark:` variants | `dark:bg-black-secondary` | Native dark mode |
| `section`, `container` | Layout primitives | Spacing rhythm (`p-6 md:p-[120px]`) |

**Design rules observed:**
- Headlines: tight tracking, `font-semibold`–`extrabold`
- Cards: `rounded-lg`, generous `p-8`, white on cream
- CTAs: solid green pill, dark text on light buttons
- Hard `border-y border-black` on dark bands
- Hover: lift + shadow + subtle transform, `transition-all duration-300`

---

## 13. Sentry Instrumentation (monitoring blueprint)

Every component carries:
```html
<div data-sentry-component="CardContent" data-sentry-source-file="Card.tsx">
<svg data-sentry-element="svg" data-sentry-component="Arrow45" data-sentry-source-file="Arrow45.tsx">
```
This gives **error tracking per-component** (Sentry maps crashes to the exact source file) and **component-level analytics**. Zero runtime cost; pure metadata.

---

## 14. Replication Checklist → Notin

| # | Evernote feature | Notin status | How to replicate |
|---|---|---|---|
| 1 | Split hero + Lottie | ✅ done (CSS demo) | Swap `hero-demo` for `lottie.loadAnimation()` with a JSON |
| 2 | Mega-menu nav | ⬜ | `NavigationDesktop` + `NavLinkDropDown` pattern |
| 3 | Feature card hover (lift + shape) | ✅ cards exist | Add `group-hover:translate-y-[-12px]` + corner shape SVG |
| 4 | Slick carousel with 56px arrows | ✅ scroll-snap carousel | Upgrade to Slick/Embla for infinite loop |
| 5 | Dark CTA band `border-y border-black` | ✅ | Already implemented |
| 6 | SplitContent rows ×4 | ✅ 2 rows | Reuse component for Organize/Recall/Share/Capture |
| 7 | DownloadCards (3 groups) | ✅ 6 cards | Group into Desktop/Mobile/Extension |
| 8 | Mega footer | ✅ | Expand link columns + legal bar |
| 9 | `data-sentry-*` instrumentation | ✅ all sections | Add to new components as you build |
| 10 | Self-hosted preloaded fonts | ⬜ Google Fonts | Download woff2, preload in head |
| 11 | Native dark mode (`dark:`) | ⬜ | Add `dark:` variants + toggle |
| 12 | hCaptcha on signup | ⬜ | Add to future auth forms |

---

## 15. Key Takeaways

1. **Component-per-section naming** is the architecture — copy it (`CardsShowcase`, `SplitContent`, …).
2. **The "wow" is Lottie** — one JSON file + container heights = the moving app hero.
3. **Hover choreography** (lift + shadow + decorative shape) makes static cards feel premium for free.
4. **Semantic tokens everywhere** — no hardcoded colors, which is why the site re-themes instantly (we did the same in `input.css`).
5. **SEO is table stakes** — keyword-first title, canonical, lazy images, preloaded fonts, SSR content.
6. **Sentry metadata costs nothing** and pays off in production debugging.
