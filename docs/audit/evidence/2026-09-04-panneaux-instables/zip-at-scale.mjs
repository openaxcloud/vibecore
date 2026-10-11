/** Does the x4 export/zip hold on a REPRESENTATIVE project, what does it cost
 *  end to end, and WHO fires it? Stack traces name the call sites -- reading
 *  the code only tells you who COULD call it. */
import { chromium, webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const P=process.env.PANEL||'overview';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function run(engine,name,ctxOpts){
  const b=await engine.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...ctxOpts});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  // capture a stack trace at every export/zip fetch, from inside the page
  await page.addInitScript(() => {
    window.__zipCalls = [];
    const orig = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (String(url).includes('/export/zip')) {
        window.__zipCalls.push({ t: Date.now(), stack: (new Error().stack || '').split('\n').slice(1, 7).join(' | ') });
      }
      return orig.apply(this, args);
    };
  });
  const zipResponses=[]; let apiReqs=0;
  page.on('request',r=>{ if(/\/api\//.test(r.url())) apiReqs++; });
  page.on('response',async r=>{ if(r.url().includes('/export/zip')){
    let len=null; try{ len=(await r.body()).length; }catch{}
    zipResponses.push({status:r.status(), bytes:len});
  }});
  const T0=Date.now(); const rec={engine:name};
  const sel=`[data-testid="ide-service-panel"][data-panel="${P}"]`;
  try{
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${P}`,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForSelector(sel,{timeout:90000});
    let last=-1,stable=0,floor=null;
    for(let i=0;i<400;i++){
      const len=await page.evaluate(s=>{const e=document.querySelector(s);return e?(e.innerText||'').trim().length:0;},sel);
      if(floor===null) floor=len;
      if(len===last&&len>floor){ if(++stable>=3){ rec.t_content=Date.now()-T0; break; } } else stable=0;
      last=len; await sleep(100);
    }
    rec.finalLen=last;
  }catch(e){ rec.err=String(e.message).slice(0,90); }
  await sleep(6000);
  rec.zipCalls = await page.evaluate(()=>window.__zipCalls||[]).catch(()=>[]);
  rec.zipCallCount = rec.zipCalls.length;
  rec.zipResponses = zipResponses;
  rec.zipBytesTotal = zipResponses.reduce((s,x)=>s+(x.bytes||0),0);
  rec.apiReqs = apiReqs;
  await b.close();
  return rec;
}
(async()=>{
  const out=[];
  for (const [eng,nm,opts] of [[chromium,'chromium-1440',{viewport:{width:1440,height:900}}],
                               [webkit,'webkit-iphone',{...devices['iPhone 15 Pro']}]]){
    const r=await run(eng,nm,opts);
    out.push(r);
    console.log(`${r.engine}: content=${r.t_content??r.err}ms  zipCalls=${r.zipCallCount}  zipBytes=${(r.zipBytesTotal/1024/1024).toFixed(2)}MiB (decoded)  apiReqs=${r.apiReqs}`);
    r.zipCalls.forEach((c,i)=>console.log(`   call ${i+1}: ${c.stack.slice(0,220)}`));
    await sleep(14000);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/zip-at-scale.json',JSON.stringify(out,null,2));
})();
