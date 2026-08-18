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
for(const n of ['Analyseur de sécurit','Compétences de l']){
  await p.locator('[data-testid="button-add-tab"]').click({timeout:12000}).catch(()=>{});
  await p.waitForTimeout(2200);
  await p.getByText(new RegExp(n,'i')).first().click({timeout:8000}).catch(()=>{});
  await p.waitForTimeout(4500);
}
await p.locator('[data-testid="button-tab-switcher"]').click({timeout:10000}).catch(()=>{});
await p.waitForTimeout(3500);
const mesure=async(etiquette)=>{
  const d=await p.evaluate(()=>[...document.querySelectorAll('.bolt-mobile-tab-switcher-card')].map(card=>{
    const r=card.getBoundingClientRect();
    const x=card.querySelector('.bolt-mobile-tab-switcher-close');
    const xr=x?x.getBoundingClientRect():null;
    return {id:(card.getAttribute('data-testid')||'').replace('tab-card-',''), h:Math.round(r.height),
      croix:x?{pos:getComputedStyle(x).position, dyHaut:Math.round(xr.top-r.top), dxDroite:Math.round(r.right-xr.right)}:null};
  }));
  const hs=[...new Set(d.map(x=>x.h))];
  console.log(`${etiquette} hauteurs=${JSON.stringify(hs)} ${hs.length===1?'✅ UNIFORMES':'❌ DIFFÉRENTES'}`);
  d.filter(x=>x.croix).slice(0,2).forEach(x=>console.log(`   ${x.id}: croix ${x.croix.pos} à ${x.croix.dyHaut}px du haut, ${x.croix.dxDroite}px de la droite`));
};
await mesure('AVANT :');
// injection des règles corrigées
await p.addStyleTag({content:`
.bolt-mobile-tab-switcher-card{height:102px;min-height:102px}
.bolt-mobile-tab-switcher-card .bolt-mobile-tab-switcher-close{position:absolute;top:4px;right:4px}
`});
await p.waitForTimeout(1200);
await mesure('APRÈS :');
const el=await p.$('.bolt-mobile-tab-switcher-grid'); if(el) await el.screenshot({path:'/tmp/grid-fixed.png'});
await b.close();
