/** Why does loadRuntimeFiles fail on a cold open? Capture every request with
 *  its status, plus console/page errors, for the first N seconds. */
import { chromium, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const W=Number(process.env.WINDOW_MS||40000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  const T0=Date.now(); const nonOk=[]; const all=[]; const logs=[];
  page.on('response',r=>{ const u=r.url().replace(APP,''); all.push({t:Date.now()-T0,s:r.status(),u});
    if(r.status()>=400) nonOk.push({t:Date.now()-T0,s:r.status(),u:u.slice(0,110)}); });
  page.on('console',m=>{ if(['error','warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0,170)}`); });
  page.on('pageerror',e=>logs.push('pageerror: '+String(e.message).slice(0,170)));
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:60000});
  while(Date.now()-T0<W) await sleep(500);
  await b.close();
  console.log(`total responses: ${all.length}`);
  console.log('--- NON-2xx/3xx responses ---');
  (nonOk.length?nonOk:[{t:'-',s:'-',u:'(none)'}]).slice(0,20).forEach(x=>console.log(`  ${x.t}ms ${x.s} ${x.u}`));
  console.log('--- workspace / runtime / files endpoints seen (WITNESS: must be non-empty) ---');
  const rt=all.filter(x=>/workspace|runtime|files/i.test(x.u));
  (rt.length?rt:[{t:'-',s:'-',u:'(none — filter may be wrong)'}]).slice(0,22).forEach(x=>console.log(`  ${x.t}ms ${x.s} ${String(x.u).slice(0,105)}`));
  console.log('--- console errors/warnings ---');
  [...new Set(logs)].slice(0,14).forEach(l=>console.log('  '+l));
})();
