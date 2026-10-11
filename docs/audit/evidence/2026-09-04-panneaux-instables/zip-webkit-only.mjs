import { webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await webkit.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...devices['iPhone 15 Pro']});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  await page.addInitScript(()=>{ window.__zip=[]; const o=window.fetch;
    window.fetch=function(...a){ const u=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||'';
      if(String(u).includes('/export/zip')) window.__zip.push({t:Date.now(),stack:(new Error().stack||'').split('\n').slice(1,6).join(' | ')});
      return o.apply(this,a); }; });
  const resp=[]; const T0=Date.now();
  page.on('response',async r=>{ if(r.url().includes('/export/zip')){ let n=null; try{n=(await r.body()).length;}catch{} resp.push({s:r.status(),bytes:n,t:Date.now()-T0}); }});
  try{
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector('[data-testid="ide-service-panel"][data-panel="overview"]',{timeout:60000});
    let last=-1,stable=0,floor=null;
    for(let i=0;i<300;i++){
      const len=await page.evaluate(()=>{const e=document.querySelector('[data-testid="ide-service-panel"][data-panel="overview"]');return e?(e.innerText||'').trim().length:0;});
      if(floor===null) floor=len;
      if(len===last&&len>floor){ if(++stable>=3){ console.log('content_ms='+(Date.now()-T0)); break; } } else stable=0;
      last=len; await sleep(100);
    }
  }catch(e){ console.log('ERR '+String(e.message).slice(0,80)); }
  await sleep(8000);
  const calls=await page.evaluate(()=>window.__zip||[]).catch(()=>[]);
  console.log('zipCalls='+calls.length+'  responses='+resp.length+'  totalDecodedMiB='+(resp.reduce((s,x)=>s+(x.bytes||0),0)/1048576).toFixed(2));
  resp.forEach((r,i)=>console.log(`  resp ${i+1}: status=${r.s} bytes=${r.bytes} at=${r.t}ms`));
  calls.forEach((c,i)=>console.log(`  call ${i+1}: ${c.stack.slice(0,200)}`));
  await b.close();
})();
