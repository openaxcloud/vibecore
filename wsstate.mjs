import { chromium } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const IDS=['cmsy0y4hw00140nd8q0635ejc','cmsxd9jwy00540ngvme46r9ts'];
const b=await chromium.launch();
const c=await b.newContext({ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
await p.goto(`${APP}/dashboard`,{waitUntil:'domcontentloaded',timeout:70000});
for(const id of IDS){
  const d=await p.evaluate(async(pid)=>{
    const r=await fetch(`/api/projects/${pid}/ide-panel/overview`,{headers:{accept:'application/json'}});
    const j=await r.json().catch(()=>({}));
    const w=j.data?.workspace||j.workspace;
    return {status:r.status, ws:w?{id:w.id,status:w.status,mode:w.runtimeMode}:null};
  },id);
  console.log(id, JSON.stringify(d));
}
await b.close();
