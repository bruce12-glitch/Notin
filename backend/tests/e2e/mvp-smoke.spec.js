import fs from 'node:fs';
import path from 'node:path';
import { test, expect, request as requestFactory } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `notin-e2e-${runId}@example.test`;
const notebookName = `QA Notebook ${runId}`;
const tagName = `qa-tag-${runId}`;
const noteTitle = `QA smoke note ${runId}`;
const searchToken = `SearchToken${runId.replace(/[^a-z0-9]/gi, '')}`;
const noteBody = `Persistent smoke-test body containing ${searchToken}.`;

function noteRow(page) {
  return page.locator('.app-note-item', { hasText: noteTitle });
}

test('health endpoint reports the unified API is ready', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    service: 'notin-api',
  });
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: 'Notin — Your Second Brain',
    start_url: '/app.html',
    display: 'standalone',
  });
  expect((await request.get('/sw.js')).ok()).toBeTruthy();
  expect((await request.get('/icons/icon-192.png')).ok()).toBeTruthy();
  expect((await request.get('/icons/icon-512.png')).ok()).toBeTruthy();
});

test('MVP journey: OTP, note persistence, organize, search, share, pin, trash, restore, logout', async ({ page, request, browser }) => {
  test.setTimeout(60_000);

  const authHealth = await request.get('/api/auth/health');
  expect(authHealth.ok()).toBeTruthy();
  const authState = await authHealth.json();
  test.skip(
    !authState.demoMode,
    'Demo OTP is unavailable. Run with NODE_ENV!=production and without SMTP to exercise code 123456.',
  );

  // Auth is UI-driven. The unique throwaway email keeps runs independent.
  await page.goto('/');
  await page.locator('#email').fill(email);
  await expect(page.locator('#continueBtn')).toBeEnabled();
  await page.locator('#continueBtn').click();
  await expect(page.locator('#otpStep')).toBeVisible();
  await page.locator('#otpInput').fill('123456');
  await page.locator('#otpVerifyBtn').click();
  await expect(page).toHaveURL(/\/app\.html#\/home$/);
  await expect(page.locator('#appEmail')).toHaveText(email);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.locator('#navHome')).toHaveClass(/is-active/);
  await expect(page.locator('#homeCreateNote')).toBeEnabled();

  // Create notebook and tag through their real sidebar routes before creating
  // the note. New notes inherit the active notebook; the tag is attached later.
  await page.locator('#navNotebooks').click();
  await expect(page).toHaveURL(/#\/notebooks$/);
  await page.locator('#newNotebookBtn').click();
  await page.locator('#newNotebookInput').fill(notebookName);
  await page.locator('#newNotebookAdd').click();
  await expect(page.locator('#listTitle')).toHaveText(notebookName);

  await page.locator('#navTags').click();
  await expect(page).toHaveURL(/#\/tags$/);
  await page.locator('#newTagBtn').click();
  await page.locator('#newTagInput').fill(tagName);
  await page.locator('#newTagAdd').click();
  await expect(page.locator('#listTitle')).toHaveText(`#${tagName}`);
  // Toggle the new (empty) tag filter off while retaining the notebook filter.
  await page.locator('#tagList .app-nb-item', { hasText: tagName }).locator('.app-nb-open').click();
  await expect(page.locator('#listTitle')).toHaveText(notebookName);

  // Create through the global + Note action, then explicitly save through TipTap.
  await page.locator('#sidebarNewNote').click();
  await expect(page).toHaveURL(/#\/notes$/);
  await expect(page.locator('#editorTitle')).toBeEnabled();
  await page.locator('#editorTitle').fill(noteTitle);
  const editor = page.locator('#tiptapEditor .ProseMirror');
  await expect(editor).toBeEditable();
  await editor.fill(noteBody);
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await expect(noteRow(page)).toBeVisible();

  // Attach a generated 1x1 PNG through the UI (no binary fixture is committed).
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/attachments') && response.request().method() === 'POST'),
    page.locator('#attachImageInput').setInputFiles({ name: `pixel-${runId}.png`, mimeType: 'image/png', buffer: imageBytes }),
  ]);
  expect(uploadResponse.status()).toBe(201);
  const ownerAuthorization = uploadResponse.request().headers().authorization;
  const [uploadedAttachment] = await uploadResponse.json();
  const attachmentCard = page.locator(`[data-attachment-id="${uploadedAttachment.id}"]`);
  await expect(attachmentCard).toBeVisible();
  await expect(attachmentCard.locator('img')).toBeVisible();
  await expect.poll(() => attachmentCard.locator('img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  // A second authenticated user cannot fetch another user's image bytes.
  const otherEmail = `notin-e2e-other-${runId}@example.test`;
  const otherChallengeResponse = await request.post('/api/auth/otp/demo-request', { data: { email: otherEmail } });
  expect(otherChallengeResponse.ok()).toBeTruthy();
  const otherChallenge = await otherChallengeResponse.json();
  const otherAuthResponse = await request.post('/api/auth/otp/verify', { data: { challenge: otherChallenge.challenge, code: '123456' } });
  expect(otherAuthResponse.ok()).toBeTruthy();
  const otherAuth = await otherAuthResponse.json();
  const otherAuthorization = `Bearer ${otherAuth.accessToken || otherAuth.token}`;
  const forbiddenFile = await request.get(uploadedAttachment.url, { headers: { Authorization: otherAuthorization } });
  expect(forbiddenFile.status()).toBe(404);

  // The foreign user cannot create a share for the owner's note.
  const foreignShare = await request.post(`/api/notes/${uploadedAttachment.noteId}/share`, { headers: { Authorization: otherAuthorization } });
  expect(foreignShare.status()).toBe(404);

  // Create the share through the owner UI, then open it in a fresh logged-out context.
  const [shareResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/notes/${uploadedAttachment.noteId}/share`) && response.request().method() === 'POST'),
    page.locator('#shareBtn').click(),
  ]);
  expect(shareResponse.status()).toBe(201);
  let share = await shareResponse.json();
  await expect(page.locator('#shareLinkInput')).toHaveValue(share.url);
  const publicPayloadResponse = await request.get(`/api/public/share/${share.token}`);
  expect(publicPayloadResponse.ok()).toBeTruthy();
  const publicPayload = await publicPayloadResponse.json();
  expect(publicPayload).toMatchObject({ title: noteTitle, contentText: noteBody });
  expect(publicPayload.images).toHaveLength(1);
  const publicImage = await request.get(publicPayload.images[0].url);
  expect(publicImage.ok()).toBeTruthy();
  expect(publicImage.headers()['content-type']).toContain('image/png');

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(share.url);
  await expect(publicPage.locator('#sharedTitle')).toHaveText(noteTitle);
  await expect(publicPage.locator('#sharedBody')).toContainText(noteBody);
  await expect(publicPage.locator('#sharedImages img')).toHaveCount(1);
  await expect.poll(() => publicPage.locator('#sharedImages img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await publicContext.close();

  // Assign and filter by tag using the shipped editor/sidebar controls.
  await page.locator('#tagAddSelect').selectOption({ label: tagName });
  await expect(page.locator('#tagChips')).toContainText(tagName);
  await page.locator('#navTags').click();
  await page.locator('#tagList .app-nb-item', { hasText: tagName }).locator('.app-nb-open').click();
  await expect(page.locator('#listTitle')).toHaveText(`#${tagName}`);
  await expect(noteRow(page)).toBeVisible();

  // Notebook filter also contains the note.
  await page.locator('#navNotebooks').click();
  const notebookRow = page.locator('#notebookList .app-nb-item', { hasText: notebookName });
  await notebookRow.locator('.app-nb-open').click();
  await expect(notebookRow).toHaveClass(/is-active/);
  await expect(noteRow(page)).toBeVisible();

  // Pin from the editor and assert both state and pin-first list placement.
  await page.locator('#pinBtn').click();
  await expect(page.locator('#pinBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app-note-item').first()).toContainText(noteTitle);
  await expect(noteRow(page)).toHaveClass(/is-pinned/);

  // A hard reload proves refresh-cookie bootstrap and database persistence.
  await page.reload();
  await expect(page).toHaveURL(/\/app\.html#\/notebooks$/);
  await expect(noteRow(page)).toBeVisible();
  await noteRow(page).click();
  await expect(page.locator('#editorTitle')).toHaveValue(noteTitle);
  await expect(page.locator('#tiptapEditor .ProseMirror')).toContainText(noteBody);
  const persistedAttachment = page.locator(`[data-attachment-id="${uploadedAttachment.id}"]`);
  await expect(persistedAttachment).toBeVisible();
  await expect(persistedAttachment.locator('img')).toBeVisible();
  await expect.poll(() => persistedAttachment.locator('img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  // Rotate after reload so this browser session can later exercise the Revoke UI.
  const firstShareToken = share.token;
  const [rotatedShareResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/notes/${uploadedAttachment.noteId}/share`) && response.request().method() === 'POST'),
    page.locator('#shareBtn').click(),
  ]);
  expect(rotatedShareResponse.status()).toBe(201);
  share = await rotatedShareResponse.json();
  expect((await request.get(`/api/public/share/${firstShareToken}`)).status()).toBe(404);
  expect((await request.get(`/api/public/share/${share.token}`)).ok()).toBeTruthy();

  // Search is UI-driven and waits for the product's 300 ms debounce.
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/notes?') && response.url().includes(`q=${searchToken}`) && response.ok()),
    page.locator('#searchInput').fill(searchToken),
  ]);
  await expect(noteRow(page)).toBeVisible();
  await expect(page.locator('.app-note-item')).toHaveCount(1);
  await page.locator('#searchClear').click();
  await expect(page.locator('#searchInput')).toHaveValue('');

  // Trash, verify absence from All Notes, then restore from Trash.
  await page.locator('#trashBtn').click();
  await expect(noteRow(page)).toHaveCount(0);
  const trashedShare = await request.get(`/api/public/share/${share.token}`);
  expect(trashedShare.status()).toBe(404);
  await page.locator('#navAllNotes').click();
  await expect(noteRow(page)).toHaveCount(0);
  await page.locator('#navTrash').click();
  await expect(noteRow(page)).toBeVisible();
  await noteRow(page).click();
  await expect(page.locator('#restoreBtn')).toBeVisible();
  await expect(page.locator(`[data-attachment-id="${uploadedAttachment.id}"]`)).toBeVisible();
  await page.locator('#restoreBtn').click();
  await expect(page.locator('#listTitle')).toHaveText('All Notes');
  await expect(noteRow(page)).toBeVisible();
  const restoredShare = await request.get(`/api/public/share/${share.token}`);
  expect(restoredShare.ok()).toBeTruthy();

  // Revoke through the owner UI; the same secret immediately becomes invalid.
  await expect(page.locator('#sharePanel')).toBeVisible();
  const [revokeResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/notes/${uploadedAttachment.noteId}/share`) && response.request().method() === 'DELETE'),
    page.locator('#revokeShareBtn').click(),
  ]);
  expect(revokeResponse.status()).toBe(204);
  await expect(page.locator('#shareStatus')).toHaveText('Link revoked');
  const revokedShare = await request.get(`/api/public/share/${share.token}`);
  expect(revokedShare.status()).toBe(404);

  // Permanent deletion removes attachment metadata/file access as well.
  await page.locator('#trashBtn').click();
  await page.locator('#navTrash').click();
  await expect(noteRow(page)).toBeVisible();
  await noteRow(page).click();
  await page.locator('#deleteBtn').click();
  await expect(page.locator('#deleteModal')).toBeVisible();
  await page.locator('#modalConfirm').click();
  await expect(noteRow(page)).toHaveCount(0);
  const deletedFile = await request.get(uploadedAttachment.url, { headers: { Authorization: ownerAuthorization } });
  expect(deletedFile.status()).toBe(404);

  // Logout revokes the refresh session and the app can no longer remain open.
  await page.locator('#logoutBtn').click();
  await expect(page).toHaveURL(/\/login\.html$/);
  await page.goto('/app.html');
  await expect(page).toHaveURL(/\/login\.html$/);
});

test('account export and confirmed deletion wipe owned data without affecting another user', async ({ baseURL }) => {
  const ownerApi = await requestFactory.newContext({ baseURL });
  const otherApi = await requestFactory.newContext({ baseURL });
  const ownerEmail = `account-owner-${runId}@example.test`;
  const otherEmail = `account-other-${runId}@example.test`;
  const password = 'SmokePassword-123!';
  const checksLocalDisk = ['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname);
  const uploadDirectory = path.resolve('uploads');
  const filesBefore = checksLocalDisk && fs.existsSync(uploadDirectory) ? new Set(fs.readdirSync(uploadDirectory)) : new Set();
  let uploadedDiskFile = null;

  try {
    const ownerSignup = await ownerApi.post('/api/users/signup', { data: { email: ownerEmail, password, username: 'Export Owner' } });
    expect(ownerSignup.status()).toBe(201);
    const ownerAuth = await ownerSignup.json();
    const ownerAuthorization = `Bearer ${ownerAuth.accessToken}`;
    const ownerHeaders = { Authorization: ownerAuthorization };

    const notebookResponse = await ownerApi.post('/api/notebooks', { headers: ownerHeaders, data: { name: `Export Notebook ${runId}` } });
    expect(notebookResponse.status()).toBe(201);
    const notebook = await notebookResponse.json();
    const tagResponse = await ownerApi.post('/api/tags', { headers: ownerHeaders, data: { name: `export-tag-${runId}` } });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();

    const noteResponse = await ownerApi.post('/api/notes', {
      headers: ownerHeaders,
      data: { title: `Export Note ${runId}`, contentText: 'Exported account body', description: 'Exported account body', notebookId: notebook.id },
    });
    expect(noteResponse.status()).toBe(201);
    let note = await noteResponse.json();
    const taggedNoteResponse = await ownerApi.put(`/api/notes/${note.id}`, { headers: ownerHeaders, data: { tagIds: [tag.id], isPinned: true } });
    expect(taggedNoteResponse.ok()).toBeTruthy();
    note = await taggedNoteResponse.json();

    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const attachmentResponse = await ownerApi.post(`/api/notes/${note.id}/attachments`, {
      headers: ownerHeaders,
      multipart: { images: { name: `account-${runId}.png`, mimeType: 'image/png', buffer: imageBytes } },
    });
    expect(attachmentResponse.status()).toBe(201);
    const [attachment] = await attachmentResponse.json();
    if (checksLocalDisk) {
      const newFiles = fs.readdirSync(uploadDirectory).filter((file) => !filesBefore.has(file));
      expect(newFiles).toHaveLength(1);
      [uploadedDiskFile] = newFiles;
    }

    const shareResponse = await ownerApi.post(`/api/notes/${note.id}/share`, { headers: ownerHeaders });
    expect(shareResponse.status()).toBe(201);
    const share = await shareResponse.json();

    const exportResponse = await ownerApi.get('/api/users/me/export', { headers: ownerHeaders });
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()['content-disposition']).toContain('attachment; filename="notin-export-');
    const exported = await exportResponse.json();
    expect(exported.user).toMatchObject({ email: ownerEmail, username: 'Export Owner' });
    expect(exported.user).not.toHaveProperty('password');
    expect(exported.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: note.id, title: `Export Note ${runId}`, contentText: 'Exported account body', isPinned: true, tags: [expect.objectContaining({ id: tag.id })] }),
    ]));
    expect(exported.notebooks).toEqual(expect.arrayContaining([expect.objectContaining({ id: notebook.id })]));
    expect(exported.tags).toEqual(expect.arrayContaining([expect.objectContaining({ id: tag.id })]));
    expect(exported.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ id: attachment.id, noteId: note.id, mime: 'image/png' })]));

    const wrongConfirm = await ownerApi.delete('/api/users/me', { headers: ownerHeaders, data: { confirm: 'delete' } });
    expect(wrongConfirm.status()).toBe(400);
    expect((await ownerApi.get('/api/notes', { headers: ownerHeaders })).ok()).toBeTruthy();

    const otherSignup = await otherApi.post('/api/users/signup', { data: { email: otherEmail, password } });
    expect(otherSignup.status()).toBe(201);
    const otherAuth = await otherSignup.json();
    const otherHeaders = { Authorization: `Bearer ${otherAuth.accessToken}` };
    const otherNote = await otherApi.post('/api/notes', { headers: otherHeaders, data: { title: `Other user ${runId}` } });
    expect(otherNote.status()).toBe(201);

    const deleteResponse = await ownerApi.delete('/api/users/me', { headers: ownerHeaders, data: { confirm: 'DELETE' } });
    expect(deleteResponse.status()).toBe(204);
    if (checksLocalDisk) expect(fs.existsSync(path.join(uploadDirectory, uploadedDiskFile))).toBeFalsy();

    expect((await ownerApi.get('/api/notes', { headers: ownerHeaders })).status()).toBe(401);
    expect((await ownerApi.post('/api/auth/refresh')).status()).toBe(401);
    expect((await ownerApi.post('/api/users/signin', { data: { email: ownerEmail, password } })).status()).toBe(404);
    expect((await ownerApi.get(`/api/public/share/${share.token}`)).status()).toBe(404);
    expect((await ownerApi.get(attachment.url, { headers: ownerHeaders })).status()).toBe(401);

    const otherNotesResponse = await otherApi.get('/api/notes', { headers: otherHeaders });
    expect(otherNotesResponse.ok()).toBeTruthy();
    const otherNotes = await otherNotesResponse.json();
    expect(otherNotes).toEqual(expect.arrayContaining([expect.objectContaining({ title: `Other user ${runId}` })]));
  } finally {
    await ownerApi.dispose();
    await otherApi.dispose();
  }
});
