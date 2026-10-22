import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test('opening a file in a floating pane updates its tabs and survives docking', async ({
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

  await expect(page.locator('.monaco-editor .view-lines')).toContainText('File tab identity audit');
  await file('audit.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012');

  const panes = page.locator('.bolt-project-pane-leaf');
  await panes.first().getByTestId('tab-options').click();
  await page.getByTestId('tab-options-split-right').click();
  await expect(panes).toHaveCount(2);

  const targetPaneId = await panes.last().getAttribute('data-pane-id');
  expect(targetPaneId).toBeTruthy();

  const target = page.locator(`.bolt-project-pane-leaf[data-pane-id="${targetPaneId}"]`);
  const leftTabId = await panes.first().getByRole('tab').first().getAttribute('data-tab-id');

  await target.getByTestId('tab-options').click();
  await page.getByTestId('tab-options-toggle-floating').click();

  const floating = page.getByTestId(`floating-pane-${targetPaneId}`);
  await expect(floating).toBeVisible();
  await floating.getByTestId('tab-add').click();
  await page.getByTestId('ide-add-tab-command-palette').getByRole('button').filter({ hasText: 'other.txt' }).click();
  await expect(floating.getByRole('tab').filter({ hasText: 'other.txt' })).toHaveCount(1);
  await expect(floating.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');

  const openedTabId = await floating.getByRole('tab').filter({ hasText: 'other.txt' }).getAttribute('data-tab-id');
  await page.screenshot({ path: testInfo.outputPath('floating-file.png') });
  await panes.first().getByTestId('tab-add').click();
  await page.getByTestId('ide-add-tab-command-palette').getByRole('button').filter({ hasText: 'audit.txt' }).click();
  await expect(panes.first().locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012');
  await page.screenshot({ path: testInfo.outputPath('independent-files.png') });
  await expect(floating.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');

  await floating
    .getByRole('tab')
    .filter({ hasText: 'audit.txt' })
    .getByRole('button', { name: 'audit.txt', exact: true })
    .click();
  await expect(floating.locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012');
  await floating
    .getByRole('tab')
    .filter({ hasText: 'other.txt' })
    .getByRole('button', { name: 'other.txt', exact: true })
    .click();
  await expect(floating.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');

  await floating.getByTestId(`dock-floating-pane-${targetPaneId}`).click();
  await expect(floating).toHaveCount(0);
  await expect(panes).toHaveCount(2);

  const reopenedTab = target.getByRole('tab').filter({ hasText: 'other.txt' });
  await expect(reopenedTab).toHaveAttribute('data-tab-id', openedTabId!);
  await expect(reopenedTab).toHaveAttribute('aria-selected', 'true');
  await expect(target.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');
  await expect(panes.first().getByRole('tab').first()).toHaveAttribute('data-tab-id', leftTabId!);
  await page.screenshot({ path: testInfo.outputPath('docked-file.png') });

  const auditEditor = panes.first().locator('.monaco-editor');
  await auditEditor.click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => JSON.parse(localStorage.getItem(`vibecore.projectIdeMemory:${id}`) ?? '{}').ui?.selectedFile,
        projectId,
      ),
    )
    .toBe('/home/project/audit.txt');
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('INDEPENDENT-AUDIT-DRAFT');
  await expect(auditEditor.locator('.view-lines')).toContainText('INDEPENDENT-AUDIT-DRAFT');
  await expect(target.locator('.monaco-editor .view-lines')).toContainText('SECOND-DOCUMENT');

  await panes.first().getByTestId('tab-add').click();
  await page.getByTestId('ide-add-tab-command-palette').getByRole('button').filter({ hasText: 'other.txt' }).click();

  const editors = page.locator('.monaco-editor .view-lines');
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toContainText('SECOND-DOCUMENT');
  await expect(editors.nth(1)).toContainText('SECOND-DOCUMENT');
  await panes
    .first()
    .getByRole('tab')
    .filter({ hasText: 'audit.txt' })
    .getByRole('button', { name: 'audit.txt', exact: true })
    .click();
  await expect(editors.nth(0)).toContainText('INDEPENDENT-AUDIT-DRAFT');
  await expect(editors.nth(1)).toContainText('SECOND-DOCUMENT');
  await panes
    .first()
    .getByRole('tab')
    .filter({ hasText: 'other.txt' })
    .getByRole('button', { name: 'other.txt', exact: true })
    .click();

  // Observe actual widget replacement, not just the two widgets that existed before the locale change.
  const oldWidgets = await page.evaluateHandle(() => Array.from(document.querySelectorAll('.monaco-editor')));
  await page.evaluate(() => {
    document.documentElement.lang = 'fr';
    window.dispatchEvent(new Event('vibecore:language-change'));
  });
  await expect.poll(() => oldWidgets.evaluate((nodes) => nodes.every((node) => !node.isConnected))).toBe(true);
  await oldWidgets.dispose();
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toContainText('SECOND-DOCUMENT');
  await expect(editors.nth(1)).toContainText('SECOND-DOCUMENT');
  await page.screenshot({ path: testInfo.outputPath('shared-locale.png') });

  await panes.first().getByTestId('tab-options').click();
  await page.getByTestId('tab-options-close-pane').click();
  await expect(panes).toHaveCount(1);
  await expect(editors).toHaveCount(1);
  await expect(editors).toContainText('SECOND-DOCUMENT');
  await page.screenshot({ path: testInfo.outputPath('shared-survivor.png') });
});
