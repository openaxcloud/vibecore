/** With a HEALTHY runtime tree, who still downloads the archive? */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const W=Number(process.env.WINDOW_MS||45000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  await page.addInitScript(()=>{ window.__z=[]; const o=window.fetch;
    window.fetch=function(...a){ const u=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||'';
      if(String(u).includes('/export/zip')) window.__z.push({t:Date.now(),stack:(new Error().stack||'').split('\n').slice(1,5).join(' <- ')});
      return o.apply(this,a); }; });
  const T0=Date.now();
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:60000});
  while(Date.now()-T0<W) await sleep(500);
  const z=await page.evaluate(()=>window.__z||[]).catch(()=>[]);
  await b.close();
  console.log(`archive fetches: ${z.length}`);
  z.forEach((c,i)=>console.log(`  ${i+1} @${c.t-T0}ms  ${c.stack.replace(/https:\/\/app\.e-code\.ai\/assets\//g,'').slice(0,230)}`));
})();
