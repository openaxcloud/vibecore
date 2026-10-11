/**
 * Matched-window archive census. The earlier engine comparison was invalid
 * because each engine got a different observation window; the archive responses
 * land at 15-22s, so a short window undercounts.
 *
 * Here BOTH engines get the SAME fixed wall-clock window measured from
 * navigation start, and counting is done on Playwright's request/response
 * events (not an in-page hook), so nothing depends on when the panel painted.
 */
import { chromium, webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const WINDOW_MS=Number(process.env.WINDOW_MS||45000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function probe(engine,name,opts){
  const b=await engine.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...opts});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  const reqs=[], resps=[]; const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,150));});
  page.on('request',r=>{ if(r.url().includes('/export/zip')) reqs.push(Date.now()); });
  page.on('response',async r=>{ if(r.url().includes('/export/zip')){
    let n=null; try{ n=(await r.body()).length; }catch{}
    resps.push({t:Date.now(), status:r.status(), bytes:n}); }});
  const T0=Date.now();
  try{ await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:60000}); }
  catch(e){ errs.push('NAV '+String(e.message).slice(0,70)); }
  // FIXED window from navigation start -- identical for both engines
  while (Date.now()-T0 < WINDOW_MS) await sleep(500);
  await b.close();
  const bytes = resps.reduce((s,x)=>s+(x.bytes||0),0);
  return { engine:name, windowMs:WINDOW_MS,
    archiveRequests:reqs.length, archiveResponses:resps.length,
    decodedMiB:+(bytes/1048576).toFixed(2),
    requestOffsetsMs:reqs.map(t=>t-T0),
    responseOffsetsMs:resps.map(r=>r.t-T0),
    dataCloneErrors: errs.filter(e=>/DataClone|cloned/i.test(e)).length,
    consoleErrors: errs.length };
}
(async()=>{
  const out=[];
  for(const [e,n,o] of [[chromium,'chromium-desktop',{viewport:{width:1440,height:900}}],
                        [webkit,'webkit-iphone',{...devices['iPhone 15 Pro']}]]){
    const r=await probe(e,n,o); out.push(r);
    console.log(JSON.stringify(r));
    await sleep(15000);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/archive-matched.json',JSON.stringify(out,null,2));
  const c=out[0], w=out[1];
  console.log(`\n=== MATCHED WINDOW ${WINDOW_MS}ms ===`);
  console.log(`chromium: ${c.archiveRequests} requests, ${c.archiveResponses} responses, ${c.decodedMiB} MiB`);
  console.log(`webkit  : ${w.archiveRequests} requests, ${w.archiveResponses} responses, ${w.decodedMiB} MiB`);
})();
