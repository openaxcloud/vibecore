const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui845-ci-resize-diagnostic/' + (process.env.LABEL || 'menus');
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'env';
const cases=[{width:390,height:844,language:'en',zoom:1}];
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
      context = await chromium.launchPersistentContext(fs.mkdtempSync('/workspace/ui845-ci-resize-diagnostic/profile-'), { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], isMobile: true, hasTouch: true, deviceScaleFactor: 2, viewport: { width: format.width, height: format.height } });
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
          const key='SLACK_API_KEY';
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
        expect(row.nativeZoom.dpr).toBe(2);
        expect(row.nativeZoom.cssZoom).toBe('1');
        await expect.poll(()=>requests).toBeGreaterThan(0);
        row.loadingVisible=await page.getByText(/Loading (environment|secrets)/i).filter({visible:true}).first().isVisible();release();
        if(process.env.MODE==='recovery') {
          const alert=page.getByRole('alert').filter({hasText:/503/}).filter({visible:true}).first();await expect(alert).toBeVisible();row.errorText=await alert.innerText();
          const retry=alert.getByRole('button',{name:/Retry|Réessayer/});await retry.focus();recovered=true;await page.keyboard.press('Enter');await expect(alert).toBeHidden();
        }
        const panel=page.locator(target==='env'?'.bolt-project-managed-panel:has(.bolt-project-env-scopes)':'.bolt-secrets').filter({visible:true}).first();await expect(panel).toBeVisible();
        await expect.poll(()=>panel.evaluate(e=>e.isConnected&&e.clientWidth>100)).toBe(true);
        const anchor=panel.locator('.bolt-secrets-chip--key').first();
        const filter=page.getByTestId('secrets-filter');await filter.fill('zzz');await expect(anchor).toBeHidden();await filter.fill('slack');await expect(anchor).toBeVisible();
        const sample=async(label)=>{const m=await anchor.evaluate((e,label)=>{const sc=e.closest('.bolt-project-service-panel').querySelector(':scope > .min-h-0'),nav=document.querySelector('.bolt-mobile-replit-nav-inner'),svc=e.closest('.bolt-project-service-panel');const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};const a=rect(e),s=rect(sc),n=rect(nav),point=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);return {label,key:a,scroller:s,nav:n,scrollTop:sc.scrollTop,scrollHeight:sc.scrollHeight,clientHeight:sc.clientHeight,htmlKeyboard:document.documentElement.dataset.vcClavier??null,focused:document.activeElement===e,hit:point===e||e.contains(point),occluder:point?.className,transition:{property:getComputedStyle(svc).transitionProperty,duration:getComputedStyle(svc).transitionDuration},predicate:a.width>0&&a.height>0&&a.x>=s.x&&a.right<=s.right&&a.y>=s.y&&a.bottom<=s.bottom&&s.bottom<=n.y&&(point===e||e.contains(point))};},label);row.observations.push(m);return m;};
        await sample('before resize');await page.setViewportSize({width:390,height:200});await filter.focus();await page.keyboard.press('Tab');await expect(anchor).toBeFocused();await sample('after Tab');
        await expect(page.locator('html')).toHaveAttribute('data-vc-clavier','ouvert');await expect(page.locator('.bolt-mobile-replit-nav-inner')).toBeHidden();
        const kb=await sample('keyboard state acceptance');expect(kb.hit).toBe(true);expect(kb.focused).toBe(true);expect(kb.key.y).toBeGreaterThanOrEqual(kb.scroller.y);expect(kb.key.bottom).toBeLessThanOrEqual(kb.scroller.bottom);expect(kb.key.bottom).toBeLessThanOrEqual(200);row.keyboardPass=true;
        await page.reload({waitUntil:'domcontentloaded'});await expect(anchor).toBeVisible();await expect(page.locator('html')).not.toHaveAttribute('data-vc-clavier','ouvert');await expect(page.locator('.bolt-mobile-replit-nav-inner')).toBeVisible();await filter.fill('slack');await filter.focus();await page.keyboard.press('Tab');await expect(anchor).toBeFocused();
        await expect.poll(async()=>{return(await sample('reloaded strict dock poll')).predicate;},{timeout:5000}).toBe(true);await anchor.click({trial:true});row.dockPass=true;await page.screenshot({path:out+'/390x200-reloaded-dock.jpg',type:'jpeg',quality:75});
        await page.setViewportSize({width:390,height:844});await expect(filter).toHaveValue('slack');const menu=page.getByTestId('secret-menu-SLACK_API_KEY');await menu.focus();await page.keyboard.press('Enter');await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(menu).toBeFocused();row.menuEscape=true;
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
