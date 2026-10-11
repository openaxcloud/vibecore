import { chromium } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
const API='http://127.0.0.1:3011', APP='http://127.0.0.1:5183', OUT='/private/tmp/claude-501/-Users-hb-dev-vibecore-base-tc/987e34e2-2756-4a63-bf5d-9718de24d014/scratchpad/retour';
const compte=JSON.parse(readFileSync(OUT+'/compte.json','utf8')); const pid=readFileSync(OUT+'/projet.txt','utf8').trim();
const tok=(await (await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:compte.email,password:'Password123!'})})).json()).token;
const H={headers:{authorization:'Bearer '+tok}};
const t0=Date.now(); const ts=()=>`${((Date.now()-t0)/1000).toFixed(0).padStart(3)}s`;
const serveur=async(m)=>{ const z=await JSZip.loadAsync(Buffer.from((await (await fetch(`${API}/projects/${pid}/export/zip`,H)).json()).archive.base64,'base64')); const f=Object.entries(z.files).find(([n])=>/src\/App\.tsx$/.test(n)); const c=await f[1].async('string'); return `${c.length} car., marque ${c.includes(m)}`; };
const b=await chromium.launch(); const ecrits=[];
const ouvrir=async()=>{ const c=await b.newContext({viewport:{width:1440,height:900}}); await c.addCookies([{name:'vc_session',value:tok,url:APP,httpOnly:true,sameSite:'Lax'}]); const p=await c.newPage();
  p.on('request', q=>{ const u=q.url(); if(['PUT','POST','PATCH'].includes(q.method()) && /files|ide-state|runtime|write/.test(u)) ecrits.push(`${ts()} ${q.method()} ${u.replace(APP,'').replace(API,'').slice(0,110)}`); });
  await p.goto(`${APP}/projects/${pid}/ide?lang=fr`,{timeout:180000}); await p.getByText('App.tsx',{exact:true}).first().waitFor({timeout:120000}); await p.waitForTimeout(4000); await p.getByText('App.tsx',{exact:true}).first().click(); await p.waitForTimeout(3000); return {c,p}; };
let {c,p}=await ouvrir();
const m=`quand-${Date.now().toString(36)}`;
await p.locator('.monaco-editor .view-line').first().click(); await p.keyboard.press('Home'); await p.keyboard.type(`// ${m}`); await p.keyboard.press('Enter');
await p.getByRole('button',{name:/^Enregistrer$/}).first().click();
for (let i=0;i<8;i++){ await p.waitForTimeout(3000); console.log(`${ts()} onglet OUVERT  : serveur ${await serveur(m)}`); }
await c.close(); console.log(`${ts()} onglet fermé`);
for (let i=0;i<4;i++){ await new Promise(r=>setTimeout(r,3000)); console.log(`${ts()} onglet FERMÉ  : serveur ${await serveur(m)}`); }
({c,p}=await ouvrir()); console.log(`${ts()} réouvert`);
for (let i=0;i<5;i++){ console.log(`${ts()} RÉOUVERT     : serveur ${await serveur(m)}`); await p.waitForTimeout(3000); }
console.log('--- écritures envoyées par le navigateur ---'); for (const e of ecrits) console.log(e);
await c.close(); await b.close();
