import { test, expect, request as requestFactory } from '@playwright/test';

// WP-SEC-005 — device inventory smoke: list active families, UA/IP capture, revoke
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

function pseudoIp(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 200) + 10}`;
}
const specIp = pseudoIp(`sessions-${runId}`);
const specIp2 = pseudoIp(`sessions2-${runId}`);

test('Device inventory: list, UA/IP capture, revoke single and revoke-others', async ({ baseURL }) => {
  const ctx = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Forwarded-For': specIp, 'User-Agent': 'Playwright-Session-Test/1.0' },
  });
  const ctx2 = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Forwarded-For': specIp2, 'User-Agent': 'Playwright-Session-Test/2.0' },
  });

  try {
    const email = `sessions-${runId}@example.test`;
    // Signup -> creates family with UA/IP
    const signup = await ctx.post('/api/users/signup', {
      data: { email, password, username: 'Session Owner' },
    });
    expect(signup.status()).toBe(201);
    const signupBody = await signup.json();
    const token = signupBody.accessToken;
    expect(token).toBeTruthy();

    // List sessions via Bearer + cookie -> 1 session, isCurrent true, UA/IP present
    let list = await ctx.get('/api/auth/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status()).toBe(200);
    let listBody = await list.json();
    expect(Array.isArray(listBody.sessions)).toBeTruthy();
    expect(listBody.sessions.length).toBe(1);
    const first = listBody.sessions[0];
    expect(first.familyId).toBeTruthy();
    expect(first.userAgent).toContain('Playwright-Session-Test/1.0');
    expect(first.ipAddress).toBeTruthy();
    expect(first.isCurrent).toBe(true);

    // Second session via signin from different IP/UA
    const signin = await ctx2.post('/api/users/signin', {
      data: { email, password },
    });
    expect(signin.status()).toBe(200);
    const signinBody = await signin.json();
    const token2 = signinBody.accessToken;
    expect(token2).toBeTruthy();

    // ctx2 list -> should see 2 sessions, one current (its own)
    list = await ctx2.get('/api/auth/sessions', {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(list.status()).toBe(200);
    listBody = await list.json();
    expect(listBody.sessions.length).toBe(2);
    const families = listBody.sessions.map(s => s.familyId);
    expect(new Set(families).size).toBe(2);
    const currentForCtx2 = listBody.sessions.find(s => s.isCurrent);
    expect(currentForCtx2).toBeTruthy();
    expect(currentForCtx2.userAgent).toContain('2.0');

    // ctx (first device) still sees 2, but its current is first
    list = await ctx.get('/api/auth/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    listBody = await list.json();
    expect(listBody.sessions.length).toBe(2);
    const currentForCtx = listBody.sessions.find(s => s.isCurrent);
    expect(currentForCtx.familyId).toBe(first.familyId);

    // Revoke second family from first device
    const secondFamily = listBody.sessions.find(s => s.familyId !== first.familyId).familyId;
    const revoke = await ctx.delete(`/api/auth/sessions/${secondFamily}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revoke.status()).toBe(200);
    const revokeBody = await revoke.json();
    expect(revokeBody.ok).toBe(true);

    // Now only 1 active
    list = await ctx.get('/api/auth/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    listBody = await list.json();
    expect(listBody.sessions.length).toBe(1);
    expect(listBody.sessions[0].familyId).toBe(first.familyId);

    // Create third session to test revoke-others
    const ctx3 = await requestFactory.newContext({
      baseURL,
      extraHTTPHeaders: { 'X-Forwarded-For': pseudoIp(`sessions3-${runId}`), 'User-Agent': 'Playwright-Session-Test/3.0' },
    });
    const signin3 = await ctx3.post('/api/users/signin', { data: { email, password } });
    expect(signin3.status()).toBe(200);
    const token3 = (await signin3.json()).accessToken;

    // Now 2 sessions again
    list = await ctx.get('/api/auth/sessions', { headers: { Authorization: `Bearer ${token}` } });
    listBody = await list.json();
    expect(listBody.sessions.length).toBe(2);

    // Revoke others from ctx (should keep first, revoke third)
    const revokeOthers = await ctx.post('/api/auth/sessions/revoke-others', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revokeOthers.status()).toBe(200);
    const othersBody = await revokeOthers.json();
    expect(othersBody.ok).toBe(true);
    expect(othersBody.revokedCount).toBe(1);

    list = await ctx.get('/api/auth/sessions', { headers: { Authorization: `Bearer ${token}` } });
    listBody = await list.json();
    expect(listBody.sessions.length).toBe(1);
    expect(listBody.sessions[0].familyId).toBe(first.familyId);

    await ctx3.dispose();

    // Usage endpoint should reflect sessions count
    const usage = await ctx.get('/api/users/me/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(usage.status()).toBe(200);
    const usageBody = await usage.json();
    expect(usageBody.sessions.count).toBe(1);
    expect(usageBody.notes.quota).toBeTruthy();

    // 404 on unknown family
    const notFound = await ctx.delete('/api/auth/sessions/doesnotexist123', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(notFound.status()).toBe(404);
  } finally {
    await ctx.dispose();
    await ctx2.dispose();
  }
});
