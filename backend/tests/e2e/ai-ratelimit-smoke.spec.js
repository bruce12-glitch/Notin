import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

// summarize requires >= 200 characters of note text.
const noteBody = [
  'The quarterly infrastructure review covers the unified API, the editor shell, and the marketing site.',
  'Rate limiting is applied per authenticated account so that shared egress addresses cannot starve other users.',
  'This paragraph exists only to push the note past the two hundred character minimum the summarizer enforces.',
].join(' ');

async function signUp(api, email) {
  const response = await api.post('/api/users/signup', {
    data: { email, password, username: 'Rate Limit Probe' },
  });
  expect(response.status()).toBe(201);
  const { token } = await response.json();
  expect(typeof token).toBe('string');
  return { Authorization: `Bearer ${token}` };
}

async function createNote(api, headers) {
  const response = await api.post('/api/notes', {
    headers,
    data: { title: 'Untitled', contentText: noteBody, description: noteBody },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test('AI rate limits are keyed per user, so one account cannot exhaust another on the same IP', async ({ baseURL }) => {
  const alphaApi = await requestFactory.newContext({ baseURL });
  const betaApi = await requestFactory.newContext({ baseURL });

  try {
    expect(noteBody.length).toBeGreaterThanOrEqual(200);

    const alphaHeaders = await signUp(alphaApi, `ai-ratelimit-alpha-${runId}@example.test`);
    const betaHeaders = await signUp(betaApi, `ai-ratelimit-beta-${runId}@example.test`);

    const alphaNote = await createNote(alphaApi, alphaHeaders);
    const betaNote = await createNote(betaApi, betaHeaders);

    // Alpha spends its whole 5-per-15-minute summarize budget.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const allowed = await alphaApi.post(`/api/notes/${alphaNote.id}/summarize`, { headers: alphaHeaders });
      expect(allowed.status(), `alpha summarize attempt ${attempt} should be allowed`).toBe(200);
    }

    // The 6th is refused, and the refusal body stays the library default.
    const exhausted = await alphaApi.post(`/api/notes/${alphaNote.id}/summarize`, { headers: alphaHeaders });
    expect(exhausted.status()).toBe(429);
    expect(await exhausted.text()).toContain('Too many requests');

    // Beta shares the IP and the process but owns a separate budget. This is the
    // assertion that fails when the limiters key on IP: before WP-AI-005 a brand-new
    // account's first ever AI call returned 429.
    const betaFirstCall = await betaApi.post(`/api/notes/${betaNote.id}/summarize`, { headers: betaHeaders });
    expect(betaFirstCall.status()).toBe(200);
    const betaPayload = await betaFirstCall.json();
    expect(betaPayload.summary).toEqual(expect.any(String));
    expect(betaPayload.summary.length).toBeGreaterThan(0);

    // Budgets are per endpoint as well as per user: alpha's summarize exhaustion
    // must not spill into a different AI endpoint.
    const alphaOtherEndpoint = await alphaApi.post(`/api/notes/${alphaNote.id}/suggest-title`, { headers: alphaHeaders });
    expect(alphaOtherEndpoint.status()).toBe(200);

    // Unauthenticated calls are rejected by `auth` before any limiter runs.
    const anonymous = await alphaApi.post(`/api/notes/${alphaNote.id}/summarize`);
    expect(anonymous.status()).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({ message: 'Unauthorized' });
  } finally {
    await alphaApi.dispose();
    await betaApi.dispose();
  }
});
