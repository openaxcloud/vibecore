const{chromium}=require('@playwright/test');
const fs=require('node:fs');const base=process.env.UI_BASE_URL||'http://127.0.0.1:6099';
(async()=>{const results=[];for(const factor of[1,2]){
const profile=fs.mkdtempSync('/tmp/account-next/native-zoom/profile-');fs.mkdirSync(profile+'/Default');
const prefs={partition:{default_zoom_level:{x:Math.log(factor)/Math.log(1.2)}}};fs.writeFileSync(profile+'/Default/Preferences',JSON.stringify(prefs));
const context=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,viewport:null,args:['--no-sandbox','--window-size=1280,800']});
try{await context.addCookies([{name:'vc_session',value:'synthetic-ui-fixture',url:base}]);await context.addInitScript(()=>localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0})));
await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const page=await context.newPage();await page.goto(base+'/billing?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('input[name=budgetCapDollars]').waitFor();
const metrics=await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualScale:visualViewport.scale,visualWidth:visualViewport.width,scroll:document.documentElement.scrollWidth}));
await page.screenshot({path:`/tmp/account-next/native-zoom/billing-${factor}x.png`});results.push({factor,profile,prefs,metrics});console.log(JSON.stringify(results.at(-1)));}finally{await context.close();}}
fs.writeFileSync('/tmp/account-next/native-zoom/probe.json',JSON.stringify(results,null,2));})().catch(e=>{console.error(e);process.exit(1)});
