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
