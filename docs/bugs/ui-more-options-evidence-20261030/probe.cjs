const fs = require('node:fs');
const { chromium, expect } = require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip = require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime = require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin = 'http://127.0.0.1:21999';
const out = '/workspace/ui-more-options-20261030/' + (process.env.LABEL || 'diagnostic');
const mode = process.env.MODE || 'spontaneous';
if(!['spontaneous','release-before-click','after-detachment','press-across-release','press-stable'].includes(mode)) throw new Error('Unknown mode');
const cpu = Number(process.env.CPU || 1);
const trace = process.env.TRACE !== '0';
const action = process.env.ACTION || 'forced';
if(!['forced','normal','native','tap'].includes(action)) throw new Error('Unknown action');
const lightweightEvents = process.env.EVENTS === '1';
if(mode.startsWith('press-') && action !== 'native') throw new Error('Press experiment requires ACTION=native');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const profiles = [
 {name:'iphone-se',viewport:{width:375,height:667},userAgent:iphone},
 {name:'iphone-pro-max',viewport:{width:430,height:932},userAgent:iphone},
 {name:'android-landscape',viewport:{width:932,height:430},userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'},
 {name:'ipad-mini-portrait',viewport:{width:768,height:1024},userAgent:'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'},
].filter(p=>!process.env.PROFILE || p.name===process.env.PROFILE);
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const archive=new JSZip();for(const [name,content] of Object.entries(runtime.files))archive.file(name,content);
 const archiveBase64=await archive.generateAsync({type:'base64'});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const rows=[];
 try{for(const profile of profiles){
  const context=await browser.newContext({baseURL:origin,viewport:profile.viewport,isMobile:true,hasTouch:true,userAgent:profile.userAgent});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
  const row={profile:profile.name,cpu,mode,trace,action,lightweightEvents,errors:[],transport:[]};let originalButton;let release;const gate=new Promise(r=>release=r);let observed=false;let ideStateFulfilled=false;
  await context.addCookies([{name:'vc_session',value:'synthetic-ui',url:origin,httpOnly:true,sameSite:'Lax'}]);
  page.on('pageerror',e=>row.errors.push(e.message));
  await page.addInitScript(({traceEnabled,eventsEnabled})=>{
   if(window!==window.top)return;
   localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0}));
   localStorage.setItem('vc:ws-seed:synthetic-first',JSON.stringify({revision:'synthetic-revision',seededAt:Date.now()}));
   const ids=new WeakMap();let next=0;const retained=[];const events=[];const actionEvents=[];let pressedButton=null;let last='';
   const identity=e=>{if(!e)return null;if(!ids.has(e))ids.set(e,++next);return ids.get(e)};
   const describe=e=>{if(!(e instanceof Element))return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {id:identity(e),tag:e.tagName,testid:e.getAttribute('data-testid'),connected:e.isConnected,rect:{x:r.x,y:r.y,w:r.width,h:r.height},rectCount:e.getClientRects().length,display:c.display,visibility:c.visibility,opacity:c.opacity,pointerEvents:c.pointerEvents,hidden:e.hasAttribute('hidden'),inert:e.hasAttribute('inert'),ariaHidden:e.getAttribute('aria-hidden')};};
   const capture=(why,details)=>{
    const nodes=[...document.querySelectorAll('[data-testid="mobile-bottom-navigation"] [data-testid="button-more"]')];
    for(const n of nodes)if(!retained.includes(n)){retained.push(n);if(retained.length>12)retained.shift();}
    const data={nodes:nodes.map(n=>{const ancestors=[];for(let a=n.parentElement;a&&ancestors.length<8;a=a.parentElement)ancestors.push(describe(a));return {target:describe(n),ancestors};}),retained:retained.map(describe),keyboard:document.documentElement?.getAttribute('data-vc-clavier'),viewport:{width:innerWidth,height:innerHeight,visual:visualViewport?{w:visualViewport.width,h:visualViewport.height,scale:visualViewport.scale,top:visualViewport.offsetTop,left:visualViewport.offsetLeft}:null},active:describe(document.activeElement)};
    const signature=JSON.stringify(data);if(why==='mutation'&&signature===last)return;last=signature;
    events.push({time:performance.now(),why,details,...data});if(events.length>160)events.shift();return data;
   };
   if(traceEnabled){
   new MutationObserver(()=>capture('mutation')).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','inert','aria-hidden','data-vc-clavier']});
   for(const type of ['focusin','focusout','pointerdown','pointerup','click'])document.addEventListener(type,e=>capture(type,{target:identity(e.target),testid:e.target?.getAttribute?.('data-testid')}),true);
   window.addEventListener('resize',()=>capture('resize'));visualViewport?.addEventListener('resize',()=>capture('visual-resize'));
   }
   if(eventsEnabled){
    document.addEventListener('pointerdown',event=>{pressedButton=event.target instanceof Element?event.target.closest('button'):null;},true);
    const light=e=>e instanceof Element?{id:identity(e),tag:e.tagName,testid:e.getAttribute('data-testid'),connected:e.isConnected}:null;
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','focusin','focusout'])document.addEventListener(type,event=>{
      actionEvents.push({time:performance.now(),type,isTrusted:event.isTrusted,pointerType:event.pointerType,target:light(event.target),button:light(event.target?.closest?.('button')),retained:retained.map(light)});
      if(actionEvents.length>160)actionEvents.shift();
    },true);
   }
   window.__moreDiagnostic={events,actionEvents,capture,pressedButtonSnapshot:()=>pressedButton?{id:identity(pressedButton),connected:pressedButton.isConnected,testid:pressedButton.getAttribute('data-testid'),tag:pressedButton.tagName}:null};
  },{traceEnabled:trace,eventsEnabled:lightweightEvents});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   if(await runtime.intercept(route,origin,row.transport))return;
   if(url.origin!==origin||!['GET','HEAD'].includes(method)){row.transport.push({blocked:true,method,path:url.pathname});return route.fulfill({status:503,json:{error:'Synthetic audit blocks external requests and mutations'}});}
   if(url.pathname.endsWith('/export/zip'))return route.fulfill({json:{archive:{base64:archiveBase64}}});
   if(url.pathname.endsWith('/ide-state')){observed=true;if(mode!=='spontaneous')await gate;await route.fulfill({json:{ideState:{version:1,state:{}}}});ideStateFulfilled=true;return;}
   if(url.pathname==='/api/agent-memory/preferences')return route.fulfill({json:{preference:{enabled:false}}});
   return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  try{
   const projectId='synthetic-first';
    await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile'), `${profile.name} compact shell`).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId('mobile-bottom-navigation'), `${profile.name} bottom navigation`).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId('tab-preview'), `${profile.name} Webview tab`).toBeVisible();
    await expect(page.getByTestId('tab-agent'), `${profile.name} AI Agent tab`).toBeVisible();
    await expect(page.getByTestId('tab-deployments'), `${profile.name} Deployments tab`).toBeVisible();

    const readLayout = () =>
      page.evaluate(() => {
        const navElement = document.querySelector('.bolt-mobile-replit-nav');
        const statusElement = document.querySelector('.bolt-project-statusbar-mobile');
        const nav = navElement?.getBoundingClientRect();
        const status = statusElement?.getBoundingClientRect();

        const statusVisible =
          statusElement instanceof HTMLElement &&
          getComputedStyle(statusElement).display !== 'none' &&
          statusElement.offsetParent !== null;

        return {
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          navVisible:
            navElement instanceof HTMLElement &&
            getComputedStyle(navElement).display !== 'none' &&
            getComputedStyle(navElement).visibility !== 'hidden' &&
            Boolean(nav && nav.width > 0 && nav.height > 0),
          overlaps: Boolean(nav && status && statusVisible && status.bottom > nav.top),
        };
      });

    /*
     * The visibility assertions above wait on `mobile-bottom-navigation`, but
     * the measurement below reads `.bolt-mobile-replit-nav` — a DIFFERENT
     * element, shown by a media query once the compact shell settles. Reading
     * it in a single snapshot meant an unsettled frame reported
     * `navVisible: false`, which is exactly the flake that hit a different
     * device profile on each run. Poll until the layout settles instead.
     */
    await expect(async () => {
      const layout = await readLayout();

      expect(layout.navVisible, `${profile.name} nav visible`).toBe(true);
      expect(layout.overflowX, `${profile.name} horizontal overflow`).toBe(false);
      expect(layout.overlaps, `${profile.name} status/nav overlap`).toBe(false);
    }).toPass({ timeout: 30_000, intervals: [250, 500, 1000, 2000] });

    await expect(page.getByTestId('mobile-bottom-navigation').getByTestId('button-more')).toBeVisible();

    /*
     * The compact header exposes a single overflow control whose test id (and
     * target menu) depends on the active panel: `mobile-agent-menu-trigger`
     * while the Agent panel is up, `button-more` otherwise. The shell lands on
     * the Agent panel, so asserting `button-more` unconditionally never
     * matched. Accept either — what matters is that the control is there.
     */
    await expect(
      page
        .getByTestId('mobile-ide-header')
        .locator('[data-testid="button-more"], [data-testid="mobile-agent-menu-trigger"]'),
      `${profile.name} header overflow control`,
    ).toBeVisible();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);

    if (mode !== 'spontaneous') {
      originalButton = await page.getByTestId('mobile-bottom-navigation').getByTestId('button-more').elementHandle();
      row.gateObserved = observed;
      if (!observed) throw new Error('Controlled ide-state gate was not reached');
      if(mode !== 'press-across-release'){
        release();
        if (mode === 'after-detachment' || mode === 'press-stable') {
          await expect.poll(() => originalButton.evaluate(node => !node.isConnected),{timeout:5000}).toBe(true);
          row.detachedBeforePress=true;
        }
      }
    }
    row.actionTarget = await page.evaluate(()=>window.__moreDiagnostic.capture('before-click')?.nodes[0]?.target);
    if(action==='forced'){
      await page.getByTestId('mobile-bottom-navigation').getByTestId('button-more').click({ force: true });
    }else if(action==='normal'){
      await page.getByTestId('mobile-bottom-navigation').getByTestId('button-more').click();
    }else{
      const rect=row.actionTarget?.rect;
      if(!rect || rect.w<=0 || rect.h<=0)throw new Error('Native single click has no valid snapshot rectangle');
      row.nativePoint={x:rect.x+rect.w/2,y:rect.y+rect.h/2};
      if(mode==='press-across-release' || mode==='press-stable'){
        await page.mouse.move(row.nativePoint.x,row.nativePoint.y);
        await page.mouse.down();
        row.pressStarted=true;
        row.actualPressedAfterDown=await page.evaluate(()=>window.__moreDiagnostic.pressedButtonSnapshot());
        try{
          if(mode==='press-across-release'){
            release();
            await expect.poll(()=>ideStateFulfilled,{timeout:5000}).toBe(true);
            row.ideStateFulfilledDuringPress=true;
            // Diagnostic gesture duration, not a product delay or a retry.
            await page.waitForTimeout(150);
            row.detachedDuringPress=await originalButton.evaluate(node=>!node.isConnected);
            row.actualPressedDuringHold=await page.evaluate(()=>window.__moreDiagnostic.pressedButtonSnapshot());
          }
        }finally{
          await page.mouse.up();
          row.pressReleased=true;
          row.actualPressedAfterUp=await page.evaluate(()=>window.__moreDiagnostic.pressedButtonSnapshot());
        }
      }else if(action==='tap'){
        await page.touchscreen.tap(row.nativePoint.x,row.nativePoint.y);
      }else{
        await page.mouse.click(row.nativePoint.x,row.nativePoint.y);
      }
    }
    await expect(page.getByTestId('mobile-more-menu-sheet'), `${profile.name} more menu`).toBeVisible({
      timeout: 10_000,
    });
    await page.evaluate(()=>window.__moreDiagnostic?.capture('after-sheet-visible'));
    if(mode==='press-across-release'){
      await expect.poll(()=>originalButton.evaluate(node=>!node.isConnected),{timeout:5000}).toBe(true);
      row.detachedAfterRelease=true;
      await expect.poll(()=>page.evaluate(()=>window.__moreDiagnostic?.pressedButtonSnapshot()?.connected),{timeout:5000}).toBe(false);
      row.actualPressedDetachedAfterRelease=true;
    }

   row.pass=true;
  }catch(error){row.pass=false;row.failure=error.message;await page.screenshot({path:out+'/'+profile.name+'-failure.png'}).catch(()=>{});}
  finally{
   release();row.actualPressedAtEnd=await page.evaluate(()=>window.__moreDiagnostic?.pressedButtonSnapshot()||null).catch(()=>null);row.actionEvents=await page.evaluate(()=>window.__moreDiagnostic?.actionEvents||[]).catch(()=>[]);row.ledger=await page.evaluate(()=>{window.__moreDiagnostic?.capture('final');return window.__moreDiagnostic?.events||[]}).catch(()=>[]);
   await context.close();rows.push(row);fs.writeFileSync(out+'/receipt.json',JSON.stringify(rows,null,2));
   console.log(JSON.stringify({profile:profile.name,cpu,mode,trace,action,lightweightEvents,pass:row.pass,failure:row.failure}));
  }
 }}finally{await browser.close();}
 if(rows.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
