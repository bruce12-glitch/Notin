import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

const longBody = [
  'Product planning begins with a weekly customer review and a written decision log for every release milestone.',
  'The team compares onboarding feedback, support trends, and editor reliability before selecting the next measurable priority.',
  'Each proposal names an owner, a deadline, and the evidence required to decide whether the change should ship.',
  'Design and engineering record follow-up ideas in the same note so the next planning session starts with shared context.',
].join(' ');

const planningBody = [
  'Planning coordinates the quarterly roadmap, customer research, release readiness, and the ownership of follow-up work.',
  'Planning notes capture decisions from the product meeting and explain which editor improvements are ready for validation.',
  'The group reviews open risks, assigns measurable outcomes, and records a rollback option before committing to delivery.',
].join(' ');

test('AI tag suggestions enforce guards, map existing tags, and never write tags', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({ baseURL });
  const foreignApi = await requestFactory.newContext({ baseURL });
  const ownerEmail = `ai-tags-owner-${runId}@example.test`;
  const foreignEmail = `ai-tags-foreign-${runId}@example.test`;

  try {
    const signup = await ownerApi.post('/api/users/signup', {
      data: { email: ownerEmail, password, username: 'Tags Owner' },
    });
    expect(signup.status()).toBe(201);
    const { accessToken } = await signup.json();
    const ownerHeaders = { Authorization: `Bearer ${accessToken}` };

    const noteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: `Tag suggestions ${runId}`, contentText: longBody, description: longBody },
    });
    expect(noteResponse.status()).toBe(201);
    const note = await noteResponse.json();
    expect(note.tags).toEqual([]);

    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/suggest-tags`);
    expect(unauthenticated.status()).toBe(401);

    const suggestionsResponse = await ownerApi.post(`/api/notes/${note.id}/suggest-tags`, {
      headers: ownerHeaders,
    });
    expect(suggestionsResponse.status()).toBe(200);
    const payload = await suggestionsResponse.json();
    expect(['groq', 'mock']).toContain(payload.provider);
    expect(Array.isArray(payload.tags)).toBe(true);
    expect(payload.tags.length).toBeGreaterThanOrEqual(3);
    expect(payload.tags.length).toBeLessThanOrEqual(5);
    for (const tag of payload.tags) {
      expect(tag).toEqual(expect.objectContaining({ name: expect.any(String) }));
      expect(tag.name.length).toBeGreaterThan(0);
      expect(tag.name.length).toBeLessThanOrEqual(25);
      expect(tag.existing === null || typeof tag.existing === 'string').toBe(true);
    }

    // Suggestion is read-only: it must neither create tags nor attach them.
    const notesResponse = await ownerApi.get('/api/notes', { headers: ownerHeaders });
    expect(notesResponse.status()).toBe(200);
    const notes = await notesResponse.json();
    expect(notes.find((item) => item.id === note.id)?.tags).toEqual([]);
    const tagsAfterSuggestion = await ownerApi.get('/api/tags', { headers: ownerHeaders });
    expect(tagsAfterSuggestion.status()).toBe(200);
    expect(await tagsAfterSuggestion.json()).toEqual([]);

    const createTag = await ownerApi.post('/api/tags', {
      headers: ownerHeaders,
      data: { name: 'planning' },
    });
    expect(createTag.status()).toBe(201);
    const planningTag = await createTag.json();

    const secondNoteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: `Planning suggestions ${runId}`, contentText: planningBody, description: planningBody },
    });
    expect(secondNoteResponse.status()).toBe(201);
    const secondNote = await secondNoteResponse.json();
    const mappedResponse = await ownerApi.post(`/api/notes/${secondNote.id}/suggest-tags`, {
      headers: ownerHeaders,
    });
    expect(mappedResponse.status()).toBe(200);
    const mappedPayload = await mappedResponse.json();
    const planningSuggestions = mappedPayload.tags.filter(
      (tag) => tag.name.toLowerCase() === 'planning',
    );
    for (const suggestion of planningSuggestions) {
      expect(suggestion.existing).toBe(planningTag.id);
    }

    const shortBody = 'x'.repeat(30);
    const shortNoteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: `Short tag note ${runId}`, contentText: shortBody, description: shortBody },
    });
    expect(shortNoteResponse.status()).toBe(201);
    const shortNote = await shortNoteResponse.json();
    const shortSuggestion = await ownerApi.post(`/api/notes/${shortNote.id}/suggest-tags`, {
      headers: ownerHeaders,
    });
    expect(shortSuggestion.status()).toBe(400);
    await expect(shortSuggestion.json()).resolves.toMatchObject({
      message: 'Note is too short to tag (needs at least 100 characters)',
    });

    const foreignSignup = await foreignApi.post('/api/users/signup', {
      data: { email: foreignEmail, password, username: 'Tags Foreign' },
    });
    expect(foreignSignup.status()).toBe(201);
    const foreignAuth = await foreignSignup.json();
    const foreignSuggestion = await foreignApi.post(`/api/notes/${note.id}/suggest-tags`, {
      headers: { Authorization: `Bearer ${foreignAuth.accessToken}` },
    });
    expect(foreignSuggestion.status()).toBe(404);
    await expect(foreignSuggestion.json()).resolves.toMatchObject({ message: 'Note not found' });
  } finally {
    await ownerApi.dispose();
    await foreignApi.dispose();
  }
});
