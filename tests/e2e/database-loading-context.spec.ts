import { expect, test } from '@playwright/test';
import { installDatabaseResponseGate, withDatabaseCleanup } from './helpers/database-response-gate';

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
    let capture: Awaited<ReturnType<typeof installDatabaseResponseGate>> | undefined;

    async function attachCapture(phase: 'before-cleanup' | 'after-cleanup') {
      if (!capture) {
        return;
      }

      const body = JSON.stringify(capture.snapshot());

      try {
        await testInfo.attach(`database-capture-${locale}-${phase}`, { body, contentType: 'application/json' });
      } catch {
        // A reporter failure must not replace the test failure or lose the safe diagnostic.
        console.info(`DATABASE_CAPTURE_DIAGNOSTIC_FALLBACK ${body}`);
      }
    }

    await withDatabaseCleanup(async () => {
      await page.context().addCookies([
        { name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
        { name: 'vibecore-lang', value: locale, url: appBaseUrl, sameSite: 'Lax' },
        { name: 'ecode_theme', value: 'dark', url: appBaseUrl, sameSite: 'Lax' },
      ]);

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

      // The real binding and both response barriers must exist before hydration can fetch.
      capture = await installDatabaseResponseGate(page, projectId, appBaseUrl);
      capture.mark('navigation');
      await capture.guard(() => page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' }));
      await capture.guard(() => expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 }));
      capture.mark('open-panel');
      await page.getByTestId('button-add-tab').click();
      await page.getByTestId('tool-item-database').click();

      const panel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]:visible');
      await expect(page.getByTestId('tab-database')).toHaveAttribute('aria-pressed', 'true');
      await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 5_000 });
      await capture.waitForInitialResponse();
      expect(capture.snapshot().responses).toHaveLength(1);

      // Keep the response pending past the historical heading assertion's five-second bound.
      const requestedAt = capture.requestedAt;
      await capture.guard(() => expect.poll(() => Date.now() - requestedAt, { timeout: 8_000 }).toBeGreaterThan(6_000));
      await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
      await expect(panel.getByTestId('db-carte')).toHaveCount(0);
      await expect(panel.locator('form')).toHaveCount(0);
      await expect(panel.getByText(/^(No database yet|Aucune base de données pour le moment)$/)).toHaveCount(0);
      capture.assertHealthy();
      expect(capture.snapshot().initialRequests).toBe(1);
      expect(capture.snapshot().listRequests).toBe(1);
      capture.mark('pending-verified');
      await testInfo.attach(`database-${locale}-pending`, {
        body: await page.screenshot({ mask: [page.locator('input, textarea, pre, code')] }),
        contentType: 'image/png',
      });
      capture.release();
      await capture.settle();
      capture.assertHealthy();

      const card = panel.getByTestId('db-carte').first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
      await testInfo.attach(`database-${locale}-ready`, {
        body: await page.screenshot({ mask: [page.locator('input, textarea, pre, code')] }),
        contentType: 'image/png',
      });
      expect(capture.snapshot().responses.every((response) => response.unchanged)).toBe(true);
      expect(capture.snapshot().listRequests, 'the child must reuse the parent response').toBe(1);
      capture.mark('ready-verified');
      await card.click();

      const tables = panel.getByTestId('db-table');
      await expect(tables.first()).toBeVisible({ timeout: 30_000 });
      expect(await tables.count()).toBeGreaterThan(0);
      capture.assertHealthy();
      expect(capture.snapshot().listRequests, 'schema navigation must not reload the list').toBe(1);
      expect(capture.snapshot().routeListRequests).toBe(1);
      capture.mark('tables-verified');
      await testInfo.attach('real-response-evidence', {
        body: JSON.stringify({
          ...capture.snapshot(),
          tablesReadyMs: capture.snapshot().elapsedMs,
          tableCount: await tables.count(),
          locale,
        }),
        contentType: 'application/json',
      });
    }, [
      // Save the first-attempt state before a pending handler can delay cleanup.
      async () => {
        await attachCapture('before-cleanup');
      },
      async () => {
        await capture?.dispose();
      },
      async () => {
        await attachCapture('after-cleanup');
      },
      async () => {
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
      },
      async () => {
        capture?.assertHealthy();
      },
    ]);
  });
}
