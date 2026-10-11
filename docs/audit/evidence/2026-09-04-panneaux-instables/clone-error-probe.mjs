/** Is "Workspace start failed: DataCloneError" WebKit-only? Chromium is the control. */
import { chromium, webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function probe(engine,name,opts){
  const b=await engine.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...opts});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage(); const msgs=[]; let zip=0;
  page.on('console',m=>msgs.push(`${m.type()}: ${m.text().slice(0,180)}`));
  page.on('pageerror',e=>msgs.push('pageerror: '+String(e.message).slice(0,180)));
  page.on('request',r=>{ if(r.url().includes('/export/zip')) zip++; });
  try{
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector('[data-testid="ide-service-panel"][data-panel="overview"]',{timeout:60000});
  }catch(e){ msgs.push('NAV-ERR '+String(e.message).slice(0,80)); }
  await sleep(20000);
  await b.close();
  const clone = msgs.filter(m=>/DataClone|can not be cloned|could not be cloned/i.test(m));
  const startFail = msgs.filter(m=>/Workspace start failed/i.test(m));
  return {name, total:msgs.length, zipRequests:zip,
    dataCloneErrors:clone.length, startFailures:startFail.length,
    samples:[...new Set([...startFail,...clone])].slice(0,3),
    // witness: the probe can see console messages at all
    anyErrors: msgs.filter(m=>m.startsWith('error')||m.startsWith('pageerror')).length};
}
(async()=>{
  for(const [e,n,o] of [[chromium,'chromium-1440',{viewport:{width:1440,height:900}}],
                        [webkit,'webkit-iphone',{...devices['iPhone 15 Pro']}]]){
    const r=await probe(e,n,o);
    console.log(JSON.stringify(r,null,1));
    await sleep(14000);
  }
})();
