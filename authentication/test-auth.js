const fs = require("fs");
const os = require("os");
const path = require("path");

// Keep the suite self-contained: no local .env or persistent database required.
const TEST_DB = path.join(os.tmpdir(), `notin-auth-test-${process.pid}-${Date.now()}.db`);
process.env.ACCESS_TOKEN_SECRET ||= "test-only-access-secret-not-for-production-0123456789";
process.env.REFRESH_TOKEN_SECRET ||= "test-only-refresh-secret-not-for-production-9876543210";
process.env.DB_PATH = TEST_DB;

const app = require("./server.js");
const db = require("./db");

const base = () => `http://127.0.0.1:${server.address().port}`;

let server, cookies = "";

function setCookies(res) {
  const sc = res.headers.getSetCookie?.() || [];
  if (sc.length) cookies = sc.map((c) => c.split(";")[0]).join("; ");
}

async function req(method, path, body, useCookies = true) {
  const res = await fetch(base() + path, {
    method,
    headers: { "Content-Type": "application/json", ...(useCookies && cookies ? { Cookie: cookies } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  setCookies(res);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const results = [];

function check(name, cond, extra = "") {
  results.push([cond ? "PASS" : "FAIL", name, extra]);
}

(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  // register step 1 -> OTP required (user NOT created yet)
  let r = await req("POST", "/auth/register", {
    email: "test@notin.app",
    password: "password123",
    displayName: "Tester",
  });
  check("register returns verify-otp step", r.data?.step === "verify-otp");
  check("dev OTP code returned", /^\d{6}$/.test(r.data?.devCode || ""));
  const signupCode = r.data.devCode;

  // login blocked before verifying
  r = await req("POST", "/auth/login", {
    email: "test@notin.app",
    password: "password123",
  }, false);
  check("login blocked before OTP verify (401)", r.status === 401);

  // register step 2 -> verify OTP -> account created + logged in
  r = await req("POST", "/auth/verify-otp", {
    email: "test@notin.app",
    code: signupCode,
  });
  check("verify-otp creates account (201)", r.status === 201);
  check("returns user w/ display_name", r.data?.user?.display_name === "Tester");
  check("user is verified", r.data?.user?.is_verified === 1);
  check("no password in response", !("password_hash" in (r.data?.user || {})));

  // duplicate (real account now exists)
  r = await req("POST", "/auth/register", {
    email: "test@notin.app",
    password: "password123",
  }, false);
  check("duplicate email 409", r.status === 409);

  // validation
  r = await req("POST", "/auth/register", { email: "bad", password: "short" }, false);
  check("bad input 400", r.status === 400);

  // me
  r = await req("GET", "/auth/me");
  check("me returns user", r.data?.user?.email === "test@notin.app");

  // update profile
  r = await req("PATCH", "/auth/me", { displayName: "Renamed" });
  check("update profile", r.data?.user?.display_name === "Renamed");

  // notes CRUD
  r = await req("POST", "/notes", { title: "N1", body: "b" });
  const noteId = r.data?.id;
  check("create note", r.status === 201 && noteId);

  r = await req("GET", "/notes");
  check("list notes = 1", Array.isArray(r.data) && r.data.length === 1);

  r = await req("PUT", "/notes/" + noteId, { title: "N1-edit" });
  check("update note", r.data?.title === "N1-edit");

  r = await req("DELETE", "/notes/" + noteId);
  check("delete note", r.data?.ok === true);

  // notes without auth
  const saved = cookies;
  cookies = "";
  r = await req("GET", "/notes", null, false);
  check("notes no-auth 401", r.status === 401);
  cookies = saved;

  // change password
  r = await req("POST", "/auth/change-password", {
    currentPassword: "password123",
    newPassword: "newpassword123",
  });
  check("change password", r.data?.ok === true);

  cookies = ""; // cookies were cleared
  r = await req("POST", "/auth/login", {
    email: "test@notin.app",
    password: "newpassword123",
  });
  check("login with NEW password", r.status === 200);

  // refresh rotation
  const before = cookies;
  r = await req("POST", "/auth/refresh");
  check("refresh ok", r.data?.ok === true);
  check("cookies rotated", cookies !== before);

  // logout revokes
  r = await req("POST", "/auth/logout");
  check("logout ok", r.data?.ok === true);

  // forgot + reset password
  r = await req("POST", "/auth/forgot-password", { email: "test@notin.app" }, false);
  const resetToken = r.data?.devResetToken;
  check("forgot returns token", !!resetToken);

  r = await req("POST", "/auth/reset-password", {
    token: resetToken,
    newPassword: "resetpass123",
  }, false);
  check("reset password", r.data?.ok === true);

  r = await req("POST", "/auth/login", {
    email: "test@notin.app",
    password: "resetpass123",
  }, false);
  check("login after reset", r.status === 200);

  setCookies({ headers: { getSetCookie: () => [] } });

  // delete account (need fresh login cookies)
  const dl = await fetch(base() + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@notin.app", password: "resetpass123" }),
  });
  cookies = (dl.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

  r = await req("DELETE", "/auth/me");
  check("delete account", r.data?.ok === true);

  cookies = "";
  r = await req("POST", "/auth/login", {
    email: "test@notin.app",
    password: "resetpass123",
  }, false);
  check("login after delete fails", r.status === 401);

  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }

  console.log("\n==================== RESULTS ====================");
  let pass = 0, fail = 0;
  for (const [status, name, extra] of results) {
    console.log(`${status === "PASS" ? "✅" : "❌"} ${status}  ${name} ${extra}`);
    status === "PASS" ? pass++ : fail++;
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
