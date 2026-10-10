import { chromium } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync, appendFileSync } from 'node:fs';
const API='http://127.0.0.1:3011', APP='http://127.0.0.1:5183', OUT='/private/tmp/claude-501/-Users-hb-dev-vibecore-base-tc/987e34e2-2756-4a63-bf5d-9718de24d014/scratchpad/retour';
const compte=JSON.parse(readFileSync(OUT+'/compte.json','utf8')); const pid=readFileSync(OUT+'/projet.txt','utf8').trim();
const tok=(await (await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:compte.email,password:'Password123!'})})).json()).token;
const journal=(l)=>{console.log(l); appendFileSync(OUT+'/dix-retours.log', l+'\n');};
const serveur=async()=>{ const z=await JSZip.loadAsync(Buffer.from((await (await fetch(`${API}/projects/${pid}/export/zip`,{headers:{authorization:'Bearer '+tok}})).json()).archive.base64,'base64')); const f=Object.entries(z.files).find(([n])=>/(^|\/)src\/App\.tsx$/.test(n)); return f? await f[1].async('string') : null; };
const b=await chromium.launch();
async function ouvrir(){ const c=await b.newContext({viewport:{width:1440,height:900}}); await c.addCookies([{name:'vc_session',value:tok,url:APP,httpOnly:true,sameSite:'Lax'}]); const p=await c.newPage(); await p.goto(`${APP}/projects/${pid}/ide?lang=fr`,{timeout:180000}); await p.getByText('App.tsx',{exact:true}).first().waitFor({timeout:120000}); await p.waitForTimeout(4000); await p.getByText('App.tsx',{exact:true}).first().click(); await p.waitForTimeout(3000); return {c,p}; }
const lignes=async(p)=>(await p.locator('.monaco-editor .view-line').allInnerTexts()).map(x=>x.replace(/ /g,' '));
let precedent=null; let pertes=0;
for (let i=1;i<=10;i++){
  const {c,p}=await ouvrir();
  const vues=await lignes(p); const disque=await serveur();
  const ok = precedent===null || (vues.some(l=>l.includes(precedent)) && disque?.includes(precedent));
  if(!ok) pertes++;
  journal(`${new Date().toISOString().slice(11,19)} réouverture ${i} : marque précédente ${precedent===null?'(aucune)':precedent} → écran ${precedent===null?'-':vues.some(l=>l.includes(precedent))} | serveur ${precedent===null?'-':Boolean(disque?.includes(precedent))} | 1re ligne écran « ${(vues[0]??'').slice(0,60)} »`);
  const marque=`retour-${i}-${Date.now().toString(36)}`;
  await p.locator('.monaco-editor .view-line').first().click(); await p.keyboard.press('Home');
  await p.keyboard.type(`// ${marque}`); await p.keyboard.press('Enter');
  await p.getByRole('button',{name:/^Enregistrer$/}).first().click(); await p.waitForTimeout(6000);
  const apres=await serveur(); journal(`        édition ${i} : « ${marque} » enregistrée → sur le serveur ${Boolean(apres?.includes(marque))}`);
  precedent=marque; await c.close();
}
const {c,p}=await ouvrir(); const vues=await lignes(p); const disque=await serveur();
const ok=vues.some(l=>l.includes(precedent)) && disque?.includes(precedent); if(!ok) pertes++;
journal(`réouverture finale : marque ${precedent} → écran ${vues.some(l=>l.includes(precedent))} | serveur ${Boolean(disque?.includes(precedent))}`);
journal(`VERDICT : ${pertes===0?'AUCUNE PERTE sur 10 retours':pertes+' PERTE(S) sur 10 retours'}`);
await c.close(); await b.close();
