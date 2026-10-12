import { expect } from '@playwright/test';
import JSZip from 'jszip';
import { test } from './diagnostics/file-tab';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test('opening a stored file binds the initial editor tab without duplicating it', async ({
  page,
  request,
  context,
  fileTabDiagnostics,
}, testInfo) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `file-tabs-${suffix}@local.test`;

  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { email, password: 'Password123!', name: 'File tab audit', organizationName: `File tabs ${suffix}` },
  });
  expect(registration.ok()).toBeTruthy();

  const auth = await registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'File tab identity audit' },
  });
  expect(creation.ok()).toBeTruthy();

  const projectId = (await creation.json()).project.id as string;
  const zip = new JSZip();
  zip.file('audit.txt', 'PERSISTENCE-ORIGINAL-20261012\nsecond line\n');
  zip.file('other.txt', 'SECOND-DOCUMENT\n');

  const imported = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok()).toBeTruthy();

  /*
   * Block remote runtime activity without substituting successful responses.
   * A local WebContainer may still autosave: identity/content assertions must
   * remain valid whether the edit is still dirty or has been saved.
   */
  await context.route(/\/api\/(runtime|runtime-token|chat)(\/|\?|$)/, (route) => route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*', (socket) => socket.close());

  // This blocks HTTP writes only; WebContainer filesystem writes are not intercepted.
  await context.route(/\/api\/projects\/[^/]+\/files(?:\/|\?|$)/, (route) =>
    route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'),
  );
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Password123!');
  await page.locator('button[type=submit]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  fileTabDiagnostics.mark('ide-navigation');
  await page.goto(`/projects/${projectId}/ide?panel=files`);
  fileTabDiagnostics.mark('waiting-for-monaco');

  const file = (name: string) =>
    page.getByText(name, { exact: true }).and(page.locator('.bolt-file-tree-name')).filter({ visible: true });

  /*
   * Cold CI loading took more than the default 5 s to render initial content.
   * Wait for that content, with the 10 s readiness budget used by IDE checks;
   * retain the overall 30 s test budget and fail if initialization stays stuck.
   */
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('File tab identity audit', {
    timeout: 10_000,
  });
  fileTabDiagnostics.mark('monaco-initial-content-ready');
  await file('audit.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012');
  await page.screenshot({ path: testInfo.outputPath('first-file.png') });

  const documentTabs = page.getByRole('tab').filter({ hasText: 'audit.txt' });
  await expect(documentTabs).toHaveCount(1);
  await file('audit.txt').click();
  await expect(documentTabs).toHaveCount(1);
  await file('other.txt').click();
  await expect(page.getByRole('tab').filter({ hasText: 'other.txt' })).toHaveCount(1);
  await expect(documentTabs).toHaveCount(0);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');

  await file('audit.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012');

  const documentTabId = (await documentTabs.getAttribute('data-tab-id')) ?? '';
  expect(documentTabId).not.toBe('');

  const documentTab = page.getByTestId(`tab-${documentTabId}`);

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+a');
  fileTabDiagnostics.mark('editing-draft');

  /*
   * Observe the transient dirty state before typing; autosave may clear it
   * before the next Playwright round trip. This reads DOM only, never the store.
   */
  const dirtyTransition = await documentTab.evaluateHandle((tab) => {
    const state = { observed: false, disconnect: () => observer.disconnect() };

    const observer = new MutationObserver((records) => {
      state.observed ||=
        tab.getAttribute('data-dirty') === 'true' || records.some((record) => record.oldValue === 'true');

      if (state.observed) {
        observer.disconnect();
      }
    });
    observer.observe(tab, { attributes: true, attributeFilter: ['data-dirty'], attributeOldValue: true });

    return state;
  });

  try {
    await page.keyboard.insertText('UNSAVED-A-UNIQUE\n');
    await expect.poll(() => dirtyTransition.evaluate((state) => state.observed)).toBe(true);
  } finally {
    await dirtyTransition.evaluate((state) => state.disconnect()).catch(() => undefined);
    await dirtyTransition.dispose().catch(() => undefined);
  }
  await expect(page.locator('.monaco-editor .view-lines')).toHaveText('UNSAVED-A-UNIQUE');

  const storageReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && /\/api\/projects\/[^/]+\/(files|export)(?:\/|$)/.test(path)) {
      storageReads.push(path);
    }
  });
  await file('other.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');
  await file('audit.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toHaveText('UNSAVED-A-UNIQUE');
  expect(storageReads).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('edited-content-return.png') });

  fileTabDiagnostics.mark('pinning-draft');
  await documentTabs.locator('.bolt-project-tab-pin').click();

  fileTabDiagnostics.mark('checking-pinned-draft');

  await expect(documentTabs).toHaveAttribute('data-tab-id', documentTabId);
  await expect(documentTab).toHaveAttribute('data-pinned', 'true');
  await file('other.txt').click();
  await expect(documentTabs).toHaveAttribute('data-tab-id', documentTabId);
  await expect(documentTab).toHaveAttribute('data-pinned', 'true');
  await expect(page.getByRole('tab').filter({ hasText: 'other.txt' })).toHaveCount(1);
  await file('other.txt').click();
  await expect(page.getByRole('tab').filter({ hasText: 'other.txt' })).toHaveCount(1);
  fileTabDiagnostics.mark('returning-to-pinned-draft');
  await documentTab.click();
  await expect(documentTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monaco-editor .view-lines')).toHaveText('UNSAVED-A-UNIQUE');
  await page.screenshot({ path: testInfo.outputPath('pinned-file-preserved.png') });
});
