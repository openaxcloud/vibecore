import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { assertRecipeClusterName, assertRecipeKubeconfig } from '../../scripts/private-runtime-recipe/checks.js';
import { checkLocalPublication } from './anonymous';
import { checkCalculation, emittedOrigin } from './probe';

const web = 'http://127.0.0.1:5173',
  api = 'http://127.0.0.1:3001';
test('publish the saved server rule and compute anonymously', async ({ page }) => {
  test.setTimeout(300_000);
  const ns = process.env.PRIVATE_RUNTIME_RECIPE_ID ?? '';
  assertRecipeClusterName(ns);
  expect(process.env.RUNTIME_API_E2E_NAMESPACE).toBe(ns);
  const config = process.env.KUBECONFIG;
  if (!config) throw Error('Isolated recipe kubeconfig required');
  const exec = promisify(execFile);
  const kube = async (...args: string[]) =>
    JSON.parse(
      (
        await exec('kubectl', ['--kubeconfig', config, '--context', `kind-${ns}`, '-n', ns, ...args, '-o', 'json'], {
          timeout: 15000,
        })
      ).stdout,
    );
  assertRecipeKubeconfig(
    JSON.parse(
      (await exec('kubectl', ['--kubeconfig', config, 'config', 'view', '--raw', '-o', 'json'], { timeout: 10000 }))
        .stdout,
    ),
    ns,
  );
  async function verifyService(name: string) {
    const service = await kube('get', 'service', name);
    const selector = Object.entries(service.spec.selector ?? {})
      .map(([key, value]) => key + '=' + value)
      .join(',');
    expect(selector.length).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const pods = await kube('get', 'pods', '-l', selector);
          const ready = new Set(
            pods.items
              .filter((pod: { status: { conditions?: { type: string; status: string }[] } }) =>
                pod.status.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True'),
              )
              .map((pod: { metadata: { uid: string } }) => pod.metadata.uid),
          );
          const slices = await kube('get', 'endpointslices', '-l', 'kubernetes.io/service-name=' + name);
          return slices.items.some(
            (slice: { endpoints: { conditions: { ready?: boolean }; targetRef?: { uid?: string } }[] }) =>
              slice.endpoints.some(
                (endpoint) => endpoint.conditions.ready === true && ready.has(endpoint.targetRef?.uid),
              ),
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);
  }
  await page.context().route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host.endsWith('.localhost')
      ? route.continue()
      : route.abort();
  });
  const version = randomUUID(),
    a = { version: version + '-a', factor: 3 },
    b = { version: version + '-b', factor: 7 };
  const authResponse = await page.request.post(api + '/auth/register', {
    data: { email: version + '@local.test', password: 'OnlyLocal!' + version, name: 'Dynamic fixture' },
  });
  expect(authResponse.ok()).toBe(true);
  const auth = await authResponse.json(),
    headers = { authorization: 'Bearer ' + auth.token };
  const created = await page.request.post(api + '/orgs/' + auth.organization.id + '/projects', {
    headers,
    data: { name: 'Dynamic ' + version },
  });
  expect(created.ok()).toBe(true);
  const project = (await created.json()).project.id,
    projectApi = api + '/projects/' + project;
  const zip = new JSZip();
  zip.file('server.cjs', readFileSync(new URL('./server.cjs', import.meta.url)));
  zip.file('rule.json', JSON.stringify(a));
  zip.file(
    'package.json',
    JSON.stringify({
      name: 'dynamic-fixture',
      version: '1.0.0',
      scripts: { start: 'node server.cjs', dev: 'node server.cjs' },
    }),
  );
  expect(
    (
      await page.request.post(projectApi + '/files/import/zip', {
        headers,
        data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
      })
    ).ok(),
  ).toBe(true);
  await page.context().addCookies([{ name: 'vc_session', value: auth.token, url: web, httpOnly: true }]);
  const ide = web + '/projects/' + project + '/ide?panel=';
  await page.goto(ide + 'preview');
  const run = page.getByTestId('button-run-stop');
  await expect(run).toBeVisible();
  if ((await run.innerText()).trim() === 'Stop') await run.click();
  await expect(run).toHaveText('Run');
  await run.click();
  const frame = page.locator('iframe[title="preview"]:visible');
  await expect(frame).toHaveAttribute('src', /^http:\/\/ws-[a-z0-9-]+-\d+\.localhost:3020\//, { timeout: 90000 });
  const preview = new URL((await frame.getAttribute('src'))!);
  const inspector = await page.context().newPage();
  await expect(async () => checkCalculation(inspector, preview.origin, a.version, a.factor)).toPass({ timeout: 60000 });
  const workspace = preview.hostname.replace(/-\d+\.localhost$/, '');
  await verifyService('workspace-' + workspace);
  await page.goto(ide + 'files');
  await page
    .locator('.bolt-file-tree-name:visible')
    .filter({ hasText: /^rule\.json$/ })
    .click();
  const pane = page
    .getByTestId('responsive-code-editor')
    .filter({ has: page.locator('.bolt-project-editor-toolbar-file').filter({ hasText: /^\/?rule\.json$/ }) });
  const editor = pane.locator('[data-editor-kind="monaco"] .view-lines:visible');
  await expect(editor).toContainText(a.version);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(JSON.stringify(b));
  await expect(editor).toContainText(b.version);
  const [ack] = await Promise.all([
    page.waitForResponse((r) => {
      if (r.request().method() !== 'PUT' || r.url() !== api + '/api/runtime/workspaces/' + workspace + '/files/write')
        return false;
      const body = r.request().postDataJSON();
      return (
        body.path === 'rule.json' &&
        body.content === JSON.stringify(b) &&
        r.request().headers()['x-vc-write-origin'] !== 'stream'
      );
    }),
    pane.locator('.bolt-project-editor-save-button').click(),
  ]);
  expect(ack.status()).toBe(204);
  expect(await ack.headerValue('x-vc-file-persistence')).toBe('manifest');
  await checkCalculation(inspector, preview.origin, b.version, b.factor);
  await page.locator('.bolt-project-publish-button').click();
  await page.getByTestId('publication-republier').click();
  const form = page.locator('form').filter({ has: page.locator('input[name=provider]') });
  await form.locator('details > summary').first().click();
  await form.locator('input[name=deployModeOverride][value=server]').check();
  await form.getByRole('button', { name: /^(Publish|Publier)$/ }).click();
  let id = '',
    origin = '',
    status = '';
  await expect
    .poll(
      async () => {
        const res = await page.request.get(projectApi + '/deployments', { headers });
        expect(res.ok()).toBe(true);
        const row = (await res.json()).deployments.find((item: { provider: string }) => item.provider === 'server');
        status = row?.status ?? '';
        if (['FAILED', 'CANCELED'].includes(status)) return true;
        if (status !== 'READY') return false;
        id = row.id;
        origin = emittedOrigin(row.url, id);
        return true;
      },
      { timeout: 120000 },
    )
    .toBe(true);
  expect(status).toBe('READY');
  await verifyService('app-' + id);
  await checkLocalPublication(origin, b.version, b.factor);
  writeFileSync(
    'private-runtime-evidence/dynamic-publication.json',
    JSON.stringify({
      commit: process.env.GITHUB_SHA,
      savedVersion: true,
      podEndpointReady: true,
      anonymousResponses: 2,
      httpStatus: 200,
      exactCalculation: true,
      network: 'local',
    }),
  );
});
