# 🏗️ Notin Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NOTIN REPOSITORY                                  │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   FRONTEND      │  │    BACKEND       │  │  AUTHENTICATION   │          │
│  │   (✅ COMPLETE)  │  │   (⚠️ PLANNED)   │  │   (⚠️ PLANNED)   │          │
│  │                 │  │                 │  │                 │          │
│  │  ┌─────────────┐│  │  ┌─────────────┐│  │  ┌─────────────┐│          │
│  │  │  index.html ││  │  │  API Server  ││  │  │   OAuth      ││          │
│  │  │ (1,023 L)  ││  │  │ (Express)    ││  │  │ (Google,    ││          │
│  │  └─────────────┘│  │  │             ││  │  │  GitHub)    ││          │
│  │  ┌─────────────┐│  │  │  ┌─────────┐│  │  │  ┌─────────┐│          │
│  │  │ context.html││  │  │  │ Database││  │  │  │  JWT    ││          │
│  │  │ (330 L)    ││  │  │  │ (PostgreSQL)│  │  │  │         ││          │
│  │  └─────────────┘│  │  │  └─────────┘│  │  │  └─────────┘│          │
│  │  ┌─────────────┐│  │  │             ││  │  │             ││          │
│  │  │  input.css  ││  │  │  Sync       ││  │  │  Sessions   ││          │
│  │  │ (1,455 L)  ││  │  │  Protocol   ││  │  │  Management ││          │
│  │  └─────────────┘│  │  │             ││  │  │             ││          │
│  │  ┌─────────────┐│  │  └─────────────┘│  │  └─────────────┘│          │
│  │  │  script.js  ││  │                 │  │                 │          │
│  │  │ (985 L)    ││  │  ┌─────────────┐│  │  ┌─────────────┐│          │
│  │  └─────────────┘│  │  │   Search     ││  │  │ Encryption  ││          │
│  │                 │  │  │   Service    ││  │  │ (Zero-       ││          │
│  │  ┌─────────────┐│  │  │             ││  │  │  Knowledge)  ││          │
│  │  │   assets/    ││  │  └─────────────┘│  │  └─────────────┘│          │
│  │  │  - videos   ││  │                 │  │                 │          │
│  │  │  - icons    ││  │  ┌─────────────┐│  │                 │          │
│  │  │  - images   ││  │  │   AI        ││  │                 │          │
│  │  └─────────────┘│  │  │   Features   ││  │                 │          │
│  │                 │  │  │             ││  │                 │          │
│  └─────────────────┘  │  └─────────────┘  │  └─────────────────┘          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                         DOCS (Mirror of Frontend)                       ││
│  │                                                                       ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  ││
│  │  │  index.html │  │ input.css   │  │  script.js  │                  ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  ││
│  │  ┌─────────────┐  ┌─────────────┐                                  ││
│  │  │ index-neon  │  │ styles.css  │                                  ││
│  │  └─────────────┘  └─────────────┘                                  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    SCREENSHOTS (78 verification images)                 ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📱 Landing Page Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            index.html (1,023 lines)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  1. NAVBAR (Sticky, Glass-morphism)                                    ││
│  │     ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  ││
│  │     │   Logo      │  │ Mega-Menus  │  │  CTA Stack (Login/DL/    │  ││
│  │     │  (Notin)    │  │ (Features/  │  │   Start Free + Theme     │  ││
│  │     └─────────────┘  │ Explore/    │  │   Toggle)               │  ││
│  │                    │  │ Plans)      │  │                         │  ││
│  └────────────────────┴─────────────┴─────────────────────────┘          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  2. HERO (Split Layout: 50/50)                                        ││
│  │     ┌─────────────────────────────┐  ┌─────────────────────────┐  ││
│  │     │  LEFT: Copy                   │  │  RIGHT: Video + 3D Assets │  ││
│  │     │  - "Your second brain"        │  │  - Hero Video (MP4)      │  ││
│  │     │  - Subheadline                │  │  - 3D Note Cards (3)     │  ││
│  │     │  - "Get Notin free" CTA       │  │  - AI Badge (glowing)    │  ││
│  │     │  - "Already have account?"     │  │  - Rotating Ring         │  ││
│  │     │  - Download CTA (OS-aware)    │  │  - Mouse Parallax        │  ││
│  │     └─────────────────────────────┘  └─────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  3. CARDS SHOWCASE (8 Feature Cards)                                   ││
│  │     ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                ││
│  │     │ Template │ │Notebooks │ │  Search  │ │  Tasks   │ ...            ││
│  │     │          │ │& Spaces  │ │          │ │          │                ││
│  │     └──────────┘ └──────────┘ └──────────┘ └──────────┘                ││
│  │     - Infinite loop (dual sets)                                        ││
│  │     - Circle designs on hover/click                                   ││
│  │     - Autoplay (2.6s interval)                                        ││
│  │     - 56px arrow buttons (bottom-center)                             ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  4. CAPTURE (Split Row)                                               ││
│  │     ┌─────────────────────┐  ┌─────────────────────┐                ││
│  │     │  Copy (left)         │  │  App Mockup (right)  │                ││
│  │     │  - "Capture ideas..."│  │  - Note interface     │                ││
│  │     │  - Feature list      │  │  - Checklist          │                ││
│  │     │  - "Try it free" CTA │  │  - Tags               │                ││
│  │     └─────────────────────┘  └─────────────────────┘                ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  5. ORGANIZE SHOWCASE (Layered Composition)                          ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  Cream Container (#F6F0E7)                                    │││
│  │     │  ┌─────────────────┐  ┌─────────────────┐                  │││
│  │     │  │  Photo (left)     │  │  Content (right)  │                  │││
│  │     │  │  - Workspace img  │  │  - "Bring order..."│                  │││
│  │     │  │  - Notebook card  │  │  - Description     │                  │││
│  │     │  │  - Task card      │  │  - "Try it free"   │                  │││
│  │     │  │  - Floating labels│  │  - K-shape decals  │                  │││
│  │     │  │  (Ideas, Draft,   │  │                    │                  ││
│  │     │  │   Collabs)        │  │                    │                  │││
│  │     │  └─────────────────┘  └─────────────────┘                  │││
│  │     └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  6. TESTIMONIALS (Carousel)                                           ││
│  │     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              ││
│  │     │ Testimonial 1 │ │ Testimonial 2 │ │ Testimonial 3 │ ...          ││
│  │     │  - Quote     │ │  - Quote     │ │  - Quote     │              ││
│  │     │  - Author    │ │  - Author    │ │  - Author    │              ││
│  │     └──────────────┘ └──────────────┘ └──────────────┘              ││
│  │     - Scroll-snap based                                                ││
│  │     - 56px circular arrow buttons (bottom-center)                       ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  7. PRICING (3 Tiers)                                                 ││
│  │     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                ││
│  │     │   FREE      │  │    PRO      │  │   TEAM      │                ││
│  │     │  - ₹0       │  │  - 14-day   │  │  - Contact  │                ││
│  │     │  - Unlimited│  │   trial     │  │   sales     │                ││
│  │     │   notes    │  │  - Everything│  │  - Everything│                ││
│  │     │  - 3 devices│  │   in Free   │  │   in Pro    │                ││
│  │     │  - Basic    │  │  - AI search │  │  + Shared   │                ││
│  │     │   search   │  │  - Encryption│  │   workspaces │                ││
│  │     └─────────────┘  └─────────────┘  └─────────────┘                ││
│  │     - Monthly/Yearly toggle (billing)                                  ││
│  │     - Pro card has "Most popular" badge                                ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  8. AI TOOLS BAND (Promo)                                             ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  "Want to give AI a try?"                                      │││
│  │     │  - Upload  - Record  - Transcribe  [Try it for free]           │││
│  │     └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  9. DOWNLOAD (6 Platforms + Web Clipper)                             ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  Smart Download Strip                                          │││
│  │     │  - "Get the build for your device"                             │││
│  │     │  - OS detection (Windows/Mac/Linux/iOS/Android/Web)           │││
│  │     │  - Smart CTA button                                            │││
│  │     │  - QR code for mobile                                          │││
│  │     └─────────────────────────────────────────────────────────────┘││
│  │                                                                       ││
│  │     Platform Grid (2x3):                                             ││
│  │     ┌──────────┐ ┌──────────┐ ┌──────────┐                          ││
│  │     │  Web     │ │ Windows  │ │  macOS   │                          ││
│  │     └──────────┘ └──────────┘ └──────────┘                          ││
│  │     ┌──────────┐ ┌──────────┐ ┌──────────┐                          ││
│  │     │  Linux   │ │   iOS    │ │ Android  │                          ││
│  │     └──────────┘ └──────────┘ └──────────┘                          ││
│  │                                                                       ││
│  │     Web Clipper:                                                    ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  "Save anything from the web"                                 │││
│  │     │  [Chrome] [Firefox] [Safari]                                   │││
│  │     └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  10. DARK CTA (Evernote-style)                                       ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  Background: #141414 with lime glow (#94E130)                   │││
│  │     │  "NEW" badge                                                  │││
│  │     │  "Your productivity, supercharged"                           │││
│  │     │  "Discover more →"                                            │││
│  │     └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  11. FAQ (4 Items)                                                  ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  Q: Is Notin free to use?                                     ││
│  │     │  A: Yes! Free plan includes...                               ││
│  │     │                                                               ││
│  │     │  Q: Which platforms does Notin support?                       ││
│  │     │  A: Web, Windows, macOS, Linux, iOS, Android...               ││
│  │     │                                                               ││
│  │     │  Q: Are my notes private and secure?                          ││
│  │     │  A: Absolutely. End-to-end encrypted...                        ││
│  │     │                                                               ││
│  │     │  Q: Can I work offline?                                        ││
│  │     │  A: Yes. Full offline support...                              ││
│  │     └─────────────────────────────────────────────────────────────┘││
│  │     - Accordion-style (details/summary)                              ││
│  │     - + / - indicators                                               ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  12. FOOTER (4 Columns)                                             ││
│  │     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              ││
│  │     │  Product    │  │  Company     │  │  Legal       │              ││
│  │     │  - Features │  │  - About     │  │  - Privacy   │              ││
│  │     │  - Pricing   │  │  - Blog      │  │  - Terms     │              ││
│  │     │  - Download  │  │  - Careers   │  │  - Security   │              ││
│  │     │  - Changelog│  │  - Contact   │  │              │              ││
│  │     └─────────────┘  └─────────────┘  └─────────────┘              ││
│  │     ┌─────────────────────────────────────────────────────────────┐││
│  │     │  © 2026 Notin. All rights reserved.                         │││
│  │     │  Made with ❤️ in India                                        │││
│  │     └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Motion & Interaction System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOTION ENGINE ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCROLL SYSTEM                                                              │
│  ├─ Scroll Progress Bar (top, 3px height)                                  │
│  │  └─ Updates on scroll via requestAnimationFrame                          │
│  ├─ Back-to-Top Button (bottom-right)                                      │
│  │  └─ Appears after 600px scroll                                          │
│  └─ Navbar Shrink                                                          │
│     └─ Height reduces from 72px to 58px after 260px scroll                  │
│                                                                              │
│  REVEAL SYSTEM                                                             │
│  ├─ IntersectionObserver based                                            │
│  │  └─ Threshold: 0.12                                                     │
│  ├─ Staggered Reveals                                                      │
│  │  └─ Delay: i * 70ms (max 420ms)                                         │
│  └─ CSS Transitions                                                       │
│     └─ opacity: 0 → 1, transform: translateY(22px) → none                  │
│                                                                              │
│  3D SYSTEM                                                                 │
│  ├─ Tilt Cards                                                             │
│  │  └─ perspective(900px) rotateX/Y + translateY                           │
│  ├─ Magnetic Buttons                                                       │
│  │  └─ Follows cursor with transform (dx/dy * 0.22)                        │
│  ├─ Hero 3D Assets                                                         │
│  │  └─ Mouse parallax: --px3d/--py3d CSS vars                               │
│  └─ Parallax Layers                                                       │
│     └─ data-parallax attribute controls speed                              │
│                                                                              │
│  CAROUSEL SYSTEM                                                           │
│  ├─ Features Carousel                                                      │
│  │  ├─ Infinite loop (dual card sets)                                      │
│  │  ├─ Autoplay (2.6s interval)                                            │
│  │  └─ Pauses on hover/touch                                               │
│  └─ Testimonials Carousel                                                 │
│     └─ Scroll-snap based with arrow buttons                                 │
│                                                                              │
│  VIDEO SYSTEM                                                              │
│  ├─ Hero Video                                                            │
│  │  ├─ <video autoplay muted loop playsinline>                            │
│  │  ├─ Play-enforcer (retries + gesture fallback)                        │
│  │  └─ Poster fallback                                                    │
│  └─ Video Lightbox                                                        │
│     └─ Modal with backdrop blur + full video player                        │
│                                                                              │
│  THEME SYSTEM                                                             │
│  └─ Cookie-based switcher (Green ⇄ Neon)                                  │
│     └─ Redirects between index.html and index-neon.html                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT TREE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  App                                                                         │
│  ├─ Navbar                                                                  │
│  │  ├─ Logo (img + text)                                                   │
│  │  ├─ MegaMenu (3x)                                                        │
│  │  │  ├─ MegaDrop (Features/Explore/Plans)                                │
│  │  │  │  ├─ MegaBtn (trigger)                                              │
│  │  │  │  └─ MegaPanel (dropdown)                                           │
│  │  │  │     └─ MegaCard (content)                                         │
│  │  │  │        ├─ MegaLabel (category)                                     │
│  │  │  │        └─ MegaLink (8x in Features)                                │
│  │  │  │           ├─ Icon (SVG)                                            │
│  │  │  │           ├─ Label (text)                                         │
│  │  │  │           └─ Description (text)                                   │
│  │  │  └─ MegaPlan (3x in Plans)                                           │
│  │  │     ├─ Plan Name                                                    │
│  │  │     ├─ Plan Description                                             │
│  │  │     └─ Plan Price                                                   │
│  │  └─ CTAStack                                                            │
│  │     ├─ Login (text link)                                               │
│  │     ├─ Download (btn-outline-evernote)                                  │
│  │     ├─ Start Free (btn-3d)                                             │
│  │     └─ ThemeToggle                                                    │
│  │        ├─ Dot (gradient)                                                │
│  │        └─ Label ("Switch to Neon")                                     │
│  │                                                                       │
│  ├─ Hero                                                                   │
│  │  ├─ CopyBlock                                                           │
│  │  │  ├─ Badge ("New — AI-powered search")                                │
│  │  │  ├─ Headline ("Your second brain")                                  │
│  │  │  ├─ Subheadline                                                     │
│  │  │  ├─ CTA Group                                                        │
│  │  │  │  ├─ Get Notin Free (btn-3d)                                       │
│  │  │  │  └─ Download (btn-outline-evernote, OS-aware)                    │
│  │  │  └─ Login Link                                                      │
│  │  └─ VisualBlock                                                        │
│  │     ├─ HeroVideo (video element)                                       │
│  │     ├─ Hero3D (4x)                                                     │
│  │     │  ├─ Note A (Ideas 24 notes)                                       │
│  │     │  ├─ Note B (3 tasks done today)                                   │
│  │     │  ├─ Note C (Collabs 18 people)                                    │
│  │     │  └─ Badge (AI, glowing)                                          │
│  │     └─ HeroRing (rotating)                                             │
│  │                                                                       │
│  ├─ CardsShowcase                                                         │
│  │  ├─ Header (headline + subheadline)                                    │
│  │  ├─ CarouselTrack                                                      │
│  │  │  └─ Card (8x, duplicated for loop)                                   │
│  │  │     ├─ ShowcaseCircles (2x: big + small)                             │
│  │  │     │  └─ SVG (decorative shapes)                                    │
│  │  │     ├─ Icon (SVG)                                                    │
│  │  │     ├─ Title (h5)                                                   │
│  │  │     └─ Description (p)                                              │
│  │  └─ Arrows (prev/next)                                                 │
│  │                                                                       │
│  ├─ SplitContent (Capture)                                                │
│  │  ├─ Copy (left)                                                        │
│  │  │  ├─ Eyebrow ("Capture")                                            │
│  │  │  ├─ Headline                                                        │
│  │  │  ├─ Description                                                     │
│  │  │  ├─ Feature List (4 items with checkmarks)                         │
│  │  │  └─ CTA ("Try it free")                                            │
│  │  └─ Visual (right)                                                     │
│  │     └─ AppMockup (note interface)                                     │
│  │        ├─ Window Chrome                                                │
│  │        ├─ Note Content                                                 │
│  │        ├─ Tags (3x)                                                    │
│  │        └─ Mock Caret (animated)                                         │
│  │                                                                       │
│  ├─ OrganizeShowcase                                                      │
│  │  ├─ Visual (left)                                                      │
│  │  │  ├─ Decorations (3x: top/left/bottom)                               │
│  │  │  ├─ Photo (workspace image)                                         │
│  │  │  │  └─ Fallback (if image fails)                                    │
│  │  │  ├─ NotebookCard                                                   │
│  │  │  │  ├─ Header (icon + label + chevron)                               │
│  │  │  │  ├─ Rows (6x notebook items)                                     │
│  │  │  │  └─ Create Action ("New Notebook")                               │
│  │  │  ├─ TaskCard                                                        │
│  │  │  │  ├─ Primary Task (title + metadata + avatar)                      │
│  │  │  │  ├─ Completed Task (with checkbox)                                │
│  │  │  │  └─ Input Row ("Enter task")                                     │
│  │  │  └─ FloatingLabels (3x: Ideas/Draft/Collabs)                         │
│  │  └─ Content (right)                                                    │
│  │     ├─ Badge ("Organize")                                             │
│  │     ├─ Headline                                                        │
│  │     ├─ Description                                                     │
│  │     └─ CTA ("Try it for free") + Status Messages                       │
│  │                                                                       │
│  ├─ Testimonials                                                         │
│  │  ├─ Header                                                             │
│  │  └─ CarouselTrack                                                      │
│  │     └─ Testimonial (6x)                                                │
│  │        ├─ Blockquote                                                   │
│  │        └─ Figcaption (author + role)                                   │
│  │                                                                       │
│  ├─ Pricing                                                               │
│  │  ├─ Header + Billing Toggle                                            │
│  │  └─ Grid (3x)                                                          │
│  │     └─ PriceCard                                                       │
│  │        ├─ Tier Name (Free/Pro/Team)                                    │
│  │        ├─ Price (with monthly/yearly)                                  │
│  │        ├─ Feature List (4-5 items)                                     │
│  │        └─ CTA Button                                                   │
│  │                                                                       │
│  ├─ AIToolsBand                                                           │
│  │  ├─ Copy (left)                                                        │
│  │  └─ Chips (right)                                                     │
│  │     └─ AIChip (3x: Upload/Record/Transcribe)                          │
│  │                                                                       │
│  ├─ Download                                                               │
│  │  ├─ Header                                                             │
│  │  ├─ SmartDownloadStrip                                                 │
│  │  │  ├─ OS Badge (detected device)                                      │
│  │  │  ├─ Headline (OS-aware)                                             │
│  │  │  ├─ Description                                                     │
│  │  │  └─ Smart CTA + QR Code                                             │
│  │  └─ PlatformGrid (2x3)                                                 │
│  │     └─ PlatformCard (6x: Web/Windows/macOS/Linux/iOS/Android)          │
│  │        ├─ RecBadge (if recommended)                                    │
│  │        ├─ Icon (brand SVG)                                              │
│  │        ├─ Info (name + subtitle)                                       │
│  │        └─ DownloadLink                                                │
│  │                                                                       │
│  ├─ DarkCTA                                                                │
│  │  ├─ Background (lime glow)                                             │
│  │  ├─ Badge ("NEW")                                                      │
│  │  ├─ Headline ("Your productivity, supercharged")                      │
│  │  ├─ Description                                                        │
│  │  └─ CTA Link ("Discover more")                                        │
│  │                                                                       │
│  ├─ FAQ                                                                   │
│  │  ├─ Header                                                             │
│  │  └─ Items (4x)                                                         │
│  │     └─ FaqItem (details/summary)                                       │
│  │        ├─ Summary (question + indicator)                                │
│  │        └─ FaqBody (answer)                                             │
│  │                                                                       │
│  └─ Footer                                                                │
│     ├─ Brand (logo + tagline)                                             │
│     ├─ Columns (4x: Product/Company/Legal)                                │
│     │  └─ Links (various)                                                 │
│     └─ Bottom (copyright + made in India)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design Token System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TAILWIND v4 THEME                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  @theme {                                                                   │
│    --font-sans: "Inter", -apple-system, "SF Pro Text", sans-serif;          │
│    --font-display: "IBM Plex Sans", "Inter", sans-serif;                  │
│    --font-mono: "JetBrains Mono", ui-monospace, monospace;                 │
│                                                                              │
│    /* BRAND PALETTE */                                                     │
│    --color-brand-50:  #e9f9ee;    // Lightest green                        │
│    --color-brand-100: #eefad8;    // Lighter green                         │
│    --color-brand-200: #ddf4b2;    // Light green                           │
│    --color-brand-300: #c4ec82;    // Medium-light green                    │
│    --color-brand-400: #a8f05a;    // Medium green                           │
│    --color-brand-500: #8fe333;    // PRIMARY (Evernote green)              │
│    --color-brand-600: #7cc92a;    // Darker green                          │
│    --color-brand-700: #5fa11e;    // Dark green                            │
│    --color-brand-800: #005c1a;    // Darkest green                         │
│                                                                              │
│    /* SEMANTIC SURFACES */                                                 │
│    --color-bg-primary:   #f4eee5;    // Warm cream (page bg)                │
│    --color-bg-secondary: #f9f6f2;    // Lighter cream (section bg)         │
│    --color-bg-tertiary:  #141414;    // Near-black (dark sections)         │
│    --color-surface:      #ffffff;    // White (cards)                       │
│                                                                              │
│    /* SEMANTIC TEXT */                                                    │
│    --color-text-primary:   #141414;    // Dark (main text)                  │
│    --color-text-secondary: #292929;    // Medium-dark (secondary)            │
│    --color-text-tertiary:  #8b877f;    // Light (muted text)                │
│                                                                              │
│    /* SEMANTIC STROKES */                                                  │
│    --color-stroke-cards:   #e7e0d3;    // Card borders                      │
│    --color-stroke-buttons: #d8d0c0;    // Button borders                   │
│  }                                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 CSS Class Usage Analysis

### Most Used Classes (by frequency)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Rank  │  Class              │  Usage Count  │  Purpose                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  1     │  reveal            │  50+         │  Scroll-triggered animations   │
│  2     │  rounded-2xl       │  40+         │  Card border radius            │
│  3     │  border            │  35+         │  Border styling                │
│  4     │  border-stroke-cards│ 30+         │  Card borders                  │
│  5     │  bg-surface        │  25+         │  Card backgrounds              │
│  6     │  p-6 / p-7         │  25+         │  Card padding                  │
│  7     │  text-text-secondary│ 20+         │  Secondary text color          │
│  8     │  transition        │  20+         │  Smooth transitions            │
│  9     │  hover:...         │  20+         │  Hover states                  │
│  10    │  flex             │  15+         │  Flexbox layout                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Performance Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PERFORMANCE OPTIMIZATIONS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LOADING PERFORMANCE                                                        │
│  ├─ No CDN dependencies (all local)                                        │
│  ├─ Pre-compiled CSS (28KB minified)                                       │
│  ├─ Inlined critical CSS (none - all pre-compiled)                         │
│  ├─ Lazy-loaded images (loading="lazy")                                   │
│  ├─ Async decoded images (decoding="async")                               │
│  └─ Preloaded fonts (Google Fonts)                                         │
│                                                                              │
│  RENDERING PERFORMANCE                                                    │
│  ├─ GPU-accelerated animations (transform/opacity only)                   │
│  ├─ will-change for animated elements                                      │
│  ├─ requestAnimationFrame for smooth animations                            │
│  └─ No layout thrashing (transform-based animations)                      │
│                                                                              │
│  MEMORY EFFICIENCY                                                         │
│  ├─ Single rAF loop for parallax (shared across elements)                  │
│  ├─ Event delegation where possible                                       │
│  └─ Cleanup of animation frame requests                                   │
│                                                                              │
│  ACCESSIBILITY                                                            │
│  ├─ prefers-reduced-motion support                                        │
│  │  └─ All animations disabled when reduced motion preferred             │
│  ├─ ARIA labels and roles                                                 │
│  ├─ Semantic HTML (section, article, figure, etc.)                         │
│  ├─ Focus management for modals                                           │
│  └─ Keyboard navigation support                                          │
│                                                                              │
│  SEO                                                                       │
│  ├─ Semantic HTML structure                                               │
│  ├─ Meta tags (title, description, keywords)                               │
│  ├─ Open Graph tags                                                       │
│  ├─ Twitter Card tags                                                     │
│  ├─ JSON-LD structured data                                               │
│  └─ Canonical URL                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Summary

This architecture diagram provides a comprehensive visual representation of:

1. **Repository Structure** - How files and folders are organized
2. **Page Architecture** - The 12 sections of the landing page
3. **Component Hierarchy** - Parent-child relationships
4. **Motion System** - Animation and interaction architecture
5. **Design Tokens** - Color palette and typography system
6. **Performance** - Optimization strategies

The Notin project demonstrates **exceptional architectural design** with:
- Clear separation of concerns
- Reusable component patterns
- Efficient animation systems
- Comprehensive accessibility
- Production-ready performance
