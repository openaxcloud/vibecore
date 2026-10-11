/** Décomposition CORRIGÉE. `timing.startTime` est un temps ABSOLU (epoch ms) ;
 *  requestStart/responseStart/responseEnd sont des offsets relatifs à lui.
 *  On enregistre T0 en epoch pour tout ramener à l'origine de la navigation. */
import { webkit, devices } from '@playwright/test';
import { attendreContenu } from './detect-content.mjs';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANEL=process.env.PANEL||'overview', RUNS=Number(process.env.RUNS||3);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const all=[];
  for(let i=1;i<=RUNS;i++){
    const b=await webkit.launch();
    const ctx=await b.newContext({ignoreHTTPSErrors:true,...devices['iPhone 13']});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    const reps=[]; const apis=[];
    page.on('response',async r=>{
      const u=r.url();
      if(/\/api\//.test(u)){ let t=null; try{t=r.request().timing();}catch{}
        apis.push({u:u.replace(APP,'').split('?')[0], st:t?t.startTime:null, rs:t?t.responseStart:null, re:t?t.responseEnd:null}); }
      if(!u.includes(`/ide-panel/${PANEL}`)) return;
      let t=null; try{t=r.request().timing();}catch{}
      let n=null; try{n=(await r.body()).length;}catch{}
      reps.push({timing:t, bytes:n, status:r.status()});
    });
    const T0=Date.now();
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${PANEL}`,{waitUntil:'domcontentloaded',timeout:90000});
    const c=await attendreContenu(page,PANEL,{timeoutMs:60000});
    await b.close();
    if(!c.ok || !reps.length){ console.log(`  run${i}: incomplet (contenu=${c.ok}, réponses=${reps.length})`); all.push({i,c,reps}); await sleep(12000); continue; }
    console.log(`  --- run ${i} : contenu présent à ${c.tFranchi} ms (${c.raison}) ---`);
    reps.forEach((r,k)=>{
      const t=r.timing||{};
      const A=Math.round(t.startTime-T0);                 // avant le départ
      const serveur=Math.round(t.responseStart-t.requestStart);
      const dl=Math.round(t.responseEnd-t.responseStart);
      const fin=Math.round(A+t.responseEnd);
      console.log(`    réponse ${k+1}: départ à ${A} ms | serveur ${serveur} ms | téléchargement ${dl} ms | finie à ${fin} ms | ${r.bytes} o | ${r.status}`);
    });
    // quelle réponse a produit le contenu ? la dernière finie AVANT tFranchi
    const finies=reps.map(r=>({fin:Math.round((r.timing.startTime-T0)+r.timing.responseEnd), r})).filter(x=>x.fin<=c.tFranchi).sort((a,b)=>b.fin-a.fin);
    if(finies.length){ const g=finies[0].r; const t=g.timing;
      const A=Math.round(t.startTime-T0), S=Math.round(t.responseStart-t.requestStart), C=Math.round(t.responseEnd-t.responseStart);
      const D=c.tFranchi-(A+Math.round(t.responseEnd));
      console.log(`    >>> contenu issu de la réponse finie à ${A+Math.round(t.responseEnd)} ms`);
      console.log(`    >>> A(avant départ)=${A}  B(serveur)=${S}  C(téléch.)=${C}  D(rendu)=${D}  TOTAL=${A+S+C+D} vs mesuré ${c.tFranchi}`);
      console.log(`    >>> TÉMOIN: tous segments ≥0 ? ${[A,S,C,D].every(x=>x>=0)}   écart |somme-total| = ${Math.abs((A+S+C+D)-c.tFranchi)} ms`);
      const avant=apis.filter(x=>x.st && (x.st-T0)<A).length;
      console.log(`    >>> requêtes /api/ parties AVANT celle-ci : ${avant}`);
    }
    all.push({i,c,reps});
    await sleep(12000);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/decompo2.json',JSON.stringify(all,null,2));
})();
