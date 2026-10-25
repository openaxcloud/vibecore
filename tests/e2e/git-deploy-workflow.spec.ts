import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

// Real local API/Git/PostgreSQL fixture. No remote push, publication or DNS mutation.
const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const web = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

test('desktop Git commit and deployment/domain navigation use the current project', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const marker = `git-deploy-${Date.now()}`;

  const registration = await request.post(`${api}/auth/register`, {
    data: { email: `${marker}@local.test`, password: 'Password123!', name: 'Git deployment QA' },
  });
  expect(registration.ok()).toBe(true);

  const user = await registration.json();
  const token = user.token ?? user.session?.token;
  const headers = { authorization: `Bearer ${token}` };

  const creation = await request.post(`${api}/orgs/${user.organization.id}/projects`, {
    headers,
    data: { name: marker },
  });
  expect(creation.ok()).toBe(true);

  const projectId = (await creation.json()).project.id;
  const archive = new JSZip();
  archive.file(`${marker}.txt`, `${marker}\n`);

  const imported = await request.post(`${api}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok()).toBe(true);
  await page.context().addCookies([{ name: 'vc_session', value: token, url: web, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide?panel=git`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /^(Tout indexer|Stage all)$/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /^(Tout indexer|Stage all)$/ }).click();
  await page.locator('textarea[name="message"]').fill(marker);
  await page.getByRole('button', { name: /^(Committer les modifications|Commit changes)$/ }).click();
  await expect
    .poll(
      async () => {
        const graph = await request.get(`${api}/projects/${projectId}/git/graph`, { headers });
        expect(graph.ok()).toBe(true);

        return ((await graph.json()).commits ?? []).some((commit: { message: string }) =>
          commit.message.includes(marker),
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('git-committed-desktop.png') });

  await page.getByTestId('ide-dock-deployments').click();

  const deployment = page.locator('.bolt-project-deploy-tool');
  await expect(deployment).toBeVisible();
  await expect(deployment.getByTestId('publication-republier')).toBeVisible();

  const tabs = deployment.locator('.bolt-project-tool-tabs');
  await tabs.getByRole('button', { name: /^(Domains|Domaines)$/ }).click();

  const domains = deployment.locator('.bolt-project-domains-panel');
  await expect(domains).toBeVisible();
  await expect(domains.getByRole('status')).toHaveCount(0);
  await expect(domains.getByRole('alert')).toHaveCount(0);
  await expect(domains.locator('input[name="domain"]')).toBeVisible();

  // Controlled transport failure only; the retry reads the real local API again.
  const domainEndpoint = `**/api/projects/${projectId}/ide-panel/domains`;
  await page.route(domainEndpoint, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'QA unavailable' }),
      });
    } else {
      await route.continue();
    }
  });
  await tabs.getByRole('button', { name: /^(Logs|Journaux)$/ }).click();
  await tabs.getByRole('button', { name: /^(Domains|Domaines)$/ }).click();
  await expect(domains.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('deployment-domains-error.png') });
  await page.unroute(domainEndpoint);
  await domains.getByRole('button', { name: /^(Refresh domains|Actualiser les domaines)$/ }).click();
  await expect(domains.getByRole('alert')).toHaveCount(0);
  await expect(domains.getByRole('status')).toHaveCount(0);
  await domains.locator('input[name="domain"]').fill('invalid/path');
  expect(
    await domains.locator('input[name="domain"]').evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('deployment-domains-desktop.png') });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(domains.locator('input[name="domain"]')).toBeVisible();
    await expect(domains.locator('input[name="domain"]')).toHaveValue('invalid/path');
    await page.screenshot({ path: testInfo.outputPath(`deployment-domains-${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await tabs.getByRole('button', { name: /^(Logs|Journaux)$/ }).click();
  await tabs.getByRole('button', { name: /^(Domains|Domaines)$/ }).click();
  await expect(domains.locator('input[name="domain"]')).toHaveValue('invalid/path');
  await tabs.getByRole('button', { name: /^(Overview|Vue d’ensemble|Vue d'ensemble|Aperçu)$/ }).click();
  await expect(deployment.getByTestId('publication-republier')).toBeVisible();
  await page.getByTestId('ide-dock-git').click();
  await expect(page.locator('textarea[name="message"]')).toBeVisible();
  await page.goBack();
  await expect(deployment).toBeVisible();
});
