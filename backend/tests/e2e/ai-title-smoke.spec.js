import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

const untitledBody = [
  'Weekly operations review covering support load, onboarding drop-off, and the release checklist.',
  'Support tickets grew twelve percent this week, driven mostly by the new import wizard errors.',
  'Onboarding drop-off continues at the notebook creation step, so the team will prototype a template gallery.',
  'The release checklist now requires a rollback rehearsal before any editor change ships to production.',
].join(' ');

test('AI title suggestion enforces auth, ownership, length, and never writes the title', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({ baseURL });
  const foreignApi = await requestFactory.newContext({ baseURL });
  const ownerEmail = `ai-title-owner-${runId}@example.test`;
  const foreignEmail = `ai-title-foreign-${runId}@example.test`;

  try {
    const signup = await ownerApi.post('/api/users/signup', {
      data: { email: ownerEmail, password, username: 'Title Owner' },
    });
    expect(signup.status()).toBe(201);
    const { accessToken } = await signup.json();
    const ownerHeaders = { Authorization: `Bearer ${accessToken}` };

    // Untitled note with enough content to title
    const noteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Untitled', contentText: untitledBody, description: untitledBody },
    });
    expect(noteResponse.status()).toBe(201);
    const note = await noteResponse.json();

    // Unauthenticated → 401
    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/suggest-title`);
    expect(unauthenticated.status()).toBe(401);

    // Authenticated → 200 with a bounded title; provider groq|mock
    const titleResponse = await ownerApi.post(`/api/notes/${note.id}/suggest-title`, { headers: ownerHeaders });
    expect(titleResponse.status()).toBe(200);
    const titlePayload = await titleResponse.json();
    expect(titlePayload.title).toEqual(expect.any(String));
    expect(titlePayload.title.length).toBeGreaterThan(0);
    expect(titlePayload.title.length).toBeLessThanOrEqual(60);
    expect(['groq', 'mock']).toContain(titlePayload.provider);

    // Server must NOT have written the title — note stays 'Untitled'
    const notesResponse = await ownerApi.get('/api/notes', { headers: ownerHeaders });
    expect(notesResponse.status()).toBe(200);
    const notes = await notesResponse.json();
    expect(notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: note.id, title: 'Untitled' }),
    ]));

    // A note that already has a real title → 400
    const titledResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Real title', contentText: untitledBody, description: untitledBody },
    });
    expect(titledResponse.status()).toBe(201);
    const titledNote = await titledResponse.json();
    const alreadyTitled = await ownerApi.post(`/api/notes/${titledNote.id}/suggest-title`, { headers: ownerHeaders });
    expect(alreadyTitled.status()).toBe(400);
    await expect(alreadyTitled.json()).resolves.toMatchObject({ message: 'Note already has a title' });

    // Too short → 400
    const shortResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Untitled', contentText: 'Far too short to title.', description: 'Far too short to title.' },
    });
    expect(shortResponse.status()).toBe(201);
    const shortNote = await shortResponse.json();
    const shortTitle = await ownerApi.post(`/api/notes/${shortNote.id}/suggest-title`, { headers: ownerHeaders });
    expect(shortTitle.status()).toBe(400);
    await expect(shortTitle.json()).resolves.toMatchObject({
      message: 'Note is too short to title (needs at least 40 characters)',
    });

    // Foreign user → 404
    const foreignSignup = await foreignApi.post('/api/users/signup', {
      data: { email: foreignEmail, password, username: 'Title Foreign' },
    });
    expect(foreignSignup.status()).toBe(201);
    const foreignAuth = await foreignSignup.json();
    const foreignTitle = await foreignApi.post(`/api/notes/${note.id}/suggest-title`, {
      headers: { Authorization: `Bearer ${foreignAuth.accessToken}` },
    });
    expect(foreignTitle.status()).toBe(404);
    await expect(foreignTitle.json()).resolves.toMatchObject({ message: 'Note not found' });
  } finally {
    await ownerApi.dispose();
    await foreignApi.dispose();
  }
});
