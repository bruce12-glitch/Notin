import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

const longBody = [
  'The product team is planning a calmer weekly review process for the next quarter.',
  'Each Monday, the team will review customer feedback, choose one measurable priority, and assign a clear owner before work begins.',
  'The research group will publish a short findings note every Wednesday so engineering and design can respond to evidence rather than assumptions.',
  'A Friday check-in will record what shipped, what was learned, and which decisions should be revisited in the next planning cycle.',
  'The team also agreed to protect two afternoons for focused work and to keep urgent requests in a shared queue instead of interrupting individual contributors.',
].join(' ');

test('AI note summarization enforces auth, ownership, length, and persistence', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({ baseURL });
  const foreignApi = await requestFactory.newContext({ baseURL });
  const ownerEmail = `ai-owner-${runId}@example.test`;
  const foreignEmail = `ai-foreign-${runId}@example.test`;

  try {
    const signup = await ownerApi.post('/api/users/signup', {
      data: { email: ownerEmail, password, username: 'AI Owner' },
    });
    expect(signup.status()).toBe(201);
    const { accessToken } = await signup.json();
    const ownerHeaders = { Authorization: `Bearer ${accessToken}` };

    const noteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: `AI smoke note ${runId}`, contentText: longBody, description: longBody },
    });
    expect(noteResponse.status()).toBe(201);
    const note = await noteResponse.json();

    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/summarize`);
    expect(unauthenticated.status()).toBe(401);

    const summaryResponse = await ownerApi.post(`/api/notes/${note.id}/summarize`, { headers: ownerHeaders });
    expect(summaryResponse.status()).toBe(200);
    const summaryPayload = await summaryResponse.json();
    expect(summaryPayload.summary).toEqual(expect.any(String));
    expect(summaryPayload.summary.length).toBeGreaterThan(0);
    expect(['groq', 'mock']).toContain(summaryPayload.provider);

    const notesResponse = await ownerApi.get('/api/notes', { headers: ownerHeaders });
    expect(notesResponse.status()).toBe(200);
    const notes = await notesResponse.json();
    expect(notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: note.id, summary: summaryPayload.summary }),
    ]));

    const shortBody = 'Short note for AI testing with exactly fifty char.';
    expect(shortBody.length).toBe(50);
    const shortNoteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: `Short AI note ${runId}`, contentText: shortBody, description: shortBody },
    });
    expect(shortNoteResponse.status()).toBe(201);
    const shortNote = await shortNoteResponse.json();
    const shortSummaryResponse = await ownerApi.post(`/api/notes/${shortNote.id}/summarize`, { headers: ownerHeaders });
    expect(shortSummaryResponse.status()).toBe(400);
    await expect(shortSummaryResponse.json()).resolves.toMatchObject({
      message: 'Note is too short to summarize (needs at least 200 characters)',
    });

    const foreignSignup = await foreignApi.post('/api/users/signup', {
      data: { email: foreignEmail, password, username: 'AI Foreign' },
    });
    expect(foreignSignup.status()).toBe(201);
    const foreignAuth = await foreignSignup.json();
    const foreignSummaryResponse = await foreignApi.post(`/api/notes/${note.id}/summarize`, {
      headers: { Authorization: `Bearer ${foreignAuth.accessToken}` },
    });
    expect(foreignSummaryResponse.status()).toBe(404);
    await expect(foreignSummaryResponse.json()).resolves.toMatchObject({ message: 'Note not found' });
  } finally {
    await ownerApi.dispose();
    await foreignApi.dispose();
  }
});
