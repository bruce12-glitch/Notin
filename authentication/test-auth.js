const fs = require("fs");
const os = require("os");
const path = require("path");

const TEST_DB = path.join(os.tmpdir(), `notin-auth-test-${process.pid}-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: "test",
  ACCESS_TOKEN_SECRET: "test-access-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  REFRESH_TOKEN_SECRET: "test-refresh-secret-9876543210-ZYXWVUTSRQPONMLKJIHGFEDCBA",
  CSRF_SECRET: "test-csrf-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  OTP_PEPPER: "test-otp-pepper-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  DB_PATH: TEST_DB,
  BCRYPT_ROUNDS: "4",
  OTP_RESEND_SECONDS: "0",
  LOGIN_MAX_ATTEMPTS: "5",
  LOGIN_LOCK_MINUTES: "15",
});

const app = require("./server");
const db = require("./db");

let server;
const cookies = new Map();
const results = [];
const base = () => `http://127.0.0.1:${server.address().port}`;
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function check(name, condition, extra = "") {
  results.push([condition ? "PASS" : "FAIL", name, extra]);
}

function applyCookies(res) {
  const values = res.headers.getSetCookie?.() || [];
  for (const value of values) {
    const [pair] = value.split(";");
    const split = pair.indexOf("=");
    const name = pair.slice(0, split);
    const content = pair.slice(split + 1);
    if (!content || /max-age=0/i.test(value)) cookies.delete(name);
    else cookies.set(name, content);
  }
  return values;
}

function cookieHeader(source = cookies) {
  return [...source.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function req(method, route, body, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (options.useCookies !== false && cookies.size) headers.Cookie = cookieHeader();
  if (unsafe.has(method) && options.csrf !== false && cookies.get("notin_csrf")) {
    headers["X-CSRF-Token"] = cookies.get("notin_csrf");
  }
  const res = await fetch(base() + route, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookies = options.applyCookies === false ? (res.headers.getSetCookie?.() || []) : applyCookies(res);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers, setCookies };
}

async function freshCsrf() {
  const response = await req("GET", "/auth/csrf");
  return response.data?.csrfToken;
}

(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  let r = await req("GET", "/health");
  check("health includes database readiness", r.status === 200 && r.data?.database === "ok");
  check("security headers include CSP", !!r.headers.get("content-security-policy"));
  check("server identity header removed", !r.headers.get("x-powered-by"));

  const csrf = await freshCsrf();
  check("CSRF endpoint issues signed token", /^[-\w]+\.[-\w]+$/.test(csrf || "") && cookies.get("notin_csrf") === csrf);

  r = await req("POST", "/auth/register", { email: "blocked@notin.app", password: "SecurePass123!" }, { csrf: false });
  check("state-changing request without CSRF is blocked", r.status === 403 && r.data?.code === "CSRF_INVALID");

  const primaryEmail = "secure-test@notin.app";
  const firstPassword = "SecurePass123!";
  r = await req("POST", "/auth/register", { email: primaryEmail, password: firstPassword, displayName: "Secure Tester" });
  check("registration starts OTP verification", r.status === 200 && r.data?.step === "verify-otp");
  check("development OTP returned", /^\d{6}$/.test(r.data?.devCode || ""));
  const signupCode = r.data.devCode;

  r = await req("POST", "/auth/login", { email: primaryEmail, password: firstPassword });
  check("pending account cannot log in", r.status === 401 && r.data?.error === "Invalid email or password");

  r = await req("POST", "/auth/verify-otp", { email: primaryEmail, code: "000000" });
  check("wrong OTP reports remaining attempts", r.status === 400 && r.data?.remaining === 4);

  r = await req("POST", "/auth/verify-otp", { email: primaryEmail, code: signupCode });
  check("OTP creates verified account", r.status === 201 && r.data?.user?.is_verified === 1);
  check("public user excludes password hash", !("password_hash" in (r.data?.user || {})));
  check("auth cookies are HttpOnly", r.setCookies.filter((item) => /accessToken|refreshToken/.test(item)).every((item) => /HttpOnly/i.test(item)));
  check("CSRF cookie remains browser-readable", r.setCookies.some((item) => /^notin_csrf=/.test(item) && !/HttpOnly/i.test(item)));

  r = await req("POST", "/auth/register", { email: primaryEmail, password: firstPassword });
  check("duplicate email rejected", r.status === 409);
  r = await req("POST", "/auth/register", { email: "weak@notin.app", password: "password123" });
  check("weak/common password rejected", r.status === 400 && r.data?.field === "password");

  r = await req("GET", "/auth/me");
  check("authenticated profile returned", r.data?.user?.email === primaryEmail);
  r = await req("PATCH", "/auth/me", { displayName: "Renamed Securely" });
  check("profile update validated", r.data?.user?.display_name === "Renamed Securely");

  r = await req("POST", "/notes", { title: "Security", body: "Scoped note" });
  const noteId = r.data?.id;
  check("validated note created", r.status === 201 && Number.isInteger(noteId));
  r = await req("GET", "/notes");
  check("notes list is user scoped", Array.isArray(r.data) && r.data.length === 1);
  r = await req("PUT", `/notes/${noteId}`, { title: "Security updated" });
  check("note update succeeds", r.data?.title === "Security updated");
  r = await req("GET", "/notes/not-a-number");
  check("invalid note id rejected", r.status === 400);
  r = await req("POST", "/notes", { title: "x".repeat(201), body: "" });
  check("oversized note title rejected", r.status === 400);

  const savedCookies = new Map(cookies);
  cookies.clear();
  r = await req("GET", "/notes", undefined, { useCookies: false });
  check("notes require authentication", r.status === 401);
  for (const [key, value] of savedCookies) cookies.set(key, value);

  r = await req("GET", "/auth/sessions");
  const activeSession = r.data?.sessions?.find((session) => session.active === 1);
  check("session inventory lists active device", r.status === 200 && !!activeSession);

  r = await req("POST", "/auth/change-password", { currentPassword: "WrongPassword123!", newPassword: "AnotherSecure456!" });
  check("password change requires current password", r.status === 401);
  const oldAccessToken = cookies.get("accessToken");
  r = await req("POST", "/auth/change-password", { currentPassword: firstPassword, newPassword: "AnotherSecure456!" });
  check("password change revokes sessions", r.status === 200 && r.data?.ok === true && !cookies.has("refreshToken"));

  const staleAccess = await fetch(base() + "/auth/me", { headers: { Authorization: `Bearer ${oldAccessToken}` } });
  check("old access token rejected after password change", staleAccess.status === 401);

  await freshCsrf();
  r = await req("POST", "/auth/login", { email: primaryEmail, password: "AnotherSecure456!" });
  check("new password logs in", r.status === 200);

  const oldRefresh = cookies.get("refreshToken");
  r = await req("POST", "/auth/refresh");
  const rotatedRefresh = cookies.get("refreshToken");
  check("refresh rotation succeeds", r.status === 200 && rotatedRefresh && rotatedRefresh !== oldRefresh);

  const replayCookies = new Map([
    ["refreshToken", oldRefresh],
    ["notin_csrf", cookies.get("notin_csrf")],
  ]);
  const replay = await fetch(base() + "/auth/refresh", {
    method: "POST",
    headers: {
      Cookie: cookieHeader(replayCookies),
      "X-CSRF-Token": cookies.get("notin_csrf"),
      "Content-Type": "application/json",
    },
  });
  const replayData = await replay.json();
  check("refresh-token replay is detected", replay.status === 401 && replayData.code === "TOKEN_REUSE");
  r = await req("POST", "/auth/refresh");
  check("replay revokes entire token family", r.status === 401);

  cookies.clear();
  await freshCsrf();
  r = await req("POST", "/auth/login", { email: primaryEmail, password: "AnotherSecure456!" });
  check("login recovers after replay defense", r.status === 200);
  r = await req("POST", "/auth/logout");
  check("logout clears browser session", r.status === 200 && !cookies.has("accessToken"));

  await freshCsrf();
  r = await req("POST", "/auth/forgot-password", { email: "missing@notin.app" });
  const unknownMessage = r.data?.message;
  check("unknown recovery request is generic", r.status === 200 && !r.data?.devResetToken);
  r = await req("POST", "/auth/forgot-password", { email: primaryEmail });
  const resetToken = r.data?.devResetToken;
  check("known recovery response remains generic", r.data?.message === unknownMessage);
  check("development reset token available only in dev", !!resetToken);
  r = await req("POST", "/auth/reset-password", { token: resetToken, newPassword: "weakpassword" });
  check("weak reset password rejected", r.status === 400);
  r = await req("POST", "/auth/reset-password", { token: resetToken, newPassword: "ResetSecure789!" });
  check("password reset succeeds", r.status === 200 && r.data?.ok === true);
  await freshCsrf();
  r = await req("POST", "/auth/reset-password", { token: resetToken, newPassword: "ReuseSecure789!" });
  check("reset token cannot be reused", r.status === 400);

  r = await req("POST", "/auth/login", { email: primaryEmail, password: "ResetSecure789!" });
  check("reset password logs in", r.status === 200);
  r = await req("DELETE", "/auth/me", {});
  check("account deletion requires password body", r.status === 400);
  r = await req("DELETE", "/auth/me", { currentPassword: "WrongSecure789!" });
  check("account deletion rejects wrong password", r.status === 401);
  r = await req("DELETE", "/auth/me", { currentPassword: "ResetSecure789!" });
  check("account deletion succeeds with reauthentication", r.status === 200 && r.data?.ok === true);
  await freshCsrf();
  r = await req("POST", "/auth/login", { email: primaryEmail, password: "ResetSecure789!" });
  check("deleted account cannot log in", r.status === 401);

  // Dedicated account-lockout coverage.
  const lockEmail = "lock-test@notin.app";
  r = await req("POST", "/auth/register", { email: lockEmail, password: "LockSecure123!" });
  const lockCode = r.data?.devCode;
  r = await req("POST", "/auth/verify-otp", { email: lockEmail, code: lockCode });
  check("lockout fixture account created", r.status === 201);
  await req("POST", "/auth/logout");
  await freshCsrf();
  for (let index = 0; index < 5; index++) {
    await req("POST", "/auth/login", { email: lockEmail, password: "WrongSecure123!" });
  }
  r = await req("POST", "/auth/login", { email: lockEmail, password: "LockSecure123!" });
  check("account locks after repeated failures", r.status === 429 && r.data?.code === "ACCOUNT_LOCKED");

  const hostile = await fetch(base() + "/auth/csrf", { headers: { Origin: "https://evil.example" } });
  check("untrusted browser origin rejected", hostile.status === 403);

  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }

  console.log("\n==================== RESULTS ====================");
  let passed = 0;
  let failed = 0;
  for (const [status, name, extra] of results) {
    console.log(`${status === "PASS" ? "✅" : "❌"} ${status}  ${name} ${extra}`);
    status === "PASS" ? passed++ : failed++;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (error) => {
  console.error(error);
  try { if (server) await new Promise((resolve) => server.close(resolve)); } catch {}
  try { db.close(); } catch {}
  process.exit(1);
});
