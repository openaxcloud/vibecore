const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui844-tall-help/compiled';
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
  const browser = await chromium.launchPersistentContext('/workspace/ui844-tall-help/compiled-test-profile', { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], viewport:{width:1280,height:900} });
  const settings=await browser.newPage();await settings.goto('chrome://settings/appearance');await settings.locator('#zoomLevel').selectOption('2');await settings.close();
  const rows = [];
  try {
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
          const key='CLE_SYNTHETIQUE_CONFIGURATION_FRANCAISE_' + 'PARAMETRES_DE_DOCUMENTATION_LONGUE_'.repeat(15) + 'FIN_SYNTHETIQUE' ;
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
        expect(values.bounds.x + values.bounds.width).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth) + 1);
        expect(values.bounds.y + values.bounds.height).toBeLessThanOrEqual(await page.evaluate(()=>innerHeight) + 1);
      }
      try {
        console.log('start', format.width, format.language);
        await page.goto(origin + '/projects/synthetic-first/ide?panel='+target, { waitUntil: 'domcontentloaded' });
        await expect.poll(()=>requests).toBeGreaterThan(0);
        row.zoomBefore=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale,zoom:getComputedStyle(document.documentElement).zoom}));
        expect(row.zoomBefore.innerWidth).toBe(format.width/2);expect(row.zoomBefore.dpr).toBe(2);expect(row.zoomBefore.zoom).toBe('1');
        row.zoomAfter=await page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale,zoom:getComputedStyle(document.documentElement).zoom}));row.zoomMethod='Native Chromium appearance Page zoom 200%, isolated test profile';
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
            const read=page.getByRole('button',{name:/Lire l’aide complète|Read full help/});
            const dialog=page.getByRole('dialog');
            const region=page.getByRole('region',{name:/Texte de l’aide|Help text/});
            await menu.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
            await expect(menu).toBeFocused();await expect(read).toBeVisible();await expect(dialog).toHaveCount(0);
            const fullText=await menu.getAttribute('data-vc-tooltip');
            await page.screenshot({path:out+'/'+format.width+'-'+format.language+'-offer.png'});
            await page.keyboard.press('F1');await expect(dialog).toBeVisible();await expect(region).toBeFocused();
            expect(await region.textContent()).toBe(fullText);
            row.readingStart=await region.evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight,top:e.scrollTop}));
            expect(row.readingStart.scroll).toBeGreaterThan(row.readingStart.client);
            await page.keyboard.press('PageDown');await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
            await page.keyboard.press('End');await expect.poll(()=>region.evaluate(e=>e.scrollTop+e.clientHeight>=e.scrollHeight-1)).toBe(true);
            row.readingEnd=await region.evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight,top:e.scrollTop,text:e.textContent}));
            expect(row.readingEnd.text.endsWith('FIN_SYNTHETIQUE')).toBe(true);
            row.dialogBounds=await dialog.boundingBox();
            const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
            expect(row.dialogBounds.x).toBeGreaterThanOrEqual(8);expect(row.dialogBounds.y).toBeGreaterThanOrEqual(8);
            expect(row.dialogBounds.x+row.dialogBounds.width).toBeLessThanOrEqual(viewport.width-8);
            expect(row.dialogBounds.y+row.dialogBounds.height).toBeLessThanOrEqual(viewport.height-8);
            await page.screenshot({path:out+'/'+format.width+'-'+format.language+'-last-line.png'});
            await page.setViewportSize({width:format.width,height:format.height+80});await expect(dialog).toBeVisible();expect(await region.textContent()).toBe(fullText);
            await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(menu).toBeFocused();
            await page.setViewportSize({width:format.width,height:format.height});
            await query.focus();
            const anchorRect=await menu.boundingBox();await page.mouse.move(anchorRect.x+anchorRect.width/2,anchorRect.y+anchorRect.height/2);await expect(read).toBeVisible();
            const readRect=await read.boundingBox();row.pointerPath={anchor:anchorRect,action:readRect};
            await page.mouse.move(readRect.x+readRect.width/2,readRect.y+readRect.height/2,{steps:12});await expect(read).toBeVisible();
            await page.mouse.down();await page.mouse.up();await expect(dialog).toBeVisible();await expect(region).toBeFocused();
            await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:/Fermer|Close/})).toBeFocused();
            await page.keyboard.press('Shift+Tab');await expect(dialog).toHaveCount(0);
            const outside=await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label')}));
            await page.keyboard.press('Escape');expect(await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label')}))).toEqual(outside);
            row.keyboard={pageDown:true,end:true,resizePreserved:true,escapeReturn:true,shiftTabExit:true,mouseGap:true};



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
