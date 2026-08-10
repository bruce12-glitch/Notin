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

### Image attachments (Protected)
- `GET  /api/notes/:noteId/attachments`
- `POST /api/notes/:noteId/attachments` — multipart field `images`
- `GET  /api/attachments/:id/file`
- `DELETE /api/attachments/:id`

### Read-only shares
- `POST   /api/notes/:id/share` — owner only; creates or rotates the secret
- `DELETE /api/notes/:id/share` — owner only; revokes the current secret
- `GET    /api/public/share/:token` — public read-only payload
- `GET    /api/public/share/:token/files/:attachmentId` — public image for that shared note only

All note and attachment management routes require `Authorization: Bearer <token>`. Public share reads use the unguessable share token instead of account authentication.

## Image attachment storage

Image files are stored on local disk in `backend/uploads/` by default (override with `UPLOAD_DIR`); only metadata is stored in the `Attachment` table. The upload directory is Git-ignored. PNG, JPEG, WebP, and GIF are accepted, up to **5 MB per file** and **10 images per note**. Original filenames are metadata only; random server filenames prevent path traversal and collisions.

Attachment lists and file bytes are served only after bearer-token ownership checks. Images are retained while a note is in Trash and remain available after restore. Permanent note deletion removes both attachment rows and local files. Local-disk storage is intended for development/single-instance deployment; durable multi-instance production would require shared object storage.

## Read-only share security

Creating a share generates a 32-byte cryptographically random base64url token. Only its SHA-256 hash is stored in `NoteShare`; creating another link rotates and invalidates the previous token. Revocation disables the row immediately. Tokens have no expiry by default (`expiresAt` is available for future policy).

Public payloads contain only the note title, editor content, and that note's image metadata—never owner, notebook, tag, or authentication data. Public images use `/api/public/share/:token/files/:attachmentId`, which revalidates the active token, non-trashed note, and attachment-to-note relationship on every request. Trashed notes return **404** publicly and become visible again if restored while the share remains enabled. Public responses use `no-store` and a light IP rate limit. Permanent note deletion removes its share row.

The app's **Share** button creates/rotates a link; **Copy** copies it and **Revoke** disables it. Because the raw token is never stored, the link is shown only in the browser session that created it; clicking Share again safely rotates it. `/share.html?token=…` is a plain read-only renderer and requires no login.

## MVP smoke E2E (Playwright)

The Playwright tooling lives in `backend/`. The suite uses Chromium and exercises the shipped UI against the unified API/static server, including image persistence and read-only share security; it does not test Google/SMTP delivery, offline sync, billing, or other post-MVP features.

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
