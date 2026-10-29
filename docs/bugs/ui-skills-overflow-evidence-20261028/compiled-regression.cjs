const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui838-skills-audit/' + (process.env.LABEL || 'menus');
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
      const row = { ...format, errors: [], transport: [], observations: [] };
      const page = await browser.newPage({ viewport: { width: format.width, height: format.height } });
      page.setDefaultTimeout(10000);
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
        if (url.pathname.endsWith('/ide-panel/skills') && method==='GET') return route.fulfill({json:{panel:'skills',status:'ready',data:{skills:[{id:'synthetic-long',name:'Synthetic long description',enabled:true,description:'https://example.invalid/'+'segment'.repeat(60)}],catalog:[],installedProject:[],installedWorkspace:[],auditEvents:[],hasWorkspace:false}}});
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
        console.log('start', format.width, format.language);
        await page.goto(origin + '/projects/synthetic-first/ide?panel=skills', { waitUntil: 'domcontentloaded' });
        const panel = page.locator('.bolt-project-skills-panel').filter({visible:true}).first();
        await expect(panel).toBeVisible();
        row.panelText = await panel.innerText();
        row.buttons = await panel.getByRole('button').allTextContents();
        await expect(panel.getByText('Synthetic long description')).toBeVisible();
        await expect.poll(async()=>panel.evaluate(e=>e.isConnected && e.getBoundingClientRect().width>100)).toBe(true);
        await expect(panel.getByText('Synthetic long description')).toBeVisible();
        await expect(panel).toBeVisible();
        row.geometry=await panel.evaluate(e=>({width:e.getBoundingClientRect().width,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,description:[...e.querySelectorAll('span')].filter(x=>x.textContent.startsWith('https://example.invalid/')).map(x=>({bounds:x.getBoundingClientRect().toJSON(),clientWidth:x.clientWidth,scrollWidth:x.scrollWidth,overflowWrap:getComputedStyle(x).overflowWrap}))}));
        await page.screenshot({path:`${out}/${format.width}-skills.png`});
        expect(row.geometry.scrollWidth).toBeLessThanOrEqual(row.geometry.clientWidth+1);
        expect(row.geometry.description).toHaveLength(1);
        expect(row.geometry.description[0].scrollWidth).toBeLessThanOrEqual(row.geometry.description[0].clientWidth+1);
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
