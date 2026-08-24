import { test, expect, request as requestFactory } from '@playwright/test';

// WP-CLEANUP-001 — cleanup job smoke: expired OTP and revoked refresh tokens removal
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

function pseudoIp(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 200) + 10}`;
}
const specIp = pseudoIp(`cleanup-${runId}`);

test('Cleanup endpoint removes expired tokens and returns counts', async ({ baseURL }) => {
  const ctx = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Forwarded-For': specIp },
  });

  try {
    const email = `cleanup-${runId}@example.test`;
    const signup = await ctx.post('/api/users/signup', {
      data: { email, password, username: 'Cleanup Owner' },
    });
    expect(signup.status()).toBe(201);
    const token = (await signup.json()).accessToken;
    expect(token).toBeTruthy();

    // Create some sessions then revoke to have revoked tokens
    const ctx2 = await requestFactory.newContext({
      baseURL,
      extraHTTPHeaders: { 'X-Forwarded-For': pseudoIp(`cleanup2-${runId}`) },
    });
    const signin = await ctx2.post('/api/users/signin', { data: { email, password } });
    expect(signin.status()).toBe(200);
    const token2 = (await signin.json()).accessToken;

    // Revoke second session to create revoked entry
    let list = await ctx.get('/api/auth/sessions', { headers: { Authorization: `Bearer ${token}` } });
    let listBody = await list.json();
    const secondFamily = listBody.sessions.find(s => s.familyId !== listBody.sessions.find(x => x.isCurrent).familyId)?.familyId;
    if (secondFamily) {
      const revoke = await ctx.delete(`/api/auth/sessions/${secondFamily}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(revoke.status()).toBe(200);
    }

    // Call cleanup endpoint (should succeed, may clean 0 if nothing expired yet)
    const cleanup = await ctx.post('/api/auth/cleanup', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cleanup.status()).toBe(200);
    const cleanupBody = await cleanup.json();
    expect(cleanupBody.ok).toBe(true);
    expect(cleanupBody.cleaned).toBeTruthy();
    expect(typeof cleanupBody.cleaned.otpChallenges).toBe('number');
    expect(typeof cleanupBody.cleaned.refreshTokens).toBe('number');

    await ctx2.dispose();
  } finally {
    await ctx.dispose();
  }
});

test('Password strength endpoint returns score and issues', async ({ baseURL }) => {
  const ctx = await requestFactory.newContext({ baseURL });
  try {
    const weak = await ctx.post('/api/auth/password-strength', {
      data: { password: 'password', email: 'test@example.com' },
    });
    expect(weak.status()).toBe(200);
    const weakBody = await weak.json();
    expect(weakBody.valid).toBe(false);
    expect(weakBody.issues.length).toBeGreaterThan(0);
    expect(weakBody.score).toBeLessThanOrEqual(2);

    const strong = await ctx.post('/api/auth/password-strength', {
      data: { password: 'StrongPass-123!', email: 'test@example.com', username: 'tester' },
    });
    expect(strong.status()).toBe(200);
    const strongBody = await strong.json();
    expect(strongBody.valid).toBe(true);
    expect(strongBody.score).toBeGreaterThanOrEqual(3);
    expect(strongBody.label).toBeTruthy();
  } finally {
    await ctx.dispose();
  }
});
