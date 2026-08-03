# Notin

Note-taking app — thoughts, beautifully organized.

## 📁 Project Structure

```
notin/
├── index.html          ← Entry point. Redirects to the frontend.
├── frontend/           ← All frontend code (landing site)
│   ├── index.html      ← The website (home page)
│   ├── context.html    ← About / roadmap page
│   ├── input.css       ← Design tokens + scoped styles (Tailwind v4 source)
│   ├── styles.css      ← Pre-compiled CSS (works offline — no CDN)
│   ├── script.js       ← All interactions (menu, demo, parallax, CTA states…)
│   ├── assets/         ← Images, 3D logo, Lottie animation, fonts data
│   └── package.json    ← Build tooling (Tailwind CLI)
├── backend/            ← (future) API, storage, sync
├── authentication/     ← (future) auth flows, sessions, tokens
└── screenshots/        ← Design verification captures
```

## 🚀 Run It

1. **Open** `notin/index.html` in any browser → redirects to `frontend/index.html`.
   No build step, no server needed — everything is pre-compiled and offline-ready.
2. **Rebuild CSS** (after editing `input.css`):
   ```bash
   cd frontend
   npm install
   npx @tailwindcss/cli -i input.css -o styles.css --minify
   ```
3. **Deploy** — upload the whole `notin/` folder to any static host
   (Netlify / Vercel / GitHub Pages). The root `index.html` handles the entry.

## 🎨 Brand

- Colors: orange `#ff7d42` · yellow `#fbca39` · cream `#f8f7f3` · near-black `#2c2d2a`
- Font: Inter (self-hosted via preloaded woff2)

## 🌈 Neon Edition

A neon + black variant of the landing page:
- **Open** `frontend/index-neon.html`
- Files: `frontend/index-neon.html`, `frontend/input-neon.css`, `frontend/styles-neon.css`
- Same Evernote-style structure, re-skinned with neon cyan `#00E5FF` + magenta `#FF2EC4` + lime `#B6FF00` glows on pure black
- Rebuild: `npx @tailwindcss/cli -i input-neon.css -o styles-neon.css --minify`
