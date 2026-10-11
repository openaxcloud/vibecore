/** Do the two scale-only defects reproduce? Repeat N cold opens and count.
 *  Also measure the actual ide-state payload against the 512 KiB entry cap. */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const RUNS=Number(process.env.RUNS||3), W=Number(process.env.WINDOW_MS||35000);
const CAP=512*1024, BUDGET=2*1024*1024;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const rows=[];
  for(let i=0;i<RUNS;i++){
    const b=await chromium.launch();
    const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage(); const logs=[]; const states=[];
    page.on('console',m=>{ if(['error','warning'].includes(m.type())) logs.push(m.text().slice(0,180)); });
    page.on('response',async r=>{ if(/\/ide-state(\?|$)/.test(r.url()) && r.request().method()==='GET'){
      let n=null; try{ n=(await r.body()).length; }catch{}
      states.push({bytes:n,status:r.status()}); }});
    const T0=Date.now();
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:60000});
    while(Date.now()-T0<W) await sleep(500);
    // what actually made it into localStorage
    const ls = await page.evaluate(() => {
      try {
        const out=[]; let total=0;
        for (let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i); if(!k) continue;
          const v=localStorage.getItem(k)||''; const size=(k.length+v.length)*2;
          total+=size;
          if (k.includes('projectIdeMemory')) out.push({k:k.slice(-42),bytes:size});
        }
        return {ideEntries:out,totalBytes:total,keys:localStorage.length};
      } catch(e){ return {error:String(e).slice(0,80)}; }
    }).catch(e=>({error:String(e).slice(0,80)}));
    await b.close();
    const tooLarge=logs.filter(l=>/skipped-too-large|write degraded/i.test(l)).length;
    const abort=logs.filter(l=>/AbortError|Failed to (load|restore) project IDE/i.test(l)).length;
    rows.push({run:i+1, tooLarge, abortOrLoadFail:abort,
      ideStateGETs:states.length, biggestStateBytes:Math.max(0,...states.map(s=>s.bytes||0)),
      localStorage:ls, sample:[...new Set(logs.filter(l=>/IDE|memory|Abort/i.test(l)))].slice(0,3)});
    console.log(JSON.stringify(rows[rows.length-1]));
    await sleep(12000);
  }
  const rep=(k)=>rows.filter(r=>r[k]>0).length;
  console.log(`\n=== REPRODUCIBILITY over ${RUNS} cold opens ===`);
  console.log(`  "write degraded / skipped-too-large" : ${rep('tooLarge')}/${RUNS}`);
  console.log(`  "AbortError / failed to load state"  : ${rep('abortOrLoadFail')}/${RUNS}`);
  console.log(`  entry cap = ${CAP} B, total budget = ${BUDGET} B`);
})();
