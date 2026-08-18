import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';
const noteBody = [
  'The release checklist now requires a rollback rehearsal before any editor change ships to production.',
  'Support tickets grew twelve percent this week, driven mostly by the new import wizard errors.',
  'Onboarding drop-off continues at notebook creation, so the team will prototype a template gallery.',
].join(' ');

function withIp(authHeaders, ip) {
  return { ...authHeaders, 'X-Forwarded-For': ip };
}

async function expectSuggestion(response, action) {
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toMatchObject({ action, provider: expect.stringMatching(/^(groq|mock)$/) });
  expect(payload.suggestion).toEqual(expect.any(String));
  expect(payload.suggestion.length).toBeGreaterThan(0);
  expect(payload.suggestion.length).toBeLessThanOrEqual(800);
  return payload;
}

test('Writing assistant validates all actions and guards while never writing the note', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({ baseURL });
  const foreignApi = await requestFactory.newContext({ baseURL });
  const ownerEmail = `ai-assist-owner-${runId}@example.test`;
  const foreignEmail = `ai-assist-foreign-${runId}@example.test`;

  try {
    const signup = await ownerApi.post('/api/users/signup', {
      data: { email: ownerEmail, password, username: 'Assist Owner' },
    });
    expect(signup.status()).toBe(201);
    const { accessToken } = await signup.json();
    const ownerHeaders = { Authorization: `Bearer ${accessToken}` };

    const noteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Release review', contentText: noteBody, description: noteBody },
    });
    expect(noteResponse.status()).toBe(201);
    const note = await noteResponse.json();

    // Auth middleware runs before the endpoint-specific limiter.
    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      data: { action: 'continue' },
    });
    expect(unauthenticated.status()).toBe(401);

    // All three supported actions return bounded suggestions. These five calls
    // deliberately use one IP and stay at the endpoint's 5-per-15-minute limit.
    const continuePayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.11'),
      data: { action: 'continue' },
    }), 'continue');
    const rephrasePayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.11'),
      data: { action: 'rephrase', text: 'The checklist is clear. The rehearsal happens Friday.' },
    }), 'rephrase');
    const shortenPayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.11'),
      data: { action: 'shorten', text: 'The checklist is clear. The rehearsal happens Friday. The owner will publish results.' },
    }), 'shorten');
    if (continuePayload.provider === 'mock') {
      expect(continuePayload.suggestion).toContain('Next step:');
      expect(rephrasePayload.suggestion).toBe('The rehearsal happens Friday. The checklist is clear.');
      expect(shortenPayload.suggestion).toBe('The checklist is clear.');
    }

    // WP-AI-004b — expand action (own limiter IP so the block above keeps its
    // exact 5-of-5 budget on 198.51.100.11).
    const expandPayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.14'),
      data: { action: 'expand', text: 'The checklist is clear. The rehearsal happens Friday.' },
    }), 'expand');
    if (expandPayload.provider === 'mock') {
      expect(expandPayload.suggestion).toBe('The checklist is clear. Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.');
    }
    const expandEmpty = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.14'),
      data: { action: 'expand', text: '   ' },
    });
    expect(expandEmpty.status()).toBe(400);
    await expect(expandEmpty.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });
    const expandTooLong = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.14'),
      data: { action: 'expand', text: 'x'.repeat(2001) },
    });
    expect(expandTooLong.status()).toBe(400);
    await expect(expandTooLong.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    // 'expand' became a real action in WP-AI-004b, so the unknown-action guard
    // now uses a genuinely unsupported verb.
    const invalidAction = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.11'),
      data: { action: 'translate', text: 'Do not support queued actions.' },
    });
    expect(invalidAction.status()).toBe(400);
    await expect(invalidAction.json()).resolves.toMatchObject({ message: 'Unknown assist action' });

    const emptySelection = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.11'),
      data: { action: 'rephrase', text: '   ' },
    });
    expect(emptySelection.status()).toBe(400);
    await expect(emptySelection.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    // A second IP keeps the remaining independent guards below the same limiter.
    const tooLongSelection = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.12'),
      data: { action: 'shorten', text: 'x'.repeat(2001) },
    });
    expect(tooLongSelection.status()).toBe(400);
    await expect(tooLongSelection.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    const shortText = 'This note is much too short.';
    const shortResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Short', contentText: shortText, description: shortText },
    });
    expect(shortResponse.status()).toBe(201);
    const shortNote = await shortResponse.json();
    const shortContinue = await ownerApi.post(`/api/notes/${shortNote.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.12'),
      data: { action: 'continue' },
    });
    expect(shortContinue.status()).toBe(400);
    await expect(shortContinue.json()).resolves.toMatchObject({
      message: 'Note is too short to continue (needs at least 40 characters)',
    });

    const trashResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Trash guard', contentText: noteBody, description: noteBody },
    });
    expect(trashResponse.status()).toBe(201);
    const trashNote = await trashResponse.json();
    const moved = await ownerApi.post(`/api/notes/${trashNote.id}/trash`, { headers: ownerHeaders });
    expect([200, 204]).toContain(moved.status());
    const trashedAssist = await ownerApi.post(`/api/notes/${trashNote.id}/assist`, {
      headers: withIp(ownerHeaders, '198.51.100.12'),
      data: { action: 'continue' },
    });
    expect(trashedAssist.status()).toBe(400);
    await expect(trashedAssist.json()).resolves.toMatchObject({ message: 'Restore the note before using AI' });

    // Ownership is checked before request-body validation.
    const foreignSignup = await foreignApi.post('/api/users/signup', {
      data: { email: foreignEmail, password, username: 'Assist Foreign' },
    });
    expect(foreignSignup.status()).toBe(201);
    const foreignAuth = await foreignSignup.json();
    const foreignAssist = await foreignApi.post(`/api/notes/${note.id}/assist`, {
      headers: withIp({ Authorization: `Bearer ${foreignAuth.accessToken}` }, '198.51.100.13'),
      data: { action: 'expand' },
    });
    expect(foreignAssist.status()).toBe(404);
    await expect(foreignAssist.json()).resolves.toMatchObject({ message: 'Note not found' });

    // Suggestions are read-only: the primary note remains byte-for-byte unchanged.
    const notesResponse = await ownerApi.get('/api/notes', { headers: ownerHeaders });
    expect(notesResponse.status()).toBe(200);
    const stored = (await notesResponse.json()).find((item) => item.id === note.id);
    expect(stored).toBeTruthy();
    for (const field of ['title', 'contentText', 'description', 'contentJson', 'summary', 'updatedAt']) {
      expect(stored[field]).toEqual(note[field]);
    }
  } finally {
    await ownerApi.dispose();
    await foreignApi.dispose();
  }
});
