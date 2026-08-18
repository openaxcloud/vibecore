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
const lire=async(etiquette)=>{
  const d=await p.evaluate(()=>{
    const rangee=[...document.querySelectorAll('[data-testid^="tab-"]')].map(x=>x.getAttribute('data-testid').replace('tab-','')+':'+(x.textContent||'').trim().slice(0,14));
    return {rangee};
  });
  console.log(`${etiquette.padEnd(22)} rangée(${d.rangee.length}) = ${JSON.stringify(d.rangee)}`);
};
await lire('état initial');
for(const [besoin,nom] of [['Analyseur de sécurit','Sécurité'],['Compétences de l','Compétences'],['Ports redirigés','Ports']]){
  await p.locator('[data-testid="button-add-tab"]').click({timeout:12000}).catch(()=>{});
  await p.waitForTimeout(2500);
  const ok=await p.getByText(new RegExp(besoin,'i')).first().click({timeout:9000}).then(()=>true).catch(()=>false);
  await p.waitForTimeout(7000);
  await lire(`après « ${nom} » (${ok})`);
}
// contenu du sélecteur d'onglets
await p.locator('[data-testid="button-tab-switcher"]').click({timeout:10000}).catch(()=>{});
await p.waitForTimeout(3000);
const sw=await p.evaluate(()=>{
  const t=(document.body.innerText||'').replace(/\s+/g,' ');
  const i=t.indexOf('Rechercher dans les onglets');
  return i>=0? t.slice(Math.max(0,i-320), i+120) : t.slice(0,300);
});
console.log('SÉLECTEUR:', sw);
await b.close();
