// Notin Authentication Page - Final Version

const emailInput = document.getElementById('email');
const continueBtn = document.getElementById('continueBtn');
const form = document.getElementById('authForm');
const googleBtn = document.getElementById('googleBtn');

// Enable/Disable Continue button
emailInput.addEventListener('input', () => {
  const isValid = emailInput.validity.valid && emailInput.value.length > 0;
  continueBtn.disabled = !isValid;
  continueBtn.style.background = isValid ? '#151515' : '#cecece';
});

// Form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = emailInput.value.trim();
  if (!email) return;

  continueBtn.disabled = true;
  continueBtn.textContent = 'Please wait...';

  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 800));
  
  alert(`OTP flow ready for: ${email}\n(Connect to your backend)`);
  
  continueBtn.textContent = 'Continue';
  continueBtn.disabled = false;
});

// Google button
googleBtn.addEventListener('click', () => {
  const authUrl = window.NOTIN_AUTH_API || 'http://localhost:8787';
  window.location.href = `${authUrl}/auth/google`;
});

// Login link
document.querySelector('.login-text a').addEventListener('click', (e) => {
  e.preventDefault();
  alert('Login flow would open here.');
});

// Keyboard accessibility
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement === emailInput) {
    if (!continueBtn.disabled) {
      form.dispatchEvent(new Event('submit'));
    }
  }
});

// Initial state
window.addEventListener('load', () => {
  continueBtn.disabled = true;
  continueBtn.style.background = '#cecece';
});