// ============================================================
// auth.middleware.js — route guards
// ============================================================
const { verifyAccessToken } = require("./tokens");

function requireAuth(req, res, next) {
  let token = req.cookies?.accessToken;
  if (!token) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) token = header.slice(7);
  }

  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role || "user";
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.userRole !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
