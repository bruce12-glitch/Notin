import { test, expect, request as requestFactory } from '@playwright/test';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// WP-BILLING-001 — billing contract smoke.
//
// Two layers:
//   A) Against the SHARED dev server (billing unconfigured): the config-gated
//      honesty contract — free plan defaults, 503s on checkout/portal, 401s
//      without auth, 400 validation, 503 webhook without a secret,
//      providers.billing=false.
//   B) Against a SELF-HOSTED instance (own SQLite file + mock Stripe REST API
//      on 127.0.0.1): the full money path — checkout session creation, a
//      properly SIGNED webhook flipping the plan, idempotent replays,
//      signature tampering rejection, portal session, past_due downgraded
//      entitlements, and cancel returning the user to free. Zero real Stripe
//      keys, zero network egress: STRIPE_API_BASE points at the local mock.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

function pseudoIp(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 200) + 10}`;
}

async function signup(context, baseURL, seed) {
  const email = `billing-smoke-${runId}-${seed}@example.com`;
  const username = `bs${runId.replace(/[^a-z0-9]/gi, '')}${seed}`.slice(0, 30);
  const res = await context.post(`${baseURL}/api/auth/signup`, {
    data: { username, email, password },
    headers: { 'X-Forwarded-For': pseudoIp(`${email}`) },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.accessToken).toBeTruthy();
  return { token: body.accessToken, email, userId: body.user?.id || body.userId || null };
}

// ── Part A — shared server, billing unconfigured ─────────────────────────────

test.describe('billing unconfigured (shared dev server)', () => {
  test('status requires auth; free defaults + configured:false when signed in', async ({ request }) => {
    const r0 = await request.get('/api/billing');
    expect(r0.status()).toBe(401);

    const signupRes = await request.post('/api/auth/signup', {
      data: {
        username: `bsA${runId.replace(/[^a-z0-9]/gi, '')}`.slice(0, 30),
        email: `billing-a-${runId}@example.com`,
        password,
      },
      headers: { 'X-Forwarded-For': pseudoIp(`billing-a-${runId}`) },
    });
    expect(signupRes.status()).toBe(201);
    const { accessToken } = await signupRes.json();

    const res = await request.get('/api/billing', { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      configured: false,
      plan: 'free',
      status: null,
      renewsAt: null,
    });
    expect(body.entitlements).toMatchObject({
      maxNotes: 5000,
      storageQuota: 262144000,
      aiChatPer15Min: 5,
      aiAssistPer15Min: 5,
    });
  });

  test('checkout/portal are 503 without config; checkout body is validated', async ({ request }) => {
    const signupRes = await request.post('/api/auth/signup', {
      data: {
        username: `bsB${runId.replace(/[^a-z0-9]/gi, '')}`.slice(0, 30),
        email: `billing-b-${runId}@example.com`,
        password,
      },
      headers: { 'X-Forwarded-For': pseudoIp(`billing-b-${runId}`) },
    });
    const { accessToken } = await signupRes.json();
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    const co = await request.post('/api/billing/checkout', { headers: auth, data: { plan: 'pro' } });
    expect(co.status()).toBe(503);
    expect((await co.json()).message).toBe('Billing is not configured on this deployment');

    const bad = await request.post('/api/billing/checkout', { headers: auth, data: { plan: 'enterprise' } });
    expect(bad.status()).toBe(400);
    const badBody = await bad.json();
    expect(badBody.code).toBe('VALIDATION_ERROR');
    expect(badBody.details[0].field).toBe('plan');

    const po = await request.post('/api/billing/portal', { headers: auth, data: {} });
    expect(po.status()).toBe(503);
  });

  test('webhook is 503 without a secret and providers reports billing:false', async ({ request }) => {
    const wh = await request.post('/api/billing/webhook', { data: { id: 'evt_x', type: 'checkout.session.completed', data: { object: {} } } });
    expect(wh.status()).toBe(503);

    const prov = await request.get('/api/auth/providers');
    expect(prov.status()).toBe(200);
    const provBody = await prov.json();
    expect(provBody.billing).toBe(false);
  });

  test('usage endpoint exposes the plan block with free quotas', async ({ request }) => {
    const signupRes = await request.post('/api/auth/signup', {
      data: {
        username: `bsC${runId.replace(/[^a-z0-9]/gi, '')}`.slice(0, 30),
        email: `billing-c-${runId}@example.com`,
        password,
      },
      headers: { 'X-Forwarded-For': pseudoIp(`billing-c-${runId}`) },
    });
    const { accessToken } = await signupRes.json();
    const res = await request.get('/api/users/me/usage', { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan).toMatchObject({ id: 'free', status: null, renewsAt: null });
    expect(body.attachments.storageQuota).toBe(262144000);
  });
});

// ── Part B — self-hosted instance with billing configured + mock Stripe ──────

const MOCK = {
  server: null,
  port: 0,
  requests: [], // { path, body (object), raw }
  urls: {
    checkout: 'https://checkout.stripe.com/c/pay/test-session-billing-smoke',
    portal: 'https://billing.stripe.com/p/session/test-portal-billing-smoke',
  },
};

const SERVER = { child: null, port: 5231, tmpDir: null };

const WHSEC = 'whsec_test_billing_smoke';

function stripeSign(payload, secret, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${payload}`, 'utf8').digest('hex');
  return `t=${timestampSeconds},v1=${sig}`;
}

function mockCustomerFor(userId) {
  const call = MOCK.requests
    .filter((r) => r.path === '/v1/customers' && r.body['metadata[userId]'] === userId)
    .at(-1);
  if (!call) throw new Error(`no mock customer created for ${userId}`);
  return call.body ? `cus_test_${crypto.createHash('sha1').update(call.body.email || `anon-${userId}`).digest('hex').slice(0, 12)}` : null;
}

function checkoutCompletedEvent(userId) {
  return {
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${crypto.randomBytes(8).toString('hex')}`,
        object: 'checkout.session',
        status: 'complete',
        customer: mockCustomerFor(userId),
        subscription: 'sub_test_billing_smoke',
        client_reference_id: userId,
        metadata: { userId },
      },
    },
  };
}

function subscriptionEvent(type, userId, status, extra = {}) {
  return {
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    type,
    data: {
      object: {
        id: 'sub_test_billing_smoke',
        object: 'subscription',
        customer: mockCustomerFor(userId),
        status,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        metadata: { userId },
        ...extra,
      },
    },
  };
}

async function postWebhook(request, event, { signature } = {}) {
  const payload = JSON.stringify(event);
  return request.post('/api/billing/webhook', {
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature === undefined ? stripeSign(payload, WHSEC) : signature,
    },
    data: payload,
  });
}

test.describe('billing configured (self-hosted + mock Stripe)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    SERVER.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `notin-billing-${runId}-`));

    // 1) Mock Stripe REST API on an ephemeral loopback port. Customer ids are
    // deterministic per email (like real Stripe's globally-unique ids) so the
    // unique index on User."stripeCustomerId" is never spuriously violated.
    MOCK.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        let parsed = {};
        try { parsed = Object.fromEntries(new URLSearchParams(raw)); } catch { /* ignore */ }
        MOCK.requests.push({ path: req.url, body: parsed });
        const sendJson = (code, obj) => {
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        };
        if (req.url === '/v1/customers') {
          const email = parsed.email || `anon-${parsed['metadata[userId]'] || 'unknown'}`;
          const id = `cus_test_${crypto.createHash('sha1').update(email).digest('hex').slice(0, 12)}`;
          return sendJson(200, { id, object: 'customer', email: parsed.email || null });
        }
        if (req.url === '/v1/checkout/sessions') return sendJson(200, { id: 'cs_test_billing_smoke', object: 'checkout.session', url: MOCK.urls.checkout });
        if (req.url === '/v1/billing_portal/sessions') return sendJson(200, { id: 'bps_test_billing_smoke', object: 'billing_portal.session', url: MOCK.urls.portal });
        return sendJson(404, { error: { message: `Unknown mock endpoint ${req.url}` } });
      });
    });
    await new Promise((resolve) => MOCK.server.listen(0, '127.0.0.1', resolve));
    MOCK.port = MOCK.server.address().port;

    // 2) Apply migrations to the throwaway SQLite DB, then boot the server.
    const sharedEnv = {
      ...process.env,
      PORT: String(SERVER.port),
      SQLITE_PATH: path.join(SERVER.tmpDir, 'billing.sqlite'),
      UPLOAD_DIR: path.join(SERVER.tmpDir, 'uploads'),
      STRIPE_SECRET_KEY: 'sk_test_billing_smoke',
      STRIPE_PRICE_PRO_MONTHLY: 'price_test_billing_smoke',
      STRIPE_WEBHOOK_SECRET: WHSEC,
      STRIPE_API_BASE: `http://127.0.0.1:${MOCK.port}`,
      NODE_ENV: 'development',
    };
    await new Promise((resolve, reject) => {
      const mig = spawn('node', ['src/db/migrate.js'], { cwd: backendRoot, env: sharedEnv, stdio: 'ignore' });
      mig.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`migrate exited ${code}`))));
      mig.on('error', reject);
    });
    await new Promise((resolve, reject) => {
      SERVER.child = spawn('node', ['src/server.js'], { cwd: backendRoot, env: sharedEnv, stdio: 'ignore' });
      SERVER.child.on('error', reject);
      // resolve when health is ready; reject if the child dies first
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${SERVER.port}/health`);
          if (res.ok) { clearInterval(poll); resolve(); }
        } catch { /* not up yet */ }
      }, 300);
      setTimeout(() => { clearInterval(poll); reject(new Error('self-hosted billing server did not become healthy')); }, 45_000);
      SERVER.child.on('exit', (code) => { clearInterval(poll); reject(new Error(`billing server exited early (${code})`)); });
    });
  });

  test.afterAll(async () => {
    if (SERVER.child) { try { SERVER.child.kill('SIGTERM'); } catch {} }
    if (MOCK.server) { try { await new Promise((r) => MOCK.server.close(r)); } catch {} }
    if (SERVER.tmpDir) { try { fs.rmSync(SERVER.tmpDir, { recursive: true, force: true }); } catch {} }
  });

  function selfContext() {
    return requestFactory.newContext({ baseURL: `http://127.0.0.1:${SERVER.port}` });
  }

  test('checkout returns a provider URL; the webhook — not the redirect — grants Pro', async () => {
    const ctx = await selfContext();
    const { token, userId } = await signup(ctx, `http://127.0.0.1:${SERVER.port}`, 1);

    const status0 = await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } });
    expect(status0.status()).toBe(200);
    const s0 = await status0.json();
    expect(s0.configured).toBe(true);
    expect(s0.plan).toBe('free');

    const co = await ctx.post('/api/billing/checkout', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { plan: 'pro' },
    });
    expect(co.status()).toBe(200);
    const { url } = await co.json();
    expect(url).toBe(MOCK.urls.checkout);

    // The mock saw a customer create (email-bound) and a subscription checkout
    // for our Pro price with the user id woven into the metadata chain.
    const checkoutCall = MOCK.requests.find((r) => r.path === '/v1/checkout/sessions');
    expect(checkoutCall).toBeTruthy();
    expect(checkoutCall.body['line_items[0][price]']).toBe('price_test_billing_smoke');
    expect(checkoutCall.body.mode).toBe('subscription');
    expect(checkoutCall.body['metadata[userId]']).toBeTruthy();
    expect(checkoutCall.body['subscription_data[metadata][userId]']).toBe(checkoutCall.body['metadata[userId]']);
    void userId;

    // Redirect alone must NOT flip the plan.
    const status1 = await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } });
    expect((await status1.json()).plan).toBe('free');

    // Signed webhook flips it.
    const wh = await postWebhook(ctx, checkoutCompletedEvent(checkoutCall.body['metadata[userId]']));
    expect(wh.status()).toBe(200);
    expect(await wh.json()).toEqual({ received: true });

    const status2 = await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } });
    const s2 = await status2.json();
    expect(s2.plan).toBe('pro');
    expect(s2.status).toBe('active');
    expect(s2.entitlements.storageQuota).toBeGreaterThan(s0.entitlements.storageQuota);

    // Usage mirrors the plan too.
    const usage = await ctx.get('/api/users/me/usage', { headers: { Authorization: `Bearer ${token}` } });
    const usageBody = await usage.json();
    expect(usageBody.plan.id).toBe('pro');
    expect(usageBody.attachments.storageQuota).toBe(s2.entitlements.storageQuota);
    await ctx.dispose();
  });

  test('webhook replays are idempotent; bad, tampered, and stale signatures are rejected', async () => {
    const ctx = await selfContext();
    const { token } = await signup(ctx, `http://127.0.0.1:${SERVER.port}`, 2);
    const co = await ctx.post('/api/billing/checkout', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { plan: 'pro' },
    });
    expect(co.status()).toBe(200);
    const userId = MOCK.requests.filter((r) => r.path === '/v1/checkout/sessions').at(-1).body['metadata[userId]'];

    const event = checkoutCompletedEvent(userId);
    const first = await postWebhook(ctx, event);
    expect(first.status()).toBe(200);
    const replay = await postWebhook(ctx, event);
    expect(replay.status()).toBe(200);
    const status = await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } });
    const s = await status.json();
    expect(s.plan).toBe('pro');
    expect(s.status).toBe('active');

    // Wrong secret
    const badSecret = await postWebhook(ctx, checkoutCompletedEvent(userId), { signature: stripeSign(JSON.stringify(event), 'whsec_wrong') });
    expect(badSecret.status()).toBe(400);
    // Tampered payload (valid signature over DIFFERENT bytes)
    const tampered = await postWebhook(ctx, checkoutCompletedEvent(userId), { signature: stripeSign('{"tampered":true}', WHSEC) });
    expect(tampered.status()).toBe(400);
    // Garbage header
    const garbage = await ctx.post('/api/billing/webhook', {
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'v1=deadbeef' },
      data: JSON.stringify(event),
    });
    expect(garbage.status()).toBe(400);
    // Stale timestamp (outside the ±5 min tolerance)
    const stale = await postWebhook(ctx, event, { signature: stripeSign(JSON.stringify(event), WHSEC, Math.floor(Date.now() / 1000) - 3600) });
    expect(stale.status()).toBe(400);
    // Missing header
    const missing = await ctx.post('/api/billing/webhook', { headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(event) });
    expect(missing.status()).toBe(400);
    await ctx.dispose();
  });

  test('past_due keeps the Pro label but falls back to free quotas; recovery restores them', async () => {
    const ctx = await selfContext();
    const { token } = await signup(ctx, `http://127.0.0.1:${SERVER.port}`, 3);

    // Seed directly through the webhook chain: completed → pro/active
    const co = await ctx.post('/api/billing/checkout', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { plan: 'pro' },
    });
    expect(co.status()).toBe(200);
    const metaUserId = MOCK.requests.filter((r) => r.path === '/v1/checkout/sessions').at(-1).body['metadata[userId]'];
    expect((await postWebhook(ctx, checkoutCompletedEvent(metaUserId))).status()).toBe(200);

    const pro = await (await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(pro.plan).toBe('pro');

    // Miss a payment → past_due: label stays, entitlements drop to free.
    await postWebhook(ctx, subscriptionEvent('customer.subscription.updated', metaUserId, 'past_due'));
    const pastDue = await (await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(pastDue.plan).toBe('pro');
    expect(pastDue.status).toBe('past_due');
    expect(pastDue.entitlements.storageQuota).toBeLessThan(pro.entitlements.storageQuota);
    expect(pastDue.entitlements.aiChatPer15Min).toBe(5);

    // Payment recovers → active: Pro entitlements return, with a renewal date.
    await postWebhook(ctx, subscriptionEvent('customer.subscription.updated', metaUserId, 'active'));
    const recovered = await (await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(recovered.status).toBe('active');
    expect(recovered.entitlements.storageQuota).toBe(pro.entitlements.storageQuota);
    expect(recovered.renewsAt).toBeTruthy();
    await ctx.dispose();
  });

  test('cancellation returns the user to free; portal opens after a customer exists', async () => {
    const ctx = await selfContext();
    const { token } = await signup(ctx, `http://127.0.0.1:${SERVER.port}`, 4);

    // No customer yet → portal is a 409, not a provider call.
    const portal0 = await ctx.post('/api/billing/portal', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, data: {} });
    expect(portal0.status()).toBe(409);

    const co = await ctx.post('/api/billing/checkout', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { plan: 'pro' },
    });
    expect(co.status()).toBe(200);
    const metaUserId = MOCK.requests.filter((r) => r.path === '/v1/checkout/sessions').at(-1).body['metadata[userId]'];
    await postWebhook(ctx, checkoutCompletedEvent(metaUserId));

    const portal1 = await ctx.post('/api/billing/portal', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, data: {} });
    expect(portal1.status()).toBe(200);
    expect((await portal1.json()).url).toBe(MOCK.urls.portal);
    const portalCall = MOCK.requests.find((r) => r.path === '/v1/billing_portal/sessions');
    expect(portalCall.body.customer).toBe(mockCustomerFor(metaUserId));

    await postWebhook(ctx, subscriptionEvent('customer.subscription.deleted', metaUserId, 'canceled'));
    const after = await (await ctx.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(after.plan).toBe('free');
    expect(after.status).toBe('canceled');
    expect(after.entitlements.storageQuota).toBe(262144000);

    // After cancel, checkout must work again (not "already pro" 409).
    const co2 = await ctx.post('/api/billing/checkout', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { plan: 'pro' },
    });
    expect(co2.status()).toBe(200);
    await ctx.dispose();
  });
});
