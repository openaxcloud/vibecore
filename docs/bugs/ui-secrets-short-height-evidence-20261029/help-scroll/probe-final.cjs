const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui845-help-scroll/' + (process.env.LABEL || 'menus');
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'env';
const cases=[{width:820,height:400,language:'fr',zoom:2}];
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
      context = await chromium.launchPersistentContext(fs.mkdtempSync('/workspace/ui845-help-scroll/profile-'), { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], viewport: { width: format.width, height: format.height } });
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
        window.__helpScrollEvents=[];
        const snapshot=(phase,e)=>{const a=document.activeElement;window.__helpScrollEvents.push({phase,at:performance.now(),target:e?.target?.className,active:a?.className,help:document.querySelectorAll('[data-vc-full-help]').length,offer:[...document.querySelectorAll('button')].some(b=>/Lire l’aide complète|Read full help/.test(b.textContent)),tooltip:document.querySelectorAll('[role=tooltip]').length,scroll:document.querySelector('.bolt-project-ide-mobile-panel')?.scrollTop});};
        for(const type of ['focusin','focusout','scroll','keydown'])window.addEventListener(type,e=>{snapshot(type,e);queueMicrotask(()=>snapshot(type+'-microtask',e));requestAnimationFrame(()=>snapshot(type+'-frame',e));},true);

        localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'dismissed', step: 0 }));
        localStorage.setItem('vc:ws-seed:synthetic-first', JSON.stringify({ revision: 'synthetic-revision', seededAt: Date.now() }));
      });
      await page.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if(url.pathname.endsWith('/ide-panel/'+target)&&method==='GET') {
          requests++;if(!recovered){await gate;if(process.env.MODE==='recovery')return route.fulfill({status:503,json:{error:'Synthetic service unavailable'}});}
          const key='SYNTHETIC_HELP_'+ 'LONG_SECTION_'.repeat(100)+'FIN_MARKER_844';
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
        const anchor=panel.locator('.bolt-secrets-chip--key').first();
        await expect.poll(()=>anchor.getAttribute('data-vc-tooltip')).toContain('FIN_MARKER_844');
        const text=await anchor.getAttribute('data-vc-tooltip');expect(text.length).toBeGreaterThan(1000);
        async function measure(label){row.observations.push(await anchor.evaluate((e,label)=>{const r=e.getBoundingClientRect(),sc=e.closest('.bolt-project-service-panel')?.querySelector(':scope > .min-h-0'),nav=document.querySelector('.bolt-mobile-replit-nav-inner');const rect=x=>{const r=x?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null;};const point=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label,anchor:rect(e),centerUnoccluded:e===point||e.contains(point),occluder:point?.className,scroller:rect(sc),scrollTop:sc?.scrollTop,scrollHeight:sc?.scrollHeight,scrollMax:sc?sc.scrollHeight-sc.clientHeight:null,parents:[...function*(x){while(x){yield x;x=x.parentElement;}}(e)].filter(x=>getComputedStyle(x).overflowY!=='visible').map(x=>({cls:x.className,overflow:getComputedStyle(x).overflowY,client:x.clientHeight,scroll:x.scrollHeight,top:x.scrollTop})),scrollPadding:getComputedStyle(sc).scrollPadding,padding:getComputedStyle(sc).padding,nav:rect(nav),viewport:{w:innerWidth,h:innerHeight},active:document.activeElement===e,tooltipAction:!![...document.querySelectorAll('button')].find(x=>/Read full help|Lire l’aide complète/.test(x.textContent))};},label));}
        await measure('initial');await anchor.focus();await measure('focus sync');await page.waitForTimeout(750);await measure('focus settled');
        await page.keyboard.press('F1');row.f1AfterFirstFocus=await page.locator('[data-vc-full-help]').count();expect(row.f1AfterFirstFocus).toBe(1);if(row.f1AfterFirstFocus)await page.keyboard.press('Escape');
        await panel.locator('.bolt-secrets-filter input').focus();await page.keyboard.press('Tab');await page.waitForTimeout(750);await measure('native Tab from filter settled');
        await page.keyboard.press('F1');row.f1AfterNativeTab=await page.locator('[data-vc-full-help]').count();expect(row.f1AfterNativeTab).toBe(1);if(row.f1AfterNativeTab)await page.keyboard.press('Escape');
        await anchor.scrollIntoViewIfNeeded();await page.waitForTimeout(250);await measure('scrollIntoView settled');
        const scroller=panel.locator('..');const pos=await scroller.boundingBox();await page.mouse.move(pos.x+pos.width/2,pos.y+10);await page.mouse.wheel(0,60);await page.waitForTimeout(500);await measure('wheel60 settled');
        const filterInput=page.locator('.bolt-secrets-filter input');await filterInput.focus();await page.keyboard.press('Tab');
        await expect.poll(()=>anchor.evaluate(e=>{const r=e.getBoundingClientRect(),x=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return x===e||e.contains(x);})).toBe(true);
        const m=await anchor.evaluate(e=>{const a=e.getBoundingClientRect(),s=e.closest('.bolt-project-service-panel').querySelector(':scope > .min-h-0').getBoundingClientRect(),n=document.querySelector('.bolt-mobile-replit-nav-inner').getBoundingClientRect();return{a:{top:a.top,bottom:a.bottom},s:{top:s.top,bottom:s.bottom},nav:n.top};});
        expect(m.a.top).toBeGreaterThanOrEqual(m.s.top);expect(m.a.bottom).toBeLessThanOrEqual(m.s.bottom);expect(m.s.bottom).toBeLessThanOrEqual(m.nav);row.acceptance=m;
        await anchor.click({trial:true});
        await page.screenshot({path:out+'/820-fr-200-focus-after.jpg',type:'jpeg',quality:75});
        await panel.locator('.bolt-secrets-filter input').focus();await page.keyboard.press('Tab');await page.waitForTimeout(750);await page.keyboard.press('F1');const help=page.locator('[data-vc-full-help]');await expect(help).toBeVisible();const reading=help.getByRole('region');await expect(reading).toBeFocused();row.completeText=await reading.textContent();expect(row.completeText).toBe(await anchor.getAttribute('data-vc-tooltip'));await page.keyboard.press('End');await expect.poll(()=>reading.evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop)).toBeLessThanOrEqual(1);row.readingEnd=await reading.evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight,top:e.scrollTop}));await page.screenshot({path:out+'/820-fr-200-last-line.png'});await page.keyboard.press('Escape');await expect(help).toHaveCount(0);await expect(anchor).toBeFocused();row.helpEndEscape=true;


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
        row.events=await page.evaluate(()=>window.__helpScrollEvents);release();await page.close();await context.close();context=null;
        rows.push(row);
        fs.writeFileSync(out + '/receipt.json', JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
