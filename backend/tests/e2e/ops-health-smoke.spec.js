import { test, expect } from '@playwright/test';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SANE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function requestIdOf(response) {
  return response.headers()['x-request-id'];
}

test('GET /health is a fast liveness probe and never depends on readiness shape', async ({ request }) => {
  const started = Date.now();
  const response = await request.get('/health');
  const elapsedMs = Date.now() - started;
  expect(response.status()).toBe(200);
  expect(elapsedMs).toBeLessThan(1000);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, service: 'notin-api' });
  expect(body.status).toBeUndefined();
  expect(body.database).not.toEqual(expect.objectContaining({ reachable: expect.anything() }));
  expect(requestIdOf(response)).toMatch(SANE_ID_RE);
});

test('GET /api/health is a readiness check with a real measured latencyMs', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(body.database.reachable).toBe(true);
  expect(['PostgreSQL', 'SQLite-fallback']).toContain(body.database.driver);
  expect(typeof body.database.latencyMs).toBe('number');
  expect(Number.isFinite(body.database.latencyMs)).toBe(true);
  expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
  expect(body.database.latencyMs).toBeLessThan(2000);
  expect(typeof body.uptimeSeconds).toBe('number');
  expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  expect(typeof body.version).toBe('string');
  expect(body.version.length).toBeGreaterThan(0);
  expect(body).not.toHaveProperty('error');
  expect(requestIdOf(response)).toMatch(SANE_ID_RE);
});

test('GET /api/health/deep includes upload writability', async ({ request }) => {
  const response = await request.get('/api/health/deep');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(body.database.reachable).toBe(true);
  expect(body.uploads).toEqual({ writable: true });
  expect(requestIdOf(response)).toMatch(SANE_ID_RE);
});

test('sane inbound X-Request-Id is echoed; hostile values are replaced', async ({ request }) => {
  const sane = 'ops-trace_abc-123';
  const echoed = await request.get('/health', { headers: { 'X-Request-Id': sane } });
  expect(requestIdOf(echoed)).toBe(sane);

  const uuid = '11111111-2222-4333-a444-555555555555';
  const uuidRes = await request.get('/api/health', { headers: { 'X-Request-Id': uuid } });
  expect(requestIdOf(uuidRes)).toBe(uuid);

  const tooLong = `x${'a'.repeat(128)}`; // 129 chars
  expect(tooLong.length).toBe(129);
  const longRes = await request.get('/health', { headers: { 'X-Request-Id': tooLong } });
  const longId = requestIdOf(longRes);
  expect(longId).not.toBe(tooLong);
  expect(longId).toMatch(UUID_RE);

  const withSlash = 'abc/def';
  const slashRes = await request.get('/health', { headers: { 'X-Request-Id': withSlash } });
  expect(requestIdOf(slashRes)).not.toBe(withSlash);
  expect(requestIdOf(slashRes)).toMatch(UUID_RE);

  const withSpace = 'not a valid id';
  const spaceRes = await request.get('/health', { headers: { 'X-Request-Id': withSpace } });
  expect(requestIdOf(spaceRes)).not.toBe(withSpace);
  expect(requestIdOf(spaceRes)).toMatch(UUID_RE);

  const withDot = 'trace.id';
  const dotRes = await request.get('/api/health', { headers: { 'X-Request-Id': withDot } });
  expect(requestIdOf(dotRes)).not.toBe(withDot);
  expect(requestIdOf(dotRes)).toMatch(UUID_RE);
});

test('a generated request id is a UUID when no inbound header is sent', async ({ request }) => {
  const response = await request.get('/health');
  expect(requestIdOf(response)).toMatch(UUID_RE);
});

test('forced 500 keeps message and returns the same request id the client sent', async ({ request }) => {
  const inbound = 'forced-500-support-id';
  const response = await request.fetch('/api/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': inbound,
    },
    data: '{not-json',
  });
  expect(response.status()).toBe(500);
  expect(requestIdOf(response)).toBe(inbound);
  const body = await response.json();
  expect(body.message).toBe('Internal Server Error');
  expect(body.requestId).toBe(inbound);
});
