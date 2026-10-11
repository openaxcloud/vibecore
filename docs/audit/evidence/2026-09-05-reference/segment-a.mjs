/**
 * DÉCOUPAGE DU SEGMENT A — les ~7 s avant que la requête du panneau ne parte.
 *
 * Instrument : jalons NAVIGATEUR disponibles sur WebKit (navigation, paint,
 * largest-contentful-paint, resource) + le seul jalon applicatif existant
 * (`ecode-theme-applied`). L'application ne pose ni `measure` ni autre `mark`.
 *
 * CE QUE CETTE MESURE NE DIRA PAS : quelle fonction bloque le fil. WebKit
 * n'implémente pas `longtask` — `observe()` l'accepte pourtant sans erreur puis
 * n'émet rien. Le découpage donne donc QUAND, jamais QUOI.
 */
import { webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const PANEL=process.env.PANEL||'overview', RUNS=Number(process.env.RUNS||3);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const out=[];
  for(let i=1;i<=RUNS;i++){
    const b=await webkit.launch();
    const ctx=await b.newContext({ignoreHTTPSErrors:true,...devices['iPhone 13']});
    await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    let departPanneau=null, premiereApi=null;
    const T0=Date.now();
    page.on('request',r=>{ const u=r.url();
      if(/\/api\//.test(u) && premiereApi===null) premiereApi=Date.now()-T0;
      if(u.includes(`/ide-panel/${PANEL}`) && departPanneau===null) departPanneau=Date.now()-T0; });
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${PANEL}`,{waitUntil:'domcontentloaded',timeout:90000});
    await sleep(20000);
    const j=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0]||{};
      const paints=Object.fromEntries(performance.getEntriesByType('paint').map(e=>[e.name,Math.round(e.startTime)]));
      const lcp=performance.getEntriesByType('largest-contentful-paint').map(e=>Math.round(e.startTime));
      const marks=performance.getEntriesByType('mark').map(e=>({n:e.name,t:Math.round(e.startTime)}));
      const res=performance.getEntriesByType('resource');
      const js=res.filter(r=>/\.js(\?|$)/.test(r.name)).map(r=>({n:r.name.split('/').pop().slice(0,34),d:Math.round(r.duration),e:Math.round(r.responseEnd)}));
      js.sort((a,b)=>b.d-a.d);
      return {
        docResponseEnd:Math.round(n.responseEnd||0), domInteractive:Math.round(n.domInteractive||0),
        domContentLoaded:Math.round(n.domContentLoadedEventEnd||0), loadEvent:Math.round(n.loadEventEnd||0),
        paints, lcp:lcp.length?Math.max(...lcp):null, marks,
        nbJs:js.length, jsTotalDur:js.reduce((s,x)=>s+x.d,0), jsPlusLents:js.slice(0,5),
        dernierJsFini:js.length?Math.max(...js.map(x=>x.e)):null,
      };
    });
    await b.close();
    out.push({run:i, premiereApi, departPanneau, ...j});
    console.log(`  --- run ${i} ---`);
    console.log(`    document reçu           ${j.docResponseEnd} ms`);
    console.log(`    domInteractive          ${j.domInteractive} ms`);
    console.log(`    première peinture       ${j.paints['first-paint']??'-'} ms   contenu peint ${j.paints['first-contentful-paint']??'-'} ms`);
    console.log(`    thème appliqué          ${(j.marks.find(m=>m.n==='ecode-theme-applied')||{}).t ?? '-'} ms`);
    console.log(`    domContentLoaded        ${j.domContentLoaded} ms`);
    console.log(`    première requête /api/  ${premiereApi} ms`);
    console.log(`    dernier JS téléchargé   ${j.dernierJsFini} ms   (${j.nbJs} fichiers, ${j.jsTotalDur} ms cumulés)`);
    console.log(`    load                    ${j.loadEvent} ms`);
    console.log(`    LCP                     ${j.lcp ?? '-'} ms`);
    console.log(`    >>> DÉPART DU PANNEAU   ${departPanneau} ms`);
    await sleep(12000);
  }
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/segmentA.json',JSON.stringify(out,null,2));
})();
