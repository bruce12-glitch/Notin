// WP-SEC-006 — shared password strength evaluation (backend + frontend mirror)
// Used by validation.js and optional strength endpoint

const COMMON_PASSWORDS = new Set([
  'password','123456','123456789','qwerty','abc123','password1','12345678','111111',
  '123123','1234567','qwerty123','000000','1q2w3e','aa12345678','abc123456','password123',
  '1234','12345','dragon','iloveyou','monkey','letmein','trustno1','admin','welcome',
  'login','princess','solo','starwars','1234567890','qwertyuiop','superman','654321',
  'jesus','password12','master','hello','charlie','aa123456','donald','qwerty12345',
  'notinsuper','notin123','notin2024','changeme','test123','test1234','test12345'
]);

export function evaluatePasswordStrength(pwd, email = '', username = '') {
  if (!pwd) return { score: 0, label: '', color: '#e5e5e5', issues: ['empty'], valid: false };
  const issues = [];
  const lower = String(pwd).toLowerCase();
  const emailLocal = String(email || '').split('@')[0].toLowerCase();
  const uname = String(username || '').toLowerCase();

  if (pwd.length < 8) issues.push('at least 8 characters');
  if (Buffer.byteLength(pwd, 'utf8') > 72) issues.push('72 bytes or fewer');

  const categories = [/[a-z]/.test(pwd), /[A-Z]/.test(pwd), /[0-9]/.test(pwd), /[^A-Za-z0-9]/.test(pwd)].filter(Boolean).length;
  if (categories < 3) issues.push('3 of: lower, upper, number, symbol');

  if (COMMON_PASSWORDS.has(lower)) issues.push('too common');
  if (/(.)\1\1/.test(pwd)) issues.push('no 3 repeating chars');
  if (emailLocal && emailLocal.length >= 3 && lower.includes(emailLocal)) issues.push('must not contain email');
  if (uname && uname.length >= 3 && lower.includes(uname)) issues.push('must not contain username');

  for (let i = 0; i < lower.length - 3; i++) {
    const a = lower.charCodeAt(i), b = lower.charCodeAt(i+1), c = lower.charCodeAt(i+2), d = lower.charCodeAt(i+3);
    if (b === a+1 && c === b+1 && d === c+1) { issues.push('no sequential like abcd/1234'); break; }
    if (b === a-1 && c === b-1 && d === c-1) { issues.push('no sequential like dcba/4321'); break; }
  }

  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (categories >= 3) score++;
  if (categories === 4) score++;
  if (!issues.length && pwd.length >= 12) score++;
  if (issues.length) score = Math.min(score, 2);

  let label = '', color = '';
  if (score <= 1) { label = 'Weak'; color = '#E53E3E'; }
  else if (score === 2) { label = 'Fair'; color = '#DD6B20'; }
  else if (score === 3) { label = 'Good'; color = '#D69E2E'; }
  else if (score >= 4) { label = 'Strong'; color = '#00A82D'; }

  return { score, label, color, issues, valid: issues.length === 0, categories };
}

export function isCommonPassword(pwd) {
  return COMMON_PASSWORDS.has(String(pwd).toLowerCase());
}

export default evaluatePasswordStrength;
