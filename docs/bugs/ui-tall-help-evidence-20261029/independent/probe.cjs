const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui844-tall-help-independent/' + (process.env.LABEL || 'menus');
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'env';
const cases = [
  {width:390,height:320,language:'en',zoom:1},
  {width:390,height:320,language:'en',zoom:2},
  {width:820,height:400,language:'fr',zoom:2},
  {width:1280,height:400,language:'en',zoom:2},
];
(async () => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(runtime.files)) zip.file(name, content);
  const archiveBase64 = await zip.generateAsync({ type: 'base64' });
  let context;
  const browser = { close: async () => { if (context) await context.close(); } };
  const rows = [];
  try {
    for (const format of cases) {
      let recovered=false;let release;const gate=new Promise(r=>release=r);let requests=0;
      const row = { ...format, errors: [], transport: [], observations: [] };
      context = await chromium.launchPersistentContext(fs.mkdtempSync('/workspace/ui844-tall-help-independent/profile-'), { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], viewport: { width: format.width, height: format.height } });
      const settings = await context.newPage();
      await settings.goto('chrome://settings/appearance');
      await settings.locator('#zoomLevel').selectOption(String(format.zoom));
      await settings.close();
      const page = await context.newPage();
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
        if(url.pathname.endsWith('/ide-panel/'+target)&&method==='GET') {
          requests++;if(!recovered){await gate;if(process.env.MODE==='recovery')return route.fulfill({status:503,json:{error:'Synthetic service unavailable'}});}
          const key=process.env.SHORT_KEY==='1'?'SYNTHETIC_KEY':'SYNTHETIC_DOCUMENTATION_CONFIGURATION_'+ 'LONG_SECTION_'.repeat(18);
          const data=target==='env'?{envVars:process.env.MODE==='long'?[{key,value:'https://example.test/'+ 'configuration'.repeat(24),scope:'production',updatedAt:'2026-10-29T00:00:00Z'}]:[]}:{secrets:process.env.MODE==='long'?[{key,updatedAt:'2026-10-29T00:00:00Z'}]:[]};
          return route.fulfill({json:{panel:target,status:'ready',data}});
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
        console.log('start', format.width, format.language);
        await page.goto(origin + '/projects/synthetic-first/ide?panel='+target, { waitUntil: 'domcontentloaded' });
        row.nativeZoom = await page.evaluate(() => ({innerWidth, innerHeight, dpr:devicePixelRatio, cssZoom:getComputedStyle(document.documentElement).zoom}));
        expect(row.nativeZoom.innerWidth).toBe(format.width / format.zoom);
        expect(row.nativeZoom.dpr).toBe(format.zoom);
        expect(row.nativeZoom.cssZoom).toBe('1');
        await expect.poll(()=>requests).toBeGreaterThan(0);
        row.loadingVisible=await page.getByText(/Loading (environment|secrets)/i).filter({visible:true}).first().isVisible();release();
        if(process.env.MODE==='recovery') {
          const alert=page.getByRole('alert').filter({hasText:/503/}).filter({visible:true}).first();await expect(alert).toBeVisible();row.errorText=await alert.innerText();
          const retry=alert.getByRole('button',{name:/Retry|Réessayer/});await retry.focus();recovered=true;await page.keyboard.press('Enter');await expect(alert).toBeHidden();
        }
        const panel=page.locator(target==='env'?'.bolt-project-managed-panel:has(.bolt-project-env-scopes)':'.bolt-secrets').filter({visible:true}).first();await expect(panel).toBeVisible();
        await expect.poll(()=>panel.evaluate(e=>e.isConnected&&e.clientWidth>100)).toBe(true);
        const anchor=panel.getByTestId('secrets-menu');
        const text=(format.language==='fr'?'Aide synthétique longue pour vérifier la lecture complète au clavier. ':'Long synthetic help to verify complete keyboard reading. ').repeat(30)+' FIN-MARKER-844';
        await anchor.evaluate((e,text)=>e.setAttribute('data-vc-tooltip',text),text);
        const dialog=page.getByRole('dialog',{name:/Full help|Aide complète/});
        const reader=page.getByRole('region',{name:/Help text|Texte de l’aide/});
        const action=page.getByRole('button',{name:/Read full help|Lire l’aide complète/});
        async function bounds(locator,label){
          const r=await locator.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,client:e.clientWidth,scroll:e.scrollWidth};});
          row.observations.push({label,...r});expect(r.left).toBeGreaterThanOrEqual(0);expect(r.top).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(r.w);expect(r.bottom).toBeLessThanOrEqual(r.h);expect(r.scroll).toBeLessThanOrEqual(r.client+1);
        }
        await anchor.focus();await expect(action).toBeVisible();await bounds(action,'compact action');
        await page.keyboard.press('F1');await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('aria-modal','false');await expect(reader).toBeFocused();await expect(reader).toHaveText(text);await bounds(dialog,'keyboard dialog');
        await expect.poll(()=>reader.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
        await page.keyboard.press('PageDown');await expect.poll(()=>reader.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
        await page.keyboard.press('End');await expect.poll(()=>reader.evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop)).toBeLessThanOrEqual(1);
        await page.keyboard.press('Home');await reader.hover();await page.mouse.wheel(0,350);await expect.poll(()=>reader.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
        await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(anchor).toBeFocused();
        await page.mouse.move(0,0);await anchor.hover();await expect(action).toBeVisible();
        const a=await anchor.boundingBox(),c=await action.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.move(c.x+c.width/2,c.y+c.height/2,{steps:20});await expect(action).toBeVisible();await action.click();await expect(dialog).toBeVisible();await expect(reader).toBeFocused();
        await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:/Close|Fermer/})).toBeFocused();await page.keyboard.press('Tab');await expect(reader).toBeFocused();await page.keyboard.press('Tab');await expect.poll(()=>dialog.evaluate(e=>e.contains(document.activeElement)).catch(()=>false)).toBe(false);
        await anchor.focus();await expect(action).toBeVisible();await page.keyboard.press('F1');await expect(reader).toBeFocused();
        await page.setViewportSize({width:format.width+40,height:format.height+60});await expect(dialog).toBeVisible();await bounds(dialog,'resized dialog');await page.keyboard.press('End');await expect.poll(()=>reader.evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop)).toBeLessThanOrEqual(1);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(anchor).toBeFocused();
        row.completeTextLength=text.length;
        row.textLength=(await panel.innerText()).length;
        row.geometry=await panel.evaluate(e=>({width:e.getBoundingClientRect().width,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,overflows:[...e.querySelectorAll('*')].filter(x=>x.clientWidth>0&&x.scrollWidth>x.clientWidth+2).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,60),client:x.clientWidth,scroll:x.scrollWidth,overflowX:getComputedStyle(x).overflowX}))}));
        expect(row.geometry.scrollWidth).toBeLessThanOrEqual(row.geometry.clientWidth+1);
        row.pass = true;
      } catch (error) {
        row.pass = false;
        row.failure = error.message;
        await page.screenshot({ path: `${out}/${format.width}-${format.language}-${format.zoom}x-failure.png` }).catch(() => {});
        row.buttons = await page.getByRole('button').allTextContents().catch(() => []);
      } finally {
        release();await page.close();await context.close();context=null;
        rows.push(row);
        fs.writeFileSync(out + '/receipt.json', JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
