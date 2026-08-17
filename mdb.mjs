import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const SEL='[data-testid="ide-service-panel"][data-panel="database"]';
const b=await chromium.launch();
const c=await b.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
const net=[],con=[];
p.on('console',m=>{if(m.type()==='error')con.push(m.text().replace(/\s+/g,' ').slice(0,180))});
p.on('pageerror',e=>con.push('PAGEERROR '+String(e).replace(/\s+/g,' ').slice(0,220)));
p.on('response',async x=>{const u=x.url(); if(x.status()>=400||/database/i.test(u)&&x.request().method()==='POST'){let t='';try{t=(await x.text()).slice(0,260)}catch{};net.push(`${x.status()} ${x.request().method()} ${u.replace(/https:\/\/api[^/]+/,'API').replace(APP,'').slice(0,75)} :: ${t}`);}});
await p.goto(`${APP}/projects/${PID}/ide?panel=database`,{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(18000);
await p.locator(SEL).getByRole('button',{name:/Créer une base de données/}).first().click({timeout:12000});
for(const w of [8,20,40]){
  await p.waitForTimeout(w===8?8000:(w===20?12000:20000));
  const s=await p.evaluate(sel=>{
    const el=document.querySelector(sel);
    return {present:!!el, len:el?el.innerText.replace(/\s+/g,' ').trim().length:-1,
      txt:el?el.innerText.replace(/\s+/g,' ').slice(0,220):null,
      bodyTail:(document.body.innerText||'').replace(/\s+/g,' ').slice(-200)};
  },SEL);
  console.log(`@${w}s panel=${s.present} len=${s.len} :: ${s.txt}`);
  if(!s.present) console.log('   BODY TAIL: '+s.bodyTail);
}
console.log('NET='+JSON.stringify([...new Set(net)].slice(0,6),null,1));
console.log('CON='+JSON.stringify([...new Set(con)].slice(0,5),null,1));
await b.close();
