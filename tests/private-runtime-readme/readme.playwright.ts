import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { assertRecipeClusterName, assertRecipeKubeconfig } from '../../scripts/private-runtime-recipe/checks.js';

const exec = promisify(execFile);
const api = 'http://127.0.0.1:3001';
const web = 'http://127.0.0.1:5173';

async function openReadme(page: Page, projectId: string) {
  await page.goto(`${web}/projects/${projectId}/ide?panel=files`, { waitUntil: 'domcontentloaded' });
  const file = page.locator('.bolt-file-tree-node:visible').filter({
    has: page.locator('.bolt-file-tree-name').filter({ hasText: /^README\.md$/ }),
  });
  await file.click({ timeout: 60_000 });
  const editor = page.locator('.cm-content:visible[contenteditable=true]');
  await expect(editor).toBeVisible();
  return editor;
}

test(
  'README Save persists identical bytes across the runtime, volume, fresh tab and ZIP',
  { tag: '@runtime' },
  async ({ page, browser }) => {
    test.setTimeout(240_000);
    const namespace = process.env.PRIVATE_RUNTIME_RECIPE_ID ?? '';
    assertRecipeClusterName(namespace);
    expect(process.env.RUNTIME_API_E2E_NAMESPACE).toBe(namespace);
    const kubeconfig = process.env.KUBECONFIG;
    if (!kubeconfig) throw new Error('Missing isolated recipe kubeconfig');
    const kubeArgs = ['--kubeconfig', kubeconfig];
    const config = await exec('kubectl', [...kubeArgs, 'config', 'view', '--raw', '-o', 'json'], { timeout: 10_000 });
    assertRecipeKubeconfig(JSON.parse(config.stdout), namespace);

    const nonce = randomUUID();
    const initial = '# Initial README';
    const marker = `# README\nPersistance vérifiée — ${nonce}\n東京`;
    const expected = Buffer.from(marker, 'utf8');
    const registration = await page.request.post(`${api}/auth/register`, {
      data: {
        email: `readme-${nonce}@local.test`,
        password: 'ReadmeProof!12345',
        name: 'README E2E',
        organizationName: `README ${nonce}`,
      },
    });
    expect(registration.ok()).toBe(true);
    const auth = await registration.json();
    const headers = { authorization: `Bearer ${auth.token}` };
    const created = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: `README ${nonce}` },
    });
    expect(created.ok()).toBe(true);
    const id: string = (await created.json()).project.id;
    const workspace = 'ws-' + createHash('sha256').update(`${id}:${auth.user.id}`).digest('hex').slice(0, 16);
    const zip = new JSZip();
    zip.file('README.md', initial);
    const imported = await page.request.post(`${api}/projects/${id}/files/import/zip`, {
      headers,
      data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
    });
    expect(imported.ok()).toBe(true);
    const cookie = { name: 'vc_session', value: auth.token, url: web, httpOnly: true, sameSite: 'Lax' as const };
    await page.context().addCookies([cookie]);

    await test.step('Save README in the IDE and observe durable acknowledgement', async () => {
      const editor = await openReadme(page, id);
      await expect(editor).toHaveText(initial, { timeout: 60_000 });
      await editor.press('ControlOrMeta+a');
      await page.keyboard.insertText(marker);
      const save = page.locator('.vc-editor-header-save-button:visible');
      await expect(save).toBeEnabled();
      const [put] = await Promise.all([
        page.waitForRequest(
          (req) => {
            if (req.method() !== 'PUT' || req.url() !== `${api}/api/runtime/workspaces/${workspace}/files/write`)
              return false;
            const body = req.postDataJSON();
            return (
              body.path === 'README.md' && body.content === marker && req.headers()['x-vc-write-origin'] !== 'stream'
            );
          },
          { timeout: 60_000 },
        ),
        save.click(),
      ]);
      const result = await put.response();
      expect(result?.status()).toBe(204);
      expect(await result!.headerValue('x-vc-file-persistence')).toBe('manifest');
    });

    await test.step('Read the saved bytes from the runtime API', async () => {
      const result = await page.request.get(`${api}/api/runtime/workspaces/${workspace}/files/read?path=README.md`, {
        headers,
      });
      expect(result.status()).toBe(200);
      const file = await result.json();
      expect(Buffer.from(file.content, file.encoding ?? 'utf8')).toEqual(expected);
    });

    await test.step('Read the saved bytes from the agent volume', async () => {
      const target = [...kubeArgs, '--context', `kind-${namespace}`, '-n', namespace];
      const pod = `workspace-${workspace}`;
      const descriptor = JSON.parse(
        (await exec('kubectl', [...target, 'get', 'pod', pod, '-o', 'json'], { timeout: 15_000 })).stdout,
      );
      const agent = descriptor.spec.containers.find((c: { name: string }) => c.name === 'workspace-agent');
      const mount = agent.volumeMounts.find((v: { mountPath: string }) => v.mountPath === '/workspace');
      expect(
        descriptor.spec.volumes.find((v: { name: string }) => v.name === mount.name).persistentVolumeClaim.claimName,
      ).toBeTruthy();
      const { stdout } = await exec(
        'kubectl',
        [...target, 'exec', pod, '-c', 'workspace-agent', '--', 'cat', '/workspace/README.md'],
        { encoding: 'buffer', timeout: 15_000 },
      );
      expect(stdout).toEqual(expected);
    });

    await test.step('Reopen README in a new tab with only the session cookie', async () => {
      const context = await browser.newContext();
      try {
        await context.addCookies([cookie]);
        const editor = await openReadme(await context.newPage(), id);
        await expect
          .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'), { timeout: 60_000 })
          .toBe(marker);
      } finally {
        await context.close();
      }
    });

    await test.step('Compare the exported ZIP entry bytes', async () => {
      const result = await page.request.get(`${api}/projects/${id}/export/zip`, { headers });
      expect(result.status()).toBe(200);
      const archive = await JSZip.loadAsync((await result.json()).archive.base64, { base64: true });
      const entry = archive.file('README.md');
      expect(entry).toBeTruthy();
      expect(await entry!.async('nodebuffer')).toEqual(expected);
    });
  },
);
