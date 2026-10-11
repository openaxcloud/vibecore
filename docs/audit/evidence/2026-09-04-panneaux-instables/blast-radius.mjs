/**
 * How much of each panel is actually lost when the loader returns its error
 * envelope (HTTP 200 + status:'error' + data:null)?
 *
 * This is the mission's question -- "failed load vs successful load, side by
 * side" -- measured on the SAME page for the SAME panel, changing only the
 * envelope. Built-in witness: the interceptor must fire, and at least one panel
 * must change, or the harness proved nothing.
 */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANELS=(process.env.PANELS||'integrations,collaborators,packages,overview').split(',');
const SHOT=process.env.SHOT_DIR||'/tmp';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const browser=await chromium.launch();
  const out=[];
  for (const PANEL of PANELS){
    // FRESH CONTEXT AND PAGE PER PANEL -- console errors from a previous panel
    // must never land on this panel's counter.
    const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message).slice(0,120)));
    page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,120));});
    let mode='pass', hits={pass:0,fail:0};
    await page.route(`**/api/projects/*/ide-panel/${PANEL}*`, async route=>{
      if(mode==='fail'){hits.fail++; return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({panel:PANEL,project:{},status:'error',data:null,
          error:{code:'PANEL_BACKEND_UNAVAILABLE',message:'The panel backend is unavailable.',retryable:true}})});}
      hits.pass++; return route.continue();
    });
    const sel=`[data-testid="ide-service-panel"][data-panel="${PANEL}"]`;
    const text=async()=>page.evaluate(s=>{const e=document.querySelector(s);return e?(e.innerText||'').trim():null;},sel);

    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${PANEL}`,{waitUntil:'domcontentloaded',timeout:60000});
    let healthy=null;
    try{ await page.waitForSelector(sel,{timeout:45000}); await sleep(3500); healthy=await text(); }
    catch(e){ healthy=null; errs.push('SELECTOR TIMEOUT: '+String(e.message).slice(0,80)); }
    await page.screenshot({path:`${SHOT}/blast-${PANEL}-ok.png`});

    // now force the error envelope PERSISTENTLY and force a remount
    mode='fail';
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel',{detail:{panel:'logs'}})));
    await sleep(1500);
    await page.evaluate(p=>window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel',{detail:{panel:p}})),PANEL);
    await sleep(4000);
    const failed=await text();
    await page.screenshot({path:`${SHOT}/blast-${PANEL}-err.png`});

    const L=s=>s==null?null:s.length;
    out.push({panel:PANEL,hits,healthy:L(healthy),failed:L(failed),
      lossPct: healthy&&failed!=null?Math.round((1-failed.length/healthy.length)*100):null,
      failedHead:(failed||'').slice(0,160).replace(/\n/g,' | '), errs:errs.slice(0,3)});
    console.log(JSON.stringify(out[out.length-1]));
    await ctx.close();
    await sleep(12000);   // mission rule: >=12s between panel loads
  }
  console.log('=== WITNESS CHECK ===');
  console.log('interceptor fired on every panel:', out.every(o=>o.hits.fail>0));
  console.log('at least one panel changed:', out.some(o=>o.lossPct!==null&&o.lossPct!==0));
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/blast-radius.json',JSON.stringify(out,null,2));
  await browser.close();
})();
