import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io', API='https://api.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1440,height:900},ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
await p.goto(`${APP}/projects/${PID}/ide?panel=deployments`,{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(14000);
// démarrer la surveillance du répertoire AVANT de déclencher le déploiement
const watcher=p.evaluate(async({api})=>{
  const tk=await (await fetch('/api/runtime-token')).json();
  const ws='ws-7e8d7bd2a9e13f44';
  const snaps=[];
  for(let i=0;i<40;i++){
    const r=await fetch(`${api}/api/runtime/workspaces/${ws}/commands`,{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tk.token},
      body:JSON.stringify({command:'sh',args:['-c','for d in .vibecore-deploy-*; do [ -d "$d" ] && echo "$d => $(ls -a "$d" | tr "\\n" " ")"; done'],cwd:'.'})});
    const j=await r.json().catch(()=>({}));
    const o=(j.output||'').trim();
    if(o) snaps.push(`t=${i*2}s ${o.slice(0,220)}`);
    await new Promise(r=>setTimeout(r,2000));
  }
  return snaps;
},{api:API});
await p.getByRole('button',{name:/^Gérer$/}).first().click();
await p.waitForTimeout(3000);
await p.getByRole('button',{name:/Déployer le projet/i}).first().click();
const snaps=await watcher;
console.log('SNAPSHOTS ('+snaps.length+'):');
snaps.forEach(s=>console.log('  '+s));
await b.close();
