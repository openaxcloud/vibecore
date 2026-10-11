/** Passe complète espacée : page NEUVE par panneau, 12 s entre chargements,
 *  et on attend la STABILISATION DU CONTENU — jamais l'apparition de la coquille. */
import { chromium, webkit, devices } from '@playwright/test';
import { attendreContenu } from './detect-content.mjs';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANELS=(process.env.PANELS||'overview,integrations,packages,collaborators,env,secrets,logs,extensions,settings').split(',');
const ENGINE=process.env.ENGINE||'webkit';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const eng = ENGINE==='chromium'?chromium:webkit;
  const opts = ENGINE==='chromium'?{viewport:{width:1440,height:900}}:{...devices['iPhone 13']};
  const out=[];
  for(const p of PANELS){
    const b=await eng.launch();
    const ctx=await b.newContext({ignoreHTTPSErrors:true,...opts});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    const errs=[]; let api=0;
    page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,110));});
    page.on('pageerror',e=>errs.push('pageerror: '+String(e.message).slice(0,110)));
    page.on('request',r=>{if(/\/api\//.test(r.url()))api++;});
    let http=0;
    page.on('response',r=>{ if(r.url().includes(`/ide?panel=${p}`)) http=r.status(); });
    let rec;
    try{
      await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${p}`,{waitUntil:'domcontentloaded',timeout:90000});
      rec=await attendreContenu(page,p,{timeoutMs:50000});
    }catch(e){ rec={ok:false,raison:'nav:'+String(e.message).slice(0,50)}; }
    // débordement horizontal
    const deb = await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1).catch(()=>null);
    out.push({panneau:p, ...rec, api, erreurs:errs.length, debordement:deb, exemple:errs[0]||null});
    console.log(`  ${p.padEnd(15)} ${rec.ok?'OK  contenu@'+rec.tFranchi+'ms ('+rec.raison+')  len='+rec.len:'ÉCHEC '+rec.raison}  api=${api}  erreurs=${errs.length}  déb=${deb}`);
    await b.close();
    await sleep(12000);
  }
  const fs=await import('node:fs'); fs.writeFileSync(`/tmp/passe-${ENGINE}.json`,JSON.stringify(out,null,2));
  const ok=out.filter(x=>x.ok).length;
  console.log(`\n  ${ENGINE}: ${ok}/${out.length} panneaux ont rendu leur contenu ; ${out.filter(x=>x.erreurs>0).length} avec erreurs console ; ${out.filter(x=>x.debordement).length} avec débordement`);
})();
