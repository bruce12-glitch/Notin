import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';
const noteBody = [
  'The release checklist now requires a rollback rehearsal before any editor change ships to production.',
  'Support tickets grew twelve percent this week, driven mostly by the new import wizard errors.',
  'Onboarding drop-off continues at notebook creation, so the team will prototype a template gallery.',
].join(' ');

// WP-AI-005 — the assist limiter keys on the authenticated user, not the client IP,
// so spoofing X-Forwarded-For no longer buys a fresh 5-per-15-minute budget. Guard
// assertions that would overflow the owner's budget run as additional signed-up
// users instead. `budgetHolder(...)` makes that intent explicit at each call site.
async function signUpProbe(api, email, username) {
  const response = await api.post('/api/users/signup', {
    data: { email, password, username },
  });
  expect(response.status()).toBe(201);
  const { accessToken } = await response.json();
  return { Authorization: `Bearer ${accessToken}` };
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
  let guardApi;
  let stateApi;

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

    // All three supported actions return bounded suggestions. The owner spends
    // exactly 5 of its own 5-per-15-minute budget here (4 suggestions + 1 guard);
    // every later guard runs as a different signed-up user with its own budget.
    const continuePayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'continue' },
    }), 'continue');
    const rephrasePayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'rephrase', text: 'The checklist is clear. The rehearsal happens Friday.' },
    }), 'rephrase');
    const shortenPayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'shorten', text: 'The checklist is clear. The rehearsal happens Friday. The owner will publish results.' },
    }), 'shorten');
    if (continuePayload.provider === 'mock') {
      expect(continuePayload.suggestion).toContain('Next step:');
      expect(rephrasePayload.suggestion).toBe('The rehearsal happens Friday. The checklist is clear.');
      expect(shortenPayload.suggestion).toBe('The checklist is clear.');
    }

    // WP-AI-004b — expand action. Fourth of the owner's five allowed calls.
    const expandPayload = await expectSuggestion(await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'expand', text: 'The checklist is clear. The rehearsal happens Friday.' },
    }), 'expand');
    if (expandPayload.provider === 'mock') {
      expect(expandPayload.suggestion).toBe('The checklist is clear. Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.');
    }

    // Remaining selection/length guards run as a second account with its own note,
    // so they neither consume nor depend on the owner's remaining budget.
    guardApi = await requestFactory.newContext({ baseURL });
    const guardHeaders = await signUpProbe(guardApi, `ai-assist-guard-${runId}@example.test`, 'Assist Guard');
    const guardNoteResponse = await guardApi.post('/api/notes', {
      headers: guardHeaders,
      data: { title: 'Guard note', contentText: noteBody, description: noteBody },
    });
    expect(guardNoteResponse.status()).toBe(201);
    const guardNote = await guardNoteResponse.json();

    const expandEmpty = await guardApi.post(`/api/notes/${guardNote.id}/assist`, {
      headers: guardHeaders,
      data: { action: 'expand', text: '   ' },
    });
    expect(expandEmpty.status()).toBe(400);
    await expect(expandEmpty.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });
    const expandTooLong = await guardApi.post(`/api/notes/${guardNote.id}/assist`, {
      headers: guardHeaders,
      data: { action: 'expand', text: 'x'.repeat(2001) },
    });
    expect(expandTooLong.status()).toBe(400);
    await expect(expandTooLong.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    // 'expand' became a real action in WP-AI-004b, so the unknown-action guard
    // now uses a genuinely unsupported verb.
    // Fifth and final call on the owner's budget.
    const invalidAction = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'translate', text: 'Do not support queued actions.' },
    });
    expect(invalidAction.status()).toBe(400);
    await expect(invalidAction.json()).resolves.toMatchObject({ message: 'Unknown assist action' });

    const emptySelection = await guardApi.post(`/api/notes/${guardNote.id}/assist`, {
      headers: guardHeaders,
      data: { action: 'rephrase', text: '   ' },
    });
    expect(emptySelection.status()).toBe(400);
    await expect(emptySelection.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    const tooLongSelection = await guardApi.post(`/api/notes/${guardNote.id}/assist`, {
      headers: guardHeaders,
      data: { action: 'shorten', text: 'x'.repeat(2001) },
    });
    expect(tooLongSelection.status()).toBe(400);
    await expect(tooLongSelection.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    // Third account: the note-state guards (too short, trashed) get a clean budget
    // rather than crowding the selection-validation guards above.
    stateApi = await requestFactory.newContext({ baseURL });
    const stateHeaders = await signUpProbe(stateApi, `ai-assist-state-${runId}@example.test`, 'Assist State');

    const shortText = 'This note is much too short.';
    const shortResponse = await stateApi.post('/api/notes', {
      headers: stateHeaders,
      data: { title: 'Short', contentText: shortText, description: shortText },
    });
    expect(shortResponse.status()).toBe(201);
    const shortNote = await shortResponse.json();
    const shortContinue = await stateApi.post(`/api/notes/${shortNote.id}/assist`, {
      headers: stateHeaders,
      data: { action: 'continue' },
    });
    expect(shortContinue.status()).toBe(400);
    await expect(shortContinue.json()).resolves.toMatchObject({
      message: 'Note is too short to continue (needs at least 40 characters)',
    });

    const trashResponse = await stateApi.post('/api/notes', {
      headers: stateHeaders,
      data: { title: 'Trash guard', contentText: noteBody, description: noteBody },
    });
    expect(trashResponse.status()).toBe(201);
    const trashNote = await trashResponse.json();
    const moved = await stateApi.post(`/api/notes/${trashNote.id}/trash`, { headers: stateHeaders });
    expect([200, 204]).toContain(moved.status());
    const trashedAssist = await stateApi.post(`/api/notes/${trashNote.id}/assist`, {
      headers: stateHeaders,
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
      headers: { Authorization: `Bearer ${foreignAuth.accessToken}` },
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
    if (guardApi) await guardApi.dispose();
    if (stateApi) await stateApi.dispose();
  }
});
