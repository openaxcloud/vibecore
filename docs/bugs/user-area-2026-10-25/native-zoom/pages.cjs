const{chromium,expect}=require('@playwright/test');const fs=require('node:fs');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:6099';const receipt={base,synthetic:true,zoomFactor:2,pref:{partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}},observations:[],interactions:[],writes:[],errors:[]};
const metrics=p=>p.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth}));
(async()=>{for(const lang of['fr','en'])for(const theme of['light','dark']){
const profile=fs.mkdtempSync('/tmp/account-next/native-zoom/pages-profile-');fs.mkdirSync(profile+'/Default');fs.writeFileSync(profile+'/Default/Preferences',JSON.stringify(receipt.pref));
const c=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,viewport:null,args:['--no-sandbox','--window-size=1280,800']});
try{await c.addCookies([{name:'vc_session',value:'synthetic-ui-fixture',url:base},{name:'ecode_theme',value:theme,url:base}]);await c.addInitScript(()=>localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0})));
await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==base)return r.abort();if(r.request().method()!=='GET'){receipt.writes.push(r.request().method()+' '+r.request().url());return r.abort()}return r.continue()});
const p=await c.newPage();p.on('pageerror',e=>receipt.errors.push(e.message));const cdp=await c.newCDPSession(p);const{windowId}=await cdp.send('Browser.getWindowForTarget');
for(const route of['/dashboard','/projects','/billing','/account-settings','/account-settings/data']){
await p.goto(base+route+'?lang='+lang,{waitUntil:'domcontentloaded'});await p.getByRole('heading',{level:1}).first().waitFor();await expect(p.locator('html')).toHaveAttribute('data-theme',theme);
const m=await metrics(p);expect(m.outerWidth).toBe(1280);expect(m.innerWidth).toBe(640);expect(m.dpr).toBe(2);expect(m.visualScale).toBe(1);expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth+1);receipt.observations.push({route,lang,theme,...m});
if(lang==='fr')await p.screenshot({path:`/tmp/account-next/native-zoom/${route.slice(1).replaceAll('/','-')}-${theme}-200.png`});
if(route==='/billing'||route==='/account-settings'){
const field=p.locator(route==='/billing'?'input[name=budgetCapDollars]':'input[name=name]');const value=route==='/billing'?'125.50':'Camille — brouillon synthétique à deux cents pour cent';await field.fill(value);
await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:1600,height:900}});await expect.poll(async()=>(await metrics(p)).innerWidth).toBe(800);await expect(field).toHaveValue(value);await expect(field).toBeFocused();
await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:1280,height:800}});await expect.poll(async()=>(await metrics(p)).innerWidth).toBe(640);await expect(field).toHaveValue(value);
if(route==='/account-settings') {await p.getByRole('navigation',{name:lang==='fr'?'Paramètres du compte':'Account settings'}).locator('a[href="/account-settings/data"]').click();await expect(p.getByRole('dialog')).toBeVisible();await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toBeHidden();await expect(field).toHaveValue(value);await field.fill('Camille Exemple');}
receipt.interactions.push({route,lang,theme,nativeZoomPreserved:(await metrics(p)).dpr===2,draftPreserved:true,resizePhysical:'1280→1600→1280',navigationCancelled:route==='/account-settings'});
}
if(route==='/account-settings/data'){
const open=p.getByTestId('account-delete-open');await open.click();await expect(p.getByRole('dialog')).toBeVisible();const cancel=p.getByRole('dialog').getByRole('button',{name:lang==='fr'?'Annuler':'Cancel',exact:true});await cancel.scrollIntoViewIfNeeded();await expect(cancel).toBeInViewport();await p.keyboard.press('Escape');await expect(open).toBeFocused();receipt.interactions.push({route,lang,theme,dialogScrollable:true,escapeFocus:true});
}
}
}finally{await c.close();fs.writeFileSync('/tmp/account-next/native-zoom/receipt.json',JSON.stringify(receipt,null,2));}}
expect(receipt.errors).toEqual([]);expect(receipt.writes).toEqual([]);console.log(receipt.observations.length,'page observations;',receipt.interactions.length,'interaction groups passed; native200%');
})().catch(e=>{console.error(e);process.exit(1)});
