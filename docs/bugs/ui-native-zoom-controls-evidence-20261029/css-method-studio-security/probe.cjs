const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui843-zoom-studio-security/' + (process.env.LABEL || 'menus');
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'security';
const cases = process.env.CASES ? JSON.parse(process.env.CASES) : [
  { width: 390, height: 844, language: 'en' },
  { width: 820, height: 1180, language: 'en' },
  { width: 1280, height: 900, language: 'en' },

];
(async () => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(runtime.files)) zip.file(name, content);
  const archiveBase64 = await zip.generateAsync({ type: 'base64' });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const rows = [];
  try {
    for (const format of cases) {
      let recovered=false;let release;const gate=new Promise(r=>release=r);let requests=0;
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
        if(url.pathname.endsWith('/ide-panel/'+target)&&method==='GET') {
          requests++;if(!recovered){await gate;if(process.env.MODE==='recovery')return route.fulfill({status:503,json:{error:'Synthetic service unavailable'}});}
          const long='https://example.test/'+ 'documentation'.repeat(36);
          const record={id:'synthetic-consensus',runId:'synthetic-run',algorithm:'QUORUM',outcome:'PARTIAL',agreementScore:0.25,roundCount:1,durationMs:1000,createdAt:'2026-10-29T00:00:00Z'};
          const data=target==='security'?{securityState:process.env.MODE==='long'?{settings:{},scans:[{id:'synthetic-scan',status:'failed',summary:'Diagnostic synthétique '+long,scanner:'workspace-runtime',completedAt:'2026-10-29T00:00:00Z'}],vulnerabilities:[{id:'synthetic-finding',severity:'high',hidden:false,title:'Dépendance synthétique '+long,details:'Diagnostic synthétique '+long,source:'synthetic-fixture'}]}:{settings:{},scans:[],vulnerabilities:[]}}:{patchProposals:[],repairEvents:[],consensusRecords:process.env.MODE==='long'?[record]:[]};
          return route.fulfill({json:{panel:target,status:'ready',data}});
        }
        if(url.pathname.includes('/agent-consensus/')&&method==='GET')return route.fulfill({json:{record:{claimVotes:[{type:'verification',decision:'inconclusive',claim:'Rapport synthétique https://example.test/'+ 'documentation'.repeat(36),agreementRatio:0.25,supporters:['qa'],dissenters:['backend'],abstainers:['frontend']}],conflicts:[],consolidated:{summary:'Synthèse https://example.test/'+ 'documentation'.repeat(36)}}}});
        if(url.pathname==='/api/agent-memory'&&method==='GET')return route.fulfill({json:{memories:process.env.MODE==='long'?[{id:'synthetic-memory',content:'Mémoire https://example.test/'+ 'documentation'.repeat(36),scope:'project',memoryType:'semantic'}]:[]}});
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
        await expect.poll(()=>requests).toBeGreaterThan(0);
        row.loadingVisible=await page.getByText(/Loading (security|studio|agent)/i).filter({visible:true}).first().isVisible();release();
        if(process.env.MODE==='recovery') {
          const alert=page.getByRole('alert').filter({hasText:/503/}).filter({visible:true}).first();await expect(alert).toBeVisible();row.errorText=await alert.innerText();
          const retry=alert.getByRole('button',{name:/Retry|Réessayer/});await retry.focus();recovered=true;await page.keyboard.press('Enter');await expect(alert).toBeHidden();
        }
        const panel=page.locator(target==='security'?'.bolt-project-security-tool':'.bolt-project-monitoring-panel[aria-label]').filter({visible:true}).first();await expect(panel).toBeVisible();
        await expect.poll(()=>panel.evaluate(e=>e.isConnected&&e.clientWidth>100)).toBe(true);
        row.zoomBefore=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,cssZoom:getComputedStyle(document.documentElement).zoom}));
        await page.evaluate(()=>{document.documentElement.style.zoom='2'});
        row.zoomAfter=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,cssZoom:getComputedStyle(document.documentElement).zoom}));
        row.zoomMethod='CSS documentElement zoom=2; not native browser zoom';
        if(target==='security') {
          if(process.env.MODE==='long') await expect(panel.locator('.bolt-project-vulnerability-card')).toBeVisible();
          for(const name of ['Hidden','Compare','Reports','Settings','Active']) {
            const tab=panel.getByRole('button',{name,exact:true});await tab.focus();await page.keyboard.press('Enter');
            await expect(tab).toHaveAttribute('aria-current','page');
          }
        }else if(process.env.MODE==='long') {
          const trigger=panel.getByTestId('consensus-row-synthetic-run');await trigger.focus();await page.keyboard.press('Enter');await expect(trigger).toHaveAttribute('aria-expanded','true');await expect(panel).toContainText('Rapport synthétique');
        }
        if(process.env.COUNTERPROOF==='1')await page.addStyleTag({content:target==='security'?'.bolt-project-security-tool {overflow-wrap:anywhere}':'.bolt-project-monitoring-panel[aria-label] {min-width:0;grid-template-columns:minmax(0,1fr);overflow-wrap:anywhere}'});
        if(target==='security'&&process.env.MODE==='long') {
          await expect(panel.locator('.bolt-project-vulnerability-card strong')).toHaveText('Dépendance synthétique https://example.test/'+ 'documentation'.repeat(36));
          await expect(panel.locator('.bolt-project-vulnerability-card p')).toHaveText('Diagnostic synthétique https://example.test/'+ 'documentation'.repeat(36));
        }
        if(target==='studio'&&process.env.MODE==='long') {
          await expect(panel.getByText('Rapport synthétique https://example.test/'+ 'documentation'.repeat(36),{exact:true})).toHaveText('Rapport synthétique https://example.test/'+ 'documentation'.repeat(36));
          await expect(panel.getByText('Synthèse https://example.test/'+ 'documentation'.repeat(36),{exact:true})).toHaveText('Synthèse https://example.test/'+ 'documentation'.repeat(36));
        }
        if(target==='security'&&process.env.DRAFT==='1') {
          const tab=panel.getByRole('button',{name:'Settings',exact:true});await tab.focus();await page.keyboard.press('Enter');
          const input=panel.locator('select[name=scannerProfile]');await input.selectOption('sca');await expect(input).toHaveValue('sca');
          const old=await input.elementHandle();await page.setViewportSize(format.width < 1024 ? {width:1280,height:900} : {width:390,height:844});
          await expect.poll(()=>old.evaluate(e=>!e.isConnected)).toBe(true);row.oldDraftDetached=true;
          const settings=page.locator('.bolt-project-security-tool').filter({visible:true}).getByRole('button',{name:'Settings',exact:true});await settings.focus();await page.keyboard.press('Enter');
          await expect(page.locator('.bolt-project-security-tool').filter({visible:true}).locator('select[name=scannerProfile]')).toHaveValue('sca');
        }
        row.text=await panel.innerText();
        row.geometry=await panel.evaluate(e=>({width:e.getBoundingClientRect().width,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,overflows:[...e.querySelectorAll('*')].filter(x=>x.clientWidth>0&&x.scrollWidth>x.clientWidth+2).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,60),client:x.clientWidth,scroll:x.scrollWidth,overflowX:getComputedStyle(x).overflowX}))}));
        expect(row.geometry.scrollWidth).toBeLessThanOrEqual(row.geometry.clientWidth+1);
        await page.screenshot({path: `${out}/${format.width}-after.jpg`,type:'jpeg',quality:60});
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
