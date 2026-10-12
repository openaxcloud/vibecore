import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test('opening a stored file binds the initial editor tab without duplicating it', async ({
  page,
  request,
  context,
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
   * In remote mode, exercise persisted files with an unavailable runtime.
   * The local audit builds VITE_RUNTIME_MODE=remote-kubernetes and configures
   * no workspace manager; these aborts never substitute successful responses.
   */
  await context.route(/\/api\/(runtime|runtime-token|chat)(\/|\?|$)/, (route) => route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*', (socket) => socket.close());

  // Keep this a local draft test: unsuccessful saves must not clear the draft.
  await context.route(/\/api\/projects\/[^/]+\/files(?:\/|\?|$)/, (route) =>
    route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'),
  );
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Password123!');
  await page.locator('button[type=submit]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await page.goto(`/projects/${projectId}/ide?panel=files`);

  const file = (name: string) =>
    page.getByText(name, { exact: true }).and(page.locator('.bolt-file-tree-name')).filter({ visible: true });

  /*
   * Scope this regression to an initialized editor. A separate cold Monaco
   * initialization race was observed and is recorded in the local audit.
   */
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('File tab identity audit');
  await file('audit.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012');
  await page.screenshot({ path: testInfo.outputPath('first-file.png') });
  await testInfo.attach('pane-memory', {
    body: await page.evaluate(() =>
      JSON.stringify(
        Object.keys(localStorage)
          .filter((key) => key.startsWith('vibecore.projectIdeMemory:'))
          .map((key) => ({ key, ui: JSON.parse(localStorage.getItem(key) ?? '{}').ui })),
      ),
    ),
    contentType: 'application/json',
  });

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
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('UNSAVED-A-UNIQUE\n');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('UNSAVED-A-UNIQUE');

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
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('UNSAVED-A-UNIQUE');
  expect(storageReads).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('unsaved-draft-return.png') });

  await documentTabs.locator('.bolt-project-tab-pin').click();

  const pinnedFile = page.getByRole('tab', { name: 'Pinned tab: /audit.txt, unsaved changes', exact: true });
  await expect(pinnedFile).toHaveCount(1);
  await file('other.txt').click();
  await expect(pinnedFile).toHaveCount(1);
  await expect(page.getByRole('tab').filter({ hasText: 'other.txt' })).toHaveCount(1);
  await file('other.txt').click();
  await expect(page.getByRole('tab').filter({ hasText: 'other.txt' })).toHaveCount(1);
  await pinnedFile.click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('UNSAVED-A-UNIQUE');
  await page.screenshot({ path: testInfo.outputPath('pinned-file-preserved.png') });
});
