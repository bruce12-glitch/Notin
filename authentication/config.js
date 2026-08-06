// ============================================================
// config.js — validated, centralized authentication configuration
// ============================================================
require("dotenv").config({ quiet: true });
const crypto = require("crypto");

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
const isTest = NODE_ENV === "test";

function requiredSecret(name) {
  const value = String(process.env[name] || "");
  const minimum = isProduction ? 48 : 32;
  if (value.length < minimum) {
    throw new Error(
      `${name} must contain at least ${minimum} characters. Run \`npm run setup\` to generate secure local configuration.`
    );
  }
  return value;
}

function deriveSecret(label, source) {
  return crypto.createHmac("sha256", source).update(label).digest("hex");
}

function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function durationSeconds(value, fallback) {
  const text = String(value || fallback).trim();
  const match = text.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) throw new Error(`Invalid duration: ${text}`);
  const amount = Number(match[1]);
  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * units[match[2].toLowerCase()];
}

const ACCESS_TOKEN_SECRET = requiredSecret("ACCESS_TOKEN_SECRET");
const REFRESH_TOKEN_SECRET = requiredSecret("REFRESH_TOKEN_SECRET");
if (ACCESS_TOKEN_SECRET === REFRESH_TOKEN_SECRET) {
  throw new Error("ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different");
}

const config = Object.freeze({
  NODE_ENV,
  isProduction,
  isTest,
  PORT: integer("PORT", 4000, { min: 1, max: 65535 }),
  TRUST_PROXY: process.env.TRUST_PROXY || "1",
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  CSRF_SECRET: process.env.CSRF_SECRET || deriveSecret("notin:csrf", ACCESS_TOKEN_SECRET),
  OTP_PEPPER: process.env.OTP_PEPPER || deriveSecret("notin:otp", REFRESH_TOKEN_SECRET),
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || "15m",
  REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL || "7d",
  ACCESS_TOKEN_SECONDS: durationSeconds(process.env.ACCESS_TOKEN_TTL, "15m"),
  REFRESH_TOKEN_SECONDS: durationSeconds(process.env.REFRESH_TOKEN_TTL, "7d"),
  JWT_ISSUER: process.env.JWT_ISSUER || "notin-auth",
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || "notin-web",
  BCRYPT_ROUNDS: integer("BCRYPT_ROUNDS", isTest ? 4 : 12, { min: 4, max: 14 }),
  LOGIN_MAX_ATTEMPTS: integer("LOGIN_MAX_ATTEMPTS", 5, { min: 3, max: 20 }),
  LOGIN_LOCK_MINUTES: integer("LOGIN_LOCK_MINUTES", 15, { min: 1, max: 1440 }),
  OTP_TTL_MINUTES: integer("OTP_TTL_MINUTES", 10, { min: 2, max: 60 }),
  OTP_MAX_ATTEMPTS: integer("OTP_MAX_ATTEMPTS", 5, { min: 3, max: 10 }),
  OTP_RESEND_SECONDS: integer("OTP_RESEND_SECONDS", isTest ? 0 : 30, { min: 0, max: 600 }),
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  APP_URL: process.env.APP_URL || "http://localhost:4000",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: integer("SMTP_PORT", 587, { min: 1, max: 65535 }),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "Notin <no-reply@notin.app>",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:4000,http://localhost:8000,http://127.0.0.1:5500")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
});

module.exports = config;
