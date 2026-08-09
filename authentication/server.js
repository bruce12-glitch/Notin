import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_PEPPER'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const env = process.env;
const app = express();
const origin = env.APP_ORIGIN || 'http://localhost:4173';

// node:sqlite (built-in) — no native compile required
const db = new DatabaseSync(env.DB_FILE || './notin-auth.sqlite');
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    google_sub TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS otp_challenges(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens(
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );
`);

const google = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

const mailer =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 465),
        secure: env.SMTP_SECURE !== 'false',
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      })
    : null;

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const otpHash = (id, code) => sha(`${id}:${code}:${env.OTP_PEPPER}`);
const random = (n = 32) => crypto.randomBytes(n).toString('base64url');
const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth',
};

async function token(user, key, minutes, type) {
  return new SignJWT({ sub: user.id, email: user.email, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.JWT_ISSUER || 'notin-auth')
    .setAudience('notin-api')
    .setIssuedAt()
    .setExpirationTime(`${minutes}m`)
    .sign(key);
}

async function verify(tokenValue, key, type) {
  const r = await jwtVerify(tokenValue, key, {
    issuer: env.JWT_ISSUER || 'notin-auth',
    audience: 'notin-api',
  });
  if (r.payload.type !== type) throw Error('Invalid token');
  return r.payload;
}

function publicUser(u) {
  return { id: u.id, email: u.email };
}

// Allow Arena/e2b preview iframes — disable helmet blocking
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  })
);
// Live-preview friendly CORS: echo preview origins, fallback to APP_ORIGIN
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  // Allow embedding in Arena preview iframes
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  const reqOrigin = req.headers.origin;
  let allowOrigin = origin;
  // Accept Arena/e2b preview hosts, localhost, or any origin if in dev
  if (reqOrigin) {
    const isPreview = reqOrigin.includes('.e2b.app') || reqOrigin.includes('localhost') || reqOrigin.includes('127.0.0.1') || reqOrigin.includes('.arena.ai') || reqOrigin.includes('.proxy.');
    if (isPreview) allowOrigin = reqOrigin;
    // In development, be permissive for easy testing in chat
    if (env.NODE_ENV !== 'production') {
      // already set to reqOrigin if preview, otherwise keep env origin but also allow any dev origin
      if (!isPreview) allowOrigin = reqOrigin;
    }
  }
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve static auth UI (index.html, login.html, styles.css, script.js) from same origin — no CORS needed
app.use(express.static(__dirname, { extensions: ['html'] }));
// Also serve on root explicitly for clarity
app.get('/', (req, res, next) => {
  // express.static already handles index.html, but keep fallback
  if (req.path === '/') return res.sendFile(path.join(__dirname, 'index.html'));
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

const strict = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth', strict);

const pending = new Map();

app.get('/auth/google', (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) {
    return res
      .status(503)
      .send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID in .env — this is expected in local preview without credentials.');
  }
  const state = random(24);
  pending.set(state, Date.now() + 300000);
  const url = google.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || !pending.has(state) || pending.get(state) < Date.now()) {
      return res.status(400).send('Invalid or expired OAuth state');
    }
    pending.delete(state);
    const { tokens } = await google.getToken(code);
    const ticket = await google.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) {
      return res.status(403).send('A verified Google email is required');
    }
    let user = db
      .prepare('SELECT * FROM users WHERE google_sub = ?')
      .get(p.sub);
    if (!user) {
      const id = random(18);
      db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(
        id,
        p.email.toLowerCase(),
        p.sub,
        Date.now()
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const challenge = await issueOtp(user);
    res.redirect(
      `${origin}/?auth=otp&challenge=${encodeURIComponent(challenge)}&email=${encodeURIComponent(user.email)}`
    );
  } catch (e) {
    console.error(e);
    res.status(401).send('Google authentication failed');
  }
});

async function issueOtp(user) {
  if (!mailer) throw Error('SMTP is not configured');
  const id = random(18);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  db.prepare('DELETE FROM otp_challenges WHERE user_id = ? OR expires_at < ?').run(
    user.id,
    now
  );
  db.prepare('INSERT INTO otp_challenges VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    user.id,
    otpHash(id, code),
    now + 5 * 60 * 1000,
    0,
    null,
    now
  );
  await mailer.sendMail({
    from: env.MAIL_FROM,
    to: user.email,
    subject: 'Your Notin sign-in code',
    text: `Your Notin verification code is ${code}. It expires in 5 minutes and can only be used once.`,
  });
  return id;
}

app.post('/auth/otp/resend', async (req, res) => {
  try {
    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(req.body.email || '').trim().toLowerCase());
    if (user) await issueOtp(user);
    res.json({ ok: true, message: 'If the account exists, a new code was sent.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not resend code' });
  }
});

// Demo helper for live preview without SMTP — issues OTP challenge without sending email
app.post('/auth/otp/demo-request', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  // Find or create demo user (google_sub = demo:<email>)
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    const id = random(18);
    const sub = `demo:${email}:${random(8)}`;
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(id, email, sub, Date.now());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  const id = random(18);
  // In demo mode, fixed code 123456 for easy testing, but still hashed
  const demoCode = '123456';
  const now = Date.now();
  db.prepare('DELETE FROM otp_challenges WHERE user_id = ? OR expires_at < ?').run(user.id, now);
  db.prepare('INSERT INTO otp_challenges VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    user.id,
    otpHash(id, demoCode),
    now + 5 * 60 * 1000,
    0,
    null,
    now
  );
  console.log(`[DEMO OTP] ${email} => code ${demoCode} challenge ${id}`);
  res.json({ ok: true, challenge: id, email: user.email, demoCode, message: 'Demo code is 123456 (check server logs). SMTP not required for preview.' });
});

app.post('/auth/otp/verify', async (req, res) => {
  const { challenge, code } = req.body || {};
  if (typeof challenge !== 'string' || !/^[0-9]{6}$/.test(String(code))) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  const c = db.prepare('SELECT * FROM otp_challenges WHERE id = ?').get(challenge);
  if (!c || c.used_at || c.expires_at < Date.now() || c.attempts >= 5) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }
  const ok = crypto.timingSafeEqual(
    Buffer.from(otpHash(challenge, String(code))),
    Buffer.from(c.code_hash)
  );
  db.prepare(
    'UPDATE otp_challenges SET attempts = attempts + 1, used_at = ? WHERE id = ?'
  ).run(ok ? Date.now() : null, challenge);
  if (!ok) return res.status(401).json({ error: 'Invalid or expired code' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(c.user_id);
  const access = await token(user, accessKey, 15, 'access');
  const refresh = random(48);
  db.prepare('INSERT INTO refresh_tokens VALUES (?, ?, ?, ?, ?)').run(
    sha(refresh),
    user.id,
    Date.now() + 30 * 86400000,
    null,
    Date.now()
  );
  res.cookie('notin_refresh', refresh, { ...cookieOpts, maxAge: 30 * 86400000 });
  res.json({ accessToken: access, user: publicUser(user) });
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const raw = req.cookies.notin_refresh;
    if (!raw) throw Error();
    const row = db
      .prepare(
        'SELECT * FROM refresh_tokens WHERE hash = ? AND revoked_at IS NULL AND expires_at > ?'
      )
      .get(sha(raw), Date.now());
    if (!row) throw Error();
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE hash = ?').run(
      Date.now(),
      sha(raw)
    );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    const next = random(48);
    db.prepare('INSERT INTO refresh_tokens VALUES (?, ?, ?, ?, ?)').run(
      sha(next),
      user.id,
      Date.now() + 30 * 86400000,
      null,
      Date.now()
    );
    res.cookie('notin_refresh', next, { ...cookieOpts, maxAge: 30 * 86400000 });
    res.json({
      accessToken: await token(user, accessKey, 15, 'access'),
      user: publicUser(user),
    });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
});

app.post('/auth/logout', (req, res) => {
  const raw = req.cookies.notin_refresh;
  if (raw) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE hash = ?').run(
      Date.now(),
      sha(raw)
    );
  }
  res.clearCookie('notin_refresh', cookieOpts);
  res.status(204).end();
});

app.get('/health', (_, res) =>
  res.json({
    ok: true,
    service: 'notin-auth',
    googleConfigured: Boolean(env.GOOGLE_CLIENT_ID),
    smtpConfigured: Boolean(mailer),
    demoMode: !mailer,
    hint: !mailer ? 'SMTP not configured — use POST /auth/otp/demo-request with {email} then verify with code 123456' : undefined,
  })
);

// Demo page for live preview — shows API status and quick tester
app.get('/_preview', (req, res) => {
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Notin Auth — Live Preview</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}code{background:#f4f4f5;padding:2px 6px;border-radius:4px}pre{background:#111;color:#8FE333;padding:16px;border-radius:12px;overflow:auto}a{color:#3b5bdb}button{padding:10px 16px;border-radius:8px;border:1px solid #ddd;background:#111;color:#fff;cursor:pointer}input{padding:10px 12px;border:1px solid #ddd;border-radius:8px;width:260px}</style></head><body><h1>🔐 Notin Auth — Live</h1><p>API is running on this same origin. Use the UI below or call the endpoints directly.</p><ul><li><a href="/">Sign up (index.html)</a> — <code>/</code></li><li><a href="/login.html">Sign in (login.html)</a> — <code>/login.html</code></li><li><a href="/health">Health check</a> — <code>GET /health</code></li></ul><h3>Quick demo without SMTP</h3><p>1) Request demo OTP → 2) Verify with <code>123456</code></p><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="email" placeholder="you@example.com" type="email"><button onclick="demoReq()">Request demo code</button></div><pre id="out">Ready. Enter email and click Request.</pre><div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="challenge" placeholder="challenge id"><input id="code" placeholder="123456" value="123456" style="width:120px"><button onclick="demoVerify()">Verify OTP</button></div><script>async function demoReq(){const email=document.getElementById('email').value.trim();const r=await fetch('/auth/otp/demo-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email}),credentials:'include'});const j=await r.json();document.getElementById('out').textContent=JSON.stringify(j,null,2);if(j.challenge)document.getElementById('challenge').value=j.challenge}async function demoVerify(){const challenge=document.getElementById('challenge').value.trim();const code=document.getElementById('code').value.trim();const r=await fetch('/auth/otp/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge,code}),credentials:'include'});const j=await r.json();document.getElementById('out').textContent=JSON.stringify(j,null,2)}</script><p style="margin-top:24px;color:#666;font-size:13px">Google OAuth: ${env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured (set GOOGLE_CLIENT_ID in .env)'} · SMTP: ${mailer ? 'configured' : 'demo mode (code 123456)'} · DB: SQLite (${env.DB_FILE})</p></body></html>`);
});

const PORT = Number(env.PORT || 8787);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 Auth API + UI listening on http://0.0.0.0:${PORT}`);
  console.log(`   UI:   http://0.0.0.0:${PORT}/  (index.html)`);
  console.log(`   Login: http://0.0.0.0:${PORT}/login.html`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);
  console.log(`   Preview helper: http://0.0.0.0:${PORT}/_preview`);
});
