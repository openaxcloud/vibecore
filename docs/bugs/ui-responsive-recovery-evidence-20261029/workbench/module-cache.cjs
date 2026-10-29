const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui852-workbench-import/' + (process.env.LABEL || 'menus');
fs.mkdirSync(out, { recursive: true });
const cases = process.env.CASES ? JSON.parse(process.env.CASES) : [
  { width: 390, height: 844, language: 'en' },
  { width: 820, height: 1180, language: 'en' },
  { width: 1280, height: 900, language: 'en' },
  { width: 1536, height: 900, language: 'en' },
];
(async () => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(runtime.files)) zip.file(name, content);
  const archiveBase64 = await zip.generateAsync({ type: 'base64' });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const rows = [];
  try {
    for (const format of cases) {
      let chunkRequests = 0;
      const row = { ...format, errors: [], transport: [], observations: [] };
      const page = await browser.newPage({ viewport: { width: format.width, height: format.height } });
      page.setDefaultTimeout(10000);
      page.on('request',r=>{if(r.url().includes('/assets/'))row.transport.push({asset:r.url()});});
      page.on('pageerror', (error) => row.errors.push(error.message));
      await page.context().addCookies([
        { name: 'vc_session', value: 'synthetic-ui', url: origin },
        { name: 'vibecore-lang', value: format.language, url: origin },
        { name: 'ecode_theme', value: 'light', url: origin },
      ]);
      await page.addInitScript(() => {
        if (window !== window.top) return;
        localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'dismissed', step: 0 }));
        localStorage.setItem('vc:ws-seed:synthetic-first', JSON.stringify({ revision: 'synthetic-revision', seededAt: Date.now() }));
      });
      await page.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (url.origin === origin && /\/assets\/Workbench\.client-[^/]+\.js$/.test(url.pathname)) {
          chunkRequests++; row.observations.push({stage:'chunk-request',attempt:chunkRequests,path:url.pathname});
          if(chunkRequests===1){await new Promise(r=>setTimeout(r,200));return route.abort('failed');}
          return route.continue();
        }
        if (await runtime.intercept(route, origin, row.transport)) return;
        if (url.origin !== origin || !['GET', 'HEAD'].includes(method)) {
          row.transport.push({ blocked: true, method, path: url.pathname });
          return route.fulfill({ status: 503, json: { error: 'Synthetic audit blocks external requests and mutations' } });
        }
        if (url.pathname.endsWith('/export/zip')) return route.fulfill({ json: { archive: { base64: archiveBase64 } } });
        if (url.pathname.endsWith('/ide-state')) return route.fulfill({ json: { ideState: { version: 1, state: {} } } });
        if (url.pathname === '/api/agent-memory/preferences') return route.fulfill({ json: { preference: { enabled: false } } });
        return route.continue();
      });
      await page.context().routeWebSocket('**/*', (socket) => socket.close());
      async function observation(label, locator) {
        const values = await locator.evaluate((element) => {
          const r = element.getBoundingClientRect();
          const p = document.querySelector('[data-testid="ide-agent-panel"]')?.getBoundingClientRect();
          const a = document.activeElement;
          return { bounds: { x: r.x, y: r.y, width: r.width, height: r.height }, viewport: { width: innerWidth, height: innerHeight }, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, panelWidth: p?.width, active: { tag: a?.tagName, role: a?.getAttribute('role'), label: a?.getAttribute('aria-label') }, pageOverflow: document.documentElement.scrollWidth > innerWidth };
        });
        row.observations.push({ label, ...values });
        expect(values.bounds.x).toBeGreaterThanOrEqual(-1);
        expect(values.bounds.y).toBeGreaterThanOrEqual(-1);
        expect(values.bounds.x + values.bounds.width).toBeLessThanOrEqual(format.width + 1);
        expect(values.bounds.y + values.bounds.height).toBeLessThanOrEqual(format.height + 1);
      }
      try {
        await page.goto(origin + '/projects/synthetic-first/ide?panel=editor', { waitUntil: 'domcontentloaded' });
        const reload=page.getByRole('button',{name:/Reload panel|Recharger le panneau/i}).first();
        await expect(reload).toBeVisible({timeout:20000});
        await page.waitForTimeout(1600);
        row.beforeRetry={chunkRequests,text:await page.locator('body').innerText()};
        await page.screenshot({path:`${out}/${format.width}-failed.png`});
        await reload.click();
        await page.waitForTimeout(1600);
        row.afterRetry={chunkRequests,reloadVisible:await reload.isVisible(),text:await page.locator('body').innerText()};
        await page.screenshot({path:`${out}/${format.width}-retry.png`});
        const chunkPath=row.observations.find(x=>x.stage==='chunk-request').path;
        row.directSameUrl=await page.evaluate(async path=>{try{await import(path);return {resolved:true};}catch(e){return {resolved:false,message:e.message};}},chunkPath);
        row.directSameUrl.chunkRequests=chunkRequests;
        row.directNewUrl=await page.evaluate(async path=>{try{await import(path+'?local-diagnostic=1');return {resolved:true};}catch(e){return {resolved:false,message:e.message};}},chunkPath);
        row.directNewUrl.chunkRequests=chunkRequests;
        await page.reload({waitUntil:'domcontentloaded'});
        await expect(page.locator('.cm-editor,.monaco-editor').first()).toBeVisible({timeout:20000});
        row.afterPageReload={chunkRequests,editorVisible:true,reloadVisible:await reload.isVisible()};
        await page.screenshot({path:`${out}/${format.width}-recovered.png`});
        row.pass = true;
      } catch (error) {
        row.pass = false;
        row.failure = error.message;
        await page.screenshot({ path: `${out}/${format.width}-${format.language}-failure.png` }).catch(() => {});
        row.buttons = await page.getByRole('button').allTextContents().catch(() => []);
      } finally {
        await page.close();
        rows.push(row);
        fs.writeFileSync(out + '/receipt.json', JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
