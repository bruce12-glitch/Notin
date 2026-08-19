import 'dotenv/config';
import { captureExpressError } from './config/sentry.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './config/db.js';

import userRoutes from './routes/userRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import notebookRoutes from './routes/notebookRoutes.js';
import tagRoutes from './routes/tagRoutes.js';
import authRoutes from './routes/authRoutes.js';
import attachmentRoutes from './routes/attachmentRoutes.js';
import publicShareRoutes from './routes/publicShareRoutes.js';
import { signup, signin } from './controllers/userController.js';
import { allowList, canonicalOrigin, isOriginAllowed } from './lib/httpSecurity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 5000);
const isProd = process.env.NODE_ENV === 'production';

// WP-DEPLOY-001 — fail-closed production boot. Dev/preview is untouched: this
// returns immediately unless NODE_ENV === 'production'. Only variable NAMES and
// reasons are printed — never a value, not even a prefix.
const ENV_PLACEHOLDERS = new Set([
  'change-me-access-32chars-minimum-replace-in-prod',
  'change-me-refresh-32chars-minimum-replace-in-prod',
  'change-me-pepper-32chars-minimum-replace',
]);

export function assertProductionEnv(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const failures = [];

  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_PEPPER', 'APP_ORIGIN']) {
    const value = env[name];
    if (!value || !String(value).trim()) {
      failures.push(`${name} is not set`);
      continue;
    }
    if (ENV_PLACEHOLDERS.has(String(value))) {
      failures.push(`${name} is still the .env.example placeholder`);
    }
  }

  const dbUrl = String(env.DATABASE_URL || '');
  if (!dbUrl.trim()) {
    failures.push('DATABASE_URL is not set');
  } else if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    failures.push('DATABASE_URL must be a postgres:// URL in production');
  }

  return failures;
}

app.set('trust proxy', 1);

// Allow Arena/e2b preview iframes
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  })
);
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  const reqOrigin = req.headers.origin;
  // WP-DEPLOY-001 — CORS lockdown. In production only APP_ORIGIN allowlist
  // entries are echoed; everyone else gets the canonical origin back, never
  // their own. Preview/localhost echo is now strictly non-production.
  let allowOrigin = canonicalOrigin;
  if (reqOrigin) {
    if (isProd) {
      if (isOriginAllowed(reqOrigin)) allowOrigin = reqOrigin;
    } else {
      allowOrigin = reqOrigin;
    }
  }
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Notin-CSRF');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve auth static pages from same origin (keeps UI available via API process)
// This mirrors authentication/server.js static serving but from unified backend
const authStaticPath = path.join(__dirname, '../../authentication');
app.use(express.static(authStaticPath, { extensions: ['html'] }));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health at root and api
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'notin-api', database: db.usePostgres ? 'PostgreSQL' : 'SQLite-fallback', time: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'notin-api', database: db.usePostgres ? 'PostgreSQL' : 'SQLite-fallback', time: new Date().toISOString() });
});

// Auth routes — unified identity (OTP/Google + password via /api/users)
// Mount under /api/auth (preferred) and /auth (legacy for existing frontend)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

// Existing user routes (password signup/signin now use unified User table + same JWT)
// Keep /api/users as legacy path — now shares table with OTP/Google
app.use('/api/users', userRoutes);
// Spec also allows /api/auth/signup and /api/auth/signin as aliases (same handler)
app.post('/api/auth/signup', signup);
app.post('/api/auth/signin', signin);

// Public share reads are token-gated rather than account-authenticated. Keep a
// light IP limit to reduce token probing without affecting normal image loads.
const publicShareLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: true, legacyHeaders: false });
app.use('/api/public/share', publicShareLimit, publicShareRoutes);
app.use('/api', attachmentRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/tags', tagRoutes);

app.get('/', (req, res) => {
  // If request accepts html and auth index exists, serve it; otherwise JSON
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(authStaticPath, 'index.html'));
  }
  res.json({
    message: 'Notin Backend API (unified)',
    status: 'running',
    database: db.usePostgres ? 'PostgreSQL' : 'SQLite-fallback',
    auth: '/api/auth (OTP/Google) + /api/users (password) → same User table',
    notes: '/api/notes (Bearer JWT)',
  });
});

// Fallback for SPA history? Serve index.html for unknown GET html
app.get('/login.html', (req, res) => res.sendFile(path.join(authStaticPath, 'login.html')));

app.use((err, req, res, next) => {
  // Capture only the Error object. Sentry's beforeSend strips request/user/extras.
  captureExpressError(err);
  console.error(err.stack || err);
  res.status(500).json({ message: 'Internal Server Error' });
});

const start = async () => {
  // WP-DEPLOY-001 — gate before anything touches the database or a socket.
  const envFailures = assertProductionEnv();
  if (envFailures.length) {
    for (const reason of envFailures) console.error(`FATAL: ${reason}`);
    console.error(`Refusing to start in production with ${envFailures.length} invalid environment variable(s).`);
    process.exit(1);
  }

  try {
    await db.$connect();
    // Ensure sqlite fallback file exists logging
    if (!db.usePostgres) {
      console.log(`📁 Using SQLite fallback at ${db.sqlitePath} (set DATABASE_URL=postgresql://... for Postgres)`);
    }
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Notin Unified API listening on http://0.0.0.0:${PORT}`);
      console.log(`   API:        http://0.0.0.0:${PORT}/api`);
      console.log(`   Auth:       http://0.0.0.0:${PORT}/api/auth ( + /auth legacy)`);
      console.log(`   Users:      http://0.0.0.0:${PORT}/api/users`);
      console.log(`   Notes:      http://0.0.0.0:${PORT}/api/notes`);
      console.log(`   Health:     http://0.0.0.0:${PORT}/health`);
      console.log(`   Auth UI:    http://0.0.0.0:${PORT}/ (index.html) + /login.html`);
    });
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

start();

process.on('SIGINT', async () => {
  await db.$disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await db.$disconnect();
  process.exit(0);
});
