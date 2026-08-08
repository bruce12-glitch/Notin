# Notin authentication

This is a strict Google + email OTP authentication service. Google OAuth proves ownership of the Gmail account; Notin then sends a one-time six-digit code as a second step. OTPs are hashed, expire after five minutes, are single-use, and allow at most five attempts. Access JWTs last 15 minutes. Refresh tokens are opaque, hashed in SQLite, rotated on every use, and revoked on logout.

## Run

```bash
cp .env.example .env
# Fill every value; use a Gmail app password or transactional SMTP provider.
npm install
npm start
```

Register `GOOGLE_REDIRECT_URI` exactly in Google Cloud Console. Start the static site separately and open `/auth/google` from its login action. The callback redirects to `/?auth=otp&challenge=...`; the frontend should POST `{challenge, code}` to `/auth/otp/verify` with `credentials: 'include'`.

### Security notes

- Never commit `.env`, database files, or secrets.
- Use HTTPS and `NODE_ENV=production` in deployment.
- Keep the access token in memory, not localStorage; use the HTTP-only refresh cookie.
- Configure the frontend API base URL through deployment config; do not hard-code credentials.
- For multiple API instances, move OAuth state and rate limiting to Redis and use Postgres for durable storage.
