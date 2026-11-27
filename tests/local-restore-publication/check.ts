import { chromium, expect } from '@playwright/test';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
type Deployment = { id: string; status: string; url?: string; publicUrl?: string };

async function main() {
  const api = process.env.SAAS_API_URL ?? '',
    web = process.env.PLAYWRIGHT_BASE_URL ?? '';
  for (const origin of [api, web]) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Loopback bench required');
  }
  const domain = process.env.PREVIEW_DOMAIN ?? '';
  if (!/^localhost:\d+$/.test(domain)) throw Error('Loopback preview domain required');
  const pin = process.env.RESTORE_TLS_SPKI;
  if (!pin || !/^[A-Za-z0-9+/]{43}=$/.test(pin)) throw Error('Missing fixture certificate pin');
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--ignore-certificate-errors-spki-list=' + pin],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const deletedBuildInputs = new Set<string>();
    context.on('request', (request) => {
      if (request.method() !== 'DELETE') return;
      const target = new URL(request.url());
      const file = target.searchParams.get('path') ?? '';
      if (target.origin === api && /^(?:\.cache\/\.vibecore-builds\/)?\.vibecore-deploy-[^/]+\//.test(file))
        deletedBuildInputs.add(file);
    });
    const id = randomUUID();
    const A = 'snapshot-' + id,
      B = 'saved-' + id,
      C = 'before-' + id;
    const html = (value: string) => '<h1>' + value + '</h1>';
    let headers = {};
    async function post(path: string, data: object) {
      const response = await context.request.post(api + path, { headers, data });
      expect(response.ok(), path + ' HTTP ' + response.status()).toBe(true);
      return response.json();
    }
    const user = await post('/auth/register', {
      email: id + '@local.test',
      password: 'Local!' + id,
      name: 'Restore fixture',
    });
    headers = { authorization: 'Bearer ' + user.token };
    const { project } = await post('/orgs/' + user.organization.id + '/projects', { name: 'Two-tab fixture' });
    const path = '/projects/' + project.id;
    const list = await context.request.get(api + path + '/workspaces', { headers });
    const workspace =
      (await list.json()).workspaces[0] ??
      (await post(path + '/workspaces', { name: 'Fixture', runtimeMode: 'remote-kubernetes' })).workspace;
    const zip = new JSZip();
    zip.file(
      'package.json',
      JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        scripts: { build: 'mkdir -p dist && cp index.html dist/index.html' },
      }),
    );
    const userFile = '.vibecore-deploy-user/bytes.bin';
    const binary = Buffer.from([0, 13, 10, 128, 255]);

    async function verifyExport(value: string) {
      const response = await context.request.get(api + path + '/export/zip', { headers });
      expect(response.ok()).toBe(true);
      const archive = await JSZip.loadAsync((await response.json()).archive.base64, { base64: true });
      expect(
        Object.values(archive.files)
          .filter((f) => !f.dir)
          .map((f) => f.name)
          .sort(),
      ).toEqual([userFile, 'index.html', 'package.json'].sort());
      expect(await archive.file(userFile)!.async('nodebuffer')).toEqual(binary);
      expect(await archive.file('index.html')!.async('nodebuffer')).toEqual(Buffer.from(html(value)));
      expect(await archive.file('package.json')!.async('nodebuffer')).toEqual(
        await zip.file('package.json')!.async('nodebuffer'),
      );
    }
    async function seed(value: string) {
      zip.file(userFile, value === A ? binary : Buffer.from([67]));
      zip.file('index.html', html(value));
      await post(path + '/files/import/zip', {
        replaceExisting: true,
        zipBase64: await zip.generateAsync({ type: 'base64' }),
      });
    }
    await seed(A);
    await post(path + '/snapshots', { label: A });
    await seed(C);
    console.log('Snapshot A and project version C seeded');
    await context.addCookies([{ name: 'vc_session', value: user.token, url: web, httpOnly: true }]);
    const first = await context.newPage(),
      second = await context.newPage();
    const ide = web + path + '/ide?workspace=' + workspace.id + '&panel=';
    await Promise.all([first.goto(ide + 'snapshots'), second.goto(ide + 'files')]);
    await second
      .locator('.bolt-file-tree-name:visible')
      .filter({ hasText: /^index\.html$/ })
      .click();
    const pane = second
      .getByTestId('responsive-code-editor')
      .filter({ has: second.locator('.bolt-project-editor-toolbar-file').filter({ hasText: /^\/?index\.html$/ }) });
    const editor = pane.locator('[data-editor-kind="monaco"] .view-lines:visible');
    await expect(editor).toContainText(C, { timeout: 60000 });
    console.log('Concurrent editor opened C');
    async function restore() {
      await first.bringToFront();
      await first.goto(ide + 'snapshots', { waitUntil: 'domcontentloaded' });
      const [response] = await Promise.all([
        first.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/ide-panel/')),
        first
          .locator('.bolt-project-snapshot-card')
          .filter({ has: first.getByText(A, { exact: true }) })
          .locator('button[type=submit]')
          .click(),
      ]);
      expect(response.ok()).toBe(true);
      console.log('restore HTTP', response.status());
      await second.bringToFront();
      console.log(
        'restored version visible on tab focus',
        (await editor.allTextContents()).some((text) => text.includes(A)),
      );
      await second
        .locator('.bolt-file-tree-name:visible')
        .filter({ hasText: /^index\.html$/ })
        .click();
      await expect(editor).toContainText(A, { timeout: 60000 });
      await verifyExport(A);
    }
    await restore();
    await editor.click();
    await second.keyboard.press('ControlOrMeta+a');
    await context.grantPermissions(['clipboard-write', 'clipboard-read'], { origin: web });
    await second.evaluate((text) => navigator.clipboard.writeText(text), html(B));
    await second.keyboard.press('ControlOrMeta+v');
    await expect(editor).toContainText(B);
    const [ack] = await Promise.all([
      second.waitForResponse((r) => {
        if (
          r.request().method() !== 'PUT' ||
          r.url() !== api + '/api/runtime/workspaces/' + workspace.id + '/files/write'
        )
          return false;
        const data = r.request().postDataJSON();
        return (
          data.path === 'index.html' &&
          data.content === html(B) &&
          r.request().headers()['x-vc-write-origin'] !== 'stream'
        );
      }),
      pane.locator('.bolt-project-editor-save-button').click(),
    ]);
    expect(ack.status()).toBe(204);
    expect(await ack.headerValue('x-vc-file-persistence')).toBe('manifest');
    async function publish(expected: string) {
      const deployments = async (): Promise<Deployment[]> =>
        (await (await context.request.get(api + path + '/deployments', { headers })).json()).deployments;
      const existing = new Set((await deployments()).map((row) => row.id));
      await second.locator('.bolt-project-publish-button').click();
      await second.getByTestId('publication-republier').click();
      const form = second.locator('form').filter({ has: second.locator('input[name=provider]') });
      if (!existing.size) {
        await form.locator('details > summary').first().click();
        await form.locator('input[name=deployModeOverride][value=static]').check();
        await form.getByRole('button', { name: /^(Publish|Publier)$/ }).click();
      }
      let url: string | undefined;
      let deploymentId: string | undefined;
      await expect
        .poll(
          async () => {
            const row = (await deployments()).find((r) => !existing.has(r.id));
            deploymentId = row?.id;
            url = row?.url ?? row?.publicUrl;
            return row && /^(ready|failed|canceled)$/i.test(row.status) ? row.status.toUpperCase() : 'IN_PROGRESS';
          },
          { timeout: 90000 },
        )
        .not.toBe('IN_PROGRESS');
      const completed = (await deployments()).find((row) => row.id === deploymentId);
      expect(deletedBuildInputs.size, 'Browser deleted build inputs during publication').toBe(0);
      expect(completed?.status.toUpperCase()).toBe('READY');
      if (!url) throw Error('Missing deployment URL');
      expect(deploymentId).toMatch(/^[a-z0-9]+$/);
      expect(new URL(url).href).toBe('https://s-' + deploymentId + '.' + domain + '/');
      const visitor = await browser.newContext();
      try {
        expect(await visitor.cookies()).toEqual([]);
        await visitor.route('**/*', (route) =>
          new URL(route.request().url()).origin === new URL(url!).origin ? route.continue() : route.abort(),
        );
        const page = await visitor.newPage();
        const response = await page.goto(url);
        if (!response) throw Error('Missing navigation response');
        expect(response.request().redirectedFrom()).toBeNull();
        await expect(page.locator('h1')).toHaveText(expected);
        expect(response.status()).toBe(200);
        expect(await response.text()).toBe(html(expected));
      } finally {
        await visitor.close();
      }
    }
    console.log('Version B acknowledged in manifest');
    await publish(B);
    await verifyExport(B);
    console.log('Anonymous browser rendered exact B');
    await second.goto(ide + 'files');
    await second
      .locator('.bolt-file-tree-name:visible')
      .filter({ hasText: /^index\.html$/ })
      .click();
    await expect(editor).toContainText(B);
    await restore();
    await publish(A);
    console.log('PASS: C → restored A → saved and published B → restored and republished A');
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
