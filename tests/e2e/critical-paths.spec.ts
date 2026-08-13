import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = API_BASE_URL;
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `critical-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Critical E2E',
      organizationName: `Critical E2E ${suffix}`,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  const payload = (await response.json()) as { token: string; organization: { id: string } };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload;
}

async function createZipBase64(files: Record<string, string>) {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'base64' });
}

test('critical path: preview iframe loads imported app content', { tag: '@runtime' }, async ({ page }) => {
  test.setTimeout(120_000);

  const auth = await authenticate(page);
  const apiBaseUrl = API_BASE_URL;

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Critical Preview Project' },
  });
  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  const zipBase64 = await createZipBase64({
    'index.html': '<!doctype html><html><body><main id="app">Critical preview iframe loaded</main></body></html>',
  });
  const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64 },
  });
  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Workspace:\s*running/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Webview' }).click();

  const previewIframe = page.locator('iframe[title="preview"]').first();
  await expect(previewIframe).toBeVisible({ timeout: 90_000 });
  await expect(page.frameLocator('iframe[title="preview"]').locator('#app')).toContainText(
    'Critical preview iframe loaded',
    { timeout: 90_000 },
  );
});
