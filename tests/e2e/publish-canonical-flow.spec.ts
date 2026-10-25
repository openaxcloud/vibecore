import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';

const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const web = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

async function fixture(page: Page, request: APIRequestContext) {
  const registration = await request.post(`${api}/auth/register`, {
    data: {
      email: `publish-qa-${Date.now()}-${Math.random().toString(36).slice(2)}@local.test`,
      password: 'Password123!',
      name: 'Publish flow QA',
    },
  });
  expect(registration.ok()).toBe(true);

  const user = await registration.json();
  const headers = { authorization: `Bearer ${user.token}` };

  const created = await request.post(`${api}/orgs/${user.organization.id}/projects`, {
    headers,
    data: { name: 'Isolated publish flow' },
  });
  expect(created.ok()).toBe(true);

  const projectId = (await created.json()).project.id as string;
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: user.token, url: web, httpOnly: true, sameSite: 'Lax' }]);

  return { projectId, headers };
}

async function postedForm(request: Request) {
  const response = new Response(request.postDataBuffer() as BodyInit, {
    headers: { 'content-type': request.headers()['content-type'] },
  });
  return Object.fromEntries(await response.formData());
}

async function openManage(page: Page, projectId: string, workspaceId?: string) {
  await page.goto(`/projects/${projectId}/ide?panel=deployments${workspaceId ? `&workspace=${workspaceId}` : ''}`, {
    waitUntil: 'domcontentloaded',
  });

  const host = page.locator('.bolt-project-deploy-tool');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await host
    .locator('.bolt-project-tool-tabs')
    .getByRole('button', { name: /^(Manage|Gérer)$/ })
    .click();

  return host;
}

test('top Publish, dashboard navigation and legacy bookmark open the same publish host', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId } = await fixture(page, request);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-publish-button')).toBeVisible({ timeout: 60_000 });
  await page.locator('.bolt-project-publish-button').click();

  const host = page.locator('.bolt-project-deploy-tool');
  await expect(host.getByTestId('publication-republier')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`panel=deployments`));
  await page.goto(`/projects/${projectId}/activity`, { waitUntil: 'domcontentloaded' });
  await page.locator(`a[href="/projects/${projectId}/ide?panel=deployments"]`).first().click();
  await expect(host.getByTestId('publication-republier')).toBeVisible();
  await page.goto(`/projects/${projectId}/deployments`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=deployments$`));
  await expect(host.getByTestId('publication-republier')).toBeVisible();
  await host.getByTestId('publication-republier').click();
  await expect(host.locator('form input[type="hidden"][name="provider"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('canonical-managed-publish.png') });
});

test('real unavailable detection allows explicit mode override; double click sends one payload and error can be retried', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId, headers } = await fixture(page, request);

  const secondary = await request.post(`${api}/projects/${projectId}/workspaces`, {
    headers,
    data: { name: 'QA selected workspace', runtimeMode: 'remote-kubernetes' },
  });
  expect(secondary.ok()).toBe(true);

  const selectedWorkspaceId = (await secondary.json()).workspace.id as string;
  const detectionRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('detect=1')) {
      detectionRequests.push(request.url());
    }
  });

  const rateResponse = await request.get(`${api}/projects/${projectId}/deployments/rate-card`, { headers });
  expect(rateResponse.ok()).toBe(true);

  const rate = await rateResponse.json();
  const available = rate.machineSizes.find((size: { available: boolean }) => size.available);
  expect(available).toBeTruthy();

  const sent: Array<Record<string, FormDataEntryValue>> = [];

  let release!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/projects/${projectId}/ide-panel/deployments`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    sent.push(await postedForm(route.request()));

    if (sent.length === 1) {
      await gate;
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'QA: publication temporarily unavailable' }),
    });
  });

  await page.goto(`/projects/${projectId}/ide?workspace=${selectedWorkspaceId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-publish-button')).toBeVisible({ timeout: 60_000 });
  await page.locator('.bolt-project-publish-button').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe(selectedWorkspaceId);

  const host = page.locator('.bolt-project-deploy-tool');
  await expect(host).toBeVisible({ timeout: 60_000 });

  // The real workspace-agent lookup has a 30-second unavailable timeout.
  const initialDetection = page.waitForResponse(
    (response) => response.url().includes('detect=1') && response.request().method() === 'GET',
    { timeout: 45_000 },
  );
  await host
    .locator('.bolt-project-tool-tabs')
    .getByRole('button', { name: /^(Manage|Gérer)$/ })
    .click();
  expect((await initialDetection).ok()).toBe(true);

  const managed = host.locator('form').filter({ has: page.locator('input[type="hidden"][name="provider"]') });
  await expect(host.getByRole('button', { name: /^(Re-detect|Relancer la détection)$/ })).toBeVisible({
    timeout: 30_000,
  });

  const detectResponse = page.waitForResponse(
    (response) => response.url().includes('detect=1') && response.request().method() === 'GET',
    { timeout: 45_000 },
  );
  await host.getByRole('button', { name: /^(Re-detect|Relancer la détection)$/ }).click();
  expect((await detectResponse).ok()).toBe(true);
  await managed.locator('details > summary').click();
  await managed.locator('input[name="deployModeOverride"][value="server"]').check();
  await expect(managed.locator('select[name="machineSize"]')).toBeVisible();
  await managed.locator('select[name="machineSize"]').selectOption(available.key);
  await managed.locator('select[name="environment"]').selectOption('staging');
  await managed.locator('textarea[name="envVars"]').fill('PUBLIC_QA_MARKER=isolated');

  const workspaceId = await managed.locator('input[name="workspaceId"]').inputValue();
  expect(workspaceId).toBe(selectedWorkspaceId);
  expect(detectionRequests.length).toBeGreaterThan(0);
  expect(detectionRequests.every((url) => new URL(url).searchParams.get('workspace') === selectedWorkspaceId)).toBe(
    true,
  );

  const publish = managed.getByRole('button', { name: /^(Publish|Publier)$/ });
  await publish.dblclick();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    provider: 'server',
    machineSize: available.key,
    environment: 'staging',
    workspaceId,
    envVars: 'PUBLIC_QA_MARKER=isolated',
  });
  release();
  await expect(page.getByText('QA: publication temporarily unavailable', { exact: true })).toBeVisible();
  await expect(publish).toBeEnabled();
  await expect(managed.locator('textarea[name="envVars"]')).toHaveValue('PUBLIC_QA_MARKER=isolated');
  await publish.click();
  await expect.poll(() => sent.length).toBe(2);
  await expect(publish).toBeEnabled();
  await managed.locator('input[name="deployModeOverride"][value="static"]').check();
  await expect(managed.locator('select[name="machineSize"]')).toHaveCount(0);
  await publish.click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2].provider).toBe('static');
  expect(sent[2]).not.toHaveProperty('machineSize');
  await page.setViewportSize({ width: 390, height: 844 });

  // Wait for the mobile shell to render, not only for retained hidden form state.
  await expect(managed.locator('textarea[name="envVars"]')).toBeInViewport();
  await expect(
    host.locator('.bolt-project-tool-tabs').getByRole('button', { name: /^(Manage|Gérer)$/ }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(managed.locator('input[name="workspaceId"]')).toHaveCount(1);
  await expect(managed.locator('textarea[name="envVars"]')).toHaveValue('PUBLIC_QA_MARKER=isolated');
  await expect(managed.locator('input[name="deployModeOverride"][value="static"]')).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('managed-publish-mobile.png') });
});

// Controlled history and responses: proves UI confirmation/payload, not a real deployment.
test('cancel and rollback require confirmation; Escape and Cancel send nothing', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const { projectId } = await fixture(page, request);
  const sent: Array<Record<string, FormDataEntryValue>> = [];
  await page.route(`**/api/projects/${projectId}/ide-panel/deployments*`, async (route) => {
    if (route.request().method() === 'POST') {
      sent.push(await postedForm(route.request()));
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'QA: deployment mutation unavailable' }),
      });

      return;
    }

    const response = await route.fetch();
    const payload = await response.json();
    payload.data.deployments = [
      {
        id: 'qa-building',
        status: 'BUILDING',
        provider: 'static',
        environment: 'preview',
        createdAt: '2026-10-25T00:00:00Z',
        logs: [],
      },
      {
        id: 'qa-ready',
        status: 'READY',
        provider: 'server',
        environment: 'preview',
        createdAt: '2026-10-24T00:00:00Z',
        productionUrl: 'https://fixture.invalid',
        logs: [],
      },
    ];
    await route.fulfill({ response, json: payload });
  });

  const host = await openManage(page, projectId);

  const cancel = host.locator(
    'form:has(input[name="intent"][value="cancel"]):has(input[name="deploymentId"][value="qa-building"]) button',
  );
  await cancel.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Cancel this deployment?' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(sent).toHaveLength(0);
  await cancel.click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sent).toHaveLength(0);
  await cancel.click();
  await dialog.getByRole('button', { name: 'Cancel deployment', exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ intent: 'cancel', deploymentId: 'qa-building' });
  await expect(page.getByText('QA: deployment mutation unavailable', { exact: true })).toBeVisible();

  const rollback = host.locator(
    'form:has(input[name="intent"][value="rollback"]):has(input[name="deploymentId"][value="qa-ready"]) button',
  );
  await rollback.click();
  await expect(dialog.getByRole('heading', { name: 'Roll back to this deployment?' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toHaveCount(0);
  expect(sent).toHaveLength(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await rollback.click();
  await page.screenshot({ path: testInfo.outputPath('rollback-confirmation.png') });
  await dialog.getByRole('button', { name: 'Roll back', exact: true }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ intent: 'rollback', deploymentId: 'qa-ready' });
});
