import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
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
  const pane = page.getByTestId('responsive-code-editor').filter({
    has: page.locator('.bolt-project-editor-toolbar-file').filter({ hasText: /^\/?README\.md$/ }),
  });
  const editor = pane.locator('[data-editor-kind="monaco"] .view-lines:visible');
  await expect(editor).toBeVisible();
  return editor;
}

test(
  'IDE reimport preserves protected bytes and deletes exactly one obsolete leaf on the same pod and PVC',
  { tag: '@runtime' },
  async ({ page }) => {
    test.setTimeout(240_000);
    expect(process.env.GITHUB_ACTIONS).toBe('true');
    expect(process.env.RUNNER_ENVIRONMENT).toBe('github-hosted');
    const namespace = process.env.PRIVATE_RUNTIME_RECIPE_ID ?? '';
    assertRecipeClusterName(namespace);
    expect(process.env.RUNTIME_API_E2E_NAMESPACE).toBe(namespace);
    const kubeconfig = process.env.KUBECONFIG;
    if (!kubeconfig) throw new Error('Missing isolated recipe kubeconfig');
    const kubeArgs = ['--kubeconfig', kubeconfig];
    const config = await exec('kubectl', [...kubeArgs, 'config', 'view', '--raw', '-o', 'json'], { timeout: 10_000 });
    assertRecipeKubeconfig(JSON.parse(config.stdout), namespace);

    const nonce = randomUUID();
    const initial = 'Initial-README';
    const marker = `# README\nPersistance vérifiée — ${nonce}\n東京`;

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

    const pod = `workspace-${workspace}`;
    const target = [...kubeArgs, '--context', `kind-${namespace}`, '-n', namespace];
    const kube = async (...args: string[]) => (await exec('kubectl', [...target, ...args], { timeout: 15_000 })).stdout;
    const agent = (...args: string[]) => kube('exec', pod, '-c', 'workspace-agent', '--', ...args);
    async function identity() {
      const desc = JSON.parse(await kube('get', 'pod', pod, '-o', 'json'));
      const container = desc.spec.containers.find((c: { name: string }) => c.name === 'workspace-agent');
      const mount = container.volumeMounts.find((m: { mountPath: string }) => m.mountPath === '/workspace');
      const claim = desc.spec.volumes.find((v: { name: string }) => v.name === mount.name).persistentVolumeClaim
        .claimName;
      const pvc = JSON.parse(await kube('get', 'pvc', claim, '-o', 'json'));
      expect(pvc.status.phase).toBe('Bound');
      const result = { podUid: desc.metadata.uid, pvcUid: pvc.metadata.uid, pv: pvc.spec.volumeName };
      for (const value of Object.values(result)) expect(value).toEqual(expect.any(String));
      return result;
    }

    const editor = await openReadme(page, id);
    await expect(editor).toHaveText(initial, { timeout: 60_000 });
    await expect
      .poll(
        async () => {
          const file = await page.request.get(`${api}/api/runtime/workspaces/${workspace}/files/read?path=README.md`, {
            headers,
          });
          if (!file.ok()) return false;
          const body = await file.json();
          return Buffer.from(body.content, body.encoding ?? 'utf8').equals(Buffer.from(initial));
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const before = await identity();
    const old = `obsolete-${nonce}`;
    const protectedPaths = ['package-lock.json', 'deep/yarn.lock', 'node_modules/sentinel', '.git/sentinel'];
    const stale = `${old}/stale.ts`;
    const fixtures = Object.fromEntries(
      [...protectedPaths.map((p) => `${old}/${p}`), stale].map((path) => [
        path,
        Buffer.from(`\u0000${nonce}:${path}\n`).toString('base64'),
      ]),
    );
    await agent(
      'node',
      '-e',
      `
      const fs = require('node:fs'), path = require('node:path');
      process.chdir('/workspace');
      fs.mkdirSync(process.argv[1]);
      for (const [p, b] of Object.entries(JSON.parse(process.argv[2]))) {
        fs.mkdirSync(path.dirname(p), {recursive:true});
        fs.writeFileSync(p, Buffer.from(b,'base64'), {flag:'wx'});
      }`,
      old,
      JSON.stringify(fixtures),
    );
    const inventory = async (): Promise<Record<string, string>> =>
      JSON.parse(
        await agent(
          'node',
          '-e',
          `
      const fs = require('node:fs'), path = require('node:path');
      process.chdir('/workspace');
      const out = {};
      function walk(dir) {
        for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
          const p = path.join(dir,e.name);
          if (e.isDirectory()) walk(p);
          else if (e.isFile()) out[p] = fs.readFileSync(p).toString('base64');
          else throw Error('unexpected special file in synthetic workspace');
        }
      }
      walk('.'); console.log(JSON.stringify(out));`,
        ),
      );
    const expectedTree = await inventory();
    expect(expectedTree).toMatchObject(fixtures);
    expect(expectedTree['README.md']).toBe(Buffer.from(initial).toString('base64'));
    delete expectedTree[stale];
    expectedTree['README.md'] = Buffer.from(marker).toString('base64');

    // Only the storage revision changes here. Reopening the IDE drives the actual pod reimport.
    zip.file('README.md', marker);
    const update = await page.request.post(`${api}/projects/${id}/files/import/zip`, {
      headers,
      data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
    });
    expect(update.ok()).toBe(true);
    const beforeReload = await inventory();
    expect(beforeReload[stale]).toBe(fixtures[stale]);
    expect(beforeReload['README.md']).toBe(Buffer.from(initial).toString('base64'));
    const [download] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${web}/api/projects/${id}/project-action?intent=export` && r.ok(), {
        timeout: 60_000,
      }),
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
    async function archiveFiles(bytes: Buffer) {
      const archive = await JSZip.loadAsync(bytes);
      const entries = Object.values(archive.files).filter((e) => !e.dir);
      return Object.fromEntries(await Promise.all(entries.map(async (e) => [e.name, await e.async('base64')])));
    }
    const archived = await archiveFiles(await download.body());
    expect(archived['README.md']).toBe(expectedTree['README.md']);
    await expect.poll(inventory, { timeout: 60_000 }).toEqual(expectedTree);
    expect(await identity()).toEqual(before);
    const exported = await page.request.get(`${api}/projects/${id}/export/zip`, { headers });
    expect(exported.status()).toBe(200);
    expect(await archiveFiles(Buffer.from((await exported.json()).archive.base64, 'base64'))).toEqual(archived);
    await writeFile(
      'private-runtime-evidence/reimport.json',
      JSON.stringify({
        commit: process.env.GITHUB_SHA,
        before,
        after: await identity(),
        removed: stale,
        protected: protectedPaths,
        archived: Object.keys(archived),
        comparedFiles: Object.keys(expectedTree).length,
      }),
      { flag: 'wx' },
    );
  },
);
