// ============================================================
// server.js — complete JWT auth API (Express + SQLite)
// ============================================================
require("dotenv").config({ quiet: true });
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const path = require("path");

const userModel = require("./models/user.model");
const {
  signAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  isRefreshTokenActive,
  revokeRefreshToken,
  revokeAllForUser,
  issueResetToken,
  findValidResetToken,
  markResetTokenUsed,
} = require("./tokens");
const { requireAuth } = require("./auth.middleware");
const { validate } = require("./validators");
const notesRouter = require("./notes.routes");
const otpModel = require("./models/otp.model");
const { sendOtpEmail } = require("./mailer");

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ---------- CORS (credentials-aware) ----------
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ||
  "http://localhost:3000,http://localhost:8000,http://127.0.0.1:5500")
  .split(",").map((s) => s.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- rate limiters ----------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

// ---------- cookie helpers (proxy-aware) ----------
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

function cookieOptsFor(req, maxAgeMs) {
  const isHttps =
    COOKIE_SECURE ||
    req.secure ||
    (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

  return {
    httpOnly: true,
    maxAge: maxAgeMs,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/",
  };
}

function setAuthCookies(req, res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = issueRefreshToken(user.id, {
    userAgent: req.headers["user-agent"] || "",
    ip: req.ip || "",
  });
  res.cookie("accessToken", accessToken, cookieOptsFor(req, 15 * 60 * 1000));
  res.cookie("refreshToken", refreshToken, cookieOptsFor(req, 7 * 24 * 60 * 60 * 1000));
}

function clearAuthCookies(res) {
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/" });
}

// ================= AUTH ROUTES =================

// STEP 1 of signup: hash password, create PENDING signup, email an OTP.
app.post("/auth/register", authLimiter, validate("register"), async (req, res) => {
  const { email, password, displayName } = req.body;
  if (userModel.getUserByEmail(email)) {
    return res.status(409).json({ error: "email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const otp = otpModel.upsertPending({ email, passwordHash, displayName });
  const result = await sendOtpEmail(email, otp);

  return res.status(200).json({
    step: "verify-otp",
    email,
    message: result.sent
      ? "We emailed you a 6-digit code. Enter it to finish signing up."
      : "Dev mode (no SMTP): use the code below to verify.",
    emailSent: result.sent,
    ...(result.devCode ? { devCode: result.devCode } : {}),
    ttlMinutes: otpModel.OTP_TTL_MIN,
  });
});

// STEP 2 of signup: verify OTP -> create user -> log in.
app.post("/auth/verify-otp", authLimiter, validate("verifyOtp"), async (req, res) => {
  const { email, code } = req.body;
  const check = otpModel.verifyOtp(email, code);
  if (!check.ok) {
    return res.status(400).json({ error: check.reason, remaining: check.remaining });
  }

  const p = check.pending;
  try {
    const user = userModel.createUser({
      email: p.email,
      passwordHash: p.password_hash,
      displayName: p.display_name,
    });
    userModel.setVerified(user.id, 1);
    otpModel.deletePending(email);
    setAuthCookies(req, res, user);
    return res.status(201).json({ user: userModel.getUserById(user.id) });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      otpModel.deletePending(email);
      return res.status(409).json({ error: "email already registered" });
    }
    throw err;
  }
});

// Resend a fresh OTP for a pending signup.
app.post("/auth/resend-otp", authLimiter, validate("forgotPassword"), async (req, res) => {
  const { email } = req.body;
  const pending = otpModel.getPending(email);
  if (!pending) return res.status(400).json({ error: "no pending signup — please sign up again" });

  const otp = otpModel.upsertPending({
    email,
    passwordHash: pending.password_hash,
    displayName: pending.display_name,
  });
  const result = await sendOtpEmail(email, otp);

  return res.json({
    message: result.sent ? "A new code was emailed." : "Dev mode: new code below.",
    emailSent: result.sent,
    ...(result.devCode ? { devCode: result.devCode } : {}),
  });
});

app.post("/auth/login", authLimiter, validate("login"), async (req, res) => {
  const { email, password } = req.body;
  const user = userModel.getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  setAuthCookies(req, res, user);
  return res.json({ user: userModel.getUserById(user.id) });
});

app.post("/auth/refresh", (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "no refresh token" });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: "invalid or expired refresh token" });
  }

  if (!isRefreshTokenActive(token)) {
    return res.status(401).json({ error: "refresh token revoked" });
  }

  revokeRefreshToken(token);
  const user = userModel.getUserById(payload.sub);
  if (!user) return res.status(401).json({ error: "user no longer exists" });

  setAuthCookies(req, res, user);
  return res.json({ ok: true });
});

app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) revokeRefreshToken(token);
  clearAuthCookies(res);
  return res.json({ ok: true });
});

app.post("/auth/logout-all", requireAuth, (req, res) => {
  revokeAllForUser(req.userId);
  clearAuthCookies(res);
  return res.json({ ok: true });
});

// ---------- profile ----------
app.get("/auth/me", requireAuth, (req, res) => {
  const user = userModel.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "user not found" });
  return res.json({ user });
});

app.patch("/auth/me", requireAuth, validate("updateProfile"), (req, res) => {
  const user = userModel.updateProfile(req.userId, { displayName: req.body.displayName });
  return res.json({ user });
});

app.post("/auth/change-password", requireAuth, validate("changePassword"), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const full = userModel.getUserByEmail(userModel.getUserById(req.userId).email);
  if (!(await bcrypt.compare(currentPassword, full.password_hash))) {
    return res.status(401).json({ error: "current password is incorrect" });
  }

  userModel.updatePassword(req.userId, await bcrypt.hash(newPassword, 10));
  revokeAllForUser(req.userId);
  clearAuthCookies(res);
  return res.json({ ok: true, message: "password changed — please log in again" });
});

app.delete("/auth/me", requireAuth, (req, res) => {
  userModel.deleteUser(req.userId);
  clearAuthCookies(res);
  return res.json({ ok: true });
});

// ---------- password reset ----------
app.post("/auth/forgot-password", authLimiter, validate("forgotPassword"), (req, res) => {
  const user = userModel.getUserByEmail(req.body.email);
  const response = { ok: true, message: "If that email exists, a reset link was sent." };
  if (!user) return res.json(response);

  const token = issueResetToken(user.id, 30);
  return res.json({ ...response, devResetToken: token });
});

app.post("/auth/reset-password", authLimiter, validate("resetPassword"), async (req, res) => {
  const { token, newPassword } = req.body;
  const row = findValidResetToken(token);
  if (!row) return res.status(400).json({ error: "invalid or expired reset token" });

  userModel.updatePassword(row.user_id, await bcrypt.hash(newPassword, 10));
  markResetTokenUsed(row.id);
  revokeAllForUser(row.user_id);
  return res.json({ ok: true, message: "password reset — please log in" });
});

// ---------- protected resource ----------
app.use("/notes", requireAuth, notesRouter);
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ---------- errors ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => console.log(`Auth server on http://0.0.0.0:${PORT}`));
}

module.exports = app;
