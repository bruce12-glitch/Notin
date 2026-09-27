# Notin authentication + app UI

This directory is the **static client** for Notin: the signup page
(`index.html`), the sign-in page (`login.html`), the main application
(`app.html` + `app.bundle.js`), the public share viewer (`share.html` +
`share.js`), and the PWA service worker (`sw.js`) and manifest.

It contains **no server**. The legacy standalone `:8787` auth service was
retired — any docs referencing it are stale. Everything here is served by the
unified backend (`backend/`, port 5000), which owns all auth logic
(Google OAuth, email OTP, password sign-in, sessions).

## Run locally

```bash
cd ../backend && npm install && npm start   # serves this directory at http://localhost:5000/
```

Open http://localhost:5000/ (signup) or http://localhost:5000/login.html.

## Developing the app UI

```bash
npm install
npm run build:app   # esbuild: app.js -> app.bundle.js
```

Edit `app.js`, then rebuild. `app.bundle.js` is committed — CI fails if the
bundle is stale relative to the source.

## Service worker cache rule

`sw.js` caches the app shell. Navigations are network-first and static assets
are stale-while-revalidate, but you must still **bump `CACHE_NAME` on every
change to `app.html` or `app.bundle.js`** — offline clients keep the old shell
until the cache identity changes. Mention the bump in your PR.
