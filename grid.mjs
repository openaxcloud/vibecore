import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const b=await chromium.launch();
const c=await b.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
await p.goto(`${APP}/projects/${PID}/ide`,{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(18000);
// ouvrir 2 panneaux pour avoir des tuiles fermables
for(const n of ['Analyseur de sécurit','Stockage de fichiers|Stockage d']){
  await p.locator('[data-testid="button-add-tab"]').click({timeout:12000}).catch(()=>{});
  await p.waitForTimeout(2200);
  await p.getByText(new RegExp(n,'i')).first().click({timeout:8000}).catch(()=>{});
  await p.waitForTimeout(5000);
}
await p.locator('[data-testid="button-tab-switcher"]').click({timeout:10000}).catch(()=>{});
await p.waitForTimeout(3500);
const d=await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('.bolt-mobile-tab-switcher-card')];
  return cards.map(card=>{
    const r=card.getBoundingClientRect();
    const close=card.querySelector('.bolt-mobile-tab-switcher-close');
    const cr=close?close.getBoundingClientRect():null;
    const cs=close?getComputedStyle(close):null;
    return {id:(card.getAttribute('data-testid')||'').replace('tab-card-',''),
      h:Math.round(r.height), w:Math.round(r.width),
      croix: close? {pos:cs.position, haut:Math.round(cr.top-r.top), droite:Math.round(r.right-cr.right),
                     taille:`${Math.round(cr.width)}×${Math.round(cr.height)}`} : null};
  });
});
console.log(JSON.stringify(d,null,1).slice(0,1100));
const el=await p.$('.bolt-mobile-tab-switcher-grid'); if(el) await el.screenshot({path:'/tmp/grid.png'});
await b.close();
