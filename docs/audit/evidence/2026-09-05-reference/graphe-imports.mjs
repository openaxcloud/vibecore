/** Fermeture transitive des imports STATIQUES depuis le chunk racine,
 *  sur l'artefact SERVI en production. Aucun navigateur, aucun moteur :
 *  la mesure porte sur le bundle livré, identique pour tout le monde. */
const APP=process.env.APP_BASE||'https://app.e-code.ai';
const CAP=Number(process.env.CAP||400);
const cache=new Map();
async function chunk(p){
  if(cache.has(p)) return cache.get(p);
  const r=await fetch(`${APP}${p}`);
  const t=r.ok? await r.text() : '';
  cache.set(p,t); return t;
}
const reStat=/import\s*(?:[^"';]*?from\s*)?["'](\.\/[^"']+\.js)["']/g;
const reDyn=/import\(\s*["'](\.\/[^"']+\.js)["']/g;
function extraire(src,re){ const out=new Set(); let m; re.lastIndex=0;
  while((m=re.exec(src))) out.add('/assets/'+m[1].replace('./','')); return [...out]; }
(async()=>{
  const racine=process.env.ROOT||'/assets/root-DbG_qNUl.js';
  const vus=new Set([racine]); const file=[racine]; const arcs=[]; let dyn=new Set();
  while(file.length && vus.size<CAP){
    const p=file.shift(); const src=await chunk(p);
    if(!src){ continue; }
    for(const d of extraire(src,reStat)){ arcs.push([p,d]); if(!vus.has(d)){ vus.add(d); file.push(d); } }
    for(const d of extraire(src,reDyn)) dyn.add(d);
  }
  const nom=p=>p.replace('/assets/','').replace(/-[A-Za-z0-9_-]{8,}\.js$/,'');
  console.log(`  fermeture transitive des imports STATIQUES depuis root : ${vus.size} fichiers`);
  console.log(`  chargés en différé (import dynamique) rencontrés        : ${dyn.size}`);
  // quels sont des ROUTES ?
  const routes=[...vus].filter(p=>/route|_index|\._|^\/assets\/(signup|login|dashboard|settings|organization|legal|mfa|security|account|admin|upgrade|downgrade|invoices|support|team|api-keys|api\.)/.test(p));
  console.log(`\n  dont modules ressemblant à des ROUTES : ${routes.length}`);
  routes.slice(0,28).forEach(p=>console.log(`    ${nom(p)}`));
  // qui tire le plus ?
  const parSource=new Map();
  arcs.forEach(([a,b])=>{ parSource.set(a,(parSource.get(a)||0)+1); });
  console.log('\n  chunks qui importent le plus statiquement :');
  [...parSource.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([p,n])=>console.log(`    ${n} imports  <- ${nom(p)}`));
  const fs=await import('node:fs');
  fs.writeFileSync('/tmp/graphe.json',JSON.stringify({total:vus.size,fichiers:[...vus],arcs,dyn:[...dyn]},null,2));
})();
