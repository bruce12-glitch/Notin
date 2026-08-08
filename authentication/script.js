// Notin Authentication — behavior preserved; UI corrected separately

const emailInput = document.getElementById('email');
const continueBtn = document.getElementById('continueBtn');
const form = document.getElementById('authForm');
const googleBtn = document.getElementById('googleBtn');
const appleBtn = document.getElementById('appleBtn');
const loginLink = document.getElementById('loginLink');

function setContinueEnabled(isValid) {
  continueBtn.disabled = !isValid;
}

emailInput.addEventListener('input', () => {
  const isValid = emailInput.validity.valid && emailInput.value.trim().length > 0;
  setContinueEnabled(isValid);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  if (!email || !emailInput.validity.valid) return;

  continueBtn.disabled = true;
  const original = continueBtn.textContent;
  continueBtn.textContent = 'Please wait...';

  // Stub — connect to backend later
  await new Promise((resolve) => setTimeout(resolve, 800));

  alert(`OTP flow ready for: ${email}\n(Connect to your backend)`);

  continueBtn.textContent = original;
  setContinueEnabled(true);
});

googleBtn.addEventListener('click', () => {
  const authUrl = window.NOTIN_AUTH_API || 'http://localhost:8787';
  window.location.href = `${authUrl}/auth/google`;
});

if (appleBtn) {
  appleBtn.addEventListener('click', () => {
    // Visual parity with Evernote; SIWA not wired yet
    alert('Continue with Apple — coming soon.');
  });
}

if (loginLink) {
  loginLink.addEventListener('click', (e) => {
    // login.html may not exist yet — keep soft fallback
    if (!loginLink.getAttribute('href') || loginLink.getAttribute('href') === '#') {
      e.preventDefault();
      alert('Login flow would open here.');
    }
  });
}

window.addEventListener('load', () => {
  setContinueEnabled(false);
});
