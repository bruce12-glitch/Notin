import { test, expect, request as requestFactory } from '@playwright/test';

// WP-SEC-001 — refresh rotation families + replay detection (keyless; auth needs no providers)
function rawRefreshCookie(response){
  for(const h of response.headersArray()){
    if(h.name.toLowerCase() === 'set-cookie'){
      const m = /notin_refresh=([^;]+)/.exec(h.value);
      if(m && m[1]) return m[1];
    }
  }
  return null;
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';
const exactInvalidSession = { error: 'Invalid session' };

test('Refresh rotation families: happy chain, grace sibling, logout nuke, isolation, concurrent burst', async ({ baseURL }) => {
  // §1 — Rotation chain happy path: T1 (signup) → T2 → T3, access token works.
  const ctx1 = await requestFactory.newContext({ baseURL });
  const ctx2 = await requestFactory.newContext({ baseURL });
  const ctx3 = await requestFactory.newContext({ baseURL });
  const main = await requestFactory.newContext({ baseURL }); // §2 long-lived family A
  const clean = () => requestFactory.newContext({ baseURL }); // one-shot presenters (stolen-cookie role)

  try {
    const signup1 = await ctx1.post('/api/users/signup', {
      data: { email: `replay-chain-${runId}@example.test`, password, username: 'Replay Chain' },
    });
    expect(signup1.status()).toBe(201);
    const firstRefresh = await ctx1.post('/api/auth/refresh');
    expect(firstRefresh.status()).toBe(200); // jar rotated T1 → T2
    const secondRefresh = await ctx1.post('/api/auth/refresh');
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
    const t1 = rawRefreshCookie(signupMain);
    expect(t1).toBeTruthy();
    const mainRotate = await main.post('/api/auth/refresh'); // consumes T1 (reason 'rotation')
    expect(mainRotate.status()).toBe(200); // main jar now holds T2
    const attacker = await clean();
    const siblingReuse = await attacker.post('/api/auth/refresh', {
      headers: { Cookie: `notin_refresh=${t1}` },
    });
    expect(siblingReuse.status()).toBe(200); // inside grace → fresh sibling, NOT a nuke
    await attacker.dispose();
    const familyStillAlive = await main.post('/api/auth/refresh'); // T2 still live
    expect(familyStillAlive.status()).toBe(200);

    // §3 — Logout-then-reuse = instant family nuke, generic 401 body (oracle check).
    const signup2 = await ctx2.post('/api/users/signup', {
      data: { email: `replay-logout-${runId}@example.test`, password, username: 'Replay Logout' },
    });
    expect(signup2.status()).toBe(201);
    const rotate2b = await ctx2.post('/api/auth/refresh');
    expect(rotate2b.status()).toBe(200);
    const t2b = rawRefreshCookie(rotate2b);
    expect(t2b).toBeTruthy();
    const { accessToken: access2b } = await rotate2b.json(); // kept for §6 honesty assertion
    const ctx2Logout = await ctx2.post('/api/auth/logout');
    expect(ctx2Logout.status()).toBe(204); // reason 'logout' — NOT sheltered by rotation grace
    const replay2b = await ctx2.post('/api/auth/refresh', {
      headers: { Cookie: `notin_refresh=${t2b}` },
    });
    expect(replay2b.status()).toBe(401);
    await expect(replay2b.json()).resolves.toEqual(exactInvalidSession); // deep-equality oracle check
    const clearedCookieHeader = replay2b.headersArray().some(
      (h) => h.name.toLowerCase() === 'set-cookie' && h.value.includes('notin_refresh=')
    );
    expect(clearedCookieHeader).toBe(true); // header exists; value not asserted

    // §4 — Family isolation: §2's family A untouched by §3's nuke; garbage cookie 401s identically.
    const otherFamilyFine = await main.post('/api/auth/refresh');
    expect(otherFamilyFine.status()).toBe(200);
    const garbageCtx = await clean();
    const garbage = await garbageCtx.post('/api/auth/refresh', {
      headers: { Cookie: 'notin_refresh=totally-garbage-value' },
    });
    expect(garbage.status()).toBe(401);
    await expect(garbage.json()).resolves.toEqual(exactInvalidSession);
    await garbageCtx.dispose();

    // §5 — Concurrent burst: every presenter of the same live cookie gets a sibling.
    const signup3 = await ctx3.post('/api/users/signup', {
      data: { email: `replay-burst-${runId}@example.test`, password, username: 'Replay Burst' },
    });
    expect(signup3.status()).toBe(201);
    const burst = await Promise.all([
      ctx3.post('/api/auth/refresh'),
      ctx3.post('/api/auth/refresh'),
      ctx3.post('/api/auth/refresh'),
    ]);
    for (const response of burst) expect(response.status()).toBe(200); // CAS loser re-reads into grace
    const burstFollowUp = await ctx3.post('/api/auth/refresh');
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
