import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

test('an open add-tab palette survives the loading-shell handoff and explicit closure stays closed', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);

  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `palette-handoff-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Palette handoff',
      organizationName: `Palette handoff ${suffix}`,
    },
  });
  expect(registration.ok()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };
  const headers = { authorization: `Bearer ${auth.token}` };
  const projectIds: string[] = [];

  for (const name of ['Palette handoff', 'Another palette project']) {
    const created = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name },
    });
    expect(created.ok()).toBeTruthy();
    projectIds.push((await created.json()).project.id as string);
  }

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
    { name: 'ecode_theme', value: 'dark', url: appBaseUrl, sameSite: 'Lax' },
  ]);

  let release!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  let responsesReady = 0;

  const pending = new Set<Promise<void>>();

  // Hold an actual response unchanged: do not fabricate history, markup or a success.
  await page.route('**/api/projects/*/ide-state', (route) => {
    if (route.request().method() !== 'GET') {
      return route.continue();
    }

    const handler = (async () => {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      responsesReady += 1;
      await gate;
      await route.fulfill({ response });
    })();
    pending.add(handler);
    void handler.finally(() => pending.delete(handler)).catch(() => undefined);

    return handler;
  });

  try {
    await page.goto(`/projects/${projectIds[0]}/ide`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => responsesReady, { timeout: 30_000 }).toBeGreaterThan(0);

    const trigger = page.locator('.bolt-project-tabbar:visible [data-testid="tab-add"]').first();
    const palette = page.getByTestId('ide-add-tab-command-palette');
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();
    await expect(palette).toBeVisible();
    await palette.locator('input').fill('Database');
    await trigger.evaluate((node) => node.setAttribute('data-palette-shell-witness', 'true'));
    await testInfo.attach('palette-before-handoff', { body: await page.screenshot(), contentType: 'image/png' });

    release();
    await expect(page.locator('[data-palette-shell-witness]'), 'the shell must actually be replaced').toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(palette).toBeVisible();
    await expect(palette.locator('.bolt-project-tool-menu')).toBeVisible();
    await expect(palette.locator('input')).toHaveValue('Database');
    await testInfo.attach('palette-after-handoff', { body: await page.screenshot(), contentType: 'image/png' });

    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(palette.locator('input')).toHaveValue('');
    await palette.locator('.bolt-project-tool-search-close').click();
    await expect(palette).toHaveCount(0);

    await trigger.click();
    await expect(palette).toBeVisible();

    await page.goto(`/projects/${projectIds[1]}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/projects/${projectIds[1]}/ide`));
    await expect(trigger).toBeVisible();
    await expect(palette).toHaveCount(0);
    await page.goBack();
    await expect(trigger).toBeVisible();
    await expect(palette).toHaveCount(0);
  } finally {
    release();
    await Promise.allSettled([...pending]);

    const cleanupStatuses: number[] = [];

    for (const projectId of projectIds) {
      const removed = await request.delete(`${apiBaseUrl}/projects/${projectId}`, { headers });
      cleanupStatuses.push(removed.status());
    }

    console.info(`PALETTE_QA_CLEANUP ${JSON.stringify({ statuses: cleanupStatuses })}`);
    expect(cleanupStatuses).toEqual([200, 200]);
  }
});
