const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui843-native-debugger/' + (process.env.LABEL || 'native');
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'debugger';
const cases = process.env.CASES ? JSON.parse(process.env.CASES) : [
  { width: 390, height: 844, language: 'en' },
  { width: 820, height: 1180, language: 'en' },
  { width: 1280, height: 900, language: 'en' },

];
(async () => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(runtime.files)) zip.file(name, content);
  const archiveBase64 = await zip.generateAsync({ type: 'base64' });
  const browser = await chromium.launchPersistentContext('/workspace/ui843-native-debugger/profile-'+Date.now(), { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'],viewport:{width:1280,height:900} });
  const rows = [];
  try {
    const settings=await browser.newPage();await settings.goto('chrome://settings/appearance');await settings.locator('#zoomLevel').selectOption('2');await settings.close();
    for (const format of cases) {
      let recovered=false;let release;const gate=new Promise(r=>release=r);let requests=0;
      const row = { ...format, errors: [], transport: [], observations: [] };
      const page = await browser.newPage();await page.setViewportSize({width:format.width,height:format.height});
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
          const data=process.env.MODE==='long'?{debuggerState:{launchConfigs:[{id:'config-synthetic',name:'Diagnostic de documentation — '+ 'documentation'.repeat(20),type:'node',program:'server.js'}],breakpoints:[{id:'break-synthetic',filePath:'src/'+ 'documentation/'.repeat(25)+'server.js',line:123,condition:'request.path === "https://example.test/'+ 'documentation'.repeat(35)+'"',enabled:true}],watches:[],sessions:[{id:'session-synthetic',name:'Session documentation — '+ 'documentation'.repeat(25),adapter:'node-inspector',status:'paused',command:'node '+ 'documentation/'.repeat(25)+'server.js',callStack:[{name:'fonctionDocumentation'+ 'longue'.repeat(30),file:'src/'+ 'documentation/'.repeat(20)+'server.js',line:123,column:7}],variables:[{name:'documentation',value:'https://example.test/'+ 'documentation'.repeat(30)}]}]},runtimeProcesses:[],runtimeLogs:{logs:[{timestamp:'2026-10-29T00:00:00Z',message:'Synthetic diagnostic https://example.test/'+ 'documentation'.repeat(30)}]}}:{debuggerState:{launchConfigs:[],breakpoints:[],watches:[],sessions:[]},runtimeProcesses:[],runtimeLogs:{logs:[]}};
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
        expect(values.bounds.x + values.bounds.width).toBeLessThanOrEqual(values.viewport.width + 1);
        expect(values.bounds.y + values.bounds.height).toBeLessThanOrEqual(values.viewport.height + 1);
      }
      try {
        console.log('start', format.width, format.language);
        await page.goto(origin + '/projects/synthetic-first/ide?panel='+target, { waitUntil: 'domcontentloaded' });
        row.zoom=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom}));expect(row.zoom.innerWidth).toBe(format.width/2);expect(row.zoom.dpr).toBe(2);expect(row.zoom.cssZoom).toBe('1');
        await expect.poll(()=>requests).toBeGreaterThan(0);
        row.loadingVisible=await page.getByText(/Loading debugger/i).filter({visible:true}).first().isVisible();release();
        if(process.env.MODE==='recovery') {
          const alert=page.getByRole('alert').filter({hasText:/503/}).filter({visible:true}).first();await expect(alert).toBeVisible();row.errorText=await alert.innerText();
          const retry=alert.getByRole('button',{name:/Retry|Réessayer/});await retry.focus();recovered=true;await page.keyboard.press('Enter');await expect(alert).toBeHidden();
        }
        const panel=page.locator('[data-testid="ide-service-panel"][data-panel="debugger"]').filter({visible:true}).first();await expect(panel).toBeVisible();
        await expect.poll(()=>panel.evaluate(e=>e.isConnected&&e.clientWidth>100)).toBe(true);
        await expect(panel.getByRole('heading',{name:'Debug sessions',exact:true})).toBeVisible();
        const refresh=panel.getByRole('button',{name:'Refresh runtime',exact:true});await refresh.focus();await expect(refresh).toBeFocused();
        if(false)await page.addStyleTag({content:'[data-panel="debugger"] > div:last-child > div {min-width:0;overflow-wrap:anywhere;} [data-panel="debugger"] .grid,[data-panel="debugger"] .grid > *,[data-panel="debugger"] section,[data-panel="debugger"] aside,[data-panel="debugger"] form {min-width:0;} [data-panel="debugger"] [class*="xl:grid-cols-[minmax"] {grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));} [data-panel="debugger"] [class*="lg:grid-cols-2"] {grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));} [data-panel="debugger"] select {min-width:0;width:100%;}'});
        if(process.env.MODE==='long') {
          const expected='https://example.test/'+ 'documentation'.repeat(30);
          await expect(panel.locator('.bolt-panel-row-detail').filter({hasText:expected})).toHaveText(expected);
          row.textGeometry=await panel.locator('.bolt-panel-row-title,.bolt-panel-row-detail').evaluateAll(ns=>ns.map(n=>({textLength:n.textContent.length,client:n.clientWidth,scroll:n.scrollWidth})));
          for(const x of row.textGeometry)expect(x.scroll).toBeLessThanOrEqual(x.client+1);
          const remove=panel.getByRole('button',{name:'Remove',exact:true});
          await remove.scrollIntoViewIfNeeded();
          row.removeGeometry=await remove.evaluate(e=>{const f=e.closest('form'), b=e.getBoundingClientRect(),r=f.getBoundingClientRect();return {buttonWidth:b.width,buttonClient:e.clientWidth,buttonScroll:e.scrollWidth,formWidth:r.width,formScroll:f.scrollWidth,left:b.left,right:b.right,formLeft:r.left,formRight:r.right};});
          expect(row.removeGeometry.buttonScroll).toBeLessThanOrEqual(row.removeGeometry.buttonClient+1);
          expect(row.removeGeometry.formScroll).toBeLessThanOrEqual(row.removeGeometry.formWidth+1);
          expect(row.removeGeometry.left).toBeGreaterThanOrEqual(row.removeGeometry.formLeft-1);
          expect(row.removeGeometry.right).toBeLessThanOrEqual(row.removeGeometry.formRight+1);
          await remove.click({trial:true});
          await remove.focus();await expect(remove).toBeFocused();

        }
        row.text=await panel.innerText();
        row.outerGeometry=await panel.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
        const body=panel.locator(':scope > div').last();
        if(process.env.CAPTURE==='1'&&process.env.MODE==='long') {
          await panel.locator('input[name="breakpointId"]').locator('..').locator('..').first().scrollIntoViewIfNeeded();
          await body.evaluate(e=>e.scrollLeft=0);
          await page.screenshot({path:out+'/'+format.width+'-breakpoint.png'});
        }
        row.geometry=await body.evaluate(e=>({width:e.getBoundingClientRect().width,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,overflows:[...e.querySelectorAll('*')].filter(x=>x.clientWidth>0&&x.scrollWidth>x.clientWidth+2).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,60),client:x.clientWidth,scroll:x.scrollWidth,overflowX:getComputedStyle(x).overflowX}))}));
        expect(row.geometry.scrollWidth).toBeLessThanOrEqual(row.geometry.clientWidth+1);
        row.pass = true;
      } catch (error) {
        row.pass = false;
        row.failure = error.message;
        await page.screenshot({ path: `${out}/${format.width}-${format.language}-failure.png` }).catch(() => {});
        row.buttons = await page.getByRole('button').allTextContents().catch(() => []);
      } finally {
        release();await page.close();
        rows.push(row);
        fs.writeFileSync(out + '/receipt.json', JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
