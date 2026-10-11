/** Same env, same project, same panel -- only the ENGINE changes.
 *  Diffs the URL multiset so the missing requests are named, not guessed. */
import { chromium, webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const P=process.env.PANEL||'overview';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function census(engine, name, ctxOpts){
  const b=await engine.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...ctxOpts});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage(); const rows=[];
  page.on('request',r=>{ const u=r.url(); if(/\/api\//.test(u)) rows.push(`${r.method()} ${u.replace(APP,'').split('?')[0]}`); });
  try{
    await page.goto(`${APP}/projects/${PROJECT}/ide?panel=${P}`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector(`[data-testid="ide-service-panel"][data-panel="${P}"]`,{timeout:60000});
  }catch(e){ rows.push('ERR '+String(e.message).slice(0,60)); }
  await sleep(14000);
  await b.close();
  const c={}; rows.forEach(u=>c[u]=(c[u]||0)+1);
  return {name,total:rows.length,counts:c};
}
(async()=>{
  const a=await census(chromium,'chromium-1440',{viewport:{width:1440,height:900}});
  console.log(`${a.name}: ${a.total} requests`);
  await sleep(14000);
  const b=await census(webkit,'webkit-iphone',{...devices['iPhone 15 Pro']});
  console.log(`${b.name}: ${b.total} requests`);
  const keys=[...new Set([...Object.keys(a.counts),...Object.keys(b.counts)])].sort();
  console.log('\n--- per-endpoint, chromium vs webkit (only where they DIFFER) ---');
  let dc=0,dw=0;
  for(const k of keys){
    const x=a.counts[k]||0, y=b.counts[k]||0;
    if(x!==y){ console.log(`  chromium=${x}  webkit=${y}   ${k.slice(0,88)}`); dc+=x; dw+=y; }
  }
  console.log(`\n  differing endpoints account for: chromium ${dc}, webkit ${dw}  (delta ${dc-dw})`);
  const fs=await import('node:fs'); fs.writeFileSync('/tmp/census-engines.json',JSON.stringify({a,b},null,2));
})();
