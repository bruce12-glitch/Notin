# Notin Authentication Service

Hardened Express + SQLite authentication for Notin. The service includes verified email/password accounts, rotating JWT sessions, account lockout, CSRF protection, password recovery, device-session management, and protected user-scoped notes.

## Requirements

- **Node.js 22.5+** (`node:sqlite` is used)
- npm
- SMTP credentials for production email verification and password recovery

Some Node 22 releases print an experimental warning for `node:sqlite`; this does not indicate a failed startup.

## First-time setup

```bash
cd authentication
npm install
npm run setup
npm start
```

`npm run setup` performs the prerequisites automatically:

1. Checks the Node.js version.
2. Creates an ignored `.env` with four independent 48-byte secrets when one does not exist.
3. Creates the SQLite database and parent directory.
4. Runs idempotent schema migrations.
5. Enables WAL, foreign keys, a busy timeout, and normal synchronous mode.
6. Runs SQLite `quick_check` and removes expired security records.

The service and web client are available at `http://localhost:4000` by default.

Useful commands:

```bash
npm run db:check        # environment, database, and production-mail preflight
npm run check           # syntax checks and integration tests
npm run security:audit  # production dependency audit
npm test                # isolated security/integration suite
```

`npm start` automatically runs the preflight check before opening the server.

## Configuration

Copy `.env.example` manually only when you do not want the setup script. Never commit `.env` or the SQLite database.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode; production tightens secret and SMTP requirements |
| `PORT` | `4000` | HTTP port |
| `TRUST_PROXY` | `1` | Express proxy hop configuration |
| `DB_PATH` | `./auth.db` | SQLite path, resolved from `authentication/` |
| `APP_URL` | `http://localhost:4000` | Public URL used in password-reset links |
| `ACCESS_TOKEN_SECRET` | required | Independent access-JWT secret; 48+ characters in production |
| `REFRESH_TOKEN_SECRET` | required | Independent refresh-JWT secret |
| `CSRF_SECRET` | derived when omitted | HMAC secret for signed double-submit CSRF tokens |
| `OTP_PEPPER` | derived when omitted | HMAC pepper for six-digit verification codes |
| `ACCESS_TOKEN_TTL` | `15m` | Short-lived access-token lifetime |
| `REFRESH_TOKEN_TTL` | `7d` | Rotating session lifetime |
| `JWT_ISSUER` | `notin-auth` | Required JWT issuer |
| `JWT_AUDIENCE` | `notin-web` | Required JWT audience |
| `BCRYPT_ROUNDS` | `12` | Password hash cost (`4` in isolated tests) |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed attempts before account lockout |
| `LOGIN_LOCK_MINUTES` | `15` | Account lock duration |
| `OTP_TTL_MINUTES` | `10` | Verification-code lifetime |
| `OTP_MAX_ATTEMPTS` | `5` | Incorrect codes before pending signup deletion |
| `OTP_RESEND_SECONDS` | `30` | Server-enforced resend cooldown |
| `COOKIE_SECURE` | `false` | Force Secure cookies; HTTPS proxies are detected automatically |
| `COOKIE_DOMAIN` | empty | Optional production cookie domain |
| `CORS_ORIGINS` | local origins | Exact comma-separated browser-origin allowlist |
| `SMTP_*` | empty | SMTP transport; mandatory in production |

Development mode returns OTP/reset values in responses for local testing. Production mode never returns them and refuses readiness when SMTP is absent.

## Browser security and CSRF

Before any `POST`, `PUT`, `PATCH`, or `DELETE`, browser clients obtain a token:

```http
GET /auth/csrf
```

The server sets `notin_csrf` and returns the same signed value. Send it as `X-CSRF-Token` on unsafe requests. The included frontend handles acquisition, rotation, and one automatic retry.

Bearer-only API requests without ambient authentication cookies are exempt from cookie-CSRF validation.

## API

### Public/browser authentication

- `GET /auth/csrf` — issue a signed browser CSRF token
- `POST /auth/register` — create a pending signup and send a six-digit OTP
- `POST /auth/verify-otp` — consume the OTP, create the account, and log in
- `POST /auth/resend-otp` — resend after the server-enforced cooldown
- `POST /auth/login` — constant-time credential verification and protected login
- `POST /auth/refresh` — rotate the current refresh token
- `POST /auth/logout` — revoke the current session
- `POST /auth/forgot-password` — send a generic recovery response
- `POST /auth/reset-password` — consume a single-use reset token

### Authenticated account and session routes

- `GET /auth/me` — public account profile
- `PATCH /auth/me` — update display name
- `DELETE /auth/me` — password-confirmed account deletion
- `POST /auth/change-password` — reauthenticate, change password, and revoke all sessions
- `POST /auth/logout-all` — revoke all refresh-token families
- `GET /auth/sessions` — list current/revoked device sessions
- `DELETE /auth/sessions/:id` — revoke one device session

### Protected notes

- `GET /notes`
- `POST /notes`
- `GET /notes/:id`
- `PUT /notes/:id`
- `DELETE /notes/:id`

Every query includes the authenticated user ID. Titles, bodies, IDs, and update payloads are bounded and validated.

### Operations

- `GET /health` — process and SQLite health
- `GET /ready` — production readiness, including SMTP

## Security controls

- Bcrypt password hashing with configurable cost.
- Strong password policy and common-password rejection.
- Constant-work unknown-user login path to reduce account timing leaks.
- Per-IP rate limits plus per-account failed-login lockout.
- Short-lived JWT access tokens constrained by algorithm, issuer, audience, type, JTI, and account token version.
- HttpOnly access/refresh cookies with proxy-aware `Secure` and `SameSite` policy.
- Signed double-submit CSRF protection for every cookie-authenticated unsafe request.
- Exact trusted-origin enforcement and deny-by-default credentialed CORS.
- Refresh-token family rotation, SHA-256 database storage, replay detection, and family-wide revocation.
- Live account security-state checks invalidate access tokens after password changes.
- HMAC-peppered OTP storage, constant-time comparison, expiry, attempt deletion, and resend cooldown.
- Single-use reset tokens; older outstanding reset tokens are invalidated.
- Generic password-recovery responses to limit account enumeration.
- Password confirmation before account deletion.
- Strict Zod request schemas and bounded JSON/note sizes.
- Helmet headers with a real Content Security Policy, no server identity header, and restricted browser permissions.
- SQLite migrations, foreign keys, WAL, indexed expiry fields, cleanup, and graceful shutdown.
- No-store headers on authentication and notes APIs.

## Tests

```bash
npm test
```

The suite creates an isolated temporary database and currently performs **47 checks**, including CSRF rejection, password policy, OTP limits, cookie flags, scoped CRUD, token-version invalidation, refresh replay defense, generic recovery responses, reset-token reuse prevention, password-confirmed deletion, account lockout, CSP, and hostile-origin rejection.

Expected result:

```text
47 passed, 0 failed
```

## Production checklist

- Run behind HTTPS and set `NODE_ENV=production`.
- Use four independent randomly generated secrets.
- Configure SMTP and the externally reachable `APP_URL`.
- Restrict `CORS_ORIGINS` and `COOKIE_DOMAIN` to deployed domains.
- Keep proxy hop configuration exact; do not use an unrestricted proxy setting.
- Back up SQLite safely (or migrate the persistence models to a managed SQL database).
- Add centralized logs, alerts, and rate-limit storage for multi-instance deployments.
- Rotate signing secrets and invalidate sessions using a controlled deployment procedure.
