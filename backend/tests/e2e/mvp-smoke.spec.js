import { test, expect } from '@playwright/test';

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
});

test('MVP journey: OTP, note persistence, organize, search, pin, trash, restore, logout', async ({ page, request }) => {
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
  await expect(page).toHaveURL(/\/app\.html(?:\?|$)/);
  await expect(page.locator('#appEmail')).toHaveText(email);
  await expect(page.locator('#newNoteBtn')).toBeEnabled();

  // Create notebook and tag through the UI before creating the note. New notes
  // inherit the active notebook; the tag is attached later via the editor UI.
  await page.locator('#newNotebookBtn').click();
  await page.locator('#newNotebookInput').fill(notebookName);
  await page.locator('#newNotebookAdd').click();
  await expect(page.locator('#listTitle')).toHaveText(notebookName);

  await page.locator('#newTagBtn').click();
  await page.locator('#newTagInput').fill(tagName);
  await page.locator('#newTagAdd').click();
  await expect(page.locator('#listTitle')).toHaveText(`#${tagName}`);
  // Toggle the new (empty) tag filter off while retaining the notebook filter.
  await page.locator('#tagList .app-nb-item', { hasText: tagName }).locator('.app-nb-open').click();
  await expect(page.locator('#listTitle')).toHaveText(notebookName);

  // Create and explicitly save a rich-text note through TipTap.
  await page.locator('#newNoteBtn').click();
  await expect(page.locator('#editorTitle')).toBeEnabled();
  await page.locator('#editorTitle').fill(noteTitle);
  const editor = page.locator('#tiptapEditor .ProseMirror');
  await expect(editor).toBeEditable();
  await editor.fill(noteBody);
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await expect(noteRow(page)).toBeVisible();

  // Assign and filter by tag using the shipped editor/sidebar controls.
  await page.locator('#tagAddSelect').selectOption({ label: tagName });
  await expect(page.locator('#tagChips')).toContainText(tagName);
  await page.locator('#tagList .app-nb-item', { hasText: tagName }).locator('.app-nb-open').click();
  await expect(page.locator('#listTitle')).toHaveText(`#${tagName}`);
  await expect(noteRow(page)).toBeVisible();

  // Notebook filter also contains the note.
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
  await expect(page).toHaveURL(/\/app\.html$/);
  await expect(noteRow(page)).toBeVisible();
  await noteRow(page).click();
  await expect(page.locator('#editorTitle')).toHaveValue(noteTitle);
  await expect(page.locator('#tiptapEditor .ProseMirror')).toContainText(noteBody);

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
  await page.locator('#navAllNotes').click();
  await expect(noteRow(page)).toHaveCount(0);
  await page.locator('#navTrash').click();
  await expect(noteRow(page)).toBeVisible();
  await noteRow(page).click();
  await expect(page.locator('#restoreBtn')).toBeVisible();
  await page.locator('#restoreBtn').click();
  await expect(page.locator('#listTitle')).toHaveText('All Notes');
  await expect(noteRow(page)).toBeVisible();

  // Logout revokes the refresh session and the app can no longer remain open.
  await page.locator('#logoutBtn').click();
  await expect(page).toHaveURL(/\/login\.html$/);
  await page.goto('/app.html');
  await expect(page).toHaveURL(/\/login\.html$/);
});
