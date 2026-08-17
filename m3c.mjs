import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const JOBS=[['security','Exécuter une analyse complèt',70000],['skills','^Désactivé$',25000],['database','Créer une base de données',70000]];
const b=await chromium.launch();
for(const [panel,label,wait] of JOBS){
  const c=await b.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,locale:'fr-FR'});
  await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const p=await c.newPage();
  const net=[],con=[];
  p.on('console',m=>{if(m.type()==='error')con.push(m.text().replace(/\s+/g,' ').slice(0,130))});
  p.on('response',async x=>{if(x.status()>=400){let t='';try{t=(await x.text()).slice(0,180)}catch{};net.push(`${x.status()} ${x.request().method()} ${x.url().replace(/https:\/\/api[^/]+/,'API').replace(APP,'').slice(0,70)} :: ${t}`);}});
  await p.goto(`${APP}/projects/${PID}/ide?panel=${panel}`,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(18000);
  const sel=`[data-testid="ide-service-panel"][data-panel="${panel}"]`;
  const before=await p.evaluate(s=>document.querySelector(s)?.innerText.replace(/\s+/g,' ')??'',sel);
  let clicked;
  try{ await p.locator(sel).getByRole('button',{name:new RegExp(label)}).first().click({timeout:12000}); clicked=true; }
  catch(e){ clicked=String(e).split('\n')[0].slice(0,90); }
  await p.waitForTimeout(wait);
  const after=await p.evaluate(s=>document.querySelector(s)?.innerText.replace(/\s+/g,' ')??'',sel);
  console.log(`\n===== ${panel.toUpperCase()} clic "${label}" => ${clicked}`);
  console.log('  changé='+(after!==before)+' delta='+(after.length-before.length));
  console.log('  APRÈS: '+after.slice(0,420));
  if(net.length) console.log('  NET: '+JSON.stringify([...new Set(net)].slice(0,3)));
  if(con.length) console.log('  CON: '+JSON.stringify([...new Set(con)].slice(0,2)));
  await c.close();
}
await b.close();
