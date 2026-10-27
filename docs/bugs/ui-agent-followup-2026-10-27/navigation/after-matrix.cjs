const { chromium, expect } = require('/workspace/vibecore-ui-contract812/node_modules/@playwright/test');
const fs = require('fs');
const origin=process.env.ORIGIN;
if(!origin) throw new Error('ORIGIN required');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const rows=[];const errors=[];const blocked=[];
 try {
  for(const width of [320,768,1180,1440]) for(const mode of width===1440?['default']:['default','explicit','pending']) {
   const page=await browser.newPage({viewport:{width,height:757}});
   page.on('pageerror',e=>errors.push({width,mode,message:e.message}));
   await page.context().addCookies([{name:'vc_session',value:'synthetic-ui',url:origin},{name:'vibecore-lang',value:'en',url:origin}]);
   await page.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0}));window.__marks=[];window.__vibecoreStartupMark=m=>window.__marks.push(m)});
   let release;const gate=new Promise(r=>release=r);let requested=false;
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin||!['GET','HEAD'].includes(req.method())){blocked.push({width,mode,method:req.method(),path:url.pathname});return route.fulfill({status:503,json:{error:'isolated fixture blocks mutation/external call'}})}
    if(url.pathname.endsWith('/ide-state')){requested=true;await gate;return route.fulfill({status:200,json:{ideState:{version:1,state:{updatedAt:Date.now(),ui:{mobilePanel:mode==='explicit'?'files':'preview'}}}}})}
    return route.continue();
   });
   await page.context().routeWebSocket('**/*',s=>s.close());
   const url=origin+'/projects/synthetic-first/ide'+(mode==='explicit'?'?panel=preview':'');
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await expect.poll(()=>requested).toBe(true);
   const root=page.locator('.bolt-responsive-ide');const nav=page.getByTestId('mobile-bottom-navigation');
   if(mode==='pending'){
    await expect(page.getByTestId('ide-agent-panel')).toBeVisible();
    await nav.getByTestId('button-add-tab').click();
    await page.getByTestId('tools-sheet').getByTestId('tool-item-files').click();
    await expect(page).toHaveURL(/panel=files/);
   }
   release();
   await page.waitForFunction(()=>window.__marks.includes('layout-restored'));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const expected=mode==='default'?'chat':mode==='explicit'?'preview':'files';
   await expect(root).toHaveAttribute('data-mobile-panel',expected);
   if(mode==='default') await expect(page.getByTestId('ide-agent-panel')).toBeVisible();
   if(width<1200)await expect(nav.getByTestId('tab-'+(expected==='chat'?'agent':expected))).toHaveAttribute('aria-pressed','true');
   const result={width,mode,expected,restored:true};
   await page.screenshot({path:'/workspace/ui-initial-panel-evidence/after-'+width+'-'+mode+'.png'});
   if(width<1200&&mode==='default'){
    await nav.getByTestId('tab-preview').click();await expect(page).toHaveURL(/panel=preview/);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__marks.includes('layout-restored'));
    await expect(root).toHaveAttribute('data-mobile-panel','preview');
    await page.goBack();await expect(page).not.toHaveURL(/panel=/);
    await expect(page.getByTestId('ide-agent-panel')).toBeVisible();
    await expect(nav.getByTestId('tab-agent')).toHaveAttribute('aria-pressed','true');
    await page.goForward();await expect(root).toHaveAttribute('data-mobile-panel','preview');
    result.history='preview/reload/Back Agent/Forward preview passed';
   }
   if(width===1180&&mode==='default'){
    await nav.getByTestId('tab-agent').click();
    const input=page.locator('[data-testid="ide-agent-panel"] textarea').first();
    await input.fill('Texte synthétique conservé pendant le redimensionnement — aucun envoi.');
    for(const next of [1440,768,320,1180]){await page.setViewportSize({width:next,height:757});await expect(input).toHaveValue('Texte synthétique conservé pendant le redimensionnement — aucun envoi.')}
    result.resizeTyping='1180→1440→768→320→1180 passed';
   }
   rows.push(result);await page.close();
  }
 } finally {await browser.close();fs.writeFileSync('/workspace/ui-initial-panel-evidence/after-matrix.json',JSON.stringify({rows,errors,blocked},null,2));}
 console.log(JSON.stringify({cases:rows.length,rows,errors,blocked:blocked.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
