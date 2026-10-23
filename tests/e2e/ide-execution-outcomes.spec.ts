import { expect, test } from '@playwright/test';

// The first three cases use real API fixtures and synthetic project commands.
// The remaining cases explicitly control responses/time to test the UI contract.
// No user project or provider credential is used.
for (const scenario of [
  'terminal',
  'workflows',
  'security',
  'security-failed-response',
  'security-failed-status',
  'security-timeout',
]) {
  const panel = scenario.startsWith('security') ? 'security' : scenario;
  test(`${scenario} preserves the execution outcome`, async ({ page, baseURL }, info) => {
    test.setTimeout(90_000);
    const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
    const registration = await page.request.post(`${api}/auth/register`, {
      data: {
        email: `outcomes-${panel}-${Date.now()}@local.test`,
        password: 'Password123!',
        name: 'Synthetic outcomes',
        organizationName: 'Synthetic outcomes',
      },
    });
    expect(registration.status()).toBe(201);
    const auth = await registration.json();
    const headers = { authorization: `Bearer ${auth.token}` };
    const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: 'Synthetic execution outcome' },
    });
    expect(creation.ok()).toBe(true);
    const projectId = (await creation.json()).project.id;
    await page.context().addCookies([
      { name: 'vc_session', value: auth.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
      { name: 'vibecore-lang', value: 'en', url: baseURL! },
    ]);
    if (panel === 'workflows') {
      const seed = await page.request.put(`${api}/projects/${projectId}/env-vars`, {
        headers,
        data: {
          key: 'VIBECORE_WORKFLOWS_STATE',
          value: JSON.stringify({
            workflows: [
              {
                id: 42,
                name: 'Synthetic failure',
                enabled: true,
                executionMode: 'sequential',
                tasks: [{ id: 1, orderIndex: 0, taskType: 'shell', command: 'exit 7' }],
              },
            ],
            runs: [],
          }),
        },
      });
      expect(seed.ok()).toBe(true);
    }
    if (
      scenario === 'security-failed-response' ||
      scenario === 'security-failed-status' ||
      scenario === 'security-timeout'
    ) {
      // Controlled response/clock tests of the UI contract, NOT runtime evidence.
      await page.goto(`/projects/${projectId}/ide?panel=security`);
      const routePath = `**/api/projects/${projectId}/ide-panel/security`;
      if (scenario !== 'security-timeout') {
        await page.route(routePath, async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          await route.fulfill({
            status: 200,
            json: {
              ok: scenario === 'security-failed-status',
              scan: { status: 'failed' },
              error: 'Synthetic recorded scan failure',
            },
          });
        });
        await page
          .locator('.bolt-project-security-scan-form')
          .getByRole('button', { name: 'Run full scan', exact: true })
          .click();
        await expect(page.locator('.bolt-project-security-progress')).toHaveAttribute('data-status', 'failed');
      } else {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.clock.install();
        await page.route(routePath, async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          await gate;
          await route.abort('failed').catch(() => undefined);
        });
        try {
          await page
            .locator('.bolt-project-security-scan-form')
            .getByRole('button', { name: 'Run full scan', exact: true })
            .click();
          await expect(page.locator('.bolt-project-security-progress')).toHaveAttribute('data-status', 'running');
          await page.clock.runFor(90_001);
          await expect(page.locator('.bolt-project-security-progress')).toHaveAttribute('data-status', 'timeout');
        } finally {
          release();
        }
      }
      await page.screenshot({ path: info.outputPath(`${scenario}.png`) });
      return;
    }
    let response;
    if (panel === 'security') {
      await page.goto(`/projects/${projectId}/ide?panel=security`);
      const pending = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `/api/projects/${projectId}/ide-panel/security` &&
          r.request().method() === 'POST',
      );
      await page
        .locator('.bolt-project-security-scan-form')
        .getByRole('button', { name: 'Run full scan', exact: true })
        .click();
      response = await pending;
    } else if (panel === 'workflows') {
      await page.goto(`/projects/${projectId}/ide?panel=workflows`);
      const pending = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `/api/projects/${projectId}/ide-panel/workflows` &&
          r.request().method() === 'POST',
      );
      await page.getByTestId('workflow-run-now-42').click();
      response = await pending;
    } else {
      response = await page.request.post(`/api/projects/${projectId}/ide-panel/${panel}`, {
        data: { intent: panel === 'terminal' ? 'run-script' : 'run-workflow', script: 'exit 7', workflowId: '42' },
      });
    }
    const body = await response.json();
    const persisted = await page.request.get(`${api}/projects/${projectId}/env-vars`, { headers });
    expect(persisted.ok()).toBe(true);
    const key =
      panel === 'terminal'
        ? 'VIBECORE_TERMINAL_STATE'
        : panel === 'workflows'
          ? 'VIBECORE_WORKFLOWS_STATE'
          : 'VIBECORE_SECURITY_STATE';
    const state = JSON.parse((await persisted.json()).envVars.find((entry: any) => entry.key === key).value);
    const record = panel === 'terminal' ? state.scriptRuns[0] : panel === 'workflows' ? state.runs[0] : state.scans[0];
    await info.attach('outcome', {
      contentType: 'application/json',
      body: JSON.stringify({
        panel,
        httpStatus: response.status(),
        ok: body.ok,
        persistedStatus: record.status,
        exitCode: record.exitCode,
      }),
    });
    const succeeded = panel === 'security' && record.status === 'completed';
    expect(record.status).toBe(succeeded ? 'completed' : 'failed');
    expect.soft(body.ok).toBe(succeeded);
    expect.soft(response.status()).toBe(succeeded ? 200 : 422);
    expect((body.run ?? body.scan).id).toBe(record.id);
    if (panel === 'workflows') {
      await expect(
        page.locator('[data-testid="ide-service-panel"][data-panel="workflows"]').getByRole('alert'),
      ).toContainText('execution failed');
      await expect(page.getByTestId('workflow-item-42').locator('header > div > em[data-status="failed"]')).toBeVisible();
      await page.screenshot({ path: info.outputPath('workflow-failed.png') });
    }
    if (panel === 'security') {
      await page.screenshot({ path: info.outputPath('security-outcome.png') });
      await expect(page.locator('.bolt-project-security-progress')).toHaveAttribute(
        'data-status',
        succeeded ? 'completed' : 'failed',
      );
    }
  });
}
