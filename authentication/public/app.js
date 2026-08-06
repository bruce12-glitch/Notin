// ============================================================
// app.js — secure browser client with restrained 3D motion
// ============================================================
const API = "";
const $ = (id) => document.getElementById(id);
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let mode = "login";
let csrfToken = "";
let otpEmail = "";
let resendTimer = null;
let resetToken = new URLSearchParams(location.search).get("resetToken") || "";

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `msg ${kind}`;
}
function clearMsg(el) {
  el.textContent = "";
  el.className = "msg";
}
function safeJson(res) {
  return res.json().catch(() => ({}));
}
function cookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

async function ensureCsrf(force = false) {
  const current = cookie("notin_csrf");
  if (!force && current) {
    csrfToken = current;
    return current;
  }
  const res = await fetch(`${API}/auth/csrf`, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Could not initialize browser security");
  const data = await safeJson(res);
  csrfToken = data.csrfToken || cookie("notin_csrf");
  return csrfToken;
}

async function apiFetch(path, options = {}, state = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] ||= "application/json";
  if (UNSAFE.has(method)) {
    const token = cookie("notin_csrf") || await ensureCsrf();
    headers["X-CSRF-Token"] = token;
  }

  const res = await fetch(API + path, {
    ...options,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 403 && !state.csrfRetried) {
    const data = await safeJson(res.clone());
    if (data.code === "CSRF_INVALID") {
      await ensureCsrf(true);
      return apiFetch(path, options, { ...state, csrfRetried: true });
    }
  }

  const refreshExcluded = ["/auth/refresh", "/auth/login", "/auth/register", "/auth/verify-otp", "/auth/reset-password"];
  if (res.status === 401 && !state.authRetried && !refreshExcluded.includes(path)) {
    const refreshed = await apiFetch("/auth/refresh", { method: "POST" }, { authRetried: true });
    if (refreshed.ok) return apiFetch(path, options, { ...state, authRetried: true });
  }
  return res;
}

function passwordScore(value) {
  let score = 0;
  if (value.length >= 10) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) score++;
  return score;
}
function passwordIsValid(value) {
  return value.length >= 10 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}
function updateMeter(input, meter, copy) {
  const score = passwordScore(input.value);
  meter.dataset.score = String(score);
  const labels = [
    "Use 10+ characters with upper, lower, and a number.",
    "Weak — add uppercase and numbers.",
    "Fair — add more variety.",
    "Good — a symbol makes it stronger.",
    "Strong password.",
  ];
  copy.textContent = labels[score];
}

function setMode(next) {
  mode = next;
  const registering = mode === "register";
  $("formTitle").textContent = registering ? "Create your secure account" : "Log in to your account";
  $("submitBtn").textContent = registering ? "Send verification code" : "Log in securely";
  $("displayNameWrap").classList.toggle("hidden", !registering);
  $("passwordMeter").classList.toggle("show", registering);
  $("forgotLink").classList.toggle("hidden", registering);
  $("toggleLine").innerHTML = registering
    ? 'Already have an account? <a id="toggleLink">Log in</a>'
    : 'New here? <a id="toggleLink">Create an account</a>';
  $("toggleLink").addEventListener("click", () => setMode(registering ? "login" : "register"));
  $("password").setAttribute("autocomplete", registering ? "new-password" : "current-password");
  $("password").placeholder = registering ? "10+ characters, upper, lower, number" : "Your password";
  clearMsg($("authMsg"));
}
$("toggleLink").addEventListener("click", () => setMode("register"));

function showCard(which) {
  for (const id of ["authCard", "otpCard", "forgotCard", "resetCard", "appCard"]) {
    $(id).classList.toggle("hidden", id !== `${which}Card`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showApp(loggedIn) {
  showCard(loggedIn ? "app" : "auth");
}

// ---------- password visibility and strength ----------
document.querySelectorAll("[data-password-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $(button.dataset.passwordTarget);
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Show" : "Hide";
    button.setAttribute("aria-label", `${showing ? "Show" : "Hide"} password`);
    input.focus();
  });
});
$("password").addEventListener("input", () => updateMeter($("password"), $("passwordMeter"), $("passwordMeterCopy")));
$("resetPassword").addEventListener("input", () => updateMeter($("resetPassword"), $("resetMeter"), $("resetMeterCopy")));

// ---------- login / registration ----------
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("authMsg");
  const button = $("submitBtn");
  const email = $("email").value.trim();
  const password = $("password").value;
  const submittedMode = mode;
  clearMsg(message);

  if (!email || !$("email").checkValidity()) {
    showMsg(message, "Enter a valid email address.", "err");
    return $("email").focus();
  }
  if (submittedMode === "register" && !passwordIsValid(password)) {
    showMsg(message, "Use 10+ characters with uppercase, lowercase, and a number.", "err");
    return $("password").focus();
  }
  if (submittedMode === "login" && !password) {
    showMsg(message, "Enter your password.", "err");
    return $("password").focus();
  }

  button.disabled = true;
  button.textContent = submittedMode === "register" ? "Securing account…" : "Checking credentials…";
  showMsg(message, submittedMode === "register" ? "Preparing email verification…" : "Opening your secure session…", "ok");

  try {
    const payload = { email, password };
    if (submittedMode === "register") payload.displayName = $("displayName").value.trim() || undefined;
    const res = await apiFetch(`/auth/${submittedMode}`, { method: "POST", body: JSON.stringify(payload) });
    const data = await safeJson(res);

    if (!res.ok) {
      if (res.status === 409 && submittedMode === "register") {
        setMode("login");
        $("email").value = email;
        showMsg(message, "That email already has an account. Please log in.", "ok");
      } else if (res.status === 429) {
        showMsg(message, "Too many attempts. Wait a few minutes and try again.", "err");
      } else {
        showMsg(message, data.error || "Authentication failed. Please try again.", "err");
      }
      return;
    }

    if (submittedMode === "register") return startOtpStep(data);
    await enterApp();
  } catch (error) {
    console.error("Authentication request failed", error);
    showMsg(message, "Could not reach the secure authentication service. Try again.", "err");
  } finally {
    button.disabled = false;
    button.textContent = mode === "register" ? "Send verification code" : "Log in securely";
  }
});

// ---------- OTP ----------
const boxes = () => Array.from(document.querySelectorAll("#otpInputs input"));
function clearOtpInputs() { boxes().forEach((box) => { box.value = ""; }); }
function readOtp() { return boxes().map((box) => box.value).join(""); }
function autofillOtp(code) { boxes().forEach((box, index) => { box.value = code[index] || ""; }); }
function startOtpStep(data) {
  otpEmail = data.email;
  $("otpEmail").textContent = data.email;
  clearOtpInputs();
  clearMsg($("otpMsg"));
  if (data.devCode) {
    $("otpDevBox").textContent = `Development code: ${data.devCode}`;
    $("otpDevBox").classList.add("show");
    autofillOtp(data.devCode);
  } else {
    $("otpDevBox").classList.remove("show");
  }
  showCard("otp");
  boxes()[0].focus();
  startResendCountdown(30);
}
boxes().forEach((box, index) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && index < 5) boxes()[index + 1].focus();
  });
  box.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !box.value && index > 0) boxes()[index - 1].focus();
  });
  box.addEventListener("paste", (event) => {
    event.preventDefault();
    const digits = (event.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    autofillOtp(digits);
    boxes()[Math.min(digits.length, 5)].focus();
  });
});
$("otpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("otpSubmit");
  const code = readOtp();
  clearMsg($("otpMsg"));
  if (code.length !== 6) return showMsg($("otpMsg"), "Enter all six digits.", "err");
  button.disabled = true;
  button.textContent = "Verifying…";
  try {
    const res = await apiFetch("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: otpEmail, code }) });
    const data = await safeJson(res);
    if (!res.ok) {
      const remaining = typeof data.remaining === "number" ? ` (${data.remaining} tries left)` : "";
      showMsg($("otpMsg"), `${data.error || "Invalid code"}${remaining}`, "err");
      clearOtpInputs();
      return boxes()[0].focus();
    }
    await enterApp();
  } catch {
    showMsg($("otpMsg"), "Verification service unavailable. Try again.", "err");
  } finally {
    button.disabled = false;
    button.textContent = "Verify & create account";
  }
});
$("resendLink").addEventListener("click", async () => {
  if ($("resendLink").getAttribute("aria-disabled") === "true") return;
  const res = await apiFetch("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email: otpEmail }) });
  const data = await safeJson(res);
  if (!res.ok) {
    showMsg($("otpMsg"), data.error || "Could not resend code.", "err");
    if (data.retryAfter) startResendCountdown(data.retryAfter);
    return;
  }
  showMsg($("otpMsg"), "A new verification code was sent.", "ok");
  if (data.devCode) {
    $("otpDevBox").textContent = `Development code: ${data.devCode}`;
    $("otpDevBox").classList.add("show");
    autofillOtp(data.devCode);
  }
  startResendCountdown(30);
});
$("otpBack").addEventListener("click", () => {
  if (resendTimer) clearInterval(resendTimer);
  showCard("auth");
});
function startResendCountdown(seconds) {
  if (resendTimer) clearInterval(resendTimer);
  const link = $("resendLink");
  let remaining = Math.max(0, Number(seconds) || 0);
  link.setAttribute("aria-disabled", "true");
  const tick = () => {
    $("otpTimer").textContent = remaining > 0 ? `Resend in ${remaining}s` : "";
    if (remaining <= 0) {
      link.setAttribute("aria-disabled", "false");
      return clearInterval(resendTimer);
    }
    remaining--;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

// ---------- password recovery ----------
$("forgotLink").addEventListener("click", () => {
  $("forgotEmail").value = $("email").value;
  clearMsg($("forgotMsg"));
  showCard("forgot");
  $("forgotEmail").focus();
});
$("forgotBack").addEventListener("click", () => showCard("auth"));
$("forgotForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("forgotEmail").value.trim();
  if (!email || !$("forgotEmail").checkValidity()) return showMsg($("forgotMsg"), "Enter a valid email.", "err");
  $("forgotSubmit").disabled = true;
  try {
    const res = await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    const data = await safeJson(res);
    if (!res.ok) return showMsg($("forgotMsg"), data.error || "Could not request a reset.", "err");
    if (data.devResetToken) {
      resetToken = data.devResetToken;
      showCard("reset");
      showMsg($("resetMsg"), "Development mode: reset token loaded securely.", "ok");
      $("resetPassword").focus();
    } else {
      showMsg($("forgotMsg"), data.message, "ok");
    }
  } catch {
    showMsg($("forgotMsg"), "Recovery service unavailable. Try again.", "err");
  } finally {
    $("forgotSubmit").disabled = false;
  }
});
$("resetBack").addEventListener("click", () => {
  resetToken = "";
  history.replaceState(null, "", location.pathname);
  showCard("auth");
});
$("resetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("resetPassword").value;
  const confirmation = $("resetConfirm").value;
  clearMsg($("resetMsg"));
  if (!resetToken) return showMsg($("resetMsg"), "Reset link is missing or expired.", "err");
  if (!passwordIsValid(password)) return showMsg($("resetMsg"), "Use 10+ characters with uppercase, lowercase, and a number.", "err");
  if (password !== confirmation) return showMsg($("resetMsg"), "Passwords do not match.", "err");
  $("resetSubmit").disabled = true;
  try {
    const res = await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, newPassword: password }) });
    const data = await safeJson(res);
    if (!res.ok) return showMsg($("resetMsg"), data.error || "Could not reset password.", "err");
    resetToken = "";
    history.replaceState(null, "", location.pathname);
    setMode("login");
    showCard("auth");
    showMsg($("authMsg"), "Password reset. Log in with your new password.", "ok");
  } catch {
    showMsg($("resetMsg"), "Recovery service unavailable. Try again.", "err");
  } finally {
    $("resetSubmit").disabled = false;
  }
});

// ---------- notes and sessions ----------
$("noteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("noteTitle").value.trim();
  const body = $("noteBody").value;
  if (!title && !body.trim()) return;
  const res = await apiFetch("/notes", { method: "POST", body: JSON.stringify({ title, body }) });
  const data = await safeJson(res);
  if (!res.ok) return showMsg($("appMsg"), data.error || "Could not save note.", "err");
  $("noteTitle").value = "";
  $("noteBody").value = "";
  clearMsg($("appMsg"));
  loadNotes();
});
async function loadNotes() {
  const res = await apiFetch("/notes");
  if (!res.ok) return;
  const notes = await safeJson(res);
  const list = $("notesList");
  list.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "profile";
    empty.textContent = "No notes yet — add one above.";
    return list.appendChild(empty);
  }
  for (const note of notes) {
    const element = document.createElement("article");
    element.className = "note";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;gap:10px;align-items:flex-start";
    const copy = document.createElement("div");
    copy.style.minWidth = "0";
    const title = document.createElement("h4");
    title.textContent = note.title || "(untitled)";
    const body = document.createElement("p");
    body.textContent = note.body || "";
    const remove = document.createElement("button");
    remove.className = "note-delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      const deleted = await apiFetch(`/notes/${note.id}`, { method: "DELETE" });
      if (deleted.ok) loadNotes();
    });
    copy.append(title, body);
    row.append(copy, remove);
    element.appendChild(row);
    list.appendChild(element);
  }
}
$("sessionsBtn").addEventListener("click", async () => {
  const panel = $("sessionsPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) await loadSessions();
});
async function loadSessions() {
  const res = await apiFetch("/auth/sessions");
  const data = await safeJson(res);
  if (!res.ok) return showMsg($("appMsg"), data.error || "Could not load sessions.", "err");
  const list = $("sessionsList");
  list.innerHTML = "";
  for (const session of data.sessions || []) {
    const row = document.createElement("div");
    row.className = "session";
    const copy = document.createElement("div");
    copy.className = "session-copy";
    const agent = document.createElement("b");
    agent.textContent = session.user_agent || "Unknown browser";
    const meta = document.createElement("span");
    meta.textContent = `${session.active ? "Active" : "Signed out"} · ${session.ip || "Unknown IP"}`;
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.textContent = "Revoke";
    revoke.disabled = !session.active;
    revoke.addEventListener("click", async () => {
      const response = await apiFetch(`/auth/sessions/${session.id}`, { method: "DELETE" });
      if (response.ok) loadSessions();
    });
    copy.append(agent, meta);
    row.append(copy, revoke);
    list.appendChild(row);
  }
}
$("logoutBtn").addEventListener("click", async () => {
  await apiFetch("/auth/logout", { method: "POST" });
  setMode("login");
  showApp(false);
});
$("logoutAllBtn").addEventListener("click", async () => {
  await apiFetch("/auth/logout-all", { method: "POST" });
  setMode("login");
  showApp(false);
});

async function enterApp() {
  try {
    const res = await apiFetch("/auth/me");
    if (!res.ok) return showApp(false);
    const data = await safeJson(res);
    const user = data.user || data;
    $("userEmail").textContent = user.display_name ? `${user.display_name} (${user.email})` : user.email;
    showApp(true);
    await loadNotes();
  } catch {
    showApp(false);
  }
}

// ---------- restrained pointer depth ----------
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let frame = null;
  let latest = null;
  const activeCard = () => document.querySelector(".card:not(.hidden)");
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    latest = event;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const card = activeCard();
      if (!card || !latest) return;
      const rect = card.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (latest.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (latest.clientY - rect.top) / rect.height));
      card.style.setProperty("--rx", `${((.5 - y) * 3).toFixed(2)}deg`);
      card.style.setProperty("--ry", `${((x - .5) * 4).toFixed(2)}deg`);
      card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    });
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    document.querySelectorAll(".card").forEach((card) => {
      card.style.removeProperty("--rx");
      card.style.removeProperty("--ry");
    });
  });
})();

// ---------- startup ----------
(async function start() {
  try { await ensureCsrf(); } catch (error) { console.error(error); }
  const requestedMode = new URLSearchParams(location.search).get("mode");
  if (resetToken) {
    showCard("reset");
    $("resetPassword").focus();
    return;
  }
  if (requestedMode === "register") setMode("register");
  await enterApp();
})();
