import { test, expect, request as requestFactory } from '@playwright/test';

// WP-HARDEN-001 — backend hardening release coverage:
//   • centralized runtime validation (notes, notebooks, tags, AI payloads)
//   • PostgreSQL full-text search (with SQLite LIKE fallback)
//   • stable pagination (?page / ?limit / ?includeMeta / ?includeRank)
//   • per-user AI rate limits with a shared JSON/SSE chat budget
// Runs on both database drivers: the PostgreSQL-only tests skip when the
// suite is on the SQLite fallback (and vice versa), so the same file covers
// the CI PostgreSQL step and the local SQLite step.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'SmokePassword-123!';
const BODY = 'This is a sufficiently long note body for the AI guards, containing the marker quasarflux.'; // > 40 chars

async function signup(api, label) {
  const response = await api.post('/api/users/signup', {
    data: { email: `harden-${label}-${runId}@example.test`, password, username: `Harden ${label}` },
  });
  expect(response.status()).toBe(201);
  const { accessToken } = await response.json();
  return { Authorization: `Bearer ${accessToken}` };
}

async function createNote(api, headers, body = {}) {
  const response = await api.post('/api/notes', { headers, data: { contentText: BODY, ...body } });
  expect(response.status()).toBe(201);
  return response.json();
}

// Driver detection is memoized: one /api/health call for the whole file.
let driverPromise = null;
function getDriver(baseURL) {
  driverPromise ||= (async () => {
    const ctx = await requestFactory.newContext({ baseURL });
    try {
      const res = await ctx.get('/api/health');
      expect(res.ok()).toBeTruthy();
      return (await res.json()).database.driver; // 'PostgreSQL' | 'SQLite-fallback'
    } finally {
      await ctx.dispose();
    }
  })();
  return driverPromise;
}

function expectValidationEnvelope(response, fieldPrefix) {
  expect(response.status()).toBe(400);
  return expect(response.json()).resolves.toMatchObject({
    message: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: expect.arrayContaining([
      expect.objectContaining({ field: expect.stringMatching(new RegExp(`^${fieldPrefix}`)) }),
    ]),
  });
}

test.describe('runtime validation', () => {
  let api;
  let headers;
  let note;

  test.beforeAll(async ({ baseURL }) => {
    api = await requestFactory.newContext({ baseURL });
    headers = await signup(api, 'valid');
    note = await createNote(api, headers, { title: 'Validation base note' });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('note title over 500 characters returns a 400 validation error', async () => {
    const response = await api.post('/api/notes', { headers, data: { title: 'x'.repeat(501) } });
    await expectValidationEnvelope(response, 'title');
    const body = await response.json();
    expect(body.details[0].message).toBe('Title must be 500 characters or fewer');
  });

  test('invalid contentJson (array, not a TipTap object) returns 400', async () => {
    const response = await api.post('/api/notes', { headers, data: { contentJson: ['not', 'a', 'doc'] } });
    await expectValidationEnvelope(response, 'contentJson');
  });

  test('oversized serialized contentJson returns 400', async () => {
    const huge = { type: 'doc', content: [{ type: 'paragraph', text: 'x'.repeat(2 * 1024 * 1024 + 10) }] };
    const response = await api.post('/api/notes', { headers, data: { contentJson: huge } });
    await expectValidationEnvelope(response, 'contentJson');
  });

  test('invalid tagIds (non-strings, duplicates, too many) return 400', async () => {
    const dup = await api.put(`/api/notes/${note.id}`, { headers, data: { tagIds: ['a', 'a'] } });
    await expectValidationEnvelope(dup, 'tagIds');

    const typed = await api.put(`/api/notes/${note.id}`, { headers, data: { tagIds: [123] } });
    await expectValidationEnvelope(typed, 'tagIds');

    const tooMany = await api.put(`/api/notes/${note.id}`, { headers, data: { tagIds: Array.from({ length: 51 }, (_, i) => `tag-${i}`) } });
    await expectValidationEnvelope(tooMany, 'tagIds');
  });

  test('blank and control-character notebook names return 400', async () => {
    const blank = await api.post('/api/notebooks', { headers, data: { name: '   ' } });
    await expectValidationEnvelope(blank, 'name');
    expect((await blank.json()).details[0].message).toBe('Notebook name is required');

    const control = await api.post('/api/notebooks', { headers, data: { name: 'Bad\u0000Name' } });
    await expectValidationEnvelope(control, 'name');
    expect((await control.json()).details[0].message).toBe('Notebook name cannot contain control characters');

    const tooLong = await api.post('/api/notebooks', { headers, data: { name: 'n'.repeat(101) } });
    await expectValidationEnvelope(tooLong, 'name');
  });

  test('blank and control-character tag names return 400', async () => {
    const blank = await api.post('/api/tags', { headers, data: { name: '  ' } });
    await expectValidationEnvelope(blank, 'name');
    expect((await blank.json()).details[0].message).toBe('Tag name is required');

    const control = await api.post('/api/tags', { headers, data: { name: 'bad\u0007tag' } });
    await expectValidationEnvelope(control, 'name');
  });

  test('unknown mutable fields are rejected', async () => {
    const response = await api.post('/api/notes', { headers, data: { title: 'x', surprise: 'not allowed' } });
    await expectValidationEnvelope(response, 'surprise');
  });

  test('isPinned / isTrashed must be booleans', async () => {
    const pinned = await api.put(`/api/notes/${note.id}`, { headers, data: { isPinned: 'yes' } });
    await expectValidationEnvelope(pinned, 'isPinned');

    const trashed = await api.put(`/api/notes/${note.id}`, { headers, data: { isTrashed: 1 } });
    await expectValidationEnvelope(trashed, 'isTrashed');
  });

  test('client-provided trashedAt is rejected (server timestamps are authoritative)', async () => {
    const response = await api.put(`/api/notes/${note.id}`, { headers, data: { trashedAt: '1999-01-01T00:00:00.000Z' } });
    await expectValidationEnvelope(response, 'trashedAt');
  });

  test('malformed AI chat history returns 400 before any provider call', async () => {
    const badRole = await api.post(`/api/notes/${note.id}/chat`, {
      headers,
      data: { question: 'Valid question?', history: [{ role: 'system', content: 'no' }] },
    });
    await expectValidationEnvelope(badRole, 'history.0.role');

    const tooManyTurns = await api.post(`/api/notes/${note.id}/chat`, {
      headers,
      data: {
        question: 'Valid question?',
        history: Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` })),
      },
    });
    await expectValidationEnvelope(tooManyTurns, 'history');

    const tooLongTurn = await api.post(`/api/notes/${note.id}/chat`, {
      headers,
      data: { question: 'Valid question?', history: [{ role: 'user', content: 'y'.repeat(2001) }] },
    });
    await expectValidationEnvelope(tooLongTurn, 'history.0.content');
  });

  test('chat question longer than 2000 characters returns 400 with the legacy guard message', async () => {
    const response = await api.post(`/api/notes/${note.id}/chat`, {
      headers,
      data: { question: 'q'.repeat(2001), history: [] },
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ message: 'Ask a question (1–2000 characters)' });
  });

  test('invalid writing-assistant action returns 400', async () => {
    const response = await api.post(`/api/notes/${note.id}/assist`, {
      headers,
      data: { action: 'translate', text: 'some selection' },
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ message: 'Unknown assist action' });
  });

  test('duplicate notebook names keep the legacy 409 contract', async () => {
    const first = await api.post('/api/notebooks', { headers, data: { name: `dup ${runId}` } });
    expect(first.status()).toBe(201);
    const second = await api.post('/api/notebooks', { headers, data: { name: `dup ${runId}` } });
    expect(second.status()).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ message: 'A notebook with this name already exists' });
  });
});

test.describe('note-list pagination', () => {
  let api;
  let headers;

  test.beforeAll(async ({ baseURL }) => {
    api = await requestFactory.newContext({ baseURL });
    headers = await signup(api, 'page');
    for (let i = 0; i < 3; i += 1) {
      await createNote(api, headers, { title: `Paged note ${i} ${runId}` });
    }
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('default response remains a plain JSON array', async () => {
    const response = await api.get('/api/notes', { headers });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(3);
  });

  test('includeMeta=true returns { items, meta } with totals', async () => {
    const response = await api.get('/api/notes?includeMeta=true&page=1&limit=2', { headers });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(false);
    expect(body.items).toHaveLength(2);
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const secondPage = await api.get('/api/notes?includeMeta=true&page=2&limit=2', { headers });
    const second = await secondPage.json();
    expect(second.items).toHaveLength(1);
    expect(second.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  test('page/limit without includeMeta still paginate as a plain array', async () => {
    const response = await api.get('/api/notes?page=2&limit=2', { headers });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });

  test('invalid page/limit values return 400', async () => {
    const badPage = await api.get('/api/notes?page=0', { headers });
    await expectValidationEnvelope(badPage, 'page');

    const badLimit = await api.get('/api/notes?limit=101', { headers });
    await expectValidationEnvelope(badLimit, 'limit');

    const badLimitType = await api.get('/api/notes?limit=abc', { headers });
    await expectValidationEnvelope(badLimitType, 'limit');
  });

  test('pagination never returns another user’s notes', async ({ baseURL }) => {
    const otherApi = await requestFactory.newContext({ baseURL });
    try {
      const otherHeaders = await signup(otherApi, 'pageother');
      await createNote(otherApi, otherHeaders, { title: `Other user's paged note ${runId}` });

      const mine = await api.get('/api/notes?includeMeta=true&limit=100', { headers });
      const mineBody = await mine.json();
      expect(mineBody.meta.total).toBe(3);
      for (const item of mineBody.items) {
        expect(item.title).not.toContain("Other user's paged note");
      }
    } finally {
      await otherApi.dispose();
    }
  });
});

test.describe('search: SQLite LIKE fallback', () => {
  let api;
  let headers;

  test.beforeAll(async ({ baseURL }) => {
    api = await requestFactory.newContext({ baseURL });
    headers = await signup(api, 'sq');
    await createNote(api, headers, { title: 'SQLite searchable title', contentText: `zebra quarantine ${runId}` });
    await createNote(api, headers, { contentText: `Progress is at 100% complete for ${runId}` });
    await createNote(api, headers, { contentText: `100x checkpoint ${runId}` });
    await createNote(api, headers, { contentText: `Path is C:\\temp\\files\\${runId}` });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('substring search still works on title and body', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'SQLite-fallback', 'SQLite substring search runs only on the SQLite fallback driver');
    const byTitle = await api.get(`/api/notes?q=searchable`, { headers });
    expect(byTitle.status()).toBe(200);
    const titleMatches = await byTitle.json();
    expect(titleMatches.some((n) => n.title === 'SQLite searchable title')).toBe(true);

    const byBody = await api.get(`/api/notes?q=zebra`, { headers });
    expect(byBody.status()).toBe(200);
    expect((await byBody.json()).some((n) => n.contentText.includes('zebra quarantine'))).toBe(true);
  });

  test('literal % , _ and backslash characters stay safe', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'SQLite-fallback', 'SQLite substring search runs only on the SQLite fallback driver');
    const percent = await api.get(`/api/notes?q=100%25`, { headers });
    expect(percent.status()).toBe(200);
    const percentNotes = await percent.json();
    expect(percentNotes.some((n) => n.contentText.includes('100% complete'))).toBe(true);
    expect(percentNotes.some((n) => n.contentText.includes('100x checkpoint'))).toBe(false);

    const backslash = await api.get(`/api/notes?q=C%3A%5Ctemp`, { headers });
    expect(backslash.status()).toBe(200);
    expect((await backslash.json()).some((n) => n.contentText.includes('C:\\temp\\files'))).toBe(true);

    // `%` and `_` are matched literally — a note that does NOT contain them
    // must not appear when the query is only wildcards.
    const wildOnly = await api.get(`/api/notes?q=%25_`, { headers });
    expect(wildOnly.status()).toBe(200);
    expect(await wildOnly.json()).toHaveLength(0);
  });
});

test.describe('search: PostgreSQL full-text path', () => {
  let api;
  let headers;

  test.beforeAll(async ({ baseURL }) => {
    api = await requestFactory.newContext({ baseURL });
    headers = await signup(api, 'pg');
    // Three notes with the same searchable word, different content layouts.
    await createNote(api, headers, { title: 'Pulsar research notes', contentText: `pulsar ${runId} one` });
    await createNote(api, headers, { title: 'Unrelated', contentText: `pulsar pulsar ${runId} two` });
    await createNote(api, headers, { title: 'Also unrelated', contentText: `pulsar pulsar pulsar ${runId} three` });
    // Description-only note (contentText empty → description fallback).
    const desc = await api.post('/api/notes', { headers, data: { title: 'Filled via description', contentText: '', description: `pulsar ${runId} description-only` } });
    expect(desc.status()).toBe(201);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('search finds title, body, and description-fallback matches', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'PostgreSQL', 'PostgreSQL search path is exercised when the suite runs on PostgreSQL (CI service)');
    const response = await api.get(`/api/notes?q=pulsar&filter=all`, { headers });
    expect(response.status()).toBe(200);
    const notes = await response.json();
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.some((n) => n.title === 'Pulsar research notes')).toBe(true);
    expect(notes.some((n) => n.contentText.includes('description-only'))).toBe(true);
  });

  test('ranking is deterministic and relevance-ordered', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'PostgreSQL', 'PostgreSQL search path is exercised when the suite runs on PostgreSQL (CI service)');
    const first = await api.get(`/api/notes?q=pulsar&filter=all`, { headers });
    const second = await api.get(`/api/notes?q=pulsar&filter=all`, { headers });
    const idsA = (await first.json()).map((n) => n.id);
    const idsB = (await second.json()).map((n) => n.id);
    expect(idsA).toEqual(idsB);

    // The note with the most occurrences ranks above the single-occurrence one
    // when pinned state is equal (all unpinned here).
    const body = await second.json();
    const top = body.find((n) => n.title === 'Also unrelated');
    const low = body.find((n) => n.title === 'Pulsar research notes');
    expect(idsA.indexOf(top.id)).toBeLessThan(idsA.indexOf(low.id));
  });

  test('filters compose with search (notebook, tag, trash)', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'PostgreSQL', 'PostgreSQL search path is exercised when the suite runs on PostgreSQL (CI service)');
    const nb = await api.post('/api/notebooks', { headers, data: { name: `other nb ${runId}` } });
    expect(nb.status()).toBe(201);
    const otherNotebook = await nb.json();
    const inOtherResponse = await api.post('/api/notes', {
      headers,
      data: { title: 'Pulsar in other notebook', contentText: `pulsar ${runId} four`, notebookId: otherNotebook.id },
    });
    expect(inOtherResponse.status()).toBe(201);
    const inOther = await inOtherResponse.json();

    const byNotebook = await api.get(`/api/notes?q=pulsar&filter=all&notebookId=${otherNotebook.id}`, { headers });
    const nbNotes = await byNotebook.json();
    expect(nbNotes.length).toBe(1);
    expect(nbNotes[0].title).toBe('Pulsar in other notebook');

    const tg = await api.post('/api/tags', { headers, data: { name: `filter-tag-${runId}` } });
    expect(tg.status()).toBe(201);
    const filterTag = await tg.json();
    await api.put(`/api/notes/${inOther.id}`, { headers, data: { tagIds: [filterTag.id] } });
    const byTag = await api.get(`/api/notes?q=pulsar&filter=all&tagId=${filterTag.id}`, { headers });
    const tagNotes = await byTag.json();
    expect(tagNotes.length).toBe(1);

    // Trash composes: trashing the matching note removes it from the default
    // (active) search but keeps it in filter=all.
    await api.post(`/api/notes/${inOther.id}/trash`, { headers });
    const active = await api.get(`/api/notes?q=pulsar`, { headers });
    expect((await active.json()).some((n) => n.title === 'Pulsar in other notebook')).toBe(false);
    const all = await api.get(`/api/notes?q=pulsar&filter=all`, { headers });
    expect((await all.json()).some((n) => n.title === 'Pulsar in other notebook')).toBe(true);
  });

  test('query input cannot alter SQL behavior', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'PostgreSQL', 'PostgreSQL search path is exercised when the suite runs on PostgreSQL (CI service)');
    const hostile = await api.get(`/api/notes?q=${encodeURIComponent(`x' OR 1=1 --`)}&filter=all`, { headers });
    expect(hostile.status()).toBe(200); // no SQL error, no data leak
    const notes = await hostile.json();
    expect(Array.isArray(notes)).toBe(true);

    // Control query still works after the hostile one.
    const after = await api.get(`/api/notes?q=pulsar&filter=all`, { headers });
    expect(after.status()).toBe(200);
    expect((await after.json()).length).toBeGreaterThanOrEqual(4);
  });

  test('includeRank=true returns a rank field only when searching', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'PostgreSQL', 'PostgreSQL search path is exercised when the suite runs on PostgreSQL (CI service)');
    const ranked = await api.get(`/api/notes?q=pulsar&filter=all&includeRank=true`, { headers });
    expect(ranked.status()).toBe(200);
    const notes = await ranked.json();
    expect(notes.length).toBeGreaterThan(0);
    expect(typeof notes[0].rank).toBe('number');

    const unranked = await api.get(`/api/notes?q=pulsar&filter=all`, { headers });
    for (const note of await unranked.json()) {
      expect(note.rank).toBeUndefined();
    }

    const noQuery = await api.get(`/api/notes?includeRank=true`, { headers });
    expect(noQuery.status()).toBe(400);
    await expect(noQuery.json()).resolves.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('search metadata composes with pagination', async ({ baseURL }) => {
    test.skip((await getDriver(baseURL)) !== 'PostgreSQL', 'PostgreSQL search path is exercised when the suite runs on PostgreSQL (CI service)');
    const response = await api.get(`/api/notes?q=pulsar&filter=all&includeMeta=true&page=1&limit=2`, { headers });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.meta.total).toBeGreaterThanOrEqual(4);
    expect(body.meta.totalPages).toBe(Math.ceil(body.meta.total / 2));
  });
});

test.describe('per-user AI rate limits', () => {
  let api;
  let headersA;
  let headersB;
  let noteA;
  let noteB;

  test.beforeAll(async ({ baseURL }) => {
    api = await requestFactory.newContext({ baseURL });
    headersA = await signup(api, 'ratelimit-a');
    headersB = await signup(api, 'ratelimit-b');
    noteA = await createNote(api, headersA, { title: 'Budget A' });
    noteB = await createNote(api, headersB, { title: 'Budget B' });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('one user exhausting the chat budget does not block another authenticated user', async () => {
    // User A spends exactly the 5-per-15-minute chat budget.
    for (let i = 0; i < 5; i += 1) {
      const ok = await api.post(`/api/notes/${noteA.id}/chat`, {
        headers: headersA,
        data: { question: `Question number ${i}`, history: [] },
      });
      expect(ok.status()).toBe(200);
    }

    const blocked = await api.post(`/api/notes/${noteA.id}/chat`, {
      headers: headersA,
      data: { question: 'Sixth question', history: [] },
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['retry-after']).toBeTruthy();

    // User B is on a different budget: still 200.
    const fine = await api.post(`/api/notes/${noteB.id}/chat`, {
      headers: headersB,
      data: { question: 'Am I blocked?', history: [] },
    });
    expect(fine.status()).toBe(200);
  });

  test('JSON chat and SSE chat stream consume the same per-user budget', async () => {
    // The previous test exhausted user A; the stream endpoint must see the
    // same 429 instead of being an escape hatch.
    const streamed = await api.post(`/api/notes/${noteA.id}/chat/stream`, {
      headers: headersA,
      data: { question: 'Stream after budget?', history: [] },
    });
    expect(streamed.status()).toBe(429);
    expect(streamed.headers()['retry-after']).toBeTruthy();
  });
});

test.describe('regression smoke', () => {
  test('health, signup, note CRUD, pin, search, trash and restore still behave', async ({ baseURL }) => {
    const api = await requestFactory.newContext({ baseURL });
    try {
      const health = await api.get('/api/health');
      expect(health.ok()).toBeTruthy();
      const healthBody = await health.json();
      expect(['PostgreSQL', 'SQLite-fallback']).toContain(healthBody.database.driver);

      const headers = await signup(api, 'regress');
      const created = await createNote(api, headers, { title: `Regression note ${runId}` });
      expect(created.title).toBe(`Regression note ${runId}`);

      const updated = await api.put(`/api/notes/${created.id}`, { headers, data: { isPinned: true } });
      expect(updated.status()).toBe(200);
      expect((await updated.json()).isPinned).toBe(true);

      const list = await api.get('/api/notes?includeMeta=true', { headers });
      expect((await list.json()).meta.total).toBe(1);

      const search = await api.get(`/api/notes?q=${encodeURIComponent('Regression note')}`, { headers });
      expect((await search.json()).some((n) => n.id === created.id)).toBe(true);

      await api.post(`/api/notes/${created.id}/trash`, { headers });
      expect((await api.get('/api/notes?filter=trash', { headers })).ok()).toBeTruthy();
      await api.post(`/api/notes/${created.id}/restore`, { headers });
      const restored = await api.get('/api/notes?includeMeta=true', { headers });
      expect((await restored.json()).meta.total).toBe(1);
    } finally {
      await api.dispose();
    }
  });
});
