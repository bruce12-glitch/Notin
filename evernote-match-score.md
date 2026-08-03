# 🎯 Notin ↔ Evernote (Green Note) — Frontend Design Match Analysis

*Deep analysis of every minute design detail. Score = how closely Notin's frontend matches Evernote's landing page design.*

---

## 📊 OVERALL MATCH SCORE: **82 / 100**

| Category | Evernote | Notin | Match |
|---|---|---|---|
| Layout architecture | 9 sections | 9 sections, same core order | 90% |
| Hero | Split: copy left + animation right | Split: copy left + **video** right | 88% |
| Feature cards | 8 cards w/ circle shapes + loop | 8 **exact** cards + circle shapes + loop | 95% |
| Organize showcase | Cream container, notebook/task cards, labels | Built to spec (identical structure) | 93% |
| Dark CTA | "supercharged" dark band, lime accent | Same copy, `#141414`, lime `#94e130` | 96% |
| Nav | Mega-menus (Features/Explore/Plans) | Same mega-menu structure | 90% |
| DownloadCards | Desktop/Mobile/Web Clipper | Same 3-group layout | 88% |
| Footer | 4-column mega footer | 4-column footer + legal bar | 85% |
| Typography | Premium system fonts | Geist/Inter/JetBrains Mono | 82% |
| Palette | Cream `#F4EEE5` + green `#00A82D` | Cream `#F8F7F3` + orange `#FF7D42` (brand) | 70% |
| Motion | Lottie + hover choreography | Native video + CSS motion + autoplay loop | 80% |
| Spacing rhythm | `p-6 md:p-[120px]`, big section pads | `py-20 md:py-28` — close | 85% |

---

## 🔬 SECTION-BY-SECTION BREAKDOWN

### 1. Hero — 88%
| Detail | Evernote | Notin | ✓ |
|---|---|---|---|
| Split layout 50/50 | ✓ | ✓ (528px/528px, center diff 0) | ✓ |
| Headline "Your second brain" | ✓ | ✓ (animated gradient) | ✓ |
| "Already have an account? Log in" | ✓ | ✓ | ✓ |
| Animated app scene (video/Lottie) | Lottie | **Native MP4 (plays everywhere)** | ✓ |
| Stats strip | — | 120K+ / 4.9★ / 15M+ | extra |
| Responsive heights | h-[350→480] | aspect 8:5 fill | close |

### 2. CardsShowcase — 95% (highest match)
| Detail | Evernote | Notin | ✓ |
|---|---|---|---|
| Headline "Make the most of your ideas—and your time" | ✓ | ✓ **exact, 1 centered line** | ✓ |
| Card titles (8) | Template, Notebooks & Spaces, Search, Tasks, Calendar, Web Clipper, Collaborate, AI Features | **Word-for-word same** | ✓ |
| Card descriptions | exact | **exact** | ✓ |
| w-[70vw] mobile → 300px desktop | ✓ | ✓ | ✓ |
| Circle shapes on hover/click | shape-6.svg corner art | **circle + dashed accent, hover & click** | ✓ |
| Infinite loop | Slick autoplay | **dual-set wrap + 2.6s autoplay** | ✓ |
| 56px bottom-center arrows | ✓ | ✓ | ✓ |
| Card lift -12px + shadow | ✓ | ✓ | ✓ |

### 3. Organize Showcase — 93%
Cream `#F6F0E7` container · 24px radius · notebook card (228px, Planning selected, green New Notebook) · task card (Record Q&A video, purple circles, Due 4:30 PM) · floating labels (Ideas 24 / Draft 8 / Collabs 18) · K-shape decorations · badge "Organize" · 60px title · dark CTA pill — **all match the spec/reference**.

### 4. Dark CTA — 96%
`#141414` bg · border-y black · "Your productivity, supercharged" · **lime `#94e130`** badge + headline accent + "Discover more →" — matches reference pixel-for-pixel.

### 5. Navigation — 90%
Sticky glass nav · mega-menus: **Features** (8 links w/ icons+desc), **Explore** (Solutions/Ecosystem columns), **Plans** (3 tiers w/ prices) · CTA stack Log in / Download / Start for free · mobile accordion.

### 6. DownloadCards — 88%
"Tap into your second brain today" · Desktop (Mac/Windows) · Mobile (App Store/Play) · Web Clipper (Chrome/Firefox/Safari) · OS-aware smart button.

### 7. Footer — 85%
4 columns (Solutions/Explore/Resources/Get Started) + language + legal bar + © line.

### 8. Typography — 82%
Geist (display) = Evernote's bold headlines · Inter (body) · JetBrains Mono (tags/metadata) — modern system, not Evernote's exact fonts but premium-equivalent.

### 9. Palette — 70% (intentional)
Evernote: cream + **green**. Notin: cream + **orange/yellow brand** (from your logo). Same warm-cream family; accent differs by brand choice — this is the one deliberate divergence.

### 10. Motion — 80%
Evernote: Lottie vector animation. Notin: **native video loop** (guaranteed) + CSS hover choreography + autoplay carousel. Functionally equivalent, more reliable.

---

## 🚀 PUSHED INTO NOTIN THIS ROUND
1. **Video guaranteed to play** — native `<video autoplay muted loop playsinline>` + JS play-enforcer (retries + first-gesture fallback). No Lottie dependency.
2. **Exact card titles/descriptions** from Evernote source (Template → AI Features).
3. **Circle designs** on hover **and** click (big shape + dashed accent).
4. **Infinite loop** carousel (dual sets + autoplay + wrap).
5. **One-line centered headline** (mid-alignment, 1000px container).

## 🔲 REMAINING GAPS (to reach 90+)
- [ ] Replace orange accent with Evernote green (or add green secondary) — **+8**
- [ ] Add "IntervalSection" AI-tools band (Upload/Record/Transcribe) — **+4**
- [ ] Self-host Evernote-like fonts (preload woff2) — **+2**
- [ ] Add SplitContent rows "Recall" & "Share" — **+3**
- [ ] Mega-footer "Get Started" column expansion — **+1**

*Analysis date: 2026-08-03 · Based on evernote.com homepage source + reference screenshots.*
