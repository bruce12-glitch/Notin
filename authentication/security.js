// ============================================================
// security.js — CSRF, trusted origins, and secure cookie policy
// ============================================================
const crypto = require("crypto");
const config = require("./config");

const CSRF_COOKIE = "notin_csrf";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isHttps(req) {
  return config.COOKIE_SECURE || req.secure ||
    String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function baseCookieOptions(req) {
  const secure = isHttps(req);
  return {
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  };
}

function authCookieOptions(req, maxAge) {
  return { ...baseCookieOptions(req), httpOnly: true, maxAge, priority: "high" };
}

function csrfCookieOptions(req) {
  return {
    ...baseCookieOptions(req),
    httpOnly: false,
    maxAge: config.REFRESH_TOKEN_SECONDS * 1000,
    priority: "high",
  };
}

function signCsrfNonce(nonce) {
  return crypto.createHmac("sha256", config.CSRF_SECRET).update(nonce).digest("base64url");
}

function generateCsrfToken() {
  const nonce = crypto.randomBytes(24).toString("base64url");
  return `${nonce}.${signCsrfNonce(nonce)}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isValidCsrfToken(token) {
  const [nonce, signature, extra] = String(token || "").split(".");
  if (!nonce || !signature || extra) return false;
  return safeEqual(signature, signCsrfNonce(nonce));
}

function setCsrfCookie(req, res) {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions(req));
  return token;
}

function clearSecurityCookies(req, res) {
  const options = baseCookieOptions(req);
  res.clearCookie("accessToken", options);
  res.clearCookie("refreshToken", options);
  res.clearCookie(CSRF_COOKIE, options);
}

function requireCsrf(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  // Non-browser API clients using an Authorization header do not rely on
  // ambient cookies and are therefore not vulnerable to cookie CSRF.
  const bearerOnly = /^Bearer\s+/i.test(req.headers.authorization || "") &&
    !req.cookies?.accessToken && !req.cookies?.refreshToken;
  if (bearerOnly) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("x-csrf-token");
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken) || !isValidCsrfToken(cookieToken)) {
    return res.status(403).json({ error: "Security token missing or expired", code: "CSRF_INVALID" });
  }
  next();
}

function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function isAllowedOrigin(req, origin) {
  if (!origin) return true;
  return origin === requestOrigin(req) || config.CORS_ORIGINS.includes(origin);
}

function enforceTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && !isAllowedOrigin(req, origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  next();
}

function noStore(req, res, next) {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  next();
}

module.exports = {
  CSRF_COOKIE,
  authCookieOptions,
  baseCookieOptions,
  setCsrfCookie,
  clearSecurityCookies,
  requireCsrf,
  requestOrigin,
  isAllowedOrigin,
  enforceTrustedOrigin,
  noStore,
};
