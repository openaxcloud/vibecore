const fs=require('node:fs');
const {chromium,expect}=require('/workspace/vibecore-ui-panel-usability/node_modules/@playwright/test');
const JSZip=require('/workspace/vibecore-ui-panel-usability/node_modules/jszip');
const runtime=require('/workspace/ui-settings-usability-browser/runtime-fixture.cjs');
const origin='http://127.0.0.1:21999', out='/workspace/ui845-independent';
(async()=>{
 const profile=fs.mkdtempSync(out+'/profile-');let context;
 const receipt={fixture:'synthetic first project; key names only; no secret values',errors:[],transport:[],cssInjection:false};
 try {
  const zip=new JSZip();for(const [name,content] of Object.entries(runtime.files))zip.file(name,content);const base64=await zip.generateAsync({type:'base64'});
  context=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',args:['--no-sandbox'],viewport:{width:820,height:400}});
  const settings=await context.newPage();await settings.goto('chrome://settings/appearance');await settings.locator('#zoomLevel').selectOption('2');await settings.close();
  await context.addCookies([{name:'vc_session',value:'synthetic-ui',url:origin},{name:'vibecore-lang',value:'fr',url:origin},{name:'ecode_theme',value:'light',url:origin}]);
  const page=await context.newPage();page.on('pageerror',e=>receipt.errors.push(e.message));
  await page.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0}));localStorage.setItem('vc:ws-seed:synthetic-first',JSON.stringify({revision:'synthetic-revision',seededAt:Date.now()}));});
  await page.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url()),method=request.method();
   if(u.pathname.endsWith('/ide-panel/secrets')&&method==='GET')return route.fulfill({json:{panel:'secrets',status:'ready',data:{secrets:[{key:'SYNTHETIC_AUDIT_'+ 'LONG_SECTION_'.repeat(100)+'END',updatedAt:'2026-10-29T00:00:00Z'}]}}});
   if(await runtime.intercept(route,origin,receipt.transport))return;
   if(u.origin!==origin||!['GET','HEAD'].includes(method))return route.fulfill({status:503,json:{error:'Blocked by isolated audit'}});
   if(u.pathname.endsWith('/export/zip'))return route.fulfill({json:{archive:{base64}}});
   if(u.pathname.endsWith('/ide-state'))return route.fulfill({json:{ideState:{version:1,state:{}}}});
   if(u.pathname==='/api/agent-memory/preferences')return route.fulfill({json:{preference:{enabled:false}}});
   return route.continue();
  });
  await context.routeWebSocket('**/*',s=>s.close());
  await page.goto(origin+'/projects/synthetic-first/ide?panel=secrets',{waitUntil:'domcontentloaded'});
  const panel=page.locator('.bolt-secrets').filter({visible:true}).first(),key=panel.locator('.bolt-secrets-chip--key').first();
  await expect(panel).toBeVisible();await expect(key).toHaveAttribute('data-vc-tooltip',/SYNTHETIC_AUDIT/);
  await panel.locator('.bolt-secrets-filter input').focus();await page.keyboard.press('Tab');await expect(key).toBeFocused();
  receipt.geometry=await key.evaluate(e=>{
   const sc=e.closest('.bolt-project-service-panel').querySelector(':scope > .min-h-0'),nav=document.querySelector('.bolt-mobile-replit-nav-inner');
   const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom};};const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {key:rect(e),scroller:rect(sc),nav:rect(nav),centerUnoccluded:hit===e||e.contains(hit),focused:document.activeElement===e,scrollTop:sc.scrollTop,padding:getComputedStyle(sc).padding,keyboard:document.documentElement.getAttribute('data-vc-clavier'),nativeZoom:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom},pageOverflow:document.documentElement.scrollWidth>innerWidth};
  });
  const g=receipt.geometry;expect(g.nativeZoom).toEqual({width:410,height:200,dpr:2,cssZoom:'1'});expect(g.focused).toBe(true);expect(g.centerUnoccluded).toBe(true);expect(g.key.top).toBeGreaterThanOrEqual(g.scroller.top);expect(g.key.bottom).toBeLessThanOrEqual(g.scroller.bottom);expect(g.scroller.bottom).toBeLessThanOrEqual(g.nav.top);expect(g.pageOverflow).toBe(false);
  await key.click({trial:true});receipt.trialClick=true;receipt.pass=true;
 }catch(e){receipt.pass=false;receipt.failure=e.stack;process.exitCode=1;}
 finally{if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(out+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));}
})();
