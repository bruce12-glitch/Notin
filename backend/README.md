# Notin Backend (PostgreSQL)

Clean, modern, and stable backend for Notin.

## Tech Stack
- PostgreSQL
- Express.js
- JWT + bcryptjs
- Data model defined in `prisma/schema.prisma` (applied via `npm run db:migrate` using the `pg` driver)

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your PostgreSQL URL.

### Run migrations
```bash
npm run db:migrate
```

### Start server
```bash
npm run dev
```

## API Endpoints

### Auth
- `POST /api/users/signup`
- `POST /api/users/signin`

### Notes (Protected)
- `GET    /api/notes`
- `POST   /api/notes`
- `PUT    /api/notes/:id`
- `DELETE /api/notes/:id`

All note routes require `Authorization: Bearer <token>` header.

## MVP smoke E2E (Playwright)

The Playwright tooling lives in `backend/`. The suite uses Chromium and exercises the shipped UI against the unified API/static server; it does not test Google/SMTP delivery, attachments, offline sync, billing, or other post-MVP features.

### Prerequisites

- Node.js 20 or newer.
- Install both the backend dependencies and the authentication app's TipTap browser modules.
- Apply the database schema once.
- Demo OTP must be enabled for the full journey: `NODE_ENV` must not be `production` and SMTP variables must be unset. The suite clearly skips the journey when `/api/auth/health` reports `demoMode: false`; the health smoke still runs.

```bash
cd authentication
npm ci

cd ../backend
npm ci
npm run db:migrate
npx playwright install chromium
```

Run the suite from `backend/`:

```bash
npm run test:e2e
```

By default Playwright targets `http://127.0.0.1:5000`. It reuses an existing server there, or starts `npm start` automatically. To target an already-running deployment instead:

```bash
PLAYWRIGHT_BASE_URL=https://example.test npm run test:e2e
```

The suite uses a unique throwaway email and unique note, notebook, tag, and search values on every run. All product steps are UI-driven (no API-assisted setup): demo OTP signup, note creation and explicit save, reload persistence, search, notebook assignment/filtering, tag assignment/filtering, pin ordering, trash/restore, and logout/session revocation. Failure-only screenshots and retained traces are written to ignored Playwright artifact directories.
