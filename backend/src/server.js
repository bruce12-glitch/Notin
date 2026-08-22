import 'dotenv/config';
import { captureExpressError } from './config/sentry.js';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
import { uploadDir } from './controllers/attachmentController.js';
import { canonicalOrigin, isOriginAllowed } from './lib/httpSecurity.js';
import { logError } from './lib/logging.js';
import requestId from './middleware/requestId.js';

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

  const origins = String(env.APP_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const value of origins) {
    try {
      if (new URL(value).protocol !== 'https:') failures.push('APP_ORIGIN entries must use https:// in production');
    } catch {
      failures.push('APP_ORIGIN contains an invalid URL');
    }
  }
  if (env.PUBLIC_APP_URL) {
    try {
      if (new URL(env.PUBLIC_APP_URL).protocol !== 'https:') failures.push('PUBLIC_APP_URL must use https:// in production');
    } catch {
      failures.push('PUBLIC_APP_URL is invalid');
    }
  }
  if (!env.TRUST_PROXY || !String(env.TRUST_PROXY).trim()) {
    failures.push('TRUST_PROXY must explicitly match the production proxy topology');
  } else if (String(env.TRUST_PROXY).trim().toLowerCase() === 'true') {
    failures.push('TRUST_PROXY=true is too permissive for production');
  }

  // The shipped signup UI is passwordless. A deployment may explicitly turn
  // email auth off, otherwise boot must fail rather than presenting a flow that
  // can never deliver its code or reset link.
  if (env.AUTH_EMAIL_ENABLED !== 'false') {
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']) {
      if (!env[name] || !String(env[name]).trim()) failures.push(`${name} is required when email auth is enabled`);
    }
  }

  return [...new Set(failures)];
}

const trustProxySetting = process.env.TRUST_PROXY || '1';
const normalizedTrustProxy = trustProxySetting.trim().toLowerCase();
const trustProxyValue = /^\d+$/.test(normalizedTrustProxy)
  ? Number(normalizedTrustProxy)
  : normalizedTrustProxy === 'true'
    ? true
    : normalizedTrustProxy === 'false'
      ? false
      : trustProxySetting;
try {
  app.set('trust proxy', trustProxyValue);
} catch {
  console.error('FATAL: TRUST_PROXY is not a valid Express proxy setting');
  process.exit(1);
}

// WP-OPS-001 — correlation id: after trust proxy, before helmet/CORS/routers
// so every response (health, static, errors) carries X-Request-Id.
app.use(requestId);
app.use(compression());

function resolveAppVersion() {
  const fromEnv = String(process.env.GIT_SHA || process.env.SOURCE_VERSION || '').trim();
  if (fromEnv) return fromEnv.slice(0, 64);
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (sha) return sha;
  } catch { /* git unavailable in some deploy images */ }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    if (pkg.version) return String(pkg.version);
  } catch { /* package.json unreadable */ }
  return 'unknown';
}

const APP_VERSION = resolveAppVersion();

function healthPayload(database, extra = {}) {
  return {
    status: database.reachable ? 'ok' : 'degraded',
    database,
    uptimeSeconds: Math.floor(process.uptime()),
    version: APP_VERSION,
    ...extra,
  };
}

async function probeUploadsWritable() {
  const probePath = path.join(uploadDir, `.healthwrite-${process.pid}`);
  try {
    await fs.promises.writeFile(probePath, 'ok');
    await fs.promises.unlink(probePath).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// Production is not embeddable and gets a restrictive baseline CSP. Preview
// remains frameable because Arena renders it in an iframe.
app.use(
  helmet({
    contentSecurityPolicy: isProd ? {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
    frameguard: isProd ? { action: 'sameorigin' } : false,
    hsts: isProd ? undefined : false,
  })
);
app.use((req, res, next) => {
  if (!isProd) {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Notin-CSRF, X-Request-Id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve only the production UI surface. Source files, lockfiles, design mocks,
// development servers and node_modules must never be downloadable from the API.
const authStaticPath = path.join(__dirname, '../../authentication');
const publicAuthFiles = new Set([
  '/index.html', '/login.html', '/app.html', '/share.html',
  '/script.js', '/app.bundle.js', '/share.js', '/styles.css', '/app.css',
  '/sw.js', '/manifest.webmanifest',
]);
const authStatic = express.static(authStaticPath, {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(?:js|css|png|webmanifest)$/.test(filePath)) {
      res.setHeader('Cache-Control', isProd ? 'public, max-age=3600' : 'no-cache');
    }
  },
});
app.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) return next();
  const pathname = req.path;
  if (!publicAuthFiles.has(pathname) && !/^\/icons\/icon-(?:192|512)\.png$/.test(pathname)) return next();
  if (/\.html$/.test(pathname)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return authStatic(req, res, next);
});

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// WP-OPS-001 — liveness vs readiness.
// GET /health is the container liveness probe: process-only, never queries the
// DB, so a dependency blip cannot flap the process.
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'notin-api', database: db.usePostgres ? 'PostgreSQL' : 'SQLite-fallback', time: new Date().toISOString() });
});
// GET /api/health is the load-balancer readiness probe: real SELECT 1 with a
// 2s timeout. 503 means "stop sending traffic"; it never leaks driver errors.
app.get('/api/health', async (req, res) => {
  const database = await db.probeHealth(2000);
  const body = healthPayload(database);
  res.status(database.reachable ? 200 : 503).json(body);
});
// Deep check — same readiness plus upload-directory writability (no new deps).
app.get('/api/health/deep', async (req, res) => {
  const database = await db.probeHealth(2000);
  const uploadsWritable = await probeUploadsWritable();
  const ok = database.reachable && uploadsWritable;
  const body = healthPayload(database, { uploads: { writable: uploadsWritable } });
  res.status(ok ? 200 : 503).json(body);
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
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
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
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err?.status === 400)) {
    return res.status(400).json({
      message: 'Invalid JSON body',
      code: 'INVALID_JSON',
      requestId: req.id,
    });
  }
  // Capture only the Error object. Sentry's beforeSend strips request/user/extras.
  captureExpressError(err);
  logError(req, err.stack || err, 'unhandled');
  // Additive requestId only — `message` stays the public contract.
  res.status(500).json({ message: 'Internal Server Error', requestId: req.id });
});

const SHUTDOWN_GRACE_MS = 10_000;
let httpServer = null;
let shuttingDown = false;

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
    httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Notin Unified API listening on http://0.0.0.0:${PORT}`);
      console.log(`   API:        http://0.0.0.0:${PORT}/api`);
      console.log(`   Auth:       http://0.0.0.0:${PORT}/api/auth ( + /auth legacy)`);
      console.log(`   Users:      http://0.0.0.0:${PORT}/api/users`);
      console.log(`   Notes:      http://0.0.0.0:${PORT}/api/notes`);
      console.log(`   Health:     http://0.0.0.0:${PORT}/health (liveness)`);
      console.log(`   Readiness:  http://0.0.0.0:${PORT}/api/health`);
      console.log(`   Auth UI:    http://0.0.0.0:${PORT}/ (index.html) + /login.html`);
    });
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

function requestShutdown(signal) {
  if (shuttingDown) {
    console.log(`[shutdown] ${signal} ignored — already shutting down`);
    return;
  }
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — stopping new connections`);

  const forceTimer = setTimeout(() => {
    console.error('[shutdown] grace period expired — forcing exit');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);

  const finish = async () => {
    console.log('[shutdown] HTTP server closed');
    try {
      await db.$disconnect();
    } catch { /* leaving anyway */ }
    console.log('[shutdown] database disconnected');
    clearTimeout(forceTimer);
    process.exit(0);
  };

  if (!httpServer) {
    finish();
    return;
  }

  // Drop keep-alive idlers so server.close() waits only on in-flight requests.
  if (typeof httpServer.closeIdleConnections === 'function') {
    httpServer.closeIdleConnections();
  }

  httpServer.close((err) => {
    if (err) console.error('[shutdown] error closing HTTP server');
    finish();
  });
}

start();

process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));
