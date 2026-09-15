// LIVE prod proof for File History (RPL-FH-001.*).
// Uses a PERSISTENT context (IndexedDB survives relaunch): build real version
// history once, then relaunch at each native viewport (390/768/1024/1440) in
// light & dark and capture the panel — no resize, no re-editing in capture phase.
import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync, rmSync } from 'node:fs';

const APP = process.env.APP_BASE_URL ?? 'https://app.e-code.ai';
const API = process.env.API_BASE_URL ?? 'https://api.e-code.ai';
const OUT = process.env.FH_OUT;
const UDD = process.env.FH_UDD ?? '/private/tmp/claude-501/-Users-hb-dev-vibecore/52c7ea32-0da7-4ae2-94db-b564ececf263/scratchpad/fh-udd';
mkdirSync(OUT, { recursive: true });
try { rmSync(UDD, { recursive: true, force: true }); } catch {}
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const WIDTHS = [
  { w: 390, h: 844, name: 'mobile-390' },
  { w: 768, h: 1024, name: 'tablet-768' },
  { w: 1024, h: 768, name: 'tablet-1024' },
  { w: 1440, h: 900, name: 'desktop-1440' },
];

async function seed() {
  const api = await pwRequest.newContext({ timeout: 60000 });
  const sfx = Date.now() + '' + Math.random().toString(36).slice(2);
  const reg = await api.post(API + '/auth/register', { data: { email: `fhc-${sfx}@e-code-proof.test`, password: 'Password123!', name: 'F', organizationName: 'F ' + sfx } });
  const auth = JSON.parse(await reg.text());
  const cp = await api.post(API + '/orgs/' + auth.organization.id + '/projects', { headers: { authorization: 'Bearer ' + auth.token }, data: { name: 'FH live capture' } });
  const pid = (await cp.json()).project.id;
  const zip = new JSZip();
  zip.file('src/greeting.ts', 'export const MARKER = "seed_v1";\n');
  await api.post(API + '/projects/' + pid + '/files/import/zip', { headers: { authorization: 'Bearer ' + auth.token }, data: { zipBase64: await zip.generateAsync({ type: 'base64' }) } });
  await api.dispose();
  return { token: auth.token, pid };
}

async function launch(width, height, token, theme) {
  const ctx = await chromium.launchPersistentContext(UDD, { viewport: { width, height }, deviceScaleFactor: 2 });
  const cookies = [{ name: 'vc_session', value: token, url: APP, httpOnly: true, sameSite: 'Lax' }];
  if (theme) {
    // The IDE reads its theme from the `ecode_theme` cookie on load.
    const host = new URL(APP).hostname;
    const domain = host.endsWith('e-code.ai') ? '.e-code.ai' : host;
    cookies.push({ name: 'ecode_theme', value: theme, domain, path: '/', sameSite: 'Lax' });
  }
  await ctx.addCookies(cookies);
  const page = ctx.pages()[0] ?? await ctx.newPage();
  return { ctx, page };
}

async function splashPresent(page) {
  return (await page.getByText('Loading E-Code', { exact: false }).count()) > 0;
}

async function ensureNoSplash(page, timeout = 60000) {
  // The throwaway-project runtime re-shows the "Loading E-Code" splash while it
  // reconnects; wait until it is gone before interacting/capturing.
  for (let i = 0; i < timeout / 1000; i++) {
    if (!(await splashPresent(page))) return true;
    await page.waitForTimeout(1000);
  }
  return !(await splashPresent(page));
}


async function dismissTour(page) {
  for (const t of ['Skip tour', 'Skip', 'Got it', 'Dismiss']) {
    const el = page.getByRole('button', { name: new RegExp('^' + t + '$', 'i') }).first();
    if (await el.count()) { await el.click().catch(() => {}); await page.waitForTimeout(400); }
  }
}

async function waitForIdeReady(page) {
  await ensureNoSplash(page, 90000);
  await page.waitForTimeout(1500);
}

async function stableShot(page, path) {
  // Retry until the splash isn't covering the panel at capture time.
  for (let i = 0; i < 4; i++) {
    await ensureNoSplash(page, 30000);
    await page.waitForTimeout(600);
    if (!(await splashPresent(page))) {
      await page.screenshot({ path });
      return;
    }
  }
  await page.screenshot({ path });
}

async function openGreeting(page, width) {
  if (width <= 1199) {
    // Mobile IDE: surface the files panel, pick the file, then the editor panel.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'files' } })));
    await page.waitForTimeout(800);
  }
  const item = page.getByText('greeting.ts', { exact: false }).first();
  await item.waitFor({ state: 'visible', timeout: 180000 });
  await item.click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vibecore:open-editor-file', { detail: { filePath: 'src/greeting.ts' } })));
  if (width <= 1199) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'editor' } })));
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(2500);
}

async function setTheme(page, t) {
  await page.evaluate((th) => { const r = document.documentElement; r.setAttribute('data-theme', th); r.classList.toggle('dark', th === 'dark'); r.classList.toggle('light', th === 'light'); }, t);
  await page.waitForTimeout(300);
}

async function panelVersions(page) {
  const meta = await page.locator('[data-testid="file-history-meta"]').innerText().catch(() => '');
  const m = meta.match(/Version\s+(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[2]) : 0;
}

async function buildHistory(page) {
  await page.getByText('greeting.ts', { exact: false }).first().waitFor({ state: 'visible', timeout: 180000 });
  await page.getByText('greeting.ts', { exact: false }).first().click();
  await page.waitForTimeout(1500);
  // Wait for the runtime to serve the file content.
  for (let i = 0; i < 60; i++) {
    const t = await page.locator('.view-lines').first().innerText().catch(() => '');
    if (t.includes('seed_v1')) { console.log('content loaded @' + i * 2 + 's'); break; }
    await page.waitForTimeout(2000);
  }
  const target = 4;
  for (let attempt = 0; attempt < 8; attempt++) {
    // Read current version count via the panel.
    await page.locator('[data-testid="file-history-open"]').click().catch(() => {});
    await page.locator('[data-testid="file-history-panel"]').waitFor({ timeout: 8000 }).catch(() => {});
    const c = await panelVersions(page);
    await page.getByLabel('Close file history').click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(400);
    console.log('versions', c, 'attempt', attempt);
    if (c >= target) return c;
    try {
      await page.locator('.view-lines').first().click({ timeout: 8000 });
      await page.keyboard.press(MOD + '+A'); await page.keyboard.press('Delete');
      await page.keyboard.type('export const MARKER = "v' + (attempt + 2) + '_' + Math.random().toString(36).slice(2, 6) + '";');
      await page.waitForTimeout(500);
      await page.keyboard.press(MOD + '+S');
      await page.waitForTimeout(3000);
    } catch (e) { console.log('edit err', String(e).slice(0, 80)); }
  }
  return panelVersions(page);
}

async function drivePanel(page, tag) {
  await ensureNoSplash(page, 60000);
  const openBtn = page.locator('[data-testid="file-history-open"]');
  await openBtn.waitFor({ state: 'visible', timeout: 30000 });
  await stableShot(page, `${OUT}/${tag}-a-button.png`);
  await openBtn.click();
  await page.locator('[data-testid="file-history-panel"]').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('[data-testid="file-history-slider"]').waitFor({ state: 'visible' });
  const v = await panelVersions(page);
  console.log(tag, 'versions in panel:', v);
  await stableShot(page, `${OUT}/${tag}-b-panel.png`);
  if (v >= 2) {
    await page.getByLabel('Previous version').click();
    if (v >= 3) await page.getByLabel('Previous version').click();
    await page.locator('[data-testid="file-history-compare"]').click();
    await page.locator('[data-testid="file-history-diff"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await stableShot(page, `${OUT}/${tag}-c-compare.png`);
    await page.locator('[data-testid="file-history-compare"]').click();
    await page.locator('[data-testid="file-history-play"]').click();
    await page.waitForTimeout(500);
    await stableShot(page, `${OUT}/${tag}-d-playback.png`);
  }
  await page.getByLabel('Close file history').click().catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(300);
}

async function main() {
  let { token, pid } = await seed();
  console.log('project', pid);

  // Build phase: retry across fresh projects until real history exists, because
  // the throwaway runtime / Monaco occasionally rejects edits.
  let built = 0;
  for (let projAttempt = 0; projAttempt < 3 && built < 4; projAttempt++) {
    const { ctx, page } = await launch(1440, 900, token, 'dark');
    try {
      await page.goto(APP + '/projects/' + pid + '/ide', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await waitForIdeReady(page);
      await dismissTour(page);
      built = await buildHistory(page);
      console.log('history built:', built, 'versions (project attempt', projAttempt + ')');
    } catch (e) { console.log('build attempt err', String(e).slice(0, 80)); }
    await ctx.close();
    if (built < 4 && projAttempt < 2) {
      const s2 = await seed(); token = s2.token; pid = s2.pid;
      console.log('reseeding project for build retry:', pid);
    }
  }
  if (built < 2) { console.log('BUILD FAILED after retries'); }

  // Capture phase — relaunch at each native viewport (IndexedDB persists).
  for (const theme of ['light', 'dark']) {
    for (const { w, h, name } of WIDTHS) {
      const tag = `${name}-${theme}`;
      const { ctx, page } = await launch(w, h, token, theme);
      try {
        await page.goto(APP + '/projects/' + pid + '/ide', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitForIdeReady(page);
        await dismissTour(page);
        await openGreeting(page, w);
        await drivePanel(page, tag);
        console.log('OK', tag);
      } catch (e) {
        console.log('FAIL', tag, String(e).slice(0, 140));
        await page.screenshot({ path: `${OUT}/${tag}-FAIL.png` }).catch(() => {});
      }
      await ctx.close();
    }
  }
  console.log('DONE');
}

main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
