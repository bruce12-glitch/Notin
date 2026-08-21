import { test, expect, request as requestFactory } from '@playwright/test';

// WP-SEC-001 — refresh rotation families + replay detection (keyless; auth needs no providers)
// WP-SEC-002 — every cookie-carrying call now also echoes the signed
// double-submit cookie in the x-notin-csrf header (guards sit before the
// controller). Asserted SEC-001 semantics are unchanged.
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
const exactInvalidSession = { error: 'Invalid session' };

// Suite isolation: this spec draws from its own /api/auth strict limiter
// bucket (30 / 15 min / IP) so the whole directory can run in one server
// process. The backend sets `trust proxy: 1`, so a single-entry
// X-Forwarded-For is exactly what one client IP looks like behind the
// production proxy hop — same pattern as ai-chat-stream-smoke.spec.js and
// auth-lockout.spec.js. No production behavior is relaxed.
function pseudoIp(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 200) + 10}`; // TEST-NET-3, never routed
}
const specIp = pseudoIp(`replay-${runId}`);
const client = (baseURL, options = {}) => requestFactory.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': specIp }, ...options });

test('Refresh rotation families: happy chain, grace sibling, logout nuke, isolation, concurrent burst', async ({ baseURL }) => {
  // §1 — Rotation chain happy path: T1 (signup) → T2 → T3, access token works.
  const ctx1 = await client(baseURL);
  const ctx2 = await client(baseURL);
  const ctx3 = await client(baseURL);
  const main = await client(baseURL); // §2 long-lived family A
  const clean = () => client(baseURL); // one-shot presenters (stolen-cookie role)

  try {
    const signup1 = await ctx1.post('/api/users/signup', {
      data: { email: `replay-chain-${runId}@example.test`, password, username: 'Replay Chain' },
    });
    expect(signup1.status()).toBe(201);
    let csrf1 = rawCookie(signup1, 'notin_csrf');
    expect(csrf1).toBeTruthy();
    const firstRefresh = await ctx1.post('/api/auth/refresh', { headers: { 'x-notin-csrf': csrf1 } });
    expect(firstRefresh.status()).toBe(200); // jar rotated T1 → T2
    csrf1 = rawCookie(firstRefresh, 'notin_csrf') || csrf1;
    const secondRefresh = await ctx1.post('/api/auth/refresh', { headers: { 'x-notin-csrf': csrf1 } });
    expect(secondRefresh.status()).toBe(200); // jar rotated T2 → T3
    const { accessToken: chainAccess } = await secondRefresh.json();
    const notesWithChainAccess = await ctx1.get('/api/notes', {
      headers: { Authorization: `Bearer ${chainAccess}` },
    });
    expect(notesWithChainAccess.status()).toBe(200);

    // §2 — Sequential reuse inside the 10 s rotation grace = sibling, family survives.
    const signupMain = await main.post('/api/users/signup', {
      data: { email: `replay-main-${runId}@example.test`, password, username: 'Replay Main' },
    });
    expect(signupMain.status()).toBe(201);
    const t1 = rawCookie(signupMain, 'notin_refresh');
    const t1Csrf = rawCookie(signupMain, 'notin_csrf');
    expect(t1).toBeTruthy();
    expect(t1Csrf).toBeTruthy();
    const mainRotate = await main.post('/api/auth/refresh', { headers: { 'x-notin-csrf': t1Csrf } }); // consumes T1 (reason 'rotation')
    expect(mainRotate.status()).toBe(200); // main jar now holds T2
    let mainCsrf = rawCookie(mainRotate, 'notin_csrf') || t1Csrf;
    const attacker = await clean();
    const siblingReuse = await attacker.post('/api/auth/refresh', {
      headers: { Cookie: `notin_refresh=${t1}; notin_csrf=${t1Csrf}`, 'x-notin-csrf': t1Csrf },
    });
    expect(siblingReuse.status()).toBe(200); // inside grace → fresh sibling, NOT a nuke
    await attacker.dispose();
    const familyStillAlive = await main.post('/api/auth/refresh', { headers: { 'x-notin-csrf': mainCsrf } }); // T2 still live
    expect(familyStillAlive.status()).toBe(200);
    mainCsrf = rawCookie(familyStillAlive, 'notin_csrf') || mainCsrf;

    // §3 — Logout-then-reuse = instant family nuke, generic 401 body (oracle check).
    // WP-SEC-002 hardening: this 401 is now reachable ONLY with a valid,
    // signed CSRF pair — the replay itself is what kills the family.
    const signup2 = await ctx2.post('/api/users/signup', {
      data: { email: `replay-logout-${runId}@example.test`, password, username: 'Replay Logout' },
    });
    expect(signup2.status()).toBe(201);
    const signup2Csrf = rawCookie(signup2, 'notin_csrf');
    expect(signup2Csrf).toBeTruthy();
    const rotate2b = await ctx2.post('/api/auth/refresh', { headers: { 'x-notin-csrf': signup2Csrf } });
    expect(rotate2b.status()).toBe(200);
    const t2b = rawCookie(rotate2b, 'notin_refresh');
    const t2bCsrf = rawCookie(rotate2b, 'notin_csrf');
    expect(t2b).toBeTruthy();
    const { accessToken: access2b } = await rotate2b.json(); // kept for §6 honesty assertion
    const ctx2Logout = await ctx2.post('/api/auth/logout', { headers: { 'x-notin-csrf': t2bCsrf } });
    expect(ctx2Logout.status()).toBe(204); // reason 'logout' — NOT sheltered by rotation grace
    const replay2b = await ctx2.post('/api/auth/refresh', {
      headers: { Cookie: `notin_refresh=${t2b}; notin_csrf=${t2bCsrf}`, 'x-notin-csrf': t2bCsrf },
    });
    expect(replay2b.status()).toBe(401);
    await expect(replay2b.json()).resolves.toEqual(exactInvalidSession); // deep-equality oracle check
    const clearedCookieHeader = replay2b.headersArray().some(
      (h) => h.name.toLowerCase() === 'set-cookie' && h.value.includes('notin_refresh=')
    );
    expect(clearedCookieHeader).toBe(true); // header exists; value not asserted

    // §4 — Family isolation: §2's family A untouched by §3's nuke; garbage cookie 401s identically.
    const otherFamilyFine = await main.post('/api/auth/refresh', { headers: { 'x-notin-csrf': mainCsrf } });
    expect(otherFamilyFine.status()).toBe(200);
    mainCsrf = rawCookie(otherFamilyFine, 'notin_csrf') || mainCsrf;
    const garbageCtx = await clean();
    // Any signature-valid csrf satisfies the double-submit guard (it is not
    // session-bound); the garbage refresh token then 401s in the controller.
    const garbage = await garbageCtx.post('/api/auth/refresh', {
      headers: { Cookie: `notin_refresh=totally-garbage-value; notin_csrf=${mainCsrf}`, 'x-notin-csrf': mainCsrf },
    });
    expect(garbage.status()).toBe(401);
    await expect(garbage.json()).resolves.toEqual(exactInvalidSession);
    await garbageCtx.dispose();

    // §5 — Concurrent burst: every presenter of the same live cookie gets a sibling.
    const signup3 = await ctx3.post('/api/users/signup', {
      data: { email: `replay-burst-${runId}@example.test`, password, username: 'Replay Burst' },
    });
    expect(signup3.status()).toBe(201);
    const burstCsrf = rawCookie(signup3, 'notin_csrf');
    expect(burstCsrf).toBeTruthy();
    const burst = await Promise.all([
      ctx3.post('/api/auth/refresh', { headers: { 'x-notin-csrf': burstCsrf } }),
      ctx3.post('/api/auth/refresh', { headers: { 'x-notin-csrf': burstCsrf } }),
      ctx3.post('/api/auth/refresh', { headers: { 'x-notin-csrf': burstCsrf } }),
    ]);
    for (const response of burst) expect(response.status()).toBe(200); // CAS loser re-reads into grace
    // Each 200 minted a self-consistent (refresh, csrf) pair; use burst[0]'s
    // pair explicitly so the follow-up is deterministic regardless of which
    // concurrent response the cookie jar processed last.
    const b0Refresh = rawCookie(burst[0], 'notin_refresh');
    const b0Csrf = rawCookie(burst[0], 'notin_csrf');
    expect(b0Refresh).toBeTruthy();
    expect(b0Csrf).toBeTruthy();
    const burstFollowUp = await ctx3.post('/api/auth/refresh', {
      headers: { Cookie: `notin_refresh=${b0Refresh}; notin_csrf=${b0Csrf}`, 'x-notin-csrf': b0Csrf },
    });
    expect(burstFollowUp.status()).toBe(200);

    // §6 — Honesty assertion (design ceiling): the stateless access token minted
    // alongside T2b still authorizes API reads after its family was nuked —
    // access tokens live out their ~15 min regardless of refresh revocation.
    // Closing THIS is salvage item #4 (token-version invalidation), a future
    // WP — deliberately out of scope here.
    const honesty = await ctx3.get('/api/notes', {
      headers: { Authorization: `Bearer ${access2b}` },
    });
    expect(honesty.status()).toBe(200);
  } finally {
    await ctx1.dispose();
    await ctx2.dispose();
    await ctx3.dispose();
    await main.dispose();
  }
});
