import { test, expect, request as requestFactory } from '@playwright/test';

// WP-SEC-003 — request-only coverage for the per-email signin ladder and OTP
// issue window. Every email is fresh so rows cannot leak between test runs.
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'LockoutPassword-123!';

async function expectInvalidSignin(api, email) {
  const response = await api.post('/api/users/signin', {
    data: { email, password: 'WrongPassword-123!' },
  });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ message: 'Invalid credentials' });
  return response;
}

async function expectLockedSignin(api, email) {
  const response = await api.post('/api/users/signin', {
    data: { email, password: 'WrongPassword-123!' },
  });
  expect(response.status()).toBe(429);
  await expect(response.json()).resolves.toEqual({ message: 'Too many failed attempts — try again later' });
  const retryAfter = response.headers()['retry-after'];
  expect(retryAfter).toMatch(/^\d+$/);
  expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  return { response, retryAfter: Number(retryAfter) };
}

async function expectSigninSuccess(api, email) {
  const response = await api.post('/api/users/signin', {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toMatchObject({
    user: { email },
    token: expect.any(String),
    accessToken: expect.any(String),
  });
  return payload;
}

test('signin lockout is progressive, availability-preserving, and email-isolated', async () => {
  test.setTimeout(60_000);
  const api = await requestFactory.newContext();
  const email = `lockout-owner-${runId}@example.test`;
  const unknownEmail = `lockout-unknown-${runId}@example.test`;
  const otherEmail = `lockout-other-${runId}@example.test`;

  try {
    const signup = await api.post('/api/users/signup', {
      data: { email, password, username: 'Lockout Owner' },
    });
    expect(signup.status()).toBe(201);

    // Failures 1–4 retain the existing 401 body; the fifth starts stage one.
    for (let i = 0; i < 4; i += 1) await expectInvalidSignin(api, email);
    const firstLock = await expectLockedSignin(api, email);
    expect(firstLock.retryAfter).toBeLessThanOrEqual(65);

    // No waiting-based test: continued misses during the lock advance the
    // ladder, and the count-five boundary at stage two must exceed two minutes.
    const subsequentRetryAfters = [];
    for (let i = 0; i < 5; i += 1) {
      subsequentRetryAfters.push((await expectLockedSignin(api, email)).retryAfter);
    }
    expect(subsequentRetryAfters.some((seconds) => seconds > 120)).toBe(true);

    // Availability preservation: the correct password still runs bcrypt and
    // wins during the lock, clearing the ladder and returning the normal shape.
    await expectSigninSuccess(api, email);
    for (let i = 0; i < 4; i += 1) await expectInvalidSignin(api, email);
    const resetLock = await expectLockedSignin(api, email);
    expect(resetLock.retryAfter).toBeLessThanOrEqual(65);

    // Unknown accounts run the same bcrypt/throttle path and expose the same
    // response as a wrong password, preventing account enumeration.
    for (let i = 0; i < 4; i += 1) await expectInvalidSignin(api, unknownEmail);
    await expectLockedSignin(api, unknownEmail);

    // User B remains on the 401 contract while user A is locked.
    const otherSignup = await api.post('/api/users/signup', {
      data: { email: otherEmail, password, username: 'Lockout Other' },
    });
    expect(otherSignup.status()).toBe(201);
    await expectInvalidSignin(api, otherEmail);
  } finally {
    await api.dispose();
  }
});

test('OTP demo issuance is throttled per email, not globally', async () => {
  test.setTimeout(30_000);
  const api = await requestFactory.newContext();
  const email = `otp-throttle-${runId}@example.test`;
  const secondEmail = `otp-throttle-second-${runId}@example.test`;
  const otpIp = `198.51.100.${(Date.now() % 200) + 20}`;
  const otpHeaders = { 'X-Forwarded-For': otpIp };

  try {
    // Keep this loop to seven /api/auth calls total: five allowed, one 429,
    // then one independent email. strict remains the existing 30/15-minute IP
    // budget and is intentionally not changed here.
    for (let i = 0; i < 5; i += 1) {
      const response = await api.post('/api/auth/otp/demo-request', {
        headers: otpHeaders,
        data: { email },
      });
      expect(response.status()).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true });
    }

    const blocked = await api.post('/api/auth/otp/demo-request', {
      headers: otpHeaders,
      data: { email },
    });
    expect(blocked.status()).toBe(429);
    await expect(blocked.json()).resolves.toEqual({ error: 'Too many codes requested — try again later' });
    const retryAfter = blocked.headers()['retry-after'];
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);

    const isolated = await api.post('/api/auth/otp/demo-request', {
      headers: otpHeaders,
      data: { email: secondEmail },
    });
    expect(isolated.status()).toBe(200);
    await expect(isolated.json()).resolves.toMatchObject({ ok: true });
  } finally {
    await api.dispose();
  }
});

// The 15-minute window slide and 60-minute signin cap tail are review-verified,
// not test-waited.
