// Notin Authentication — unified API wiring (WP-AUTH-002)
// Visual layout / 3D / cursor frozen — only behavior replaced

const API_BASE = (window.NOTIN_API || '').replace(/\/$/, '') || '';

// In-memory token (NEVER localStorage)
let memToken = null;
let memEmail = null;
function setMemToken(t, email){ memToken = t || null; if(email) memEmail = email; }
function getMemToken(){ return memToken; }

// Elements — shared between signup & login (graceful if missing)
const emailInput = document.getElementById('email');
const continueBtn = document.getElementById('continueBtn');
const authForm = document.getElementById('authForm');
const emailError = document.getElementById('emailError');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const emailStep = document.getElementById('emailStep');
const otpStep = document.getElementById('otpStep');
const otpInput = document.getElementById('otpInput');
const otpForm = document.getElementById('otpForm');
const otpVerifyBtn = document.getElementById('otpVerifyBtn');
const otpError = document.getElementById('otpError');
const otpResendBtn = document.getElementById('otpResendBtn');
const otpCooldown = document.getElementById('otpCooldown');
const otpMeta = document.getElementById('otpMeta');
const otpBackBtn = document.getElementById('otpBackBtn');
const otpEmailMasked = document.getElementById('otpEmailMasked');

// Login-only
const passwordStep = document.getElementById('passwordStep');
const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('passwordInput');
const pwdError = document.getElementById('pwdError');
const pwdContinueBtn = document.getElementById('pwdContinueBtn');
const pwdBackBtn = document.getElementById('pwdBackBtn');
const pwdEmailMasked = document.getElementById('pwdEmailMasked');
const pwdToggle = document.getElementById('pwdToggle');
const emailCodeBtn = document.getElementById('emailCodeBtn');
const cantSignInLink = document.getElementById('cantSignInLink');
const cantSignInMsg = document.getElementById('cantSignInMsg');

// WP-AUTH-003 — forgot/reset steps (login.html only; null on signup index.html)
const forgotStep = document.getElementById('forgotStep');
const forgotForm = document.getElementById('forgotForm');
const forgotEmail = document.getElementById('forgotEmail');
const forgotError = document.getElementById('forgotError');
const forgotSubmitBtn = document.getElementById('forgotSubmitBtn');
const forgotDone = document.getElementById('forgotDone');
const forgotDevBtn = document.getElementById('forgotDevBtn');
const forgotBackBtn = document.getElementById('forgotBackBtn');
const resetStep = document.getElementById('resetStep');
const resetForm = document.getElementById('resetForm');
const resetPassword = document.getElementById('resetPassword');
const resetConfirm = document.getElementById('resetConfirm');
const resetError = document.getElementById('resetError');
const resetSubmitBtn = document.getElementById('resetSubmitBtn');
const resetBackBtn = document.getElementById('resetBackBtn');
const resetPwdToggle = document.getElementById('resetPwdToggle');
const resetDoneMsg = document.getElementById('resetDoneMsg');
const resetStrength = document.getElementById('resetStrength');
const resetStrengthBar = document.getElementById('resetStrengthBar');
const resetStrengthFill = document.getElementById('resetStrengthFill');

// OTP step for login uses suffixed IDs
const otpStep2 = document.getElementById('otpStep') || document.querySelector('#otpStep');
const otpInput2 = document.getElementById('otpInput') || document.getElementById('otpInput');
const otpError2 = document.getElementById('otpError2') || otpError;
const otpVerifyBtn2 = document.getElementById('otpVerifyBtn2');
const otpResendBtn2 = document.getElementById('otpResendBtn2');
const otpCooldown2 = document.getElementById('otpCooldown2');
const otpMeta2 = document.getElementById('otpMeta2');
const otpBackBtn2 = document.getElementById('otpBackBtn2');
const otpEmailMasked2 = document.getElementById('otpEmailMasked2');

const googleBtn = document.getElementById('googleBtn');
const appleBtn = document.getElementById('appleBtn');
const loginLink = document.getElementById('loginLink');

// State
let currentEmail = '';
let currentChallenge = '';
let resetToken = ''; // WP-AUTH-003 — reset token from email link / dev fallback (memory only)
let resendTimer = null;
let cooldownSec = 0;

function apiUrl(p){ if(!p.startsWith('/')) p='/'+p; return API_BASE + p; }
async function api(path, {method='GET', body, auth=false}={}){
  const headers={'Content-Type':'application/json'};
  if(auth && memToken) headers['Authorization']=`Bearer ${memToken}`;
  const res = await fetch(apiUrl(path), {method, headers, credentials:'include', body: body?JSON.stringify(body):undefined});
  return res;
}
function maskEmail(email){
  if(!email||!email.includes('@')) return email||'';
  const [a,d]=email.split('@');
  if(a.length<=1) return `*@${d}`;
  if(a.length===2) return `${a[0]}*@${d}`;
  return `${a[0]}${'*'.repeat(Math.max(1,a.length-2))}${a[a.length-1]}@${d}`;
}
function setEmailError(msg){ if(emailError) emailError.textContent = msg||''; }
function setOtpError(msg){ 
  const el = (otpError || otpError2);
  if(el) el.textContent = msg||'';
  const el2 = (otpError && otpError2 && otpError!==otpError2) ? otpError2 : null;
  if(el2) el2.textContent = msg||'';
}
function setPwdError(msg){ if(pwdError) pwdError.textContent = msg||''; }
// WP-AUTH-003
function setForgotError(msg){ if(forgotError) forgotError.textContent = msg||''; }
function setResetError(msg){ if(resetError) resetError.textContent = msg||''; }
function showStep(name){
  // name: 'email' | 'otp' | 'password' | 'forgot' | 'reset'
  const isLogin = !!passwordStep;
  if(emailStep) emailStep.hidden = name!=='email';
  if(otpStep) otpStep.hidden = !(name==='otp' && !isLogin);
  // WP-AUTH-003 — forgot/reset steps are exclusive with everything else
  if(forgotStep) forgotStep.hidden = name!=='forgot';
  if(resetStep) resetStep.hidden = name!=='reset';
  // login has otpStep hidden as well but its OTP is same element? In login we reuse same otpStep if suffix not used
  // For login, passwordStep and otpStep2 are distinct
  if(passwordStep) passwordStep.hidden = name!=='password';
  // login's OTP uses same otpStep id? We created otpStep for login as hidden initially, but login has two OTP ids
  // If login and name==='otp' we need to show the login OTP variant
  const loginOtp = document.getElementById('otpStep');
  const loginOtp2 = document.getElementById('otpStep'); // same
  // Actually login.html has passwordStep and otpStep (with same id otpStep). We'll just toggle same.
  // For login OTP we use the same otpStep element (the last one defined as otpStep)
  // To avoid confusion, just ensure otpStep visible when name==='otp'
  // passwordStep already handled
}
function persistEmail(email){
  try{ sessionStorage.setItem('notin_email', email); }catch{}
}
function redirectToApp(email){
  if(email) persistEmail(email);
  const base = API_BASE || '';
  const url = base ? `${base}/app.html` : '/app.html';
  const target = email ? `${url}?email=${encodeURIComponent(email)}` : url;
  window.location.href = target;
}
function startCooldown(btn, span){
  if(!btn || !span) return;
  cooldownSec = 45;
  btn.disabled = true;
  span.textContent = `Resend in ${cooldownSec}s`;
  clearInterval(resendTimer);
  resendTimer = setInterval(()=>{
    cooldownSec--;
    if(cooldownSec<=0){
      clearInterval(resendTimer);
      btn.disabled = false;
      span.textContent = '';
    } else {
      span.textContent = `Resend in ${cooldownSec}s`;
    }
  }, 1000);
}

function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()); }

function setContinueEnabled(isValid){
  if(continueBtn) continueBtn.disabled = !isValid;
  setEmailError('');
}

// Email live validation
if(emailInput){
  emailInput.addEventListener('input', ()=>{
    const isValid = emailInput.validity.valid && emailInput.value.trim().length>0 && isValidEmail(emailInput.value);
    setContinueEnabled(isValid);
    if(isValid) setEmailError('');
  });
}

// Request a passwordless challenge. Production uses SMTP through /otp/request;
// development falls back to the explicitly guarded 123456 demo endpoint.
async function requestOtp(email){
  let response = await api('/api/auth/otp/request', {method:'POST', body:{email}});
  if(response.ok){
    const payload = await response.json();
    if(!payload.challenge) throw new Error('The server did not return a verification challenge');
    return { challenge: payload.challenge, email: payload.email || email };
  }

  // Demo mode is available only outside production and only without SMTP. The
  // backend enforces both conditions; attempting it here cannot enable demo in
  // a production process.
  if(response.status===404 || response.status===503){
    let demo = await api('/api/auth/otp/demo-request', {method:'POST', body:{email}});
    if(!demo.ok && demo.status===404){
      demo = await api('/auth/otp/demo-request', {method:'POST', body:{email}});
    }
    if(demo.ok){
      const payload = await demo.json();
      return { challenge: payload.challenge, email: payload.email || email };
    }
  }

  const payload = await response.json().catch(()=>({}));
  throw new Error(payload.error || 'Could not send code. Try again.');
}

// Email Continue → OTP (signup) or password (login)
if(authForm){
  authForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if(!email || !isValidEmail(email)){
      setEmailError('Enter a valid email address');
      return;
    }
    // Login page: go to password step first (hybrid)
    const isLoginPage = !!passwordStep;
    if(isLoginPage){
      // Show password step for email+password flow
      currentEmail = email;
      if(pwdEmailMasked) pwdEmailMasked.textContent = maskEmail(email);
      setPwdError('');
      if(passwordInput) passwordInput.value = '';
      showStep('password');
      if(passwordInput) passwordInput.focus();
      // Preserve email in session for OTP alternative
      persistEmail(email);
      // Push deep-link preserve
      try{ history.replaceState({},'', `${location.pathname}?email=${encodeURIComponent(email)}`); }catch{}
      return;
    }
    // Signup page: email → OTP
    currentEmail = email;
    setEmailError('');
    if(continueBtn){
      continueBtn.disabled = true;
      const orig = continueBtn.textContent;
      continueBtn.textContent = 'Sending code…';
      try{
        const { challenge } = await requestOtp(email);
        currentChallenge = challenge;
        if(otpEmailMasked) otpEmailMasked.textContent = maskEmail(email);
        if(otpMeta) otpMeta.textContent = 'The code expires in 5 minutes and works once';
        setOtpError('');
        showStep('otp');
        if(otpInput) { otpInput.value=''; otpInput.focus(); }
        startCooldown(otpResendBtn, otpCooldown);
        persistEmail(email);
        try{ history.replaceState({},'', `${location.pathname}?email=${encodeURIComponent(email)}`); }catch{}
      } catch(err){
        setEmailError(err.message || 'Could not send code. Try again.');
      } finally {
        continueBtn.textContent = orig;
        setContinueEnabled(true);
      }
    }
  });
}

// OTP verify (signup OTP)
if(otpForm){
  otpForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const codeEl = otpInput || document.getElementById('otpInput');
    const code = (codeEl ? codeEl.value : '').trim();
    if(!/^[0-9]{6}$/.test(code)){
      setOtpError('Enter the 6-digit code');
      return;
    }
    setOtpError('');
    const btn = otpVerifyBtn || document.getElementById('otpVerifyBtn');
    if(btn){ btn.disabled = true; btn.textContent = 'Verifying…'; }
    try{
      let res = await api('/api/auth/otp/verify', {method:'POST', body:{ challenge: currentChallenge, code }});
      if(!res.ok && res.status===404){
        // try legacy
        res = await api('/auth/otp/verify', {method:'POST', body:{ challenge: currentChallenge, code }});
      }
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || 'Invalid or expired code');
      const token = j.accessToken || j.token;
      if(!token) throw new Error('No token returned');
      setMemToken(token, currentEmail);
      persistEmail(currentEmail);
      redirectToApp(currentEmail);
    } catch(err){
      setOtpError(err.message || 'Verification failed');
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = 'Verify code'; }
    }
  });
}

// OTP resend
if(otpResendBtn){
  otpResendBtn.addEventListener('click', async ()=>{
    if(!currentEmail) return;
    setOtpError('');
    otpResendBtn.disabled = true;
    otpResendBtn.textContent = 'Sending…';
    try{
      // Try demo again for challenge refresh
      const { challenge } = await requestOtp(currentEmail);
      currentChallenge = challenge;
      setOtpError('');
      if(otpError) otpError.textContent = '';
      if(otpMeta) otpMeta.textContent = 'A new code was sent';
      startCooldown(otpResendBtn, otpCooldown);
    } catch(err){
      setOtpError(err.message || 'Could not resend');
      otpResendBtn.disabled = false;
      otpResendBtn.textContent = 'Resend code';
    } finally {
      if(otpResendBtn.textContent==='Sending…') otpResendBtn.textContent='Resend code';
    }
  });
}
if(otpBackBtn){
  otpBackBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    showStep('email');
    setOtpError('');
    setEmailError('');
  });
}

// Password step (login.html only)
if(passwordForm){
  passwordForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const pwd = passwordInput ? passwordInput.value : '';
    if(!pwd || pwd.length<1){
      setPwdError('Enter your password');
      return;
    }
    setPwdError('');
    if(pwdContinueBtn){ pwdContinueBtn.disabled=true; pwdContinueBtn.textContent='Signing in…'; }
    try{
      let res = await api('/api/users/signin', {method:'POST', body:{ email: currentEmail, password: pwd }});
      if(!res.ok){
        // try alias
        const alt = await api('/api/auth/signin', {method:'POST', body:{ email: currentEmail, password: pwd }});
        if(alt.ok) res = alt;
      }
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.message || j.error || 'Invalid credentials');
      const token = j.accessToken || j.token;
      if(!token) throw new Error('No token returned');
      setMemToken(token, currentEmail);
      persistEmail(currentEmail);
      redirectToApp(currentEmail);
    } catch(err){
      setPwdError(err.message || 'Sign in failed');
    } finally {
      if(pwdContinueBtn){ pwdContinueBtn.disabled=false; pwdContinueBtn.textContent='Sign in'; }
    }
  });
}
if(pwdToggle && passwordInput){
  pwdToggle.addEventListener('click', ()=>{
    const isPwd = passwordInput.type === 'password';
    passwordInput.type = isPwd ? 'text' : 'password';
    pwdToggle.textContent = isPwd ? 'Hide' : 'Show';
  });
}
if(pwdBackBtn){
  pwdBackBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    showStep('email');
    setPwdError('');
  });
}
if(emailCodeBtn){
  emailCodeBtn.addEventListener('click', async ()=>{
    if(!currentEmail) return;
    setPwdError('');
    emailCodeBtn.disabled = true;
    emailCodeBtn.textContent = 'Sending code…';
    try{
      const { challenge } = await requestOtp(currentEmail);
      currentChallenge = challenge;
      // Show OTP step (need to find OTP elements for login — they are suffixed 2)
      const loginOtpMask = document.getElementById('otpEmailMasked2');
      if(loginOtpMask) loginOtpMask.textContent = maskEmail(currentEmail);
      setOtpError('');
      // Hide password, show OTP
      if(passwordStep) passwordStep.hidden = true;
      const loginOtpStep = document.getElementById('otpStep');
      if(loginOtpStep) loginOtpStep.hidden = false;
      // Use login OTP input
      const li = document.getElementById('otpInput');
      if(li) { li.value=''; li.focus(); }
      const rc = document.getElementById('otpResendBtn2');
      const cd = document.getElementById('otpCooldown2');
      startCooldown(rc, cd);
      if(otpMeta2) otpMeta2.textContent = 'The code expires in 5 minutes and works once';
    } catch(err){
      setPwdError(err.message || 'Could not send code');
    } finally {
      emailCodeBtn.disabled=false;
      emailCodeBtn.textContent='Email me a code instead';
    }
  });
}
// Login OTP verify (second set of IDs)
const loginOtpForm = document.getElementById('otpForm');
const loginOtpInput = document.getElementById('otpInput');
// If login page has second OTP form ids, handle separately
const otpForm2 = document.getElementById('otpForm'); // same
// Actually login.html OTP form is same id otpForm? It has otpForm? In login we didn't give id for OTP form? We gave id="otpForm"? Let's check login's OTP form id is otpForm as well? Yes it has id="otpForm" in both? For login we reused same id? But we differentiate with 2 suffix for buttons. Simplify: handle both via delegation
// Add listener for login OTP verify button 2
const otpVerifyBtnLogin = document.getElementById('otpVerifyBtn2');
if(otpVerifyBtnLogin){
  otpVerifyBtnLogin.closest('form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const codeEl = document.getElementById('otpInput');
    const code = codeEl ? codeEl.value.trim() : '';
    if(!/^[0-9]{6}$/.test(code)){
      const errEl = document.getElementById('otpError2');
      if(errEl) errEl.textContent = 'Enter the 6-digit code';
      return;
    }
    const btn = otpVerifyBtnLogin;
    btn.disabled=true; btn.textContent='Verifying…';
    const errEl = document.getElementById('otpError2');
    if(errEl) errEl.textContent='';
    try{
      let res = await api('/api/auth/otp/verify', {method:'POST', body:{ challenge: currentChallenge, code }});
      if(!res.ok) res = await api('/auth/otp/verify', {method:'POST', body:{ challenge: currentChallenge, code }});
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || 'Invalid or expired code');
      const token = j.accessToken || j.token;
      setMemToken(token, currentEmail);
      persistEmail(currentEmail);
      redirectToApp(currentEmail);
    } catch(err){
      if(errEl) errEl.textContent = err.message || 'Verification failed';
    } finally {
      btn.disabled=false; btn.textContent='Verify code';
    }
  });
}
const otpResendBtnLogin = document.getElementById('otpResendBtn2');
if(otpResendBtnLogin){
  otpResendBtnLogin.addEventListener('click', async ()=>{
    if(!currentEmail) return;
    const errEl = document.getElementById('otpError2');
    if(errEl) errEl.textContent='';
    otpResendBtnLogin.disabled=true; otpResendBtnLogin.textContent='Sending…';
    try{
      const { challenge } = await requestOtp(currentEmail);
      currentChallenge = challenge;
      const meta = document.getElementById('otpMeta2');
      if(meta) meta.textContent='A new code was sent';
      startCooldown(otpResendBtnLogin, document.getElementById('otpCooldown2'));
    } catch(err){
      if(errEl) errEl.textContent = err.message;
    } finally {
      otpResendBtnLogin.disabled=false; otpResendBtnLogin.textContent='Resend code';
    }
  });
}
const otpBackBtnLogin = document.getElementById('otpBackBtn2');
if(otpBackBtnLogin){
  otpBackBtnLogin.addEventListener('click', (e)=>{
    e.preventDefault();
    // back to password step if came from there, else email
    const pwStep = document.getElementById('passwordStep');
    const otpStepEl = document.getElementById('otpStep');
    if(pwStep && !pwStep.hidden){
      // keep password
    } else {
      if(otpStepEl) otpStepEl.hidden = true;
      if(emailStep) emailStep.hidden = false;
      showStep('email');
    }
    // simpler: show email
    showStep('email');
    // also ensure password hidden if needed
    if(pwStep) pwStep.hidden = true;
    if(otpStepEl) otpStepEl.hidden = true;
    if(emailStep) emailStep.hidden = false;
  });
}

// Google
if(googleBtn){
  googleBtn.addEventListener('click', ()=>{
    const authUrl = API_BASE || window.location.origin;
    // Prefer /api/auth/google same origin
    // Check if backend mounts at /api/auth/google, else fallback to /auth/google
    window.location.href = `${authUrl}/api/auth/google`;
  });
}

// Apple — disabled style + inline message, no fake success
if(appleBtn){
  appleBtn.style.opacity = '0.72';
  appleBtn.title = 'Coming soon';
  // add inline message container if not exists
  let appleMsg = document.getElementById('appleMsg');
  if(!appleMsg){
    appleMsg = document.createElement('div');
    appleMsg.id='appleMsg';
    appleMsg.className='auth-error';
    appleMsg.setAttribute('aria-live','polite');
    appleMsg.style.marginTop='10px';
    // insert after social-row
    const socialRow = document.querySelector('.social-row');
    if(socialRow) socialRow.insertAdjacentElement('afterend', appleMsg);
  }
  appleBtn.addEventListener('click', ()=>{
    appleMsg.textContent = 'Continue with Apple — coming soon.';
    setTimeout(()=>{ if(appleMsg.textContent.includes('Apple')) appleMsg.textContent=''; }, 3200);
  });
}

// WP-SEC-006 — client-side password strength (mirrors backend validation.js)
function evaluatePasswordStrength(pwd, email=''){
  if(!pwd) return { score:0, label:'', color:'#e5e5e5', issues:[] };
  const issues=[];
  const lower = pwd.toLowerCase();
  const emailLocal = String(email||'').split('@')[0].toLowerCase();
  if(pwd.length < 8) issues.push('at least 8 characters');
  if(Buffer) {} // placeholder
  const categories = [/[a-z]/.test(pwd), /[A-Z]/.test(pwd), /[0-9]/.test(pwd), /[^A-Za-z0-9]/.test(pwd)].filter(Boolean).length;
  if(categories < 3) issues.push('3 of: lower, upper, number, symbol');
  if(/(.)\1\1/.test(pwd)) issues.push('no 3 repeating chars');
  if(emailLocal && emailLocal.length>=3 && lower.includes(emailLocal)) issues.push('must not contain email');
  // sequential
  for(let i=0;i<lower.length-3;i++){
    const a=lower.charCodeAt(i), b=lower.charCodeAt(i+1), c=lower.charCodeAt(i+2), d=lower.charCodeAt(i+3);
    if(b===a+1 && c===b+1 && d===c+1){ issues.push('no sequential like abcd/1234'); break; }
    if(b===a-1 && c===b-1 && d===c-1){ issues.push('no sequential like dcba/4321'); break; }
  }
  const common = new Set(['password','123456','qwerty','abc123','password1','12345678','111111','123123','qwerty123','admin','welcome','letmein','monkey','dragon','iloveyou']);
  if(common.has(lower)) issues.push('too common');
  let score = 0;
  if(pwd.length >= 8) score++;
  if(pwd.length >= 12) score++;
  if(categories >= 3) score++;
  if(categories === 4) score++;
  if(!issues.length && pwd.length >= 12) score++;
  if(issues.length) score = Math.min(score, 2);
  let label='', color='';
  if(score <=1){ label='Weak'; color='#E53E3E'; }
  else if(score ===2){ label='Fair'; color='#DD6B20'; }
  else if(score ===3){ label='Good'; color='#D69E2E'; }
  else if(score >=4){ label='Strong'; color='#00A82D'; }
  return { score, label, color, issues };
}

function renderResetStrength(){
  if(!resetPassword || !resetStrength || !resetStrengthBar || !resetStrengthFill) return;
  const pwd = resetPassword.value || '';
  const email = (forgotEmail && forgotEmail.value) || currentEmail || '';
  const { score, label, color, issues } = evaluatePasswordStrength(pwd, email);
  if(!pwd){
    resetStrength.textContent='';
    resetStrengthBar.style.display='none';
    resetStrengthFill.style.width='0%';
    return;
  }
  resetStrengthBar.style.display='block';
  const pct = Math.min(100, (score/5)*100);
  resetStrengthFill.style.width = pct + '%';
  resetStrengthFill.style.background = color;
  if(issues.length){
    resetStrength.textContent = label + ' — needs ' + issues.join(', ');
    resetStrength.style.color = color;
  } else {
    resetStrength.textContent = label + ' password';
    resetStrength.style.color = color;
  }
}

// ── WP-AUTH-003 — forgot/reset password flow ──
// “Can’t sign in?” → in-column forgot step (email → reset link). With SMTP the link arrives
// by email; without SMTP (dev only) the server echoes a token and we offer one-tap continue.
if(cantSignInLink){
  cantSignInLink.addEventListener('click', (e)=>{
    e.preventDefault();
    const pref = emailInput && isValidEmail(emailInput.value) ? emailInput.value.trim().toLowerCase() : '';
    if(forgotEmail && pref) forgotEmail.value = pref;
    setForgotError('');
    if(forgotDone) forgotDone.textContent = '';
    if(forgotDevBtn) forgotDevBtn.hidden = true;
    showStep('forgot');
    if(forgotEmail) forgotEmail.focus();
  });
}
if(forgotForm){
  forgotForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = (forgotEmail ? forgotEmail.value : '').trim().toLowerCase();
    if(!isValidEmail(email)){
      setForgotError('Enter a valid email address');
      return;
    }
    setForgotError('');
    if(forgotDone) forgotDone.textContent = '';
    if(forgotDevBtn) forgotDevBtn.hidden = true;
    if(forgotSubmitBtn){ forgotSubmitBtn.disabled = true; forgotSubmitBtn.textContent = 'Sending…'; }
    try{
      let res = await api('/api/auth/forgot-password', {method:'POST', body:{email}});
      if(!res.ok && res.status===404) res = await api('/auth/forgot-password', {method:'POST', body:{email}});
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || 'Could not process request');
      // Generic (anti-enumeration) confirmation is all the server commits to
      if(forgotDone) forgotDone.textContent = j.message || 'If an account exists for that email, a reset link is on its way.';
      // Dev fallback (no SMTP, non-production): server echoes the token — offer direct continue
      if(j.devResetToken && forgotDevBtn){
        resetToken = j.devResetToken;
        forgotDevBtn.hidden = false;
      }
    }catch(err){
      setForgotError(err.message || 'Could not process request');
    }finally{
      if(forgotSubmitBtn){ forgotSubmitBtn.disabled = false; forgotSubmitBtn.textContent = 'Send reset link'; }
    }
  });
}
if(forgotDevBtn){
  forgotDevBtn.addEventListener('click', ()=>{
    if(!resetToken) return;
    setResetError('');
    showStep('reset');
    if(resetPassword){ resetPassword.value=''; resetPassword.focus(); }
    if(resetConfirm) resetConfirm.value='';
  });
}
if(forgotBackBtn){
  forgotBackBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    setForgotError('');
    showStep('email');
  });
}
if(resetForm){
  resetForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const p1 = resetPassword ? resetPassword.value : '';
    const p2 = resetConfirm ? resetConfirm.value : '';
    if(!resetToken){
      setResetError('Missing reset token — request a new reset link.');
      return;
    }
    const strength = evaluatePasswordStrength(p1, currentEmail);
    if(p1.length < 8 || strength.issues.length){
      setResetError(strength.issues.length ? 'Password: ' + strength.issues.join(', ') : 'Password must be at least 8 characters');
      return;
    }
    if(p1 !== p2){
      setResetError('Passwords do not match');
      return;
    }
    setResetError('');
    if(resetSubmitBtn){ resetSubmitBtn.disabled = true; resetSubmitBtn.textContent = 'Resetting…'; }
    try{
      let res = await api('/api/auth/reset-password', {method:'POST', body:{ token: resetToken, password: p1 }});
      if(!res.ok && res.status===404) res = await api('/auth/reset-password', {method:'POST', body:{ token: resetToken, password: p1 }});
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || 'Reset link is invalid or has expired');
      resetToken = ''; // token is consumed server-side too (single-use)
      // Success → back to the sign-in form with a confirmation message
      window.location.href = apiUrl('/login.html?reset=1');
    }catch(err){
      setResetError(err.message || 'Could not reset password');
    }finally{
      if(resetSubmitBtn){ resetSubmitBtn.disabled = false; resetSubmitBtn.textContent = 'Reset password'; }
    }
  });
}
if(resetBackBtn){
  resetBackBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    setResetError('');
    showStep('email');
  });
}
if(resetPwdToggle && resetPassword){
  resetPwdToggle.addEventListener('click', ()=>{
    const isPwd = resetPassword.type === 'password';
    resetPassword.type = isPwd ? 'text' : 'password';
    resetPwdToggle.textContent = isPwd ? 'Hide' : 'Show';
  });
}
if(resetPassword){
  resetPassword.addEventListener('input', renderResetStrength);
}
if(forgotEmail){
  forgotEmail.addEventListener('input', ()=>{ if(resetStep && !resetStep.hidden) renderResetStrength(); });
}

if(loginLink){
  loginLink.addEventListener('click', (e)=>{
    if(!loginLink.getAttribute('href') || loginLink.getAttribute('href')==='#'){
      e.preventDefault();
      // handled
    }
  });
}

// Handle landing query ?auth=otp&challenge=&email=  (Google callback)
// WP-AUTH-003 — also handles ?token=<reset token> (email link) and ?reset=1 (post-reset success)
(function handleOtpQuery(){
  const qs = new URLSearchParams(location.search);
  // Reset link from the email (or dev log) → straight to the reset step
  const tok = qs.get('token');
  if(tok && resetStep){
    resetToken = tok.trim();
    setResetError('');
    if(resetDoneMsg) resetDoneMsg.textContent = '';
    showStep('reset');
    try{ history.replaceState({},'', location.pathname); }catch{} // don't keep the token in the URL bar
    if(resetPassword){ resetPassword.value=''; resetPassword.focus(); }
    if(resetConfirm) resetConfirm.value='';
    return;
  }
  if(qs.get('reset')==='1' && resetDoneMsg){
    resetDoneMsg.textContent = 'Password updated — sign in with your new password.';
    try{ history.replaceState({},'', location.pathname); }catch{}
  }
  const auth = qs.get('auth');
  const ch = qs.get('challenge');
  const em = qs.get('email');
  if(auth==='otp' && ch){
    currentChallenge = ch;
    currentEmail = em ? decodeURIComponent(em) : '';
    const masked = currentEmail ? maskEmail(currentEmail) : 'your email';
    if(otpEmailMasked) otpEmailMasked.textContent = masked;
    const masked2 = document.getElementById('otpEmailMasked2');
    if(masked2) masked2.textContent = masked;
    setOtpError('');
    if(otpMeta) otpMeta.textContent = 'The code expires in 5 minutes and works once';
    if(otpMeta2) otpMeta2.textContent = 'The code expires in 5 minutes and works once';
    showStep('otp');
    if(otpInput) otpInput.focus();
    const li = document.getElementById('otpInput');
    if(li) li.focus();
    // clean URL but keep challenge in memory
    try{ history.replaceState({},'', location.pathname); }catch{}
    if(currentEmail) persistEmail(currentEmail);
    startCooldown(otpResendBtn || document.getElementById('otpResendBtn2'), otpCooldown || document.getElementById('otpCooldown2'));
  } else {
    // preserve ?email= for deep-link
    const em2 = qs.get('email');
    if(em2 && emailInput){
      emailInput.value = decodeURIComponent(em2);
      const isValid = isValidEmail(emailInput.value);
      setContinueEnabled(isValid);
    }
  }
})();

window.addEventListener('load', ()=>{
  setContinueEnabled(false);
  // if email prefilled, enable
  if(emailInput && isValidEmail(emailInput.value)) setContinueEnabled(true);
});

// Prevent double-submit helper
let submitting = false;
// Prevent double-submit helper
let submittingDouble = false;

/* =========================================================
   3D MOTION + GLOWING CURSOR — additive only
   Does NOT alter layout, form width, 50/50 or flow
   ========================================================= */
(() => {
  // UX FIX (2026-08-09): the pointer-follow overlays (notin-cursor-spotlight/glow/dot/ring)
  // formed a sliding "white sheet" that washed over the credentials form and, with the
  // column/button/email 3D tilt, made the email field impossible to click/type into.
  // Disabled entirely — the page keeps its static layout, artwork, and quick intro fade
  // with a normal native cursor. Re-enable by flipping to true.
  const POINTER_MOTION = false;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
  const isSmall = window.matchMedia('(max-width: 900px)').matches;
  if (prefersReduced) return;

  const authColumn = document.querySelector('.auth-column');
  const artGreen = document.querySelector('.art-green');
  const artPurple = document.querySelector('.art-purple');
  const artBlue = document.querySelector('.art-blue');
  const artOrange = document.querySelector('.art-orange');
  const heroCopy = document.querySelector('.hero-copy');
  const brandMark = document.querySelector('.brand-mark');
  const artRegion = document.querySelector('.art-region');

  if (POINTER_MOTION && !isTouch && !isSmall) {
    const dot = document.createElement('div');
    dot.className = 'notin-cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'notin-cursor-ring';
    const glow = document.createElement('div');
    glow.className = 'notin-cursor-glow';
    const spotlight = document.createElement('div');
    spotlight.className = 'notin-cursor-spotlight';
    document.body.appendChild(dot);
    document.body.appendChild(glow);
    document.body.appendChild(ring);
    document.body.appendChild(spotlight);
    if (artRegion) artRegion.classList.add('has-spotlight');

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my, gx = mx, gy = my;
    let prevX = mx, prevY = my;
    let velX = 0, velY = 0, speed = 0;
    let rafId = null;
    let lastTrail = 0;
    let tickCount = 0;
    const lerp = (a, b, n) => (1 - n) * a + n * b;
    const spawnTrail = (x, y, s) => {
      if (s < 6) return;
      const now = performance.now();
      if (now - lastTrail < 28) return;
      lastTrail = now;
      const t = document.createElement('div');
      t.className = 'notin-cursor-trail';
      document.body.appendChild(t);
      const size = 10 + Math.min(s * 0.55, 14);
      t.style.width = size + 'px';
      t.style.height = size + 'px';
      t.style.margin = `-${size/2}px 0 0 -${size/2}px`;
      t.style.left = '0'; t.style.top = '0';
      t.style.opacity = '0.9';
      t.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1)`;
      requestAnimationFrame(() => {
        t.style.transition = 'transform 0.62s cubic-bezier(.2,.6,.3,1), opacity 0.62s ease';
        t.style.transform = `translate3d(${x}px, ${y}px, 0) scale(0.2)`;
        t.style.opacity = '0';
      });
      setTimeout(() => t.remove(), 640);
    };
    const onMouseMove = (e) => {
      const nx = e.clientX, ny = e.clientY;
      velX = nx - prevX; velY = ny - prevY;
      speed = Math.sqrt(velX*velX + velY*velY);
      prevX = nx; prevY = ny; mx = nx; my = ny;
      dot.style.opacity = '1'; ring.style.opacity = '1'; glow.style.opacity = '0.95'; spotlight.style.opacity = '1';
      document.body.classList.add('has-custom-cursor');
      const velNorm = Math.min(speed / 28, 1);
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) scale(${1 + velNorm*0.18})`;
      dot.style.filter = `hue-rotate(${velNorm*6}deg) brightness(${1+velNorm*0.12})`;
      const glowScale = 1 + velNorm * 0.55;
      glow.style.transform = `translate3d(${mx}px, ${my}px, 0) scale(${glowScale})`;
      glow.classList.add('is-moving'); ring.classList.add('is-moving');
      spotlight.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      if (artRegion) {
        const rect = artRegion.getBoundingClientRect();
        const sx = ((mx - rect.left) / rect.width) * 100;
        const sy = ((my - rect.top) / rect.height) * 100;
        artRegion.style.setProperty('--spot-x', sx + '%');
        artRegion.style.setProperty('--spot-y', sy + '%');
      }
      spawnTrail(mx, my, speed);
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onMouseLeave = () => { dot.style.opacity='0'; ring.style.opacity='0'; glow.style.opacity='0'; spotlight.style.opacity='0'; };
    const onMouseEnter = () => { dot.style.opacity='1'; ring.style.opacity='1'; glow.style.opacity='0.92'; spotlight.style.opacity='1'; };
    const interactiveSel = 'a, button, input, [role="button"]';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(interactiveSel)) { ring.classList.add('is-hover'); glow.classList.add('is-hover'); dot.style.transform = `translate3d(${mx}px, ${my}px, 0) scale(1.45)`; }
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(interactiveSel)) { ring.classList.remove('is-hover'); glow.classList.remove('is-hover'); dot.style.transform = `translate3d(${mx}px, ${my}px, 0) scale(1)`; }
    });
    document.body.classList.add('has-js-motion');
    const style = document.createElement('style');
    style.textContent = `.has-js-motion .art-green,.has-js-motion .art-purple,.has-js-motion .art-blue,.has-js-motion .art-orange,.has-js-motion .hero-copy,.has-js-motion .brand-mark{animation:none !important}`;
    document.head.appendChild(style);
    const depth = { green: 0.028, purple: 0.042, blue: 0.032, orange: 0.048, hero: 0.018, mark: 0.012 };
    function tick() {
      rafId = null; tickCount += 0.016;
      rx = lerp(rx, mx, 0.16); ry = lerp(ry, my, 0.16); gx = lerp(gx, mx, 0.10); gy = lerp(gy, my, 0.10);
      velX *= 0.92; velY *= 0.92; speed *= 0.92;
      const curSpeed = Math.sqrt(velX*velX + velY*velY); const vNorm = Math.min(curSpeed / 22, 1);
      const skewX = velX * 0.08; const skewY = velY * 0.08; const scaleV = 1 + vNorm * 0.22;
      const ringT = `translate3d(${rx}px, ${ry}px, 0) scale(${scaleV}) skew(${skewX*0.06}deg, ${skewY*0.06}deg)`;
      ring.style.transform = ringT; glow.style.transform = `translate3d(${gx}px, ${gy}px, 0) scale(${1 + vNorm*0.42})`;
      glow.style.opacity = String(0.42 + vNorm*0.55);
      if (vNorm < 0.03) { ring.classList.remove('is-moving'); glow.classList.remove('is-moving'); }
      const nx = (mx / window.innerWidth) * 2 - 1; const ny = (my / window.innerHeight) * 2 - 1;
      if (authColumn) { const rotY = nx * 4.2; const rotX = -ny * 3.6; const floatY = Math.sin(tickCount * 0.7) * 3; const floatZ = Math.cos(tickCount * 0.5) * 4; authColumn.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translate3d(0, ${floatY}px, ${floatZ}px)`; authColumn.classList.add('is-3d'); }
      if (brandMark) { const bx = nx * 6; const by = ny * 5; const br = nx * 1.2; const bf = Math.sin(tickCount * 0.9) * 2; brandMark.style.transform = `translate3d(${bx}px, ${by + bf}px, 18px) rotate(${br}deg)`; }
      const float = (s,a) => Math.sin(tickCount * s) * a; const float2 = (s,a) => Math.cos(tickCount * s) * a;
      if (artGreen) { const x = nx * (depth.green * 420); const y = ny * (depth.green * 320) + float(0.9, 5); const r = nx * 0.7 + float2(0.6, 0.3); const z = 14 + float2(0.5, 6); artGreen.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${r}deg)`; }
      if (artPurple) { const x = nx * (depth.purple * 420); const y = ny * (depth.purple * 320) + float(0.7, 6); const r = -nx * 0.6 + float2(0.5, 0.35); const z = 18 + float2(0.4, 7); artPurple.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${r}deg)`; }
      if (artBlue) { const x = nx * (depth.blue * 420); const y = ny * (depth.blue * 320) + float(0.8, 4.5); const r = nx * 0.5 + float2(0.55, 0.25); const z = 10 + float2(0.45, 5); artBlue.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${r}deg)`; }
      if (artOrange) { const x = nx * (depth.orange * 420); const y = ny * (depth.orange * 320) + float(0.65, 5.5); const r = -nx * 0.55 + float2(0.6, 0.28); const z = 16 + float2(0.35, 6); artOrange.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${r}deg)`; const disks = artOrange.querySelectorAll('.orange-disk'); disks.forEach((d,i)=>{ const dm = (i+1)*0.18; d.style.transform = `translate3d(${nx*dm*6}px, ${ny*dm*4}px, ${8+i*6}px)`; }); }
      if (heroCopy) { const hx = nx * (depth.hero * 220); const hy = ny * (depth.hero * 180) + float(0.6, 3); const hr = nx * 0.25; heroCopy.style.transform = `translateY(-52%) translate3d(${hx}px, ${hy}px, 12px) rotateY(${hr}deg)`; }
      rafId = requestAnimationFrame(tick);
    }
    window.addEventListener('mousemove', onMouseMove, {passive:true});
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mouseenter', onMouseEnter);
    rafId = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden && rafId){ cancelAnimationFrame(rafId); rafId=null; } else if(!document.hidden && !rafId) rafId = requestAnimationFrame(tick); });
  }
  if (POINTER_MOTION) {
  const magneticBtns = document.querySelectorAll('.btn-continue, .btn-social');
  magneticBtns.forEach((btn)=>{
    let bounds=null;
    const onMove=(e)=>{
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      bounds = bounds || btn.getBoundingClientRect();
      const cx = bounds.left + bounds.width/2; const cy = bounds.top + bounds.height/2;
      const dx = e.clientX - cx; const dy = e.clientY - cy; const dist = Math.sqrt(dx*dx+dy*dy);
      if(dist < 84){ const rx = (-dy / bounds.height)*7; const ry = (dx / bounds.width)*8; const tx = dx*0.052; const ty = dy*0.062; btn.style.transform = `translate3d(${tx}px, ${ty}px, 12px) rotateX(${rx}deg) rotateY(${ry}deg)`; btn.style.transition = 'transform 0.08s linear'; }
    };
    const onLeave=()=>{ btn.style.transform=''; btn.style.transition='transform 0.42s cubic-bezier(.2,.6,.3,1), box-shadow .22s ease, background .12s ease'; bounds=null; };
    btn.addEventListener('mousemove', onMove); btn.addEventListener('mouseleave', onLeave); window.addEventListener('resize', ()=> bounds=null);
  });
  }
  const emailEl = document.getElementById('email');
  if (POINTER_MOTION && emailEl) {
    emailEl.addEventListener('mousemove', (e)=>{
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return;
      const r = emailEl.getBoundingClientRect(); const dx = (e.clientX - (r.left+r.width/2))/r.width; const dy = (e.clientY - (r.top+r.height/2))/r.height;
      emailEl.style.transform = `translate3d(${dx*6}px, ${dy*4}px, 8px) rotateY(${dx*2}deg) rotateX(${-dy*2}deg)`;
    });
    emailEl.addEventListener('mouseleave', ()=>{ if(document.activeElement===emailEl) return; emailEl.style.transform=''; });
    emailEl.addEventListener('focus', ()=> emailEl.style.transform='translateZ(10px)'); emailEl.addEventListener('blur', ()=> emailEl.style.transform='');
  }
  const intro=()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items=[document.querySelector('.brand-mark'),document.querySelector('.auth-title'),document.querySelector('.auth-subtitle'),document.querySelector('.auth-form'),document.querySelector('.auth-divider'),document.querySelector('.social-row'),document.querySelector('.auth-legal'),document.querySelector('.auth-switch')].filter(Boolean);
    items.forEach((el,i)=>{ el.style.opacity='0'; el.style.transform='translateZ(-18px) translateY(8px)'; el.style.transition=`opacity 0.6s ease ${i*0.06}s, transform 0.6s cubic-bezier(.2,.6,.3,1) ${i*0.06}s`; requestAnimationFrame(()=> setTimeout(()=>{ el.style.opacity='1'; el.style.transform='translateZ(0) translateY(0)'; },30)); });
    const arts=[artGreen,artPurple,artBlue,artOrange,heroCopy].filter(Boolean);
    arts.forEach((el,i)=>{ el.style.opacity='0'; el.style.transition=`opacity 0.9s ease ${0.4+i*0.08}s, transform 0.9s cubic-bezier(.2,.6,.3,1) ${0.4+i*0.08}s`; setTimeout(()=> el.style.opacity='1',80); });
  };
  if(document.readyState==='complete') intro(); else window.addEventListener('load', intro, {once:true});
})();
