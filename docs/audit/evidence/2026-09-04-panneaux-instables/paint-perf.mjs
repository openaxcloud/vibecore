/**
 * WHERE do the 3 s (integrations) / 6 s (overview) actually go?
 *
 * Decomposes one cold panel open into:
 *   t_nav        navigation start
 *   t_shell      [data-testid=ide-service-panel] appears  (NOT a load signal -- see BUG-PANEL-LOSS-001)
 *   t_xhr_start  the panel's own /ide-panel/:panel request leaves
 *   t_xhr_end    ... and comes back
 *   t_content    the panel's text stops being the loading state (STABILITY, not appearance)
 * plus every request the page made, so a serial chain is visible as a staircase.
 */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANELS=(process.env.PANELS||'overview,integrations,packages,collaborators').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const b=await chromium.launch(); const out=[];
  for(const P of PANELS){
    const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    const T0=Date.now(); const reqs=[];
    page.on('request',r=>{ if(/\/api\/|\/ide-panel\//.test(r.url())) reqs.push({url:r.url().replace(APP,''),start:Date.now()-T0,end:null}); });
    page.on('response',async r=>{ const u=r.url().replace(APP,''); const e=reqs.filter(x=>x.url===u&&x.end===null).pop(); if(e){e.end=Date.now()-T0; e.status=r.status();} });

    const sel=`[data-testid="ide-service-panel"][data-panel="${P}"]`;
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${P}`,{waitUntil:'domcontentloaded',timeout:60000});
    const rec={panel:P};
    try{
      await page.waitForSelector(sel,{timeout:45000});
      rec.t_shell=Date.now()-T0;
      // CONTENT = text length stable across 3 consecutive polls AND clearly past the loading floor
      let last=-1, stable=0, t_content=null, floor=null;
      for(let i=0;i<160;i++){
        const len=await page.evaluate(s=>{const e=document.querySelector(s);return e?(e.innerText||'').trim().length:0;},sel);
        if(floor===null) floor=len;
        if(len===last && len>floor){ stable++; if(stable>=3){ t_content=Date.now()-T0; break; } } else stable=0;
        last=len; await sleep(100);
      }
      rec.t_content=t_content; rec.floorLen=floor; rec.finalLen=last;
    }catch(e){ rec.err=String(e.message).slice(0,90); }
    const own=reqs.filter(r=>r.url.includes(`/ide-panel/${P}`));
    rec.ownRequests=own.map(r=>({start:r.start,end:r.end,ms:r.end!=null?r.end-r.start:null,status:r.status}));
    rec.t_xhr_start=own.length?own[0].start:null;
    rec.t_xhr_end=own.length?own[0].end:null;
    // the slowest API calls on the page, to expose a serial chain
    rec.slowest=reqs.filter(r=>r.end!=null).map(r=>({u:r.url.split('?')[0].slice(-58),start:r.start,ms:r.end-r.start}))
                    .sort((a,b)=>b.ms-a.ms).slice(0,8);
    rec.apiRequestCount=reqs.length;
    out.push(rec); console.log(JSON.stringify(rec,null,1));
    await ctx.close(); await sleep(12000);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/paint-perf.json',JSON.stringify(out,null,2));
  console.log('=== BUDGET ===');
  for(const r of out){
    if(r.t_content==null){console.log(`${r.panel}: content never stabilised (${r.err||'timeout'})`);continue;}
    console.log(`${r.panel}: shell=${r.t_shell}ms xhr=${r.t_xhr_start}->${r.t_xhr_end}ms content=${r.t_content}ms ` +
      `| before-request=${r.t_xhr_start} request=${r.t_xhr_end!=null?r.t_xhr_end-r.t_xhr_start:'?'} after-response=${r.t_xhr_end!=null?r.t_content-r.t_xhr_end:'?'}`);
  }
})();
