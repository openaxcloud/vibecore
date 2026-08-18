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
await p.locator('[data-testid="button-add-tab"]').click({timeout:12000}).catch(()=>{});
await p.waitForTimeout(2200);
await p.getByText(/Analyseur de sécurit/i).first().click({timeout:8000}).catch(()=>{});
await p.waitForTimeout(5000);
await p.locator('[data-testid="button-tab-switcher"]').click({timeout:10000}).catch(()=>{});
await p.waitForTimeout(3500);
const d=await p.evaluate(()=>{
  const btn=document.querySelector('[data-testid^="button-close-tab-"]');
  if(!btn) return {trouve:false, cartes:document.querySelectorAll('.bolt-mobile-tab-switcher-card').length};
  const cs=getComputedStyle(btn);
  // quelles feuilles définissent une règle qui matche ce bouton ?
  const matches=[];
  for(const ss of document.styleSheets){
    try{ for(const r of ss.cssRules){
      if(r.selectorText && btn.matches(r.selectorText) && /position/.test(r.style.cssText||'')){
        matches.push({sel:r.selectorText.slice(0,70), pos:r.style.position, imp:r.style.getPropertyPriority("position")});
      } } }catch(e){}
  }
  return {trouve:true, classe:btn.className, position:cs.position, top:cs.top, right:cs.right,
    display:cs.display, regles:matches};
});
console.log(JSON.stringify(d,null,1).slice(0,900));
await b.close();
