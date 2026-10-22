import { expect, test, type Page, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

async function createProject(page: Page) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `problems-panel-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Problems panel audit',
      organizationName: `Problems panel ${suffix}`,
    },
  });
  expect(registration.ok()).toBeTruthy();

  const auth = await registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'Problems panel audit' },
  });
  expect(creation.ok()).toBeTruthy();

  const projectId = (await creation.json()).project.id as string;
  const zip = new JSZip();
  zip.file('README.md', '# Problems panel fixture\n');

  const imported = await page.request.post(`${api}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok()).toBeTruthy();
  await page
    .context()
    .addCookies([
      { name: 'vc_session', value: auth.token, url: test.info().project.use.baseURL!, httpOnly: true, sameSite: 'Lax' },
    ]);

  return projectId;
}

async function expectProblems(page: Page, info: TestInfo, phase: string) {
  try {
    await expect(page).toHaveURL(/panel=problems/);

    const tab = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="problems"]');
    await expect(tab).toHaveCount(1);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.bolt-project-problems-panel')).toBeVisible();
  } finally {
    await page.screenshot({ path: info.outputPath(`${phase}.png`) });
  }
}

test('Problems URL opens its own pane tab and survives reload', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'This regression exercises the desktop pane engine.');

  const projectId = await createProject(page);
  await page.goto(`/projects/${projectId}/ide?panel=problems`);
  await expectProblems(page, info, 'opened');
  await page.reload();
  await expectProblems(page, info, 'reloaded');
});

test('Problems status bar opens diagnostics in the desktop bottom drawer', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'The desktop status bar opens a drawer; mobile uses a separate panel.');

  const projectId = await createProject(page);
  await page.goto(`/projects/${projectId}/ide?panel=editor`);
  await expect(page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="editor"]')).toBeVisible();
  await page.getByRole('button', { name: /^Open Problems\./i }).click();

  try {
    await expect(page.locator('.bolt-project-bottom-terminal .bolt-project-problems-panel')).toBeVisible();
  } finally {
    await page.screenshot({ path: info.outputPath('statusbar-opened.png') });
  }
});
