/** Exact census of requests fired by ONE cold IDE open. No matching heuristics:
 *  one row per 'request' event, method + full URL. */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const P=process.env.PANEL||'overview';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage(); const T0=Date.now(); const rows=[];
  page.on('request',r=>{ const u=r.url(); if(!/\/api\//.test(u)) return;
    rows.push({t:Date.now()-T0,m:r.method(),u:u.replace(APP,''),rt:r.resourceType()}); });
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${P}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector(`[data-testid="ide-service-panel"][data-panel="${P}"]`,{timeout:45000});
  await sleep(12000);
  const byUrl={}; rows.forEach(r=>{const k=`${r.m} ${r.u}`; (byUrl[k]=byUrl[k]||[]).push(r.t);});
  const dupes=Object.entries(byUrl).filter(([,t])=>t.length>1).sort((a,b)=>b[1].length-a[1].length);
  console.log(`total /api/ requests in one cold open of ?panel=${P}: ${rows.length}`);
  console.log(`distinct endpoints: ${Object.keys(byUrl).length}`);
  console.log(`--- endpoints requested MORE THAN ONCE (count x, at ms) ---`);
  dupes.slice(0,18).forEach(([k,t])=>console.log(`  ${t.length}x  ${k.slice(0,96)}   @${t.join(',')}`));
  console.log(`--- duplicate request events total: ${dupes.reduce((s,[,t])=>s+t.length-1,0)} of ${rows.length} ---`);
  const fs=await import('node:fs'); fs.writeFileSync(`/tmp/census-${P}.json`,JSON.stringify({rows,byUrl},null,2));
  await b.close();
})();
