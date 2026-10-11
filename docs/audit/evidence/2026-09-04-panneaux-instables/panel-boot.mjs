// Probe the 4 panels continuously WHILE a workspace boots, recording workspace
// status alongside each panel envelope. This is the failed-load / successful-load
// pair the mission asks for: same URL, same session, only workspace state differs.
const APP=process.env.APP_BASE, API=process.env.API_BASE, TOKEN=process.env.QA_TOKEN, PROJ=process.env.QA_PROJECT;
const PANELS=(process.env.PANELS||'integrations,collaborators,packages,overview').split(',');
const SECS=Number(process.env.SECS||240), EVERY=Number(process.env.EVERY||6000);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function wsStatus(){
  try{ const r=await fetch(`${API}/projects/${PROJ}/workspaces`,{headers:{authorization:`Bearer ${TOKEN}`}});
    const b=await r.json(); return (b.workspaces||[]).map(w=>`${w.name}:${w.status}`).join(',')||'none';
  }catch(e){ return 'ERR:'+(e.message||e); }
}
async function probe(panel){
  const t0=Date.now();
  try{
    const r=await fetch(`${APP}/api/projects/${PROJ}/ide-panel/${panel}`,{headers:{accept:'application/json',cookie:`vc_session=${TOKEN}`}});
    const text=await r.text(); let b=null; try{b=JSON.parse(text);}catch{}
    return {panel,http:r.status,ms:Date.now()-t0,envStatus:b?.status??null,dataNull:b?b.data===null:null,
      errCode:typeof b?.error==='object'?b.error?.code:(b?.error??null),
      dataLen:b?.data&&typeof b.data==='object'?JSON.stringify(b.data).length:null,
      loadError: b?.data?.loadError ? String(b.data.loadError).slice(0,60) : null};
  }catch(e){ return {panel,http:0,ms:Date.now()-t0,transport:String(e.message||e)}; }
}
(async()=>{
  const rows=[]; const t0=Date.now();
  while((Date.now()-t0)/1000 < SECS){
    const ws=await wsStatus();
    const res=await Promise.all(PANELS.map(probe));
    const stamp=Math.round((Date.now()-t0)/1000);
    res.forEach(x=>{x.t=stamp;x.ws=ws;rows.push(x);});
    console.log(`t=${stamp}s ws=[${ws}] ` + res.map(x=>`${x.panel}:${x.envStatus||x.http}${x.dataNull?'/NULL':''}${x.loadError?'/loadError':''}=${x.dataLen??'-'}`).join('  '));
    await sleep(EVERY);
  }
  const fs=await import('node:fs'); fs.writeFileSync(process.env.OUT||'/tmp/panel-boot.json',JSON.stringify(rows,null,2));
  console.log('--- SUMMARY over boot ---');
  for(const p of PANELS){
    const rs=rows.filter(x=>x.panel===p); const lens=rs.map(x=>x.dataLen??0);
    const mn=Math.min(...lens), mx=Math.max(...lens);
    console.log(`${p}: n=${rs.length} ok=${rs.filter(x=>x.envStatus==='ok').length} error=${rs.filter(x=>x.envStatus==='error').length} dataLen ${mn}..${mx} spread=${mx?Math.round((1-mn/mx)*100):0}% codes=${[...new Set(rs.map(x=>x.errCode).filter(Boolean))].join('|')||'-'} loadErrors=${rs.filter(x=>x.loadError).length}`);
  }
})();
