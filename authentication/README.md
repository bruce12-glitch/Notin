# Notin Authentication Service

Express + SQLite authentication service for Notin. It provides email/password accounts, email OTP verification, rotating JWT sessions in HttpOnly cookies, account management, password resets, and user-scoped notes.

## Requirements

- Node.js 22.5 or newer (`node:sqlite` is used)
- npm
- An SMTP account for real verification emails (optional during local development)

> `node:sqlite` may print an experimental-feature warning on some Node 22 releases.

## Setup

```bash
cd authentication
npm install
cp .env.example .env
```

Replace both token secrets in `.env` with different random values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run that command twice, then set `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`.

Start the service:

```bash
npm start
```

The web app and API are available at `http://localhost:4000` by default. Check service health at `GET /health`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ACCESS_TOKEN_SECRET` | required | Access-token signing secret |
| `REFRESH_TOKEN_SECRET` | required | Refresh-token signing secret; must differ from the access secret |
| `ACCESS_TOKEN_TTL` | `15m` | Access-token lifetime |
| `REFRESH_TOKEN_TTL` | `7d` | Refresh-token lifetime |
| `PORT` | `4000` | HTTP port |
| `DB_PATH` | `authentication/auth.db` | SQLite database path |
| `COOKIE_SECURE` | `false` | Force cookies to use the Secure attribute |
| `CORS_ORIGINS` | local development origins | Comma-separated credentialed origins |
| `SMTP_HOST` | empty | SMTP server; empty enables OTP development mode |
| `SMTP_PORT` | `587` | SMTP port (`465` automatically uses TLS) |
| `SMTP_USER` | empty | SMTP username |
| `SMTP_PASS` | empty | SMTP password |
| `SMTP_FROM` | `Notin <no-reply@notin.app>` | From address |
| `OTP_TTL_MINUTES` | `10` | Verification-code lifetime |

When SMTP is not configured, registration responses include `devCode` so the OTP flow can be exercised locally. Do not expose development responses on a public deployment.

## API

### Public authentication

- `POST /auth/register` — create a pending signup and send a six-digit OTP
- `POST /auth/verify-otp` — verify the OTP, create the account, and log in
- `POST /auth/resend-otp` — replace and resend a pending signup code
- `POST /auth/login` — log in
- `POST /auth/refresh` — rotate the refresh token and issue a new session
- `POST /auth/logout` — revoke the current refresh token
- `POST /auth/forgot-password` — request a password reset
- `POST /auth/reset-password` — consume a reset token

### Authenticated account routes

- `GET /auth/me` — get the current public user profile
- `PATCH /auth/me` — update the display name
- `DELETE /auth/me` — delete the account and all user-owned data
- `POST /auth/change-password` — change the password and revoke all sessions
- `POST /auth/logout-all` — revoke every refresh token for the account

### Authenticated notes routes

- `GET /notes`
- `POST /notes`
- `GET /notes/:id`
- `PUT /notes/:id`
- `DELETE /notes/:id`

Every notes query is scoped to the authenticated user.

## Tests

```bash
npm test
```

The test suite uses an isolated temporary SQLite database and test-only secrets. It covers the two-step signup flow, account validation, profile management, notes CRUD, password changes and resets, refresh rotation, logout, and account deletion.

Expected result:

```text
26 passed, 0 failed
```

## Security behavior

- Passwords are hashed with bcrypt.
- Access and refresh JWTs are stored in HttpOnly cookies.
- Cookies automatically use `Secure` and `SameSite=None` behind an HTTPS proxy.
- Refresh tokens are SHA-256 hashed in SQLite, rotated on use, and revocable.
- OTPs and reset tokens are stored only as hashes.
- OTPs expire and are removed after too many failed attempts.
- Zod validates authentication request bodies.
- Helmet and authentication rate limiting are enabled.
- SQLite foreign keys cascade deletion of user-owned notes and tokens.

For production, configure HTTPS, real SMTP, deployment-specific CORS origins, high-entropy secrets, database backups, centralized monitoring, and a real password-reset email workflow.
