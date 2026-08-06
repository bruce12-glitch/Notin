// ============================================================
// tokens.js — JWT signing/verifying + token issuance helpers
// ============================================================
require("dotenv").config({ quiet: true });
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const tokenModel = require("./models/token.model");

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "7d";

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("Missing ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET in .env");
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefreshToken(userId) {
  const jti = crypto.randomBytes(16).toString("hex");
  return jwt.sign({ sub: userId, jti }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

function issueRefreshToken(userId, meta = {}) {
  const token = signRefreshToken(userId);
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();
  tokenModel.storeRefreshToken({
    userId, token, expiresAt,
    userAgent: meta.userAgent || "",
    ip: meta.ip || "",
  });
  return token;
}

function issueResetToken(userId, ttlMinutes = 30) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  tokenModel.storeResetToken({ userId, token, expiresAt });
  return token;
}

module.exports = {
  signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken,
  issueRefreshToken, issueResetToken,
  isRefreshTokenActive: tokenModel.isRefreshTokenActive,
  revokeRefreshToken: tokenModel.revokeRefreshToken,
  revokeAllForUser: tokenModel.revokeAllForUser,
  findValidResetToken: tokenModel.findValidResetToken,
  markResetTokenUsed: tokenModel.markResetTokenUsed,
};
