import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const b=await chromium.launch();
for(const panel of ['database','security','skills']){
  const c=await b.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,locale:'fr-FR'});
  await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const p=await c.newPage();
  const net=[],con=[];
  p.on('console',m=>{if(m.type()==='error')con.push(m.text().replace(/\s+/g,' ').slice(0,130))});
  p.on('pageerror',e=>con.push('PAGEERROR '+String(e).replace(/\s+/g,' ').slice(0,130)));
  p.on('response',async x=>{if(x.status()>=400){let t='';try{t=(await x.text()).slice(0,170)}catch{};net.push(`${x.status()} ${x.request().method()} ${x.url().replace(/https:\/\/api[^/]+/,'API').replace(APP,'').slice(0,72)} :: ${t}`);}});
  await p.goto(`${APP}/projects/${PID}/ide?panel=${panel}`,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(20000);
  const s=await p.evaluate((panel)=>{
    const el=document.querySelector(`[data-testid="ide-service-panel"][data-panel="${panel}"]`);
    const scope=el||document.body;
    const t=(scope.innerText||'').replace(/\s+/g,' ');
    return {mounted:!!el, unavailable:/Unavailable/.test(t), len:t.trim().length, text:t.slice(0,420),
      ov:document.documentElement.scrollWidth>innerWidth+1?`${document.documentElement.scrollWidth}>${innerWidth}`:null,
      btn:[...scope.querySelectorAll('button')].map(x=>({l:(x.textContent||x.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,28),d:x.disabled})).filter(x=>x.l).slice(0,14)};
  },panel);
  console.log(`\n===== ${panel.toUpperCase()} (390) mounted=${s.mounted} unavailable=${s.unavailable} overflow=${s.ov} len=${s.len}`);
  console.log('TEXT: '+s.text);
  console.log('BTN: '+JSON.stringify(s.btn));
  if(con.length) console.log('CON: '+JSON.stringify([...new Set(con)].slice(0,4)));
  if(net.length) console.log('NET: '+JSON.stringify([...new Set(net)].slice(0,4)));
  await c.close();
}
await b.close();
