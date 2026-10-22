import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';

const apiBase = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const appBase = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

async function openPreviewWithLibrary(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${apiBase}/auth/register`, {
    data: {
      email: `preview-toolbar-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Preview toolbar audit',
      organizationName: `Preview toolbar ${suffix}`,
    },
  });
  expect(registration.ok()).toBeTruthy();

  const auth = await registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await page.request.post(`${apiBase}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'Preview toolbar audit' },
  });
  expect(creation.ok()).toBeTruthy();

  const projectId = (await creation.json()).project.id as string;
  const archive = new JSZip();
  archive.file('index.html', '<!doctype html><title>Toolbar audit</title><h1>Toolbar audit</h1>');
  archive.file('README.md', '# Preview toolbar audit\n');

  const imported = await page.request.post(`${apiBase}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok()).toBeTruthy();

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: appBase, httpOnly: true, sameSite: 'Lax' },
    { name: 'ecode_theme', value: 'dark', url: appBase, sameSite: 'Lax' },
  ]);
  await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-webview-toolbar')).toBeVisible();
  await page.goto(`/projects/${projectId}/ide?panel=files`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-file-tree')).toBeVisible();
  await expect(
    page
      .frameLocator('[data-testid="preview-iframe"]')
      .first()
      .getByRole('heading', { name: 'Toolbar audit', exact: true }),
  ).toBeVisible();
}

async function clippedControls(toolbar: Locator) {
  return toolbar.evaluate((element) => {
    const bounds = element.getBoundingClientRect();

    return [...element.querySelectorAll('button, input, select')]
      .filter((control) => {
        const rect = control.getBoundingClientRect();

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.left < bounds.left - 1 ||
            rect.right > bounds.right + 1 ||
            rect.top < bounds.top - 1 ||
            rect.bottom > bounds.bottom + 1)
        );
      })
      .map((control) => control.getAttribute('aria-label') ?? control.getAttribute('title') ?? control.textContent);
  });
}

test('desktop Webview keeps commands visible beside Library and after resizing', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await openPreviewWithLibrary(page);

  const toolbar = page.locator('.bolt-project-webview-toolbar');

  for (const width of [1440, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(toolbar).toBeVisible();
    await expect.poll(() => clippedControls(toolbar)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`preview-toolbar-${width}.png`) });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => clippedControls(toolbar)).toEqual([]);

  /*
   * A real pointer click must reach the visible button, without Playwright
   * scrolling a clipped ancestor to expose an initially hidden command.
   */
  const logs = toolbar.getByRole('button', { name: 'Webview logs', exact: true });
  const bounds = await logs.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(page.locator('.bolt-preview-logs-panel')).toBeVisible();
  await page.locator('.bolt-preview-logs-close').click();
  await expect(page.locator('.bolt-preview-logs-panel')).toBeHidden();

  await toolbar.getByRole('button', { name: 'Open integrated preview DevTools', exact: true }).click();

  const devTools = page.locator('.bolt-preview-devtools-panel');
  await expect(devTools).toBeVisible();
  await devTools.locator('button[aria-label]').last().click();
  await expect(devTools).toBeHidden();

  const windowOptions = toolbar.getByRole('button', { name: 'Preview window options', exact: true });
  await windowOptions.click();
  await expect(page.locator('.bolt-preview-window-menu')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.bolt-preview-window-menu')).toBeVisible();
  await expect(page.locator('.bolt-preview-window-menu button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bolt-preview-window-menu')).toBeHidden();
  await expect(windowOptions).toBeFocused();

  await windowOptions.click();
  await expect(page.locator('.bolt-preview-window-menu')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.bolt-preview-window-menu')).toBeHidden();
  await expect(logs).toBeFocused();

  await windowOptions.click();
  await expect(page.locator('.bolt-preview-window-menu')).toBeVisible();
  await page.mouse.click(80, 500);
  await expect(page.locator('.bolt-preview-window-menu')).toBeHidden();

  await windowOptions.click();
  await expect(page.locator('.bolt-preview-window-menu')).toBeVisible();

  const frame = page.locator('[data-testid="preview-iframe"]').first();
  const frameBounds = await frame.boundingBox();
  expect(frameBounds).not.toBeNull();
  await page.mouse.click(frameBounds!.x + 20, frameBounds!.y + frameBounds!.height - 20);
  await expect(page.locator('.bolt-preview-window-menu')).toBeHidden();
  await expect(
    page
      .frameLocator('[data-testid="preview-iframe"]')
      .first()
      .getByRole('heading', { name: 'Toolbar audit', exact: true }),
  ).toBeVisible();
});
