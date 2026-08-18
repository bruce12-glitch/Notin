import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

const chatBody = [
  'The release checklist now requires a rollback rehearsal before any editor change ships to production.',
  'Support tickets grew twelve percent this week, driven mostly by the new import wizard errors.',
  'Onboarding drop-off continues at the notebook creation step, so the team will prototype a template gallery.',
].join(' ');

test('Note chat enforces auth, ownership, and guards while never writing the note', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({ baseURL });
  const foreignApi = await requestFactory.newContext({ baseURL });
  const ownerEmail = `ai-chat-owner-${runId}@example.test`;
  const foreignEmail = `ai-chat-foreign-${runId}@example.test`;

  try {
    const signup = await ownerApi.post('/api/users/signup', {
      data: { email: ownerEmail, password, username: 'Chat Owner' },
    });
    expect(signup.status()).toBe(201);
    const { accessToken } = await signup.json();
    const ownerHeaders = { Authorization: `Bearer ${accessToken}` };

    expect(chatBody.length).toBeGreaterThanOrEqual(200);
    const noteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Ops review', contentText: chatBody, description: chatBody },
    });
    expect(noteResponse.status()).toBe(201);
    const note = await noteResponse.json();

    // Unauthenticated → 401
    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/chat`, {
      data: { question: 'What about rollback?', history: [] },
    });
    expect(unauthenticated.status()).toBe(401);

    // Authenticated → 200 with a grounded answer; provider groq|mock
    const chatResponse = await ownerApi.post(`/api/notes/${note.id}/chat`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(chatResponse.status()).toBe(200);
    const chatPayload = await chatResponse.json();
    expect(chatPayload.answer).toEqual(expect.any(String));
    expect(chatPayload.answer.length).toBeGreaterThan(0);
    expect(chatPayload.answer.length).toBeLessThanOrEqual(800);
    expect(['groq', 'mock']).toContain(chatPayload.provider);
    if (chatPayload.provider === 'mock') {
      expect(chatPayload.answer).toContain('Based on the note:');
      expect(chatPayload.answer.toLowerCase()).toContain('rollback');
    }

    // The chat endpoint is read-only: title/content unchanged, no summary written
    const notesResponse = await ownerApi.get('/api/notes', { headers: ownerHeaders });
    expect(notesResponse.status()).toBe(200);
    const notes = await notesResponse.json();
    const stored = notes.find((item) => item.id === note.id);
    expect(stored).toBeTruthy();
    expect(stored.title).toBe('Ops review');
    expect(stored.contentText).toBe(chatBody);
    expect(stored.summary == null || stored.summary === '').toBe(true);

    // Empty / missing question → 400 (one call: the per-endpoint limiter allows
    // only 5 chat requests per 15 minutes per IP, so this spec stays under it)
    const emptyQuestion = await ownerApi.post(`/api/notes/${note.id}/chat`, {
      headers: ownerHeaders,
      data: { question: '   ', history: [] },
    });
    expect(emptyQuestion.status()).toBe(400);
    await expect(emptyQuestion.json()).resolves.toMatchObject({ message: 'Ask a question (1–500 characters)' });

    // Too-short note → 400
    const shortText = 'Twenty char note yes.';
    const shortResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Short', contentText: shortText, description: shortText },
    });
    expect(shortResponse.status()).toBe(201);
    const shortNote = await shortResponse.json();
    const shortChat = await ownerApi.post(`/api/notes/${shortNote.id}/chat`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(shortChat.status()).toBe(400);
    await expect(shortChat.json()).resolves.toMatchObject({
      message: 'Note is too short to chat about (needs at least 40 characters)',
    });

    // Trashed note → 400
    const trashResponse = await ownerApi.post(`/api/notes/${note.id}/trash`, { headers: ownerHeaders });
    expect([200, 204]).toContain(trashResponse.status());
    const trashedChat = await ownerApi.post(`/api/notes/${note.id}/chat`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(trashedChat.status()).toBe(400);
    await expect(trashedChat.json()).resolves.toMatchObject({ message: 'Restore the note before chatting' });

    // Foreign user → 404
    const foreignSignup = await foreignApi.post('/api/users/signup', {
      data: { email: foreignEmail, password, username: 'Chat Foreign' },
    });
    expect(foreignSignup.status()).toBe(201);
    const foreignAuth = await foreignSignup.json();
    const foreignChat = await foreignApi.post(`/api/notes/${note.id}/chat`, {
      headers: { Authorization: `Bearer ${foreignAuth.accessToken}` },
      data: { question: 'What about rollback?', history: [] },
    });
    expect(foreignChat.status()).toBe(404);
    await expect(foreignChat.json()).resolves.toMatchObject({ message: 'Note not found' });
  } finally {
    await ownerApi.dispose();
    await foreignApi.dispose();
  }
});
