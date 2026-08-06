// ============================================================
// tokens.js — constrained JWTs and rotating refresh-token families
// ============================================================
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");
const config = require("./config");
const tokenModel = require("./models/token.model");

const commonSignOptions = {
  algorithm: "HS256",
  issuer: config.JWT_ISSUER,
  audience: config.JWT_AUDIENCE,
};
const commonVerifyOptions = {
  algorithms: ["HS256"],
  issuer: config.JWT_ISSUER,
  audience: config.JWT_AUDIENCE,
};

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, ver: Number(user.tokenVersion || 0), type: "access" },
    config.ACCESS_TOKEN_SECRET,
    { ...commonSignOptions, expiresIn: config.ACCESS_TOKEN_TTL, jwtid: crypto.randomUUID() }
  );
}

function signRefreshToken(userId, familyId) {
  return jwt.sign(
    { sub: String(userId), type: "refresh", family: familyId },
    config.REFRESH_TOKEN_SECRET,
    { ...commonSignOptions, expiresIn: config.REFRESH_TOKEN_TTL, jwtid: crypto.randomUUID() }
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.ACCESS_TOKEN_SECRET, commonVerifyOptions);
  if (payload.type !== "access") throw new Error("Invalid token type");
  return payload;
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.REFRESH_TOKEN_SECRET, commonVerifyOptions);
  if (payload.type !== "refresh") throw new Error("Invalid token type");
  return payload;
}

function storeSignedRefreshToken(userId, token, familyId, meta) {
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();
  tokenModel.storeRefreshToken({
    userId,
    token,
    familyId,
    expiresAt,
    userAgent: meta.userAgent || "",
    ip: meta.ip || "",
  });
}

function issueRefreshToken(userId, meta = {}) {
  const familyId = meta.familyId || crypto.randomUUID();
  const token = signRefreshToken(userId, familyId);
  storeSignedRefreshToken(userId, token, familyId, meta);
  return token;
}

function rotateRefreshToken(oldToken, userId, familyId, meta = {}) {
  return db.transaction(() => {
    const token = signRefreshToken(userId, familyId);
    storeSignedRefreshToken(userId, token, familyId, meta);
    tokenModel.rotateRefreshToken(oldToken, token);
    return token;
  });
}

function issueResetToken(userId, ttlMinutes = 30) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  tokenModel.storeResetToken({ userId, token, expiresAt });
  return token;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
  issueRefreshToken,
  rotateRefreshToken,
  issueResetToken,
  getRefreshTokenRecord: tokenModel.getRefreshTokenRecord,
  isRefreshTokenActive: tokenModel.isRefreshTokenActive,
  revokeRefreshToken: tokenModel.revokeRefreshToken,
  revokeAllForUser: tokenModel.revokeAllForUser,
  revokeFamily: tokenModel.revokeFamily,
  listSessions: tokenModel.listSessions,
  revokeSession: tokenModel.revokeSession,
  findValidResetToken: tokenModel.findValidResetToken,
  markResetTokenUsed: tokenModel.markResetTokenUsed,
};
