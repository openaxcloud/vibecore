import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const b=await chromium.launch();
const c=await b.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
await p.goto(`${APP}/dashboard`,{waitUntil:'domcontentloaded',timeout:60000});
const out=await p.evaluate(async(pid)=>{
  const call=async(intent,extra={})=>{
    const f=new FormData(); f.append('intent',intent);
    for(const [k,v] of Object.entries(extra)) f.append(k,v);
    const r=await fetch(`/api/projects/${pid}/ide-panel/database`,{method:'POST',body:f});
    return {intent, status:r.status, body:(await r.text()).slice(0,300)};
  };
  return [await call('provision'), await call('create-backup')];
},PID);
out.forEach(o=>console.log(JSON.stringify(o)));
await b.close();
