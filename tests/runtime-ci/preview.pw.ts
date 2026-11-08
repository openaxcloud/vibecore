import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
// eslint-disable-next-line no-restricted-imports -- Test-only runner helper is outside the application alias.
import { cleanupEphemeralRuntimeWorkspaces } from '../../scripts/ci/cleanup-runtime-workspaces';
import { serverBackedStaticFiles } from './server-backed-static-fixture';

// Additional live evidence only. The original 18 @runtime cases remain separate and mandatory.
for (const kind of ['static', 'vite'] as const) {
  test(
    `ephemeral Kubernetes: real ${kind === 'static' ? 'server-backed static' : kind} application reaches the preview`,
    { tag: '@ephemeral-smoke' },
    async ({ page }) => {
      test.setTimeout(300_000);

      const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
      const app = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
      const suffix = `${Date.now()}-${kind}`;

      const registration = await page.request.post(`${api}/auth/register`, {
        data: {
          email: `runtime-ci-${suffix}@local.test`,
          password: 'RuntimeCi!12345',
          name: 'Runtime CI',
          organizationName: `Runtime CI ${suffix}`,
        },
      });
      expect(registration.ok(), `Registration HTTP ${registration.status()}`).toBeTruthy();

      const auth = (await registration.json()) as { token: string; organization: { id: string } };
      await page
        .context()
        .addCookies([{ name: 'vc_session', value: auth.token, url: app, httpOnly: true, sameSite: 'Lax' }]);

      const headers = { authorization: `Bearer ${auth.token}` };

      const created = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
        headers,
        data: { name: `Runtime CI ${kind}` },
      });
      expect(created.ok(), `Create project HTTP ${created.status()}`).toBeTruthy();

      const { project } = (await created.json()) as { project: { id: string } };
      const marker = `real-kubernetes-preview-${suffix}`;
      const zip = new JSZip();

      if (kind === 'vite') {
        zip.file(
          'package.json',
          JSON.stringify({
            private: true,
            type: 'module',
            scripts: { dev: 'vite' },
            devDependencies: { vite: '5.4.19' },
          }),
        );
        zip.file(
          'index.html',
          '<!doctype html><html><body><main id="app"></main><script type="module" src="/src/main.js"></script></body></html>',
        );
        zip.file('src/main.js', `document.querySelector('#app').textContent = ${JSON.stringify(marker)};`);
      } else {
        for (const [filePath, content] of Object.entries(serverBackedStaticFiles(marker))) {
          zip.file(filePath, content);
        }
      }

      const imported = await page.request.post(`${api}/projects/${project.id}/files/import/zip`, {
        headers,
        data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
      });
      expect(imported.ok(), `Import HTTP ${imported.status()}`).toBeTruthy();
      await page.goto(`/projects/${project.id}/ide`, { waitUntil: 'domcontentloaded' });

      const runtime = page.locator('.bolt-project-statusbar-workspace');
      await expect(runtime).toContainText(/running/i, { timeout: 180_000 });
      await page.getByRole('button', { name: 'Webview', exact: true }).click();
      await expect(page.locator('iframe[title="preview"]').first()).toBeVisible({ timeout: 90_000 });

      // A client-side srcdoc/static fallback must never count as real pod evidence.
      await expect(page.locator('iframe[title="preview"]').first()).toHaveAttribute(
        'src',
        /^http:\/\/[a-z0-9-]+-[0-9]+\.localhost:3020\//,
        { timeout: 180_000 },
      );
      await expect(page.frameLocator('iframe[title="preview"]').locator('#app')).toHaveText(marker, {
        timeout: 180_000,
      });

      // The dot includes app/port readiness, so verify it after opening the preview.
      await expect(runtime.locator('.bolt-project-statusbar-runtime-dot')).toHaveAttribute('data-state', 'running', {
        timeout: 15_000,
      });
    },
  );
}

test.afterEach(cleanupEphemeralRuntimeWorkspaces);
