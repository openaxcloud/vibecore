// Live proof harness for File History (RPL-FH-001.*).
// Seeds a real project via the local SaaS API, opens the real IDE, drives the
// History panel, and captures responsive light/dark screenshots.
import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync } from 'node:fs';

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const outDir = process.env.FH_OUT ?? '/private/tmp/claude-501/-Users-hb-dev-vibecore/52c7ea32-0da7-4ae2-94db-b564ececf263/scratchpad/fh-shots';
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function authenticate(api) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await api.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `fh-proof-${suffix}@local.test`,
      password: 'Password123!',
      name: 'FH Proof',
      organizationName: `FH Proof ${suffix}`,
    },
  });
  const text = await res.text();
  if (!res.ok()) throw new Error(`register failed ${res.status()}: ${text}`);
  return JSON.parse(text);
}

async function seedProject(api, auth) {
  const create = await api.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'File History proof' },
  });
  if (!create.ok()) throw new Error(`create project ${create.status()}: ${await create.text()}`);
  const projectId = (await create.json()).project.id;

  const zip = new JSZip();
  zip.file('index.html', '<div id="root"></div>\n');
  zip.file(
    'src/greeting.ts',
    ['export function greeting(name: string) {', '  return `Hello, ${name}!`;', '}', ''].join('\n'),
  );
  const importRes = await api.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  if (!importRes.ok()) throw new Error(`import ${importRes.status()}: ${await importRes.text()}`);
  return projectId;
}

async function main() {
  const api = await pwRequest.newContext({ timeout: 60000 });
  const auth = await authenticate(api);
  const projectId = await seedProject(api, auth);
  console.log('projectId', projectId);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[browser error]', m.text().slice(0, 200));
  });

  await page.goto(`${appBaseUrl}/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  // Wait for the "Loading E-Code IDE" overlay to disappear.
  await page
    .getByText('Loading E-Code IDE', { exact: false })
    .waitFor({ state: 'detached', timeout: 45000 })
    .catch(() => console.log('loading overlay still present after 45s'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outDir}/00-ide-loaded.png`, fullPage: false });

  // Switch to the editor panel and open the seeded file.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'editor' } }));
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('vibecore:open-editor-file', { detail: { filePath: 'src/greeting.ts' } }));
  });
  await page.waitForTimeout(1500);

  const treeItem = page.getByText('greeting.ts', { exact: false }).first();
  if (await treeItem.count()) {
    await treeItem.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${outDir}/01-file-open.png`, fullPage: false });

  // Probe: is workbenchStore reachable, and can we create/select a file directly?
  const probe = await page.evaluate(async () => {
    const w = window;
    const candidates = Object.keys(w).filter((k) => /workbench|store/i.test(k));
    let created = false;
    let err = '';
    try {
      const mod = w.workbenchStore ? { workbenchStore: w.workbenchStore } : await import('/app/lib/stores/workbench.ts');
      const s = mod.workbenchStore;
      if (s && typeof s.createFile === 'function') {
        await s.createFile('/home/project/notes.txt', 'line one\n');
        s.setSelectedFile('/home/project/notes.txt');
        created = true;
      }
    } catch (e) {
      err = String(e).slice(0, 200);
    }
    return { candidates, created, err };
  });
  console.log('probe', JSON.stringify(probe));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/02-after-createfile.png`, fullPage: false });

  const btn = page.locator('[data-testid="file-history-open"]');
  await btn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  console.log('history button visible?', await btn.isVisible().catch(() => false));
  console.log('history button count', await btn.count());

  await browser.close();
  await api.dispose();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
