import { test, expect, request as requestFactory } from '@playwright/test';

// WP-SEC-002 — signed CSRF + trusted-origin enforcement on cookie-carried auth
// mutations (keyless; auth needs no providers). Playwright request contexts
// send no Origin header by default — exactly the non-browser caller the guards
// must keep letting through.
function rawCookie(response, name) {
  const prefix = `${name}=`;
  for (const h of response.headersArray()) {
    if (h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(prefix)) {
      const value = h.value.slice(prefix.length).split(';')[0];
      if (value) return value;
    }
  }
  return null;
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

// Suite isolation: each spec draws from its own /api/auth strict limiter
// bucket (30 / 15 min / IP). The backend sets `trust proxy: 1`, so a
// single-entry X-Forwarded-For is exactly what one client IP looks like behind
// the production proxy hop — same pattern as ai-chat-stream-smoke.spec.js and
// auth-lockout.spec.js. No production behavior is relaxed.
function pseudoIp(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 200) + 10}`; // TEST-NET-3, never routed
}
const specIp = pseudoIp(`csrf-${runId}`);

test('Origin guard + signed double-submit CSRF on refresh/logout', async ({ baseURL }) => {
  const ctx = await requestFactory.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': specIp } });
  const cookieless = await requestFactory.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': specIp } });

  try {
    const signup = await ctx.post('/api/users/signup', {
      data: { email: `csrf-owner-${runId}@example.test`, password, username: 'Csrf Owner' },
    });
    expect(signup.status()).toBe(201);
    let csrf = rawCookie(signup, 'notin_csrf');
    expect(csrf).toBeTruthy();

    // a. Bad origin → exact 403; then no Origin → 200 (session unharmed).
    const evilOrigin = await ctx.post('/api/auth/refresh', {
      headers: { Origin: 'https://evil.example', 'x-notin-csrf': csrf },
    });
    expect(evilOrigin.status()).toBe(403);
    await expect(evilOrigin.json()).resolves.toEqual({ error: 'Invalid origin' });
    const afterEvil = await ctx.post('/api/auth/refresh', {
      headers: { 'x-notin-csrf': csrf },
    });
    expect(afterEvil.status()).toBe(200);
    csrf = rawCookie(afterEvil, 'notin_csrf') || csrf;

    // b. Dev origin (allowlisted default) → 200.
    const devOrigin = await ctx.post('/api/auth/refresh', {
      headers: { Origin: 'http://localhost:4173', 'x-notin-csrf': csrf },
    });
    expect(devOrigin.status()).toBe(200);
    csrf = rawCookie(devOrigin, 'notin_csrf') || csrf;

    // c. Missing CSRF header (cookie present) → exact 403.
    const missingCsrf = await ctx.post('/api/auth/refresh');
    expect(missingCsrf.status()).toBe(403);
    await expect(missingCsrf.json()).resolves.toEqual({ error: 'Invalid CSRF token' });

    // d. Header ≠ cookie (mismatch) → 403.
    const mismatch = await ctx.post('/api/auth/refresh', {
      headers: { 'x-notin-csrf': `${csrf}x` },
    });
    expect(mismatch.status()).toBe(403);
    await expect(mismatch.json()).resolves.toEqual({ error: 'Invalid CSRF token' });

    // e. Forged but equal: cookie and header both 'aaa.bbb' (equal, unsigned).
    // Carry the real refresh token manually so the guard actually engages.
    const realRefresh = rawCookie(devOrigin, 'notin_refresh');
    expect(realRefresh).toBeTruthy();
    const forged = await ctx.post('/api/auth/refresh', {
      headers: {
        Cookie: `notin_refresh=${realRefresh}; notin_csrf=aaa.bbb`,
        'x-notin-csrf': 'aaa.bbb',
      },
    });
    expect(forged.status()).toBe(403);
    await expect(forged.json()).resolves.toEqual({ error: 'Invalid CSRF token' });

    // f. Genuine rotation of BOTH cookies: verbatim pair → 200 + NEW notin_csrf.
    const genuine = await ctx.post('/api/auth/refresh', {
      headers: { 'x-notin-csrf': csrf },
    });
    expect(genuine.status()).toBe(200);
    const newCsrf = rawCookie(genuine, 'notin_csrf');
    expect(newCsrf).toBeTruthy();
    expect(newCsrf).not.toBe(csrf); // rotated with the refresh token
    const reRefresh = await ctx.post('/api/auth/refresh', {
      headers: { 'x-notin-csrf': newCsrf },
    });
    expect(reRefresh.status()).toBe(200);
    csrf = rawCookie(reRefresh, 'notin_csrf') || newCsrf;

    // g. Logout matrix: no header → 403; valid pair → 204.
    const logoutNoCsrf = await ctx.post('/api/auth/logout');
    expect(logoutNoCsrf.status()).toBe(403);
    await expect(logoutNoCsrf.json()).resolves.toEqual({ error: 'Invalid CSRF token' });
    const logoutOk = await ctx.post('/api/auth/logout', {
      headers: { 'x-notin-csrf': csrf },
    });
    expect(logoutOk.status()).toBe(204);

    // h. No-cookie refresh (no Origin, no CSRF) → the WP-SEC-001 contract
    // exactly: guards sit BEHIND the session path.
    const noCookie = await cookieless.post('/api/auth/refresh');
    expect(noCookie.status()).toBe(401);
    await expect(noCookie.json()).resolves.toEqual({ error: 'Invalid session' });
  } finally {
    await ctx.dispose();
    await cookieless.dispose();
  }
});
