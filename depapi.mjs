import { chromium } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const b=await chromium.launch();
const c=await b.newContext({ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
await p.goto(`${APP}/dashboard`,{waitUntil:'domcontentloaded',timeout:60000});
const j=await p.evaluate(async(pid)=>{
  const r=await fetch(`/api/projects/${pid}/ide-panel/deployments`,{headers:{accept:'application/json'}});
  return JSON.parse(await r.text());
},PID);
const ds=j.data?.deployments??[];
console.log('DEPLOYMENTS='+ds.length);
ds.slice(0,3).forEach(d=>{
  console.log(`\n- ${d.id} ${d.status} ${d.createdAt}`);
  const nonInfo=(d.logs||[]).filter(l=>l.level!=='info');
  console.log('  erreurs='+nonInfo.length);
  nonInfo.slice(-4).forEach(l=>console.log('   ['+l.level+'] '+String(l.message).replace(/\s+/g,' ').slice(0,200)));
  const last=(d.logs||[]).slice(-2);
  last.forEach(l=>console.log('   dernier ['+l.level+'] '+String(l.message).replace(/\s+/g,' ').slice(0,180)));
});
await b.close();
