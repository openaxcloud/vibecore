/** Valide le détecteur : témoin POSITIF (panneau plein) et NÉGATIF (panneau inexistant). */
import { chromium } from '@playwright/test';
import { attendreContenu } from './detect-content.mjs';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:90000});
  const pos = await attendreContenu(page,'overview',{timeoutMs:45000});
  console.log('TÉMOIN POSITIF (overview, panneau connu plein) :', JSON.stringify(pos));
  const neg = await attendreContenu(page,'panneau-inexistant',{timeoutMs:6000});
  console.log('TÉMOIN NÉGATIF (panneau inexistant)            :', JSON.stringify(neg));
  console.log(pos.ok && !neg.ok ? 'DÉTECTEUR VALIDE' : 'DÉTECTEUR INVALIDE — ne rien mesurer');
  await b.close();
})();
