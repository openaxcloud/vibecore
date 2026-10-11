/**
 * Same measurement as paint-perf.mjs, but on the ENGINE and VIEWPORT Avi uses.
 * Chromium-desktop numbers are a floor, not his experience -- this isolates the
 * engine by changing only that variable (same env, same code, same network).
 */
import { chromium, webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANELS=(process.env.PANELS||'overview,integrations').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iphone = devices['iPhone 15 Pro'];

async function measure(engine, name, ctxOpts, P){
  const b=await engine.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...ctxOpts});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage(); const T0=Date.now(); let apiReqs=0;
  page.on('request',r=>{ if(/\/api\//.test(r.url())) apiReqs++; });
  const sel=`[data-testid="ide-service-panel"][data-panel="${P}"]`;
  const rec={engine:name,panel:P};
  try{
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${P}`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector(sel,{timeout:60000});
    rec.t_shell=Date.now()-T0;
    let last=-1,stable=0,floor=null;
    for(let i=0;i<220;i++){
      const len=await page.evaluate(s=>{const e=document.querySelector(s);return e?(e.innerText||'').trim().length:0;},sel);
      if(floor===null) floor=len;
      if(len===last&&len>floor){ if(++stable>=3){ rec.t_content=Date.now()-T0; break; } } else stable=0;
      last=len; await sleep(100);
    }
    rec.floorLen=floor; rec.finalLen=last;
  }catch(e){ rec.err=String(e.message).slice(0,90); }
  rec.apiReqs=apiReqs;
  await b.close();
  return rec;
}

(async()=>{
  const out=[];
  for(const P of PANELS){
    // A: the number I already reported -- Chromium desktop 1440
    out.push(await measure(chromium,'chromium-desktop-1440',{viewport:{width:1440,height:900}},P));
    console.log(JSON.stringify(out[out.length-1])); await sleep(12000);
    // B: same everything, WebKit + iPhone 15 Pro -- only the engine/viewport change
    out.push(await measure(webkit,'webkit-iphone15pro',{...iphone},P));
    console.log(JSON.stringify(out[out.length-1])); await sleep(12000);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/paint-mobile.json',JSON.stringify(out,null,2));
  console.log('=== ENGINE DELTA ===');
  for(const P of PANELS){
    const c=out.find(o=>o.panel===P&&o.engine.startsWith('chromium'));
    const w=out.find(o=>o.panel===P&&o.engine.startsWith('webkit'));
    console.log(`${P}: chromium=${c?.t_content??c?.err}ms (${c?.apiReqs} api)  webkit-iphone=${w?.t_content??w?.err}ms (${w?.apiReqs} api)  ` +
      (c?.t_content&&w?.t_content?`ratio=${(w.t_content/c.t_content).toFixed(2)}x`:''));
  }
})();
