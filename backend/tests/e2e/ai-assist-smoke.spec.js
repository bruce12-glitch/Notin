import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';
const noteBody = [
  'The release checklist now requires a rollback rehearsal before any editor change ships to production.',
  'Support tickets grew twelve percent this week, driven mostly by the new import wizard errors.',
  'Onboarding drop-off continues at notebook creation, so the team will prototype a template gallery.',
].join(' ');

// WP-HARDEN-001 — AI budgets are keyed per authenticated USER (5 / 15 min per
// endpoint). The old per-IP isolation headers are no longer load-bearing, so
// this spec spreads its calls across several throwaway accounts instead.
async function signupAs(api, label) {
  const signup = await api.post('/api/users/signup', {
    data: { email: `ai-assist-${label}-${runId}@example.test`, password, username: `Assist ${label}` },
  });
  expect(signup.status()).toBe(201);
  const { accessToken } = await signup.json();
  return { Authorization: `Bearer ${accessToken}` };
}

async function createNote(api, headers, body) {
  const response = await api.post('/api/notes', { headers, data: body });
  expect(response.status()).toBe(201);
  return response.json();
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
  const expandApi = await requestFactory.newContext({ baseURL });
  const guardApi = await requestFactory.newContext({ baseURL });
  const foreignApi = await requestFactory.newContext({ baseURL });

  try {
    // User A — the primary owner: 3 suggestions + unknown action + empty
    // selection = exactly 5 limiter-counted calls on /assist.
    const ownerHeaders = await signupAs(ownerApi, 'owner');
    const note = await createNote(ownerApi, ownerHeaders, {
      title: 'Release review', contentText: noteBody, description: noteBody,
    });

    // Auth middleware runs before the endpoint-specific limiter.
    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      data: { action: 'continue' },
    });
    expect(unauthenticated.status()).toBe(401);

    // All three supported actions return bounded suggestions. User A stays at
    // the endpoint's 5-per-15-minute per-user limit.
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

    // WP-AI-004b — expand action and its guards run under a second user so the
    // block above keeps its exact 5-of-5 budget.
    const expandHeaders = await signupAs(expandApi, 'expand');
    const expandNote = await createNote(expandApi, expandHeaders, {
      title: 'Expand review', contentText: noteBody, description: noteBody,
    });
    const expandPayload = await expectSuggestion(await expandApi.post(`/api/notes/${expandNote.id}/assist`, {
      headers: expandHeaders,
      data: { action: 'expand', text: 'The checklist is clear. The rehearsal happens Friday.' },
    }), 'expand');
    if (expandPayload.provider === 'mock') {
      expect(expandPayload.suggestion).toBe('The checklist is clear. Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.');
    }
    const expandEmpty = await expandApi.post(`/api/notes/${expandNote.id}/assist`, {
      headers: expandHeaders,
      data: { action: 'expand', text: '   ' },
    });
    expect(expandEmpty.status()).toBe(400);
    await expect(expandEmpty.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });
    const expandTooLong = await expandApi.post(`/api/notes/${expandNote.id}/assist`, {
      headers: expandHeaders,
      data: { action: 'expand', text: 'x'.repeat(2001) },
    });
    expect(expandTooLong.status()).toBe(400);
    await expect(expandTooLong.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });
    const tooLongSelection = await expandApi.post(`/api/notes/${expandNote.id}/assist`, {
      headers: expandHeaders,
      data: { action: 'shorten', text: 'x'.repeat(2001) },
    });
    expect(tooLongSelection.status()).toBe(400);
    await expect(tooLongSelection.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    // 'expand' became a real action in WP-AI-004b, so the unknown-action guard
    // now uses a genuinely unsupported verb.
    const invalidAction = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'translate', text: 'Do not support queued actions.' },
    });
    expect(invalidAction.status()).toBe(400);
    await expect(invalidAction.json()).resolves.toMatchObject({ message: 'Unknown assist action' });

    const emptySelection = await ownerApi.post(`/api/notes/${note.id}/assist`, {
      headers: ownerHeaders,
      data: { action: 'rephrase', text: '   ' },
    });
    expect(emptySelection.status()).toBe(400);
    await expect(emptySelection.json()).resolves.toMatchObject({
      message: 'Select some text first (1–2000 characters)',
    });

    // User C — the note-state guards (short note / trashed note) run under a
    // third user so they never touch the budgets above.
    const guardHeaders = await signupAs(guardApi, 'guard');
    const shortText = 'This note is much too short.';
    const shortNote = await createNote(guardApi, guardHeaders, {
      title: 'Short', contentText: shortText, description: shortText,
    });
    const shortContinue = await guardApi.post(`/api/notes/${shortNote.id}/assist`, {
      headers: guardHeaders,
      data: { action: 'continue' },
    });
    expect(shortContinue.status()).toBe(400);
    await expect(shortContinue.json()).resolves.toMatchObject({
      message: 'Note is too short to continue (needs at least 40 characters)',
    });

    const trashNote = await createNote(guardApi, guardHeaders, {
      title: 'Trash guard', contentText: noteBody, description: noteBody,
    });
    const moved = await guardApi.post(`/api/notes/${trashNote.id}/trash`, { headers: guardHeaders });
    expect([200, 204]).toContain(moved.status());
    const trashedAssist = await guardApi.post(`/api/notes/${trashNote.id}/assist`, {
      headers: guardHeaders,
      data: { action: 'continue' },
    });
    expect(trashedAssist.status()).toBe(400);
    await expect(trashedAssist.json()).resolves.toMatchObject({ message: 'Restore the note before using AI' });

    // Ownership is checked before request-body validation.
    const foreignHeaders = await signupAs(foreignApi, 'foreign');
    const foreignAssist = await foreignApi.post(`/api/notes/${note.id}/assist`, {
      headers: foreignHeaders,
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
    await expandApi.dispose();
    await guardApi.dispose();
    await foreignApi.dispose();
  }
});
