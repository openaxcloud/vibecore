import { chromium, webkit, devices } from '@playwright/test';
import { attendreContenu } from './detect-content.mjs';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const RUNS=Number(process.env.RUNS||3), PANEL=process.env.PANEL||'overview';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function une(engine,nom,opts){
  const b=await engine.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...opts});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage(); let api=0;
  page.on('request',r=>{ if(/\/api\//.test(r.url())) api++; });
  const t0=Date.now();
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${PANEL}`,{waitUntil:'domcontentloaded',timeout:90000});
  const r=await attendreContenu(page,PANEL,{timeoutMs:60000});
  await b.close();
  return {moteur:nom, ...r, apiReqs:api, total:Date.now()-t0};
}
(async()=>{
  const res=[];
  for(let i=0;i<RUNS;i++){
    for(const [e,n,o] of [[chromium,'chromium-1440',{viewport:{width:1440,height:900}}],
                          [webkit,'webkit-iphone',{...devices['iPhone 13']}]]){
      const r=await une(e,n,o); res.push(r);
      console.log(`  ${n.padEnd(15)} run${i+1}  contenu=${r.ok?r.tFranchi+'ms ('+r.raison+')':'ÉCHEC '+r.raison}  stable=${r.ok?r.ms+'ms':'-'}  len=${r.len??'-'}  api=${r.apiReqs}`);
      await sleep(12000);
    }
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/temps.json',JSON.stringify(res,null,2));
  for(const m of ['chromium-1440','webkit-iphone']){
    const v=res.filter(x=>x.moteur===m&&x.ok).map(x=>x.tFranchi).sort((a,b)=>a-b);
    const a=res.filter(x=>x.moteur===m).map(x=>x.apiReqs);
    if(v.length) console.log(`\n  ${m}: contenu présent à ${v.join(' / ')} ms — médiane ${v[Math.floor(v.length/2)]} ms ; requêtes /api/ ${Math.min(...a)}-${Math.max(...a)}`);
    else console.log(`\n  ${m}: aucun relevé valide`);
  }
})();
