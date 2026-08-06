// ============================================================
// auth.middleware.js — JWT guard with live account security state
// ============================================================
const { verifyAccessToken } = require("./tokens");
const userModel = require("./models/user.model");

function sqliteTimestampMs(value) {
  if (!value) return 0;
  const text = String(value);
  return Date.parse(text.includes("T") ? text : `${text.replace(" ", "T")}Z`) || 0;
}

function requireAuth(req, res, next) {
  let token = req.cookies?.accessToken;
  let method = "cookie";
  if (!token) {
    const header = req.headers.authorization || "";
    if (/^Bearer\s+/i.test(header)) {
      token = header.replace(/^Bearer\s+/i, "");
      method = "bearer";
    }
  }

  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyAccessToken(token);
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid subject");

    const state = userModel.getSecurityState(userId);
    if (!state || state.is_verified !== 1) throw new Error("Account unavailable");
    if (Number(payload.ver || 0) !== Number(state.token_version || 0)) {
      throw new Error("Session version revoked");
    }

    const changedAtSeconds = Math.floor(sqliteTimestampMs(state.password_changed_at) / 1000);
    if (changedAtSeconds && payload.iat && changedAtSeconds > payload.iat) {
      throw new Error("Password changed after token issuance");
    }

    req.userId = userId;
    req.userRole = state.role || "user";
    req.authMethod = method;
    req.authTokenId = payload.jti;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.userRole !== role) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

module.exports = { requireAuth, requireRole };
