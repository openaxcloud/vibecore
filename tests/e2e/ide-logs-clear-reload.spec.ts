import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

type LogsEnvelope = {
  status: string;
  data: {
    recentActivity?: Array<{ action?: string }>;
    runtimeLogs?: { logs?: unknown[] };
  };
};

async function createProject(page: Page, appBase: string) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `logs-reload-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Logs reload audit',
      organizationName: `Logs reload ${suffix}`,
    },
  });
  expect(registration.ok(), `Registration HTTP ${registration.status()}`).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'Logs reload audit' },
  });
  expect(creation.ok(), `Project creation HTTP ${creation.status()}`).toBeTruthy();

  const projectId = ((await creation.json()) as { project: { id: string } }).project.id;
  const archive = new JSZip();
  archive.file('README.md', '# Logs reload fixture\n');

  const imported = await page.request.post(`${api}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok(), `Archive import HTTP ${imported.status()}`).toBeTruthy();

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: appBase, httpOnly: true, sameSite: 'Lax' },
    { name: 'vibecore-lang', value: 'en', url: appBase },
  ]);

  return projectId;
}

async function recordLogsResponse(response: Response, info: TestInfo, phase: string) {
  expect(response.status()).toBe(200);

  const envelope = (await response.json()) as LogsEnvelope;
  expect(envelope.status).toBe('ok');

  const activity = envelope.data.recentActivity ?? [];

  /*
   * The real ZIP import creates this audit event. System summary placeholders
   * alone must not stand in for a successfully loaded project's activity.
   */
  expect(activity.some((event) => event.action === 'project.files.import_zip')).toBe(true);
  await info.attach(`${phase}-response`, {
    contentType: 'application/json',
    body: JSON.stringify({
      status: response.status(),
      envelopeStatus: envelope.status,
      activityCount: activity.length,
      importEventPresent: true,
      runtimeLogCount: envelope.data.runtimeLogs?.logs?.length ?? 0,
    }),
  });
}

for (const width of [1440, 1024]) {
  test.describe(`Logs reload at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 1440 ? 900 : 768 }, isMobile: false, hasTouch: false });

    test('Clear then Reload restores real System logs without reloading the page', async ({ page, baseURL }, info) => {
      test.setTimeout(90_000);
      expect(baseURL).toBeTruthy();

      const deletes: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'DELETE') {
          deletes.push(new URL(request.url()).pathname);
        }
      });

      const projectId = await createProject(page, baseURL!);

      const isLogsResponse = (response: Response) =>
        new URL(response.url()).pathname === `/api/projects/${projectId}/ide-panel/logs` &&
        response.request().method() === 'GET';

      /*
       * Hold the real memory response until the user selects a stream in the
       * startup shell. No successful API payload is replaced by this test.
       */
      const memoryUrl = `**/api/projects/${projectId}/ide-state`;

      let releaseMemory!: () => void;

      const memoryGate = new Promise<void>((resolve) => {
        releaseMemory = resolve;
      });
      await page.route(memoryUrl, async (route) => {
        if (route.request().method() === 'GET') {
          await memoryGate;
        }

        await route.continue();
      });

      const logs = page.locator('.bolt-project-console-tool');
      const system = logs.locator('.bolt-project-console-streams button').nth(2);

      try {
        const initialResponse = page.waitForResponse(isLogsResponse);
        await page.goto(`/projects/${projectId}/ide?panel=logs`);
        await recordLogsResponse(await initialResponse, info, 'initial');
        await expect(logs).toBeVisible();

        const startupPanel = await logs.elementHandle();
        expect(startupPanel).not.toBeNull();
        await system.click();
        await expect(system).toHaveAttribute('aria-pressed', 'true');
        releaseMemory();
        await expect.poll(() => startupPanel!.evaluate((node) => !node.isConnected)).toBe(true);
        await expect(logs).toBeVisible();
        await expect(system).toHaveAttribute('aria-pressed', 'true');
        await startupPanel!.dispose();
      } finally {
        releaseMemory();
        await page.unroute(memoryUrl);
      }

      const lines = logs.locator('.bolt-project-log-line');
      await expect(lines.first()).toBeVisible();

      const before = await lines.count();
      await page.screenshot({ path: info.outputPath('before-clear.png') });

      /*
       * Pause automatic polling so the response below belongs to the user's
       * Reload gesture, rather than an unrelated five-second live-tail tick.
       */
      const liveTail = logs.getByRole('button', { name: /toggle live tail/i });

      if ((await liveTail.getAttribute('aria-pressed')) === 'true') {
        await liveTail.click();
      }

      await expect(liveTail).toHaveAttribute('aria-pressed', 'false');

      await logs.getByRole('button', { name: /clear visible logs/i }).click();
      await expect(lines).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('after-clear.png') });

      const reload = logs.getByRole('button', { name: /reload logs from backend/i });
      const reloadedResponse = page.waitForResponse(isLogsResponse);
      await reload.click();
      await recordLogsResponse(await reloadedResponse, info, 'reload');
      await expect(reload).toBeEnabled();

      try {
        await expect(lines.first()).toBeVisible();
        await expect(system).toHaveAttribute('aria-pressed', 'true');
      } finally {
        await info.attach('reload-counts', {
          contentType: 'application/json',
          body: JSON.stringify({ before, afterReload: await lines.count() }),
        });
        await page.screenshot({ path: info.outputPath('after-reload.png') });
      }

      /*
       * Only the failure is injected: every successful payload comes from the
       * local API and PostgreSQL fixture, never a fulfilled/mocked response.
       */
      const logsUrl = `**/api/projects/${projectId}/ide-panel/logs`;

      let failedRequests = 0;
      await page.route(logsUrl, async (route) => {
        failedRequests++;
        await route.abort('failed');
      });
      await logs.getByRole('button', { name: /clear visible logs/i }).click();
      await expect(lines).toHaveCount(0);
      await reload.click();

      const service = page.locator('[data-testid="ide-service-panel"][data-panel="logs"]');
      const error = service.getByRole('alert');
      await expect(error).toBeVisible();
      await expect(error.getByRole('button', { name: /retry/i })).toBeEnabled();
      expect(failedRequests).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath('reload-network-error.png') });
      await page.unroute(logsUrl);

      const recoveredResponse = page.waitForResponse(isLogsResponse);
      await error.getByRole('button', { name: /retry/i }).click();
      await recordLogsResponse(await recoveredResponse, info, 'error-retry');
      await expect(error).toHaveCount(0);
      await expect(system).toHaveAttribute('aria-pressed', 'true');
      await expect(lines.first()).toBeVisible();
      await page.screenshot({ path: info.outputPath('after-error-retry.png') });
      expect(deletes, 'Clear/Reload/Retry must not delete server logs').toEqual([]);

      const fullReloadResponse = page.waitForResponse(isLogsResponse);
      await page.reload();
      await recordLogsResponse(await fullReloadResponse, info, 'full-reload');
      await expect(logs).toBeVisible();
      await system.click();
      await expect(lines.first()).toBeVisible();
      await page.screenshot({ path: info.outputPath('after-full-reload.png') });
    });
  });
}
