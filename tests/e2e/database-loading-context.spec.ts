import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

// A real response is retained unchanged. No database cards or API success are fabricated.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const [locale, title] of [
  ['en', 'All databases'],
  ['fr', 'Toutes les bases de données'],
] as const) {
  test(`database keeps ${locale} context while its real initial response is pending`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);

    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl, 'a real QA database is required').toBeTruthy();

    const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
    const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `database-context-${suffix}@local.test`,
        password: 'Password123!',
        name: 'Database context QA',
        organizationName: `Database context ${suffix}`,
      },
    });
    expect(registration.ok()).toBeTruthy();

    const auth = (await registration.json()) as { token: string; organization: { id: string } };
    const headers = { authorization: `Bearer ${auth.token}` };

    const created = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: 'Database context QA' },
    });
    expect(created.ok()).toBeTruthy();

    const projectId = (await created.json()).project.id as string;

    let bindingCreated = false;
    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let released = false;

    const pending = new Set<Promise<void>>();
    const startedAt = Date.now();

    const responses: {
      status: number;
      bytes: number;
      upstreamReadyMs: number;
      deliveredMs?: number;
      unchanged: boolean;
    }[] = [];

    let requestedAt = 0;
    let initialRequests = 0;

    const panelPath = `/api/projects/${projectId}/ide-panel/database`;

    try {
      await page.context().addCookies([
        { name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
        { name: 'vibecore-lang', value: locale, url: appBaseUrl, sameSite: 'Lax' },
        { name: 'ecode_theme', value: 'dark', url: appBaseUrl, sameSite: 'Lax' },
      ]);
      await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 });

      const setup = await request.put(`${apiBaseUrl}/projects/${projectId}/env-vars`, {
        headers,
        data: { key: 'DATABASE_URL', value: databaseUrl },
      });
      expect(setup.status()).toBe(200);
      bindingCreated = true;

      const envVar = (await setup.json()).envVar;

      // Never include credentials in an assertion's diagnostic output.
      expect(
        Boolean(
          envVar &&
            envVar.projectId === projectId &&
            envVar.key === 'DATABASE_URL' &&
            envVar.value === databaseUrl &&
            envVar.scope === 'production',
        ),
      ).toBe(true);

      await page.route('**/api/projects/*/ide-panel/database*', (route) => {
        const url = new URL(route.request().url());

        if (
          released ||
          route.request().method() !== 'GET' ||
          url.pathname !== panelPath ||
          url.searchParams.has('schemaKey')
        ) {
          return route.continue();
        }

        initialRequests += 1;
        requestedAt ||= Date.now();

        const handler = (async () => {
          const response = await route.fetch({ timeout: 60_000, maxRetries: 0 });
          expect(response.status()).toBe(200);

          const bytes = await response.body();
          const fingerprint = createHash('sha256').update(bytes).digest('hex');

          const record: (typeof responses)[number] = {
            status: response.status(),
            bytes: bytes.length,
            upstreamReadyMs: Date.now() - startedAt,
            unchanged: false,
          };
          responses.push(record);
          await gate;
          expect(createHash('sha256').update(bytes).digest('hex')).toBe(fingerprint);
          await route.fulfill({ response, body: bytes });
          record.unchanged = true;
          record.deliveredMs = Date.now() - startedAt;
        })();
        pending.add(handler);
        void handler.finally(() => pending.delete(handler)).catch(() => undefined);

        return handler;
      });
      await page.getByTestId('button-add-tab').click();
      await page.getByTestId('tool-item-database').click();

      const panel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]:visible');
      await expect(page.getByTestId('tab-database')).toHaveAttribute('aria-pressed', 'true');
      await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 5_000 });
      await expect.poll(() => responses.length, { timeout: 60_000 }).toBe(1);

      // Keep the response pending past the historical heading assertion's five-second bound.
      await expect.poll(() => Date.now() - requestedAt, { timeout: 8_000 }).toBeGreaterThan(6_000);
      await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
      await expect(panel.getByTestId('db-carte')).toHaveCount(0);
      await expect(panel.locator('form')).toHaveCount(0);
      await expect(panel.getByText(/^(No database yet|Aucune base de données pour le moment)$/)).toHaveCount(0);
      expect(initialRequests).toBe(1);
      await testInfo.attach(`database-${locale}-pending`, {
        body: await page.screenshot({ mask: [page.locator('input, textarea, pre, code')] }),
        contentType: 'image/png',
      });
      released = true;
      release();
      await Promise.all([...pending]);

      const card = panel.getByTestId('db-carte').first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
      await testInfo.attach(`database-${locale}-ready`, {
        body: await page.screenshot({ mask: [page.locator('input, textarea, pre, code')] }),
        contentType: 'image/png',
      });
      expect(responses.every((response) => response.unchanged)).toBe(true);
      await card.click();

      const tables = panel.getByTestId('db-table');
      await expect(tables.first()).toBeVisible({ timeout: 30_000 });
      expect(await tables.count()).toBeGreaterThan(0);
      await testInfo.attach('real-response-evidence', {
        body: JSON.stringify({
          initialRequests,
          requestedMs: requestedAt - startedAt,
          responses,
          tablesReadyMs: Date.now() - startedAt,
          tableCount: await tables.count(),
          locale,
        }),
        contentType: 'application/json',
      });
    } finally {
      released = true;
      release();
      await Promise.allSettled([...pending]);

      // Attempt both in order, even if withdrawing the binding has a network error.
      const bindingStatus = bindingCreated
        ? await request
            .delete(`${apiBaseUrl}/projects/${projectId}/env-vars`, {
              headers,
              data: { key: 'DATABASE_URL', scope: 'production' },
            })
            .then(
              (response) => response.status(),
              () => 'request-failed',
            )
        : undefined;
      const projectStatus = await request.delete(`${apiBaseUrl}/projects/${projectId}`, { headers }).then(
        (response) => response.status(),
        () => 'request-failed',
      );
      console.info(`DATABASE_CONTEXT_QA_CLEANUP ${JSON.stringify({ bindingStatus, projectStatus })}`);

      if (bindingCreated) {
        expect(bindingStatus).toBe(200);
      }

      expect(projectStatus).toBe(200);
    }
  });
}
