import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const web = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

async function fixture(page: Page, request: APIRequestContext) {
  const registration = await request.post(`${api}/auth/register`, {
    data: {
      email: `deploy-navigation-${Date.now()}-${Math.random().toString(36).slice(2)}@local.test`,
      password: 'Password123!',
      name: 'Deploy navigation QA',
    },
  });
  expect(registration.ok()).toBe(true);

  const user = await registration.json();
  const token = user.token ?? user.session?.token;
  const headers = { authorization: `Bearer ${token}` };

  const creation = await request.post(`${api}/orgs/${user.organization.id}/projects`, {
    headers,
    data: { name: 'Isolated deployment navigation' },
  });
  expect(creation.ok()).toBe(true);

  const projectId = (await creation.json()).project.id as string;
  await page.context().addCookies([{ name: 'vc_session', value: token, url: web, httpOnly: true, sameSite: 'Lax' }]);

  return { projectId, headers, organizationId: user.organization.id as string };
}

async function canonicalDomains(page: Page) {
  const host = page.locator('.bolt-project-deploy-tool');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(
    host.locator('.bolt-project-tool-tabs').getByRole('button', { name: /^(Domains|Domaines)$/ }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(host.locator('.bolt-project-domains-panel input[name="domain"]')).toBeVisible();
  await expect(host.locator('.bolt-project-domains-panel [role="alert"]')).toHaveCount(0);
  await expect(host.getByTestId('project-domains-scope-notice')).toBeVisible();

  return host;
}

for (const width of [390, 1440]) {
  test(`legacy domains URL opens canonical deployment domains at ${width}px`, async ({ page, request }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });

    const { projectId } = await fixture(page, request);
    await page.goto(`/projects/${projectId}/ide?panel=domains`, { waitUntil: 'domcontentloaded' });
    await canonicalDomains(page);
    await page.screenshot({ path: testInfo.outputPath(`domains-url-${width}.png`) });

    const host = page.locator('.bolt-project-deploy-tool');
    await host
      .locator('.bolt-project-tool-tabs')
      .getByRole('button', { name: /^(Logs|Journaux)$/ })
      .click();
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
    await expect(
      host.locator('.bolt-project-tool-tabs').getByRole('button', { name: /^(Logs|Journaux)$/ }),
    ).toHaveAttribute('aria-current', 'page');
  });
}

test('standalone domains bookmark redirects to the canonical deployment section', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId } = await fixture(page, request);
  await page.goto(`/projects/${projectId}/domains`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=domains$`));
  await canonicalDomains(page);
  await page.screenshot({ path: testInfo.outputPath('domains-bookmark.png') });
});

test('persisted legacy domains pane retains its identity inside the canonical deployment host', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId, headers } = await fixture(page, request);

  const state = {
    ui: {
      workspaceTabs: ['domains'],
      activeWorkspacePanel: 'domains',
      activePaneId: 'legacy-domains-pane',
      paneTree: {
        type: 'leaf',
        id: 'legacy-domains-pane',
        activeTabId: 'legacy-domains-tab',
        tabs: [{ id: 'legacy-domains-tab', panel: 'domains', pinned: true }],
      },
    },
  };

  const stored = await request.put(`${api}/projects/${projectId}/ide-state`, { headers, data: { state } });
  expect(stored.ok()).toBe(true);

  const reread = await request.get(`${api}/projects/${projectId}/ide-state`, { headers });
  expect((await reread.json()).ideState.state.ui.paneTree.tabs[0].id).toBe('legacy-domains-tab');
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await canonicalDomains(page);
  await expect(page.locator('[role="tab"][data-tab-id="legacy-domains-tab"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('domains-persisted-pane.png') });

  const host = page.locator('.bolt-project-deploy-tool');
  await host
    .locator('.bolt-project-tool-tabs')
    .getByRole('button', { name: /^(Manage|Gérer)$/ })
    .click();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(
    host.locator('.bolt-project-tool-tabs').getByRole('button', { name: /^(Manage|Gérer)$/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    host.locator('.bolt-project-tool-tabs').getByRole('button', { name: /^(Manage|Gérer)$/ }),
  ).toHaveAttribute('aria-current', 'page');
});

test('Publish leads to setup and advanced options retain values when collapsed', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId } = await fixture(page, request);
  const mutations: string[] = [];
  await page.route(`**/api/projects/${projectId}/ide-panel/*`, async (route) => {
    if (route.request().method() === 'POST') {
      mutations.push(route.request().url());
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto(`/projects/${projectId}/ide?panel=deployments`, { waitUntil: 'domcontentloaded' });

  const host = page.locator('.bolt-project-deploy-tool');
  await expect(host.getByTestId('publication-republier')).toBeVisible({ timeout: 60_000 });
  await host.getByTestId('publication-republier').click();

  const otherProviders = host.locator('details').filter({ has: page.locator('.bolt-project-deploy-wizard') });
  await otherProviders.locator(':scope > summary').click();

  const wizard = host.locator('.bolt-project-deploy-wizard');
  await expect(wizard).toBeVisible();
  await expect(wizard.getByTestId('deploy-provider-select')).toBeVisible();
  await expect(wizard.locator('select[name="environment"]')).toBeVisible();

  const advanced = wizard.locator('details');
  await expect(advanced).not.toHaveAttribute('open');
  await advanced.locator('summary').click();
  await wizard.locator('input[name="buildCommand"]').fill('npm run build:isolated');
  await wizard.locator('input[name="outputDirectory"]').fill('isolated-dist');
  await advanced.locator('summary').click();
  await expect(wizard.locator('input[name="buildCommand"]')).toBeHidden();
  await advanced.locator('summary').click();
  await expect(wizard.locator('input[name="buildCommand"]')).toHaveValue('npm run build:isolated');
  await expect(wizard.locator('input[name="outputDirectory"]')).toHaveValue('isolated-dist');
  await page.screenshot({ path: testInfo.outputPath('publish-advanced-options.png') });
  expect(mutations).toEqual([]);
});

test('legacy document POST shows its validation error before returning to canonical domains', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId, headers, organizationId } = await fixture(page, request);
  const before = await request.get(`${api}/orgs/${organizationId}/domains`, { headers });
  expect(before.ok()).toBe(true);

  const beforeDomains = (await before.json()).domains;
  await page.goto(`/projects/${projectId}/ide?panel=domains`, { waitUntil: 'domcontentloaded' });
  await canonicalDomains(page);

  /*
   * Simulate a cached legacy HTML form. This invalid hostname is rejected by
   * the real API schema before domain creation or any DNS lookup.
   */
  const response = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await page.evaluate((action) => {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = action;

    for (const [name, value] of [
      ['intent', 'create'],
      ['domain', 'invalid/path'],
    ]) {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  }, `/projects/${projectId}/domains`);
  expect((await response)?.status()).toBe(400);
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/domains$`));

  const after = await request.get(`${api}/orgs/${organizationId}/domains`, { headers });
  expect(after.ok()).toBe(true);
  expect((await after.json()).domains).toEqual(beforeDomains);
  await page.screenshot({ path: testInfo.outputPath('legacy-post-validation-error.png') });
  await page.locator('p[role="alert"] + a').click();
  await canonicalDomains(page);
});
