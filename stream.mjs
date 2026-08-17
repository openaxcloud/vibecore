import { chromium } from '@playwright/test';
import fs from 'node:fs';
const APP='https://app.34.163.208.161.sslip.io', API='https://api.34.163.208.161.sslip.io';
const TOKEN=fs.readFileSync('/tmp/qa8.session','utf8').trim();
const PID=fs.readFileSync('/tmp/qa.project','utf8').trim();
const b=await chromium.launch();
const c=await b.newContext({ignoreHTTPSErrors:true,locale:'fr-FR'});
await c.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await c.newPage();
await p.goto(`${APP}/projects/${PID}/ide`,{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(14000);
const out=await p.evaluate(async({api})=>{
  const tk=await (await fetch('/api/runtime-token')).json();
  const ws='ws-7e8d7bd2a9e13f44';
  const sandbox='.vibecore-deploy-streamprobe';
  const script=['set -e',`rm -rf "${sandbox}"`,`mkdir -p "${sandbox}"`,
    `find "." -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git ! -name "${sandbox}" -exec cp -a {} "${sandbox}/" ';'`].join('\n');
  const run=(payload)=>new Promise(res=>{
    const s=new WebSocket(`${api.replace('https','wss')}/api/runtime/workspaces/${ws}/commands/stream?token=${tk.token}`);
    const lines=[]; let done=false;
    const finish=(r)=>{if(!done){done=true;try{s.close()}catch{};res(r)}};
    setTimeout(()=>finish({timeout:true,lines}),45000);
    s.onopen=()=>s.send(JSON.stringify({type:'hello',payload}));
    s.onmessage=e=>{ const m=JSON.parse(e.data);
      if(m.type==='stdout'||m.type==='stderr') lines.push(m.type+':'+String(m.data).slice(0,120));
      if(m.type==='exit') finish({exitCode:m.exitCode,lines}); };
    s.onerror=()=>finish({error:'ws',lines});
  });
  const prep=await run({command:'sh',args:['-c',script],cwd:'.'});
  const ls=await run({command:'sh',args:['-c',`ls -a "${sandbox}" 2>&1; echo "--COUNT--"; ls "${sandbox}" 2>/dev/null | wc -l`],cwd:'.'});
  const clean=await run({command:'sh',args:['-c',`rm -rf "${sandbox}"`],cwd:'.'});
  return {prep, ls, cleanExit:clean.exitCode};
},{api:API});
console.log(JSON.stringify(out,null,1).slice(0,1500));
await b.close();
