// ============================================================
// app.js — frontend for the JWT auth API (3D card + notes)
// ============================================================
const API = ""; // same origin (served by the auth server)
let mode = "login"; // or "register"

const $ = (id) => document.getElementById(id);

function showMsg(el, text, kind) { el.textContent = text; el.className = "msg " + kind; }
function clearMsg(el) { el.textContent = ""; el.className = "msg"; }

// fetch wrapper: always send cookies + auto-refresh once on 401
async function apiFetch(path, options = {}, _retried = false) {
  const res = await fetch(API + path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });

  if (res.status === 401 && !_retried && !["/auth/refresh", "/auth/login", "/auth/register"].includes(path)) {
    const r = await fetch(API + "/auth/refresh", { method: "POST", credentials: "include" });
    if (r.ok) return apiFetch(path, options, true);
  }
  return res;
}

// ---------- toggle login <-> register ----------
function setMode(next) {
  mode = next;
  $("formTitle").textContent = mode === "login" ? "Log in to your account" : "Create your account";
  $("submitBtn").textContent = mode === "login" ? "Log in" : "Sign up";
  $("toggleLine").innerHTML =
    mode === "login"
      ? 'New here? <a id="toggleLink">Create an account</a>'
      : 'Already have an account? <a id="toggleLink">Log in</a>';
  $("toggleLink").addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
  $("password").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  clearMsg($("authMsg"));
}

$("toggleLink").addEventListener("click", () => setMode("register"));

// ---------- submit ----------
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = $("authMsg");
  const button = $("submitBtn");
  const emailInput = $("email");
  const passwordInput = $("password");
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const submittedMode = mode;

  clearMsg(message);

  // Use visible inline errors instead of relying on easy-to-miss browser
  // validation bubbles (the form intentionally has `novalidate`).
  if (!email || !emailInput.checkValidity()) {
    showMsg(message, "Enter a valid email address.", "err");
    emailInput.focus();
    return;
  }
  if (password.length < 8) {
    showMsg(message, "Password must be at least 8 characters.", "err");
    passwordInput.focus();
    return;
  }
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = submittedMode === "register" ? "Sending verification code…" : "Logging in…";
  showMsg(
    message,
    submittedMode === "register" ? "Creating your secure signup…" : "Checking your account…",
    "ok"
  );

  try {
    const res = await apiFetch("/auth/" + submittedMode, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 409 && submittedMode === "register") {
        setMode("login");
        emailInput.value = email;
        showMsg(message, "That email already has an account — please log in.", "ok");
        passwordInput.focus();
        return;
      }
      if (res.status === 401 && submittedMode === "login") {
        showMsg(message, "Wrong email or password. New here? Create an account.", "err");
        return;
      }
      showMsg(message, data.error || `Authentication failed (${res.status}). Please try again.`, "err");
      return;
    }

    if (submittedMode === "register") {
      if (data.step !== "verify-otp") {
        showMsg(message, "The server did not start email verification. Please try again.", "err");
        return;
      }
      startOtpStep(data);
      return;
    }

    await enterApp();
  } catch (error) {
    console.error("Authentication request failed", error);
    showMsg(message, "Could not reach the authentication server. Check your connection and try again.", "err");
  } finally {
    button.disabled = false;
    button.textContent = mode === "login" ? "Log in" : "Sign up";
  }
});

// ---------- logout ----------
$("logoutBtn").addEventListener("click", async () => {
  await apiFetch("/auth/logout", { method: "POST" });
  showApp(false);
  setMode("login");
});

// ---------- notes ----------
$("noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("noteTitle").value.trim();
  const body = $("noteBody").value.trim();
  if (!title && !body) return;

  const res = await apiFetch("/notes", { method: "POST", body: JSON.stringify({ title, body }) });
  if (res.ok) {
    $("noteTitle").value = "";
    $("noteBody").value = "";
    loadNotes();
  }
});

async function loadNotes() {
  const res = await apiFetch("/notes");
  if (!res.ok) return;

  const notes = await res.json();
  const list = $("notesList");
  list.innerHTML = notes.length ? "" : '<p style="color:#aaa;font-size:14px;">No notes yet — add one above.</p>';

  for (const n of notes) {
    const el = document.createElement("div");
    el.className = "note";
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="min-width:0;"><h4></h4><p></p></div>
        <button style="border:none;background:none;color:#c0392b;font-weight:700;cursor:pointer;font-size:13px;flex-shrink:0;">Delete</button>
      </div>`;
    el.querySelector("h4").textContent = n.title || "(untitled)";
    el.querySelector("p").textContent = n.body || "";
    el.querySelector("button").addEventListener("click", async () => {
      await apiFetch("/notes/" + n.id, { method: "DELETE" });
      loadNotes();
    });
    list.appendChild(el);
  }
}

// ---------- view switching ----------
function showCard(which) {
  $("authCard").classList.toggle("hidden", which !== "auth");
  $("otpCard").classList.toggle("hidden", which !== "otp");
  $("appCard").classList.toggle("hidden", which !== "app");
}

function showApp(isLoggedIn) {
  showCard(isLoggedIn ? "app" : "auth");
}

// ============================================================
// OTP verification step
// ============================================================
let otpEmail = "";
let resendTimer = null;

function startOtpStep(data) {
  otpEmail = data.email;
  $("otpEmail").textContent = data.email;
  showCard("otp");
  clearMsg($("otpMsg"));
  clearOtpInputs();

  const box = $("otpDevBox");
  if (data.devCode) {
    box.textContent = "Dev mode (no email server): your code is " + data.devCode;
    box.classList.add("show");
    autofillOtp(data.devCode);
  } else {
    box.classList.remove("show");
  }

  boxes()[0].focus();
  startResendCountdown(30);
}

const boxes = () => Array.from(document.querySelectorAll("#otpInputs input"));

function clearOtpInputs() { boxes().forEach((b) => (b.value = "")); }
function readOtp() { return boxes().map((b) => b.value).join(""); }
function autofillOtp(code) { boxes().forEach((b, i) => (b.value = code[i] || "")); }

boxes().forEach((box, i) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && i < 5) boxes()[i + 1].focus();
  });

  box.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !box.value && i > 0) boxes()[i - 1].focus();
  });

  box.addEventListener("paste", (e) => {
    e.preventDefault();
    const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    autofillOtp(digits);
    boxes()[Math.min(digits.length, 5)].focus();
  });
});

$("otpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg($("otpMsg"));

  const code = readOtp();
  if (code.length !== 6) {
    showMsg($("otpMsg"), "Enter all 6 digits.", "err");
    return;
  }

  const res = await apiFetch("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: otpEmail, code }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const extra = typeof data.remaining === "number" ? ` (${data.remaining} tries left)` : "";
    showMsg($("otpMsg"), (data.error || "Invalid code") + extra, "err");
    clearOtpInputs();
    boxes()[0].focus();
    return;
  }

  enterApp();
});

$("resendLink").addEventListener("click", async () => {
  if ($("resendLink").getAttribute("aria-disabled") === "true") return;

  const res = await apiFetch("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email: otpEmail }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    showMsg($("otpMsg"), "A new code was sent.", "ok");
    if (data.devCode) {
      $("otpDevBox").textContent = "Dev mode: your new code is " + data.devCode;
      $("otpDevBox").classList.add("show");
      autofillOtp(data.devCode);
    }
    startResendCountdown(30);
  } else {
    showMsg($("otpMsg"), data.error || "Could not resend.", "err");
  }
});

$("otpBack").addEventListener("click", () => {
  if (resendTimer) clearInterval(resendTimer);
  showCard("auth");
});

function startResendCountdown(seconds) {
  const link = $("resendLink");
  const timer = $("otpTimer");
  link.setAttribute("aria-disabled", "true");
  let s = seconds;

  const tick = () => {
    timer.textContent = s > 0 ? `Resend available in ${s}s` : "";
    if (s <= 0) {
      link.setAttribute("aria-disabled", "false");
      clearInterval(resendTimer);
    }
    s--;
  };

  if (resendTimer) clearInterval(resendTimer);
  tick();
  resendTimer = setInterval(tick, 1000);
}

async function enterApp() {
  const res = await apiFetch("/auth/me");
  if (!res.ok) {
    showApp(false);
    return;
  }

  const data = await res.json();
  const user = data.user || data;
  $("userEmail").textContent = user.display_name ? `${user.display_name} (${user.email})` : user.email;
  showApp(true);
  loadNotes();
}

// ---------- 3D tilt: card follows the mouse ----------
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  const cards = () => document.querySelectorAll(".card:not(.hidden)");
  window.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const rx = ((e.clientY - cy) / cy) * -6;
    const ry = ((e.clientX - cx) / cx) * 8;
    cards().forEach((c) => {
      c.style.animation = "none";
      c.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
  });

  window.addEventListener("mouseleave", () => {
    cards().forEach((c) => {
      c.style.transform = "";
      c.style.animation = "";
    });
  });
})();

// Respect ?mode=register|login from the main site's buttons.
(function () {
  const m = new URLSearchParams(location.search).get("mode");
  if (m === "register") setMode("register");
})();

// On load, check if already logged in.
enterApp();
