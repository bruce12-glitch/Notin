# Notin Backend (PostgreSQL + Prisma)

Clean, modern, and stable backend for Notin.

## Tech Stack
- PostgreSQL + Prisma ORM
- Express.js
- JWT + bcrypt

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your PostgreSQL URL.

### Run migrations
```bash
npx prisma generate
npx prisma migrate dev --name init
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