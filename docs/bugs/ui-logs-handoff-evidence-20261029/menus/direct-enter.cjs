const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui847-menus/' + (process.env.LABEL || 'menus');
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'env';
const cases=[{width:390,height:900,language:'en',zoom:1,cpu:4,name:'tabs390-direct-enter-witness',overlay:'tabs',delay:500}];
(async () => {
  for(const key of Object.keys(runtime.files))delete runtime.files[key];runtime.files['README.md']='# Panel visibility fixture\\n'+Array.from({length:240},(_,i)=>`Line ${i}: preserved fixture content`).join('\\n');for(let n=0;n<60;n++)runtime.files[`src/fixture-${String(n).padStart(3,'0')}.ts`]=`export const fixture = ${n};\\n`;
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
      context = await chromium.launchPersistentContext(fs.mkdtempSync('/workspace/ui847-menus/profile-'), { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], hasTouch: format.width===390, viewport: { width: format.width, height: format.height } });
      const settings = await context.newPage();
      await settings.goto('chrome://settings/appearance');
      await settings.locator('#zoomLevel').selectOption(String(format.zoom));
      await settings.close();
      const page = await context.newPage();
      page.setDefaultTimeout(10000);const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:format.cpu});
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
        if(url.pathname.endsWith('/export/zip')){row.transport.push({syntheticArchive:true,fileCount:Object.keys(runtime.files).length,delay:format.delay,requestedAt:Date.now()});if(format.delay)await new Promise(r=>setTimeout(r,format.delay));return route.fulfill({json:{archive:{base64:archiveBase64}}});}
        if(url.pathname.endsWith('/ide-state')){if(format.overlay==='tabs'){row.transport.push({heldIdeState:true});await gate;}return route.fulfill({json:{ideState:{version:1,state:{}}}});}
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
      await page.addInitScript(()=>{window.__menuAudit=[];let n=0;const ids=new WeakMap();const desc=e=>{if(!(e instanceof Element))return null;if(!ids.has(e))ids.set(e,++n);return{id:ids.get(e),tag:e.tagName,test:e.getAttribute('data-testid'),cls:String(e.className).slice(0,100),connected:e.isConnected};};window.__menuSnapshot=label=>({at:performance.now(),label,active:desc(document.activeElement),trigger:desc(document.querySelector('[data-testid="mobile-ide-header"] [data-testid="button-more"]')),sheet:desc(document.querySelector('[data-testid="mobile-more-menu-sheet"],[data-testid="mobile-tab-switcher"]')),tabsTrigger:desc(document.querySelector('[data-testid="button-tab-switcher"]')),shell:desc(document.querySelector('.bolt-responsive-ide'))});const add=x=>{if(window.__menuAudit.length<1500)window.__menuAudit.push(x);};for(const event of ['focusin','focusout','keydown','keyup','click'])for(const capture of [true,false])window.addEventListener(event,e=>add({...window.__menuSnapshot(event),capture,key:e.key,target:desc(e.target),defaultPrevented:e.defaultPrevented}),capture);new MutationObserver(records=>{for(const r of records)for(const [kind,nodes]of[['added',r.addedNodes],['removed',r.removedNodes]])for(const node of nodes){if(!(node instanceof Element))continue;const selectors='[data-testid="mobile-ide-header"],[data-testid="mobile-more-menu-sheet"],[data-testid="mobile-tab-switcher"],.bolt-responsive-ide';const hits=[...(node.matches(selectors)?[node]:[]),...node.querySelectorAll(selectors)];for(const hit of hits)add({at:performance.now(),mutation:kind,node:desc(hit)});}}).observe(document,{childList:true,subtree:true});});
      try {
        console.log('start',format.name);
        await page.goto(origin+'/projects/synthetic-first/ide?panel='+(format.overlay==='tabs'?'agent&lang=en':'editor'),{waitUntil:format.overlay==='tabs'?'domcontentloaded':'load'});
        const trigger=format.overlay==='panels'?page.getByTestId('mobile-ide-header').getByTestId('button-more'):page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher');const sheet=page.getByTestId(format.overlay==='panels'?'mobile-more-menu-sheet':'mobile-tab-switcher');
        row.cycles=[];
        for(let cycle=0;cycle<2;cycle++){
          row.stage='focus-'+cycle;await trigger.focus();row.stage='Enter-'+cycle;if(format.overlay==='tabs')await page.keyboard.press('Enter');else await trigger.press('Enter');row.observations.push(await page.evaluate(()=>window.__menuSnapshot('after Enter')));await expect(sheet).toBeVisible();
          const close=format.overlay==='panels'?sheet.getByTestId('mobile-more-menu-close'):page.getByTestId('input-search-tabs');await close.focus();await expect(close).toBeFocused();if(format.overlay==='tabs')await close.fill('Editor');await close.press('Escape');await expect(sheet).toHaveCount(0);await expect(trigger).toBeFocused();row.cycles.push({cycle,pass:true});
        }
        row.stage='visible close';await trigger.click();await sheet.getByTestId(format.overlay==='panels'?'mobile-more-menu-close':'button-close-switcher').click();await expect(sheet).toHaveCount(0);if(format.overlay==='tabs'){row.stage='empty recovery';await trigger.click();const search=page.getByTestId('input-search-tabs');await search.fill('no-tab-synthetic-847');await expect(sheet.getByRole('status')).toBeVisible();await search.fill('');await expect(sheet.getByRole('status')).toHaveCount(0);await search.press('Escape');await expect(sheet).toHaveCount(0);await expect(trigger).toBeFocused();row.emptyRecovery=true;}
        row.pass = true;
      } catch (error) {
        row.pass = false;
        row.failure = error.message;
        await page.screenshot({ path: `${out}/${format.name}-failure.png` }).catch(() => {});
        row.buttons = await page.getByRole('button').allTextContents().catch(() => []);
      } finally {
        release();row.events=await page.evaluate(()=>window.__menuAudit).catch(()=>[]);await page.close();await context.close();context=null;
        rows.push(row);
        fs.writeFileSync(out + '/receipt.json', JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
