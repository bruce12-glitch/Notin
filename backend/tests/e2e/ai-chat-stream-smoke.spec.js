import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';

const chatBody = [
  'The release checklist now requires a rollback rehearsal before any editor change ships to production.',
  'Support tickets grew twelve percent this week, driven mostly by the new import wizard errors.',
  'Onboarding drop-off continues at the notebook creation step, so the team will prototype a template gallery.',
].join(' ');

// WP-AI-003b shares ONE chatLimit budget (5 requests / 15 min) between the
// JSON chat endpoint and the SSE transport — per authenticated USER since the
// hardening release, so budgets are isolated per account even when the whole
// suite shares one server process. This spec's owner needs exactly 5
// limiter-counted calls (stream 200, JSON parity 200, empty-question,
// short-note, trashed) and the foreign 404 uses its own user; the
// X-Forwarded-For headers are harmless leftovers from the old per-IP keys and
// are ignored now. No production behavior is relaxed.
function pseudoIp(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 200) + 10}`; // TEST-NET-3, never routed
}
const ownerIp = pseudoIp(`${runId}-owner`);
const foreignIp = pseudoIp(`${runId}-foreign`);

function parseSseBody(bodyText) {
  const payloads = bodyText
    .split('\n\n')
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => frame.slice(5).trim());
  const deltas = [];
  let frameError = null;
  for (const payload of payloads) {
    if (payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed.delta === 'string') deltas.push(parsed.delta);
      if (typeof parsed.error === 'string') frameError = parsed.error;
    } catch {
      // malformed frame — none expected in this spec
    }
  }
  return { payloads, deltas, frameError };
}

test('Note chat stream is SSE with auth, ownership, guards, and JSON parity', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Forwarded-For': ownerIp },
  });
  const foreignApi = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Forwarded-For': foreignIp },
  });
  const ownerEmail = `ai-chat-stream-owner-${runId}@example.test`;
  const foreignEmail = `ai-chat-stream-foreign-${runId}@example.test`;

  try {
    const signup = await ownerApi.post('/api/users/signup', {
      data: { email: ownerEmail, password, username: 'Chat Stream Owner' },
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

    // Unauthenticated → 401 as a plain JSON error, before any SSE upgrade
    // (rate limiter never sees this call: auth middleware rejects first).
    const unauthenticated = await ownerApi.post(`/api/notes/${note.id}/chat/stream`, {
      data: { question: 'What about rollback?', history: [] },
    });
    expect(unauthenticated.status()).toBe(401);
    expect(unauthenticated.headers()['content-type']).toContain('application/json');
    await expect(unauthenticated.json()).resolves.toMatchObject({ message: 'Unauthorized' });

    // Authenticated → 200 SSE: ≥1 {"delta":…} frame, terminating [DONE]
    const streamResponse = await ownerApi.post(`/api/notes/${note.id}/chat/stream`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(streamResponse.status()).toBe(200);
    expect(streamResponse.headers()['content-type']).toContain('text/event-stream');
    expect(streamResponse.headers()['cache-control']).toContain('no-cache');
    const streamBody = await streamResponse.text();
    expect(streamBody).toContain('data: {"delta":"');
    const { payloads, deltas, frameError } = parseSseBody(streamBody);
    expect(frameError).toBeNull();
    expect(payloads[payloads.length - 1]).toBe('[DONE]');
    expect(deltas.length).toBeGreaterThanOrEqual(1);
    const assembled = deltas.join('');

    // Determinism lock: in keyless mock mode the assembled deltas must equal
    // the JSON endpoint's answer for the same question byte-for-byte.
    const jsonChat = await ownerApi.post(`/api/notes/${note.id}/chat`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(jsonChat.status()).toBe(200);
    expect(jsonChat.headers()['content-type']).toContain('application/json');
    const jsonPayload = await jsonChat.json();
    expect(jsonPayload.answer).toEqual(expect.any(String));
    expect(['groq', 'mock']).toContain(jsonPayload.provider);
    if (jsonPayload.provider === 'mock') {
      expect(assembled).toBe(jsonPayload.answer);
      expect(assembled).toContain('Based on the note:');
      expect(assembled.toLowerCase()).toContain('rollback');
    } else {
      expect(assembled.length).toBeGreaterThan(0);
      expect(assembled.length).toBeLessThanOrEqual(800);
    }

    // The stream endpoint is read-only: no note UPDATE, no transcript rows.
    const notesResponse = await ownerApi.get('/api/notes', { headers: ownerHeaders });
    expect(notesResponse.status()).toBe(200);
    const notes = await notesResponse.json();
    const stored = notes.find((item) => item.id === note.id);
    expect(stored).toBeTruthy();
    expect(stored.title).toBe('Ops review');
    expect(stored.contentText).toBe(chatBody);
    expect(stored.summary == null || stored.summary === '').toBe(true);

    // Guard matrix mirrors the JSON spec — all answered as plain JSON before
    // the stream upgrade. Owner budget check: 5 limiter-counted calls total
    // (stream 200, JSON parity, empty question, short note, trashed).
    const emptyQuestion = await ownerApi.post(`/api/notes/${note.id}/chat/stream`, {
      headers: ownerHeaders,
      data: { question: '   ', history: [] },
    });
    expect(emptyQuestion.status()).toBe(400);
    expect(emptyQuestion.headers()['content-type']).toContain('application/json');
    await expect(emptyQuestion.json()).resolves.toMatchObject({ message: 'Ask a question (1–2000 characters)' });

    // Too-short note → 400
    const shortText = 'Twenty char note yes.';
    const shortResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: 'Short', contentText: shortText, description: shortText },
    });
    expect(shortResponse.status()).toBe(201);
    const shortNote = await shortResponse.json();
    const shortChat = await ownerApi.post(`/api/notes/${shortNote.id}/chat/stream`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(shortChat.status()).toBe(400);
    expect(shortChat.headers()['content-type']).toContain('application/json');
    await expect(shortChat.json()).resolves.toMatchObject({
      message: 'Note is too short to chat about (needs at least 40 characters)',
    });

    // Foreign user → 404 (ownership guard; runs on its own limiter address)
    const foreignSignup = await foreignApi.post('/api/users/signup', {
      data: { email: foreignEmail, password, username: 'Chat Stream Foreign' },
    });
    expect(foreignSignup.status()).toBe(201);
    const foreignAuth = await foreignSignup.json();
    const foreignChat = await foreignApi.post(`/api/notes/${note.id}/chat/stream`, {
      headers: { Authorization: `Bearer ${foreignAuth.accessToken}` },
      data: { question: 'What about rollback?', history: [] },
    });
    expect(foreignChat.status()).toBe(404);
    expect(foreignChat.headers()['content-type']).toContain('application/json');
    await expect(foreignChat.json()).resolves.toMatchObject({ message: 'Note not found' });

    // Trashed note → 400
    const trashResponse = await ownerApi.post(`/api/notes/${note.id}/trash`, { headers: ownerHeaders });
    expect([200, 204]).toContain(trashResponse.status());
    const trashedChat = await ownerApi.post(`/api/notes/${note.id}/chat/stream`, {
      headers: ownerHeaders,
      data: { question: 'What about rollback?', history: [] },
    });
    expect(trashedChat.status()).toBe(400);
    expect(trashedChat.headers()['content-type']).toContain('application/json');
    await expect(trashedChat.json()).resolves.toMatchObject({ message: 'Restore the note before chatting' });
  } finally {
    await ownerApi.dispose();
    await foreignApi.dispose();
  }
});
