// auth-client.js — shared for index.html / login.html / app.html
// ONE origin (backend :5000 doubles as static+API). window.NOTIN_API can override.
const API_BASE = (window.NOTIN_API || '').replace(/\/$/, '') || '';

let _memToken = null;
let _memEmail = null;

export function setAccessToken(token, email) {
  _memToken = token || null;
  if (email) _memEmail = email;
}
export function getAccessToken() { return _memToken; }
export function getMemEmail() { return _memEmail; }
export function clearAuthMemory() { _memToken = null; _memEmail = null; }

// helper to build URL — prefers /api/auth but legacy /auth also mounted
export function apiUrl(path) {
  if (!path.startsWith('/')) path = '/' + path;
  // allow caller to pass "/api/auth/..." or "/auth/..."
  return API_BASE + path;
}

export async function api(path, { method = 'GET', body, auth = false } = {}) {
  const url = apiUrl(path);
  const headers = { 'Content-Type': 'application/json' };
  if (auth && _memToken) headers['Authorization'] = `Bearer ${_memToken}`;
  const opts = {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(url, opts);
  return res;
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [a, d] = email.split('@');
  if (a.length <= 1) return `* @${d}`.replace(' ', '');
  if (a.length === 2) return `${a[0]}* @${d}`.replace(' ', '');
  return `${a[0]}${'*'.repeat(Math.max(1, a.length - 2))}${a[a.length - 1]} @${d}`.replace(' ', '').replace(' @', '@');
}

// sessionStorage ONLY for email display (token stays memory)
export function persistEmailForApp(email) {
  try { sessionStorage.setItem('notin_email', email); } catch {}
  // also set via query fallback is handled by redirect helper
}
export function getPersistedEmail() {
  try { return sessionStorage.getItem('notin_email'); } catch { return null; }
}
export function clearPersistedEmail(){ try{ sessionStorage.removeItem('notin_email'); }catch{} }

// redirect helper — pass email via sessionStorage + query fallback
export function redirectToApp(email) {
  if (email) persistEmailForApp(email);
  // Use same-origin app.html (served by backend static)
  const url = API_BASE ? `${API_BASE}/app.html` : '/app.html';
  // Add email query once then app.html will strip it
  const target = email ? `${url}?email=${encodeURIComponent(email)}` : url;
  window.location.href = target;
}
