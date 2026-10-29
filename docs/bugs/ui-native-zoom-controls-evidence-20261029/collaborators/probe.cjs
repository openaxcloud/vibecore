const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui843-native-collab';
fs.mkdirSync(out, { recursive: true });
const target='collaborators';
const cases = [390,820,1280].map((width,i)=>({width,height:1200,language:'en',attempt:i+1}));
(async () => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(runtime.files)) zip.file(name, content);
  const archiveBase64 = await zip.generateAsync({ type: 'base64' });
  const browser = await chromium.launchPersistentContext(out+'/profile-'+Date.now(), { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], viewport:{width:1280,height:1200} });
  const settings=await browser.newPage(); await settings.goto('chrome://settings/appearance'); await settings.locator('#zoomLevel').selectOption('2'); await settings.close();
  const rows = [];
  try {
    for (const format of cases) {
      let recovered=false; let release; const gate=new Promise(r=>release=r); let targetRequests=0; let lastData;
      const row = { ...format, errors: [], transport: [], observations: [] };
      const page = await browser.newPage(); await page.setViewportSize({width:format.width,height:format.height});
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
        if(url.pathname.endsWith('/collaboration-ws'))return route.fulfill({json:{websocketUrl:'ws://127.0.0.1:21999/synthetic-collaboration'}});
        if(url.pathname.endsWith('/ide-panel/'+target)&&method==='GET') {
          targetRequests++; row.transport.push({target:true,phase:recovered?'recovery':'initial'});
          if(!recovered) {await gate; if(process.env.MODE==='recovery')return route.fulfill({status:503,json:{error:'Synthetic service unavailable'}});}
          const longPath='src/documentation/parcours-utilisateurs/configuration-des-services-et-regles-de-validation/'+ 'documentation-'.repeat(12)+'notes.tsx';
          const data=process.env.MODE==='long' ? target==='snapshots' ? {snapshots:[{id:'synthetic-snapshot',label:'Checkpoint avant adaptation des parcours français et anglais — '+ 'validation'.repeat(12),createdAt:'2026-10-28T15:00:00Z',byteLength:123456,manifest:{files:[{path:longPath,sizeBytes:12345}]}}]} : {collaborators:[{id:'synthetic-member',userId:'00000000-0000-4000-8000-000000000001',displayName:'Utilisateur synthétique — nom composé de documentation internationale',roleKey:'member'}],presence:[{sessionId:'synthetic-session',userId:'00000000-0000-4000-8000-000000000001',displayName:'Utilisateur synthétique — nom composé de documentation internationale',filePath:longPath,mode:'editing',status:'online'}],comments:[{id:'synthetic-comment',filePath:longPath,line:321,body:'Voir la documentation : https://example.test/documentation/'+ 'configuration'.repeat(35),displayName:'Utilisateur synthétique'}],activity:[],shareLinks:[],terminalPermissions:{},realtime:{status:'error',error:'Synthetic offline'}} : target==='snapshots'?{snapshots:[]}:{collaborators:[],presence:[],comments:[],activity:[],shareLinks:[],terminalPermissions:{},realtime:{status:'error',error:'Synthetic offline'}};
          lastData=data;return route.fulfill({json:{panel:target,status:'ready',data}});
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
      await page.context().routeWebSocket('**/*', (socket) => {if(!socket.url().includes('/synthetic-collaboration'))return socket.close(); const timer=setInterval(()=>{if(lastData){socket.send(JSON.stringify({type:'collaboration.ready',presence:lastData.presence??[],comments:lastData.comments??[]}));clearInterval(timer);}},30);socket.onClose(()=>clearInterval(timer));});
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
        await expect.poll(()=>targetRequests).toBeGreaterThan(0);
        const loader=page.getByText(/Loading (checkpoints|snapshots|collaborators|collaboration)/i).filter({visible:true}).first();
        row.loadingVisible=await loader.isVisible();
        release();
        if(process.env.MODE==='recovery') {
          const alert=page.getByRole('alert').filter({hasText:/503/}).filter({visible:true}).first();
          await expect(alert).toBeVisible(); row.errorText=await alert.innerText();
          const retry=alert.getByRole('button',{name:/Retry|Réessayer/});
          await retry.focus(); recovered=true; await page.keyboard.press('Enter');
          await expect(alert).toBeHidden();
        }
        const panel=page.locator(target==='snapshots'?'.bolt-project-snapshots-panel':'.bolt-project-collaboration-tool').filter({visible:true}).first();
        await expect(panel).toBeVisible();
        if(target==='snapshots'&&process.env.MODE==='long') {
          const summary=panel.locator('summary').first();await summary.focus();await page.keyboard.press('Enter');
          await expect(panel.locator('details').first()).toHaveAttribute('open','');
          await expect(panel.locator('details code')).toContainText('documentation-');
        }
        const invite=panel.locator('input[name=userId]:not([type=hidden])');
        const comment=panel.locator('input[name=body]');
        const commentPath=panel.locator('input[name=filePath]'); const commentLine=panel.locator('input[name=line]'); const inviteRole=invite.locator('xpath=ancestor::form').locator('select[name=roleKey]');
        await expect(invite).toBeVisible();
        const initialInvite=await invite.elementHandle(),initialComment=await comment.elementHandle();
        await invite.fill('draft@example.test');
        await comment.fill('Synthetic unsaved comment');
        await inviteRole.selectOption('viewer'); await commentPath.fill('src/context.ts'); await commentLine.fill('42');
        await expect(invite).toHaveValue('draft@example.test');
        await expect(comment).toHaveValue('Synthetic unsaved comment');
        await expect(inviteRole).toHaveValue('viewer'); await expect(commentPath).toHaveValue('src/context.ts'); await expect(commentLine).toHaveValue('42');
        row.draftPhases=[];
        async function record(phase) {
          row.draftPhases.push({phase,heldInvite:await initialInvite.evaluate(e=>({connected:e.isConnected,length:e.value.length})),heldComment:await initialComment.evaluate(e=>({connected:e.isConnected,length:e.value.length})),state:await page.evaluate(()=>{
            window.__draftIds??=new WeakMap();window.__draftCounter??=0;
            const id=e=>{if(!window.__draftIds.has(e))window.__draftIds.set(e,++window.__draftCounter);return window.__draftIds.get(e)};
            const fields=[...document.querySelectorAll('.bolt-project-collaboration-tool input[name=userId]:not([type=hidden]),.bolt-project-collaboration-tool input[name=body],.bolt-project-collaboration-tool input[name=filePath],.bolt-project-collaboration-tool input[name=line],.bolt-project-collaboration-tool select[name=roleKey]')].map(e=>({id:id(e),name:e.name,length:e.value.length,choice:e.tagName==='SELECT'?e.value:undefined,visible:!!e.getClientRects().length,connected:e.isConnected}));
            const nav=document.querySelector('[data-testid=mobile-bottom-navigation]');return {at:performance.now(),viewport:innerWidth,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom,fields,compact:!!nav?.getClientRects().length,surface:document.querySelector('.bolt-responsive-ide')?.getAttribute('data-mobile-panel'),router:window.__reactRouterDataRouter?.state?{navigation:window.__reactRouterDataRouter.state.navigation.state,location:window.__reactRouterDataRouter.state.location}:null};
          })});
        }
        await record('filled-native-200');
        expect(await page.evaluate(()=>innerWidth)).toBe(format.width/2); expect(await page.evaluate(()=>devicePixelRatio)).toBe(2); expect(await page.evaluate(()=>getComputedStyle(document.documentElement).zoom)).toBe('1');
        for(const width of [2560,format.width]) {
          await page.setViewportSize({width,height:1200});
          await page.waitForFunction(compact=>!!document.querySelector('[data-testid=mobile-bottom-navigation]')?.getClientRects().length===compact,width!==2560);
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await expect(panel).toBeVisible();await expect(invite).toBeVisible();
          await record('committed-'+width);
          await expect(invite).toHaveValue('draft@example.test');
          await expect(comment).toHaveValue('Synthetic unsaved comment');
          await expect(inviteRole).toHaveValue('viewer'); await expect(commentPath).toHaveValue('src/context.ts'); await expect(commentLine).toHaveValue('42');
        }
        await page.screenshot({path:out+'/'+format.width+'-native200-success.png'});
        row.pass = true;
      } catch (error) {
        row.pass = false;
        row.failure = error.message; row.failureState=await page.evaluate(()=>({width:innerWidth,fields:[...document.querySelectorAll('.bolt-project-collaboration-tool input')].filter(e=>['userId','body'].includes(e.name)&&e.type!=='hidden').map(e=>({name:e.name,length:e.value.length,choice:e.tagName==='SELECT'?e.value:undefined,visible:!!e.getClientRects().length}))}));
        await page.screenshot({ path: `${out}/${format.width}-${format.attempt}-failure.png` }).catch(() => {});
        row.buttons = await page.getByRole('button').allTextContents().catch(() => []);
      } finally {
        release(); await page.close();
        rows.push(row);
        fs.writeFileSync(out + '/receipt.json', JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
