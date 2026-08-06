// ============================================================
// server.js — hardened JWT authentication API (Express + SQLite)
// ============================================================
require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const path = require("path");

const config = require("./config");
const db = require("./db");
const userModel = require("./models/user.model");
const {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenRecord,
  revokeRefreshToken,
  revokeAllForUser,
  revokeFamily,
  listSessions,
  revokeSession,
  issueResetToken,
  findValidResetToken,
  markResetTokenUsed,
} = require("./tokens");
const { requireAuth } = require("./auth.middleware");
const { validate } = require("./validators");
const notesRouter = require("./notes.routes");
const otpModel = require("./models/otp.model");
const { sendOtpEmail, sendPasswordResetEmail, smtpConfigured } = require("./mailer");
const {
  authCookieOptions,
  setCsrfCookie,
  clearSecurityCookies,
  requireCsrf,
  isAllowedOrigin,
  enforceTrustedOrigin,
  noStore,
} = require("./security");

const app = express();
const trustProxy = /^\d+$/.test(config.TRUST_PROXY) ? Number(config.TRUST_PROXY) : config.TRUST_PROXY;
app.set("trust proxy", trustProxy);
app.disable("x-powered-by");

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "https://fonts.googleapis.com"],
  styleSrcAttr: ["'unsafe-inline'"], // Runtime 3D transforms use element.style; stylesheets remain strict.
  fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
  imgSrc: ["'self'", "data:"],
  mediaSrc: ["'self'", "https://evernote.cdn.prismic.io"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: config.isProduction ? ["'self'"] : null, // Allow Arena preview only outside production.
  upgradeInsecureRequests: config.isProduction ? [] : null,
};
app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: config.isProduction ? { action: "sameorigin" } : false,
  hsts: config.isProduction ? undefined : false,
  referrerPolicy: { policy: "no-referrer" },
}));
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.set("X-Request-Id", req.id);
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});
app.use(express.json({ limit: "128kb", strict: true, type: "application/json" }));
app.use(cookieParser());
app.use(enforceTrustedOrigin);

// ---------- CORS (credentials-aware and deny-by-default) ----------
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && isAllowedOrigin(req, origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: config.isProduction ? "1h" : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
  },
}));

// ---------- layered rate limits ----------
function limiter({ windowMs, max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: { error: message, code: "RATE_LIMITED" },
  });
}
const generalAuthLimiter = limiter({ windowMs: 15 * 60 * 1000, max: 100, message: "Too many requests. Try again later." });
const loginLimiter = limiter({ windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, message: "Too many login attempts. Try again later." });
const signupLimiter = limiter({ windowMs: 60 * 60 * 1000, max: 8, message: "Too many signup attempts. Try again later." });
const otpLimiter = limiter({ windowMs: 15 * 60 * 1000, max: 12, message: "Too many verification attempts. Try again later." });
const recoveryLimiter = limiter({ windowMs: 60 * 60 * 1000, max: 6, message: "Too many recovery attempts. Try again later." });

app.use(["/auth", "/notes"], noStore);
app.use("/auth", generalAuthLimiter);
app.get("/auth/csrf", (req, res) => {
  const csrfToken = setCsrfCookie(req, res);
  res.json({ csrfToken });
});
app.use(["/auth", "/notes"], requireCsrf);

function requestMeta(req) {
  return { userAgent: req.get("user-agent") || "", ip: req.ip || "" };
}

function setAuthCookies(req, res, user, refreshToken) {
  const securityState = userModel.getSecurityState(user.id);
  const accessToken = signAccessToken({ ...user, tokenVersion: securityState?.token_version || 0 });
  const token = refreshToken || issueRefreshToken(user.id, requestMeta(req));
  res.cookie("accessToken", accessToken, authCookieOptions(req, config.ACCESS_TOKEN_SECONDS * 1000));
  res.cookie("refreshToken", token, authCookieOptions(req, config.REFRESH_TOKEN_SECONDS * 1000));
  setCsrfCookie(req, res);
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync("NotinTimingDefense987!", config.BCRYPT_ROUNDS);

// ================= AUTH ROUTES =================
app.post("/auth/register", signupLimiter, validate("register"), async (req, res) => {
  const { email, password, displayName } = req.body;
  if (userModel.getUserByEmail(email)) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  const otp = otpModel.upsertPending({ email, passwordHash, displayName });
  try {
    const result = await sendOtpEmail(email, otp);
    return res.status(200).json({
      step: "verify-otp",
      email,
      message: result.sent
        ? "We emailed you a six-digit code."
        : "Development mode: use the verification code shown below.",
      emailSent: result.sent,
      ...(result.devCode ? { devCode: result.devCode } : {}),
      ttlMinutes: otpModel.OTP_TTL_MIN,
    });
  } catch (error) {
    otpModel.deletePending(email);
    throw error;
  }
});

app.post("/auth/verify-otp", otpLimiter, validate("verifyOtp"), async (req, res) => {
  const { email, code } = req.body;
  const check = otpModel.verifyOtp(email, code);
  if (!check.ok) return res.status(400).json({ error: check.reason, remaining: check.remaining });

  try {
    const user = db.transaction(() => {
      const created = userModel.createUser({
        email: check.pending.email,
        passwordHash: check.pending.password_hash,
        displayName: check.pending.display_name,
        verified: 1,
      });
      otpModel.deletePending(email);
      return created;
    });
    setAuthCookies(req, res, user);
    return res.status(201).json({ user: userModel.getUserById(user.id) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      otpModel.deletePending(email);
      return res.status(409).json({ error: "Email already registered" });
    }
    throw error;
  }
});

app.post("/auth/resend-otp", signupLimiter, validate("resendOtp"), async (req, res) => {
  const result = otpModel.resendPending(req.body.email);
  if (!result.ok && result.reason === "cooldown") {
    res.set("Retry-After", String(result.retryAfter));
    return res.status(429).json({ error: `Wait ${result.retryAfter} seconds before requesting another code.`, retryAfter: result.retryAfter });
  }
  if (!result.ok) return res.status(400).json({ error: "Verification request expired. Please sign up again." });

  const delivery = await sendOtpEmail(req.body.email, result.otp);
  res.json({
    message: delivery.sent ? "A new code was emailed." : "Development mode: new code shown below.",
    emailSent: delivery.sent,
    ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
  });
});

app.post("/auth/login", loginLimiter, validate("login"), async (req, res) => {
  const { email, password } = req.body;
  const user = userModel.getUserByEmail(email);
  const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);

  if (user && userModel.isLoginLocked(user)) {
    return res.status(429).json({ error: "Unable to log in. Try again later.", code: "ACCOUNT_LOCKED" });
  }
  if (!user || !passwordMatches || user.is_verified !== 1) {
    if (user) userModel.recordFailedLogin(user.id);
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const publicUser = userModel.recordSuccessfulLogin(user.id);
  setAuthCookies(req, res, publicUser);
  res.json({ user: publicUser });
});

app.post("/auth/refresh", (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "Session expired" });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearSecurityCookies(req, res);
    return res.status(401).json({ error: "Session expired" });
  }

  const record = getRefreshTokenRecord(token);
  if (!record || String(record.user_id) !== String(payload.sub) || record.family_id !== payload.family) {
    if (record?.family_id) revokeFamily(record.family_id);
    clearSecurityCookies(req, res);
    return res.status(401).json({ error: "Invalid session" });
  }
  if (record.revoked !== 0 || new Date(record.expires_at).getTime() <= Date.now()) {
    revokeFamily(record.family_id);
    clearSecurityCookies(req, res);
    return res.status(401).json({ error: "Session reuse detected. Please log in again.", code: "TOKEN_REUSE" });
  }

  const user = userModel.getUserById(Number(payload.sub));
  if (!user || user.is_verified !== 1) {
    revokeFamily(record.family_id);
    clearSecurityCookies(req, res);
    return res.status(401).json({ error: "Account unavailable" });
  }

  const refreshToken = rotateRefreshToken(token, user.id, record.family_id, requestMeta(req));
  setAuthCookies(req, res, user, refreshToken);
  res.json({ ok: true });
});

app.post("/auth/logout", (req, res) => {
  if (req.cookies?.refreshToken) revokeRefreshToken(req.cookies.refreshToken);
  clearSecurityCookies(req, res);
  res.json({ ok: true });
});

app.post("/auth/logout-all", requireAuth, (req, res) => {
  revokeAllForUser(req.userId);
  clearSecurityCookies(req, res);
  res.json({ ok: true });
});

app.get("/auth/sessions", requireAuth, (req, res) => {
  res.json({ sessions: listSessions(req.userId) });
});

app.delete("/auth/sessions/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
  if (!revokeSession(req.userId, id)) return res.status(404).json({ error: "Session not found" });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  const user = userModel.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

app.patch("/auth/me", requireAuth, validate("updateProfile"), (req, res) => {
  res.json({ user: userModel.updateProfile(req.userId, { displayName: req.body.displayName }) });
});

app.post("/auth/change-password", requireAuth, validate("changePassword"), async (req, res) => {
  const user = userModel.getUserById(req.userId);
  const full = user ? userModel.getUserByEmail(user.email) : null;
  if (!full || !(await bcrypt.compare(req.body.currentPassword, full.password_hash))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  userModel.updatePassword(req.userId, await bcrypt.hash(req.body.newPassword, config.BCRYPT_ROUNDS));
  revokeAllForUser(req.userId);
  clearSecurityCookies(req, res);
  res.json({ ok: true, message: "Password changed. Please log in again." });
});

app.delete("/auth/me", requireAuth, validate("deleteAccount"), async (req, res) => {
  const user = userModel.getUserById(req.userId);
  const full = user ? userModel.getUserByEmail(user.email) : null;
  if (!full || !(await bcrypt.compare(req.body.currentPassword, full.password_hash))) {
    return res.status(401).json({ error: "Password is incorrect" });
  }
  userModel.deleteUser(req.userId);
  clearSecurityCookies(req, res);
  res.json({ ok: true });
});

app.post("/auth/forgot-password", recoveryLimiter, validate("forgotPassword"), async (req, res) => {
  const response = { ok: true, message: "If that email exists, a reset link was sent." };
  const user = userModel.getUserByEmail(req.body.email);
  if (!user) {
    await bcrypt.compare("NotinUnknownAccount123!", DUMMY_PASSWORD_HASH);
    return res.json(response);
  }

  const token = issueResetToken(user.id, 30);
  try {
    const delivery = await sendPasswordResetEmail(user.email, token);
    return res.json({
      ...response,
      ...(delivery.devResetToken ? { devResetToken: delivery.devResetToken, devResetUrl: delivery.devResetUrl } : {}),
    });
  } catch (error) {
    console.error(`[${req.id}] Password reset email failed`, error.message);
    return res.json(response); // Never leak delivery/account state.
  }
});

app.post("/auth/reset-password", recoveryLimiter, validate("resetPassword"), async (req, res) => {
  const row = findValidResetToken(req.body.token);
  if (!row) return res.status(400).json({ error: "Invalid or expired reset link" });

  const passwordHash = await bcrypt.hash(req.body.newPassword, config.BCRYPT_ROUNDS);
  db.transaction(() => {
    userModel.updatePassword(row.user_id, passwordHash);
    markResetTokenUsed(row.id);
    revokeAllForUser(row.user_id);
  });
  clearSecurityCookies(req, res);
  res.json({ ok: true, message: "Password reset. Please log in." });
});

app.use("/notes", requireAuth, notesRouter);

app.get("/health", (req, res) => {
  const database = db.healthCheck();
  res.status(database.ok ? 200 : 503).json({
    status: database.ok ? "ok" : "degraded",
    database: database.ok ? "ok" : "error",
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.get("/ready", (req, res) => {
  const database = db.healthCheck();
  const ready = database.ok && (!config.isProduction || smtpConfigured);
  res.status(ready ? 200 : 503).json({
    ready,
    database: database.ok,
    mail: smtpConfigured ? "configured" : config.isProduction ? "required" : "development-mode",
  });
});

// ---------- errors ----------
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "Invalid JSON" });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  console.error(`[${req.id || "no-request-id"}]`, err);
  res.status(500).json({ error: "Server error", requestId: req.id });
});

let cleanupTimer;
if (require.main === module) {
  const server = app.listen(config.PORT, "0.0.0.0", () => {
    console.log(`Notin auth server listening on http://0.0.0.0:${config.PORT}`);
  });
  cleanupTimer = setInterval(() => db.cleanupExpired(), 60 * 60 * 1000);
  cleanupTimer.unref();

  const shutdown = (signal) => {
    console.log(`${signal}: closing authentication service`);
    server.close(() => {
      try { db.close(); } catch {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
