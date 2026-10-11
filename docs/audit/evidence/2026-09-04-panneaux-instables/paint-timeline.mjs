/**
 * Is the reported "94-97% content loss between two identical loads" a product
 * defect, or an artifact of READING THE PANEL BEFORE IT PAINTED?
 *
 * The earlier survey recorded a ~239-268 character floor for packages, overview
 * and collaborators alike -- the same floor for panels with very different
 * content. A shared floor across unrelated panels points at a shared state
 * (header + skeleton), not at three separate content failures.
 *
 * Sample the SAME panel at increasing delays after the shell appears. If the
 * early samples land on that floor and the late ones do not, the "loss" is a
 * timing artifact of the instrument.
 */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANELS=(process.env.PANELS||'integrations,collaborators,packages,overview').split(',');
const MARKS=[300,800,1500,3000,6000,10000];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const browser=await chromium.launch(); const out=[];
  for(const PANEL of PANELS){
    const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    const sel=`[data-testid="ide-service-panel"][data-panel="${PANEL}"]`;
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${PANEL}`,{waitUntil:'domcontentloaded',timeout:60000});
    const row={panel:PANEL,samples:{}};
    try{
      await page.waitForSelector(sel,{timeout:45000});
      let prev=0;
      for(const m of MARKS){
        await sleep(m-prev); prev=m;
        row.samples[m]=await page.evaluate(s=>{const e=document.querySelector(s);return e?(e.innerText||'').trim().length:null;},sel);
      }
      row.firstText=await page.evaluate(s=>{const e=document.querySelector(s);return e?(e.innerText||'').trim().slice(0,120).replace(/\n/g,' | '):null;},sel);
    }catch(e){ row.error=String(e.message).slice(0,100); }
    out.push(row); console.log(JSON.stringify(row));
    await ctx.close(); await sleep(12000);
  }
  console.log('=== VERDICT ===');
  for(const r of out){
    const v=Object.values(r.samples||{}).filter(x=>x!=null);
    if(!v.length){console.log(`${r.panel}: no samples (${r.error})`);continue;}
    const first=v[0], last=v[v.length-1];
    console.log(`${r.panel}: first=${first} last=${last} growth=${last&&first?Math.round((last/first)*10)/10+'x':'-'} apparent"loss"IfReadEarly=${last?Math.round((1-first/last)*100):0}%`);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/paint-timeline.json',JSON.stringify(out,null,2));
  await browser.close();
})();
