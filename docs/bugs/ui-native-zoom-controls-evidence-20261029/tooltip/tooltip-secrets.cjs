const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui843-zoom/tooltip-secrets';
fs.mkdirSync(out, { recursive: true });
const target=process.env.PANEL||'env';
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
          const key='SYNTHETIC_DOCUMENTATION_CONFIGURATION_'+ 'LONG_SECTION_'.repeat(18);
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
        await expect.poll(()=>requests).toBeGreaterThan(0);
        row.zoomBefore=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale,zoom:getComputedStyle(document.documentElement).zoom}));
        await page.evaluate(()=>document.documentElement.style.zoom='2');
        row.zoomAfter=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale,zoom:getComputedStyle(document.documentElement).zoom}));row.zoomMethod='CSS document zoom2 emulation; not native browser zoom';
        row.loadingVisible=await page.getByText(/Loading (environment|secrets)/i).filter({visible:true}).first().isVisible();release();
        if(process.env.MODE==='recovery') {
          const alert=page.getByRole('alert').filter({hasText:/503/}).filter({visible:true}).first();await expect(alert).toBeVisible();row.errorText=await alert.innerText();
          const retry=alert.getByRole('button',{name:/Retry|Réessayer/});await retry.focus();recovered=true;await page.keyboard.press('Enter');await expect(alert).toBeHidden();
        }
        const panel=page.locator(target==='env'?'.bolt-project-managed-panel:has(.bolt-project-env-scopes)':'.bolt-secrets').filter({visible:true}).first();await expect(panel).toBeVisible();
        await expect.poll(()=>panel.evaluate(e=>e.isConnected&&e.clientWidth>100)).toBe(true);
        if(process.env.MODE==='long') {
          const query=panel.locator(target==='env'?'.bolt-project-panel-toolbar input':'.bolt-secrets-filter input').first();
          await query.fill('no-result-synthetic');await expect(panel).not.toContainText('SYNTHETIC_DOCUMENTATION_CONFIGURATION_');await query.fill('');
          if(target==='env') {
            const diff=panel.locator('.bolt-project-env-diff-toggle');await diff.focus();await page.keyboard.press('Enter');await expect(diff).toHaveAttribute('aria-pressed','true');
            row.diffGeometry=await panel.locator('.bolt-project-env-diff-wrap').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
            await page.keyboard.press('Enter');await expect(panel.getByRole('button',{name:'Diff scopes',exact:true})).toHaveAttribute('aria-pressed','false');
          } else {
            const menu=panel.locator('.bolt-secrets-row-menu').first();
            await menu.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
            await expect(menu).toBeFocused();await expect(page.getByRole('tooltip')).toBeVisible();
            row.before=await menu.evaluate(e=>({pseudo:getComputedStyle(e,'::after').content,panelScroll:e.closest('.bolt-secrets').scrollWidth,panelClient:e.closest('.bolt-secrets').clientWidth,roleTips:document.querySelectorAll('[role=tooltip]').length,title:e.getAttribute('title'),text:e.getAttribute('data-vc-tooltip')}));
            if(process.env.COUNTERPROOF==='1') {
              await page.addStyleTag({content:`html[data-vc-tooltip-renderer='true'] :where(.bolt-responsive-ide,.bolt-project-ide-shell) :where(button,summary,[role='button'],[role='separator'],input,select)[data-vc-tooltip]:not([data-vc-radix-tooltip='true']):where(:hover,:focus-visible)::before,html[data-vc-tooltip-renderer='true'] :where(.bolt-responsive-ide,.bolt-project-ide-shell) :where(button,summary,[role='button'],[role='separator'],input,select)[data-vc-tooltip]:not([data-vc-radix-tooltip='true']):where(:hover,:focus-visible)::after{content:none}`});
              await page.evaluate(()=>document.documentElement.setAttribute('data-vc-tooltip-renderer','true'));
            }
            row.after=await menu.evaluate(e=>({pseudo:getComputedStyle(e,'::after').content,panelScroll:e.closest('.bolt-secrets').scrollWidth,panelClient:e.closest('.bolt-secrets').clientWidth,roleTips:document.querySelectorAll('[role=tooltip]').length,tipText:document.querySelector('[role=tooltip]')?.textContent,tipRect:document.querySelector('[role=tooltip]')?.getBoundingClientRect().toJSON()}));
            await page.screenshot({path:out+'/'+format.width+'-tooltip.png'});
            expect(row.after.roleTips).toBe(1);expect(row.after.tipText).toBe(row.before.text);
            if(process.env.COUNTERPROOF==='1')expect(row.after.pseudo).toBe('none');
            if(process.env.EXPECT_RENDERER==='1') {
              expect(await page.evaluate(()=>document.documentElement.getAttribute('data-vc-tooltip-renderer'))).toBe('true');
              expect(row.after.pseudo).toBe('none');
              await page.keyboard.press('Escape');
              await expect(page.getByRole('tooltip')).toHaveCount(0);
              await expect(menu).toBeFocused();
              expect(await menu.evaluate(e=>getComputedStyle(e,'::after').content)).toBe('none');
              await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
              await expect(page.getByRole('tooltip')).toBeVisible();
              await page.evaluate(()=>window.dispatchEvent(new Event('scroll')));
              await expect(page.getByRole('tooltip')).toHaveCount(0);
              expect(await menu.evaluate(e=>getComputedStyle(e,'::after').content)).toBe('none');
              row.dismissal={escape:true,scroll:true,focusRetained:true};
              await page.keyboard.press('Enter');
              const popup=page.getByRole('menu');await expect(popup).toBeVisible();
              row.menuBounds=await popup.boundingBox();expect(row.menuBounds.x).toBeGreaterThanOrEqual(-1);expect(row.menuBounds.x+row.menuBounds.width).toBeLessThanOrEqual(format.width+1);
              await expect(popup.getByRole('menuitem').first()).toBeFocused();
              await page.keyboard.press('Escape');await expect(popup).toBeHidden();await expect(menu).toBeFocused();row.menuAccessible=true;
            }


          }
        }
        if(process.env.DRAFT==='1') {
          const query=panel.locator(target==='env'?'.bolt-project-panel-toolbar input':'.bolt-secrets-filter input').first();
          await query.fill('synthetic-filter-draft');
          let key;if(target==='env') {key=panel.locator('input[name=key]:not([type=hidden])');await key.fill('SYNTHETIC_UNSAVED_KEY');await panel.locator('input[name=value]:not([type=hidden])').fill('synthetic-unsaved-value');}
          const old=await query.elementHandle();
          const nextWidth=format.width>1000?390:1280;await page.setViewportSize({width:nextWidth,height:900});
          await expect(page.locator(nextWidth<1024?'.bolt-responsive-ide-mobile':'.bolt-responsive-ide-desktop')).toBeVisible();
          const current=page.locator(target==='env'?'.bolt-project-panel-toolbar input':'.bolt-secrets-filter input').filter({visible:true}).first();
          row.draft={oldDetached:await old.evaluate(e=>!e.isConnected),value:await current.inputValue(),width:nextWidth,envKey:target==='env'?await page.locator('input[name=key]:not([type=hidden])').filter({visible:true}).first().inputValue():null};
          await expect(current).toHaveValue('synthetic-filter-draft');
          if(target==='env') {await expect(page.locator('input[name=key]:not([type=hidden])').filter({visible:true}).first()).toHaveValue('SYNTHETIC_UNSAVED_KEY');}
          await page.setViewportSize({width:format.width,height:format.height});await expect(page.locator(format.width<1024?'.bolt-responsive-ide-mobile':'.bolt-responsive-ide-desktop')).toBeVisible();await expect(query).toHaveValue('synthetic-filter-draft');
        }
        row.textLength=(await panel.innerText()).length;
        row.geometry=await panel.evaluate(e=>({width:e.getBoundingClientRect().width,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,overflows:[...e.querySelectorAll('*')].filter(x=>x.clientWidth>0&&x.scrollWidth>x.clientWidth+2).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,60),client:x.clientWidth,scroll:x.scrollWidth,overflowX:getComputedStyle(x).overflowX}))}));
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
