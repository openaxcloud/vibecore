// LIVE prod proof for File History (RPL-FH-001.*) against the real Project Editor.
// Single browser context (File History persists in per-context IndexedDB): seed a
// real project, open the real IDE, build real version history via edit+Save, then
// capture the panel responsively at 390/768/1024/1440 in light & dark.
import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync } from 'node:fs';

const appBaseUrl = process.env.APP_BASE_URL ?? 'https://app.e-code.ai';
const apiBaseUrl = process.env.API_BASE_URL ?? 'https://api.e-code.ai';
const outDir = process.env.FH_OUT ?? '/private/tmp/claude-501/-Users-hb-dev-vibecore/52c7ea32-0da7-4ae2-94db-b564ececf263/scratchpad/fh-prod-shots';
mkdirSync(outDir, { recursive: true });

const FILE_REL = 'src/greeting.ts';
const WIDTHS = [
  { w: 390, h: 844, name: 'mobile-390' },
  { w: 768, h: 1024, name: 'tablet-768' },
  { w: 1024, h: 768, name: 'tablet-1024' },
  { w: 1440, h: 900, name: 'desktop-1440' },
];
const EDITS = [
  'export function greeting(name) {\n  return `Hello, ${name}!`;\n}\n',
  "export function greeting(name, punctuation = '!') {\n  return `Hello, ${name}${punctuation}`;\n}\n",
  "export function greeting(name, punctuation = '!') {\n  const trimmed = String(name).trim();\n  return `Hello, ${trimmed || 'friend'}${punctuation}`;\n}\n",
];
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function authenticate(api) {
  const sfx = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await api.post(`${apiBaseUrl}/auth/register`, {
    data: { email: `fh-prod-${sfx}@e-code-proof.test`, password: 'Password123!', name: 'FH Prod', organizationName: `FH Prod ${sfx}` },
  });
  if (!res.ok()) throw new Error(`register ${res.status()}: ${await res.text()}`);
  return JSON.parse(await res.text());
}

async function seedProject(api, auth) {
  const create = await api.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'File History live proof' },
  });
  const projectId = (await create.json()).project.id;
  const zip = new JSZip();
  zip.file('index.html', '<div id="root"></div>\n');
  zip.file(FILE_REL, ['export function greeting(name) {', "  return 'Hello ' + name;", '}', ''].join('\n'));
  const imp = await api.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  if (!imp.ok()) throw new Error(`import ${imp.status()}: ${await imp.text()}`);
  return projectId;
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const r = document.documentElement;
    r.setAttribute('data-theme', t);
    r.classList.toggle('dark', t === 'dark');
    r.classList.toggle('light', t === 'light');
  }, theme);
  await page.waitForTimeout(300);
}

async function openFile(page) {
  const item = page.getByText('greeting.ts', { exact: false }).first();
  await item.waitFor({ state: 'visible', timeout: 180000 });
  await item.click();
  await page.waitForTimeout(2500);
}

async function ensureEditorVisible(page, width) {
  // On the mobile/tablet IDE (<=1199) the editor is a switchable panel.
  if (width <= 1199) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'editor' } }));
    });
    await page.waitForTimeout(600);
    // Re-select the file so a document is open in this layout.
    const item = page.getByText('greeting.ts', { exact: false }).first();
    if (await item.count()) await item.click().catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function buildHistory(page) {
  const editor = page.locator('.bolt-project-editor-adapter, [data-testid="responsive-code-editor"] textarea').first();
  await editor.waitFor({ state: 'visible', timeout: 30000 });
  for (const content of EDITS) {
    await editor.click();
    await page.keyboard.press(`${MOD}+A`);
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(content);
    // Save via the toolbar button (fires saveCurrentDocument -> capture).
    const save = page.getByRole('button', { name: /^Save$/ }).first();
    if (await save.count()) await save.click();
    else await page.keyboard.press(`${MOD}+S`);
    await page.waitForTimeout(1500);
  }
}

async function drivePanel(page, tag) {
  const openBtn = page.locator('[data-testid="file-history-open"]');
  await openBtn.waitFor({ state: 'visible', timeout: 30000 });
  await page.screenshot({ path: `${outDir}/${tag}-a-button.png` });

  await openBtn.click();
  await page.locator('[data-testid="file-history-panel"]').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('[data-testid="file-history-slider"]').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outDir}/${tag}-b-panel.png` });

  // Navigate back two versions + Compare Latest (diff).
  await page.getByLabel('Previous version').click();
  await page.getByLabel('Previous version').click();
  await page.locator('[data-testid="file-history-compare"]').click();
  await page.locator('[data-testid="file-history-diff"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: `${outDir}/${tag}-c-compare.png` });

  // Restore-enabled state visible (older version selected) captured above.
  // Playback.
  await page.locator('[data-testid="file-history-compare"]').click();
  await page.locator('[data-testid="file-history-play"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${tag}-d-playback.png` });

  // Close the panel for the next config.
  await page.getByLabel('Close file history').click().catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(400);
}

async function main() {
  const api = await pwRequest.newContext({ timeout: 60000 });
  const auth = await authenticate(api);
  const projectId = await seedProject(api, auth);
  console.log('projectId', projectId);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[browser err]', m.text().slice(0, 160)); });

  await page.goto(`${appBaseUrl}/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await openFile(page);
  await buildHistory(page);
  console.log('history built');

  for (const theme of ['light', 'dark']) {
    for (const { w, h, name } of WIDTHS) {
      const tag = `${name}-${theme}`;
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(700);
      await setTheme(page, theme);
      await ensureEditorVisible(page, w);
      try {
        await drivePanel(page, tag);
        console.log('captured', tag);
      } catch (e) {
        console.log('FAILED', tag, String(e).slice(0, 140));
        await page.screenshot({ path: `${outDir}/${tag}-FAIL.png` }).catch(() => {});
      }
    }
  }

  await browser.close();
  await api.dispose();
  console.log('DONE');
}

main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
