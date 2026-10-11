// Arm B: concurrent burst, mirroring what the IDE shell actually does on open
// (overview prefetch + collaborators prefetch + overview SSE + active panel).
const APP = process.env.APP_BASE, TOKEN = process.env.QA_TOKEN, PROJECT = process.env.QA_PROJECT;
const PANELS = (process.env.PANELS || 'integrations,collaborators,packages,overview').split(',');
const CONC = Number(process.env.CONC || 4);
const ROUNDS = Number(process.env.ROUNDS || 5);
const GAP = Number(process.env.GAP || 2000);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function probe(panel, tag) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${APP}/api/projects/${PROJECT}/ide-panel/${panel}`,
      { headers: { accept: 'application/json', cookie: `vc_session=${TOKEN}` } });
    const text = await res.text();
    let b = null; try { b = JSON.parse(text); } catch {}
    return { panel, tag, http: res.status, ms: Date.now()-t0,
             envStatus: b?.status ?? null, dataNull: b ? b.data === null : null,
             errCode: typeof b?.error==='object' ? b.error?.code : (b?.error ?? null),
             dataLen: b?.data && typeof b.data==='object' ? JSON.stringify(b.data).length : null };
  } catch (e) { return { panel, tag, http: 0, ms: Date.now()-t0, transport: String(e.message||e) }; }
}

(async () => {
  const rows = [];
  for (let r = 0; r < ROUNDS; r++) {
    // fire CONC copies of every panel simultaneously
    const jobs = [];
    for (const p of PANELS) for (let c = 0; c < CONC; c++) jobs.push(probe(p, `r${r}c${c}`));
    const res = await Promise.all(jobs);
    res.forEach(x => { x.round = r; rows.push(x); });
    const bad = res.filter(x => x.envStatus === 'error' || x.http !== 200);
    console.log(`round ${r}: n=${res.length} bad=${bad.length}` + (bad.length ? ' :: ' + JSON.stringify(bad.slice(0,6)) : ''));
    await sleep(GAP);
  }
  const fs = await import('node:fs');
  fs.writeFileSync(process.env.OUT || '/tmp/panel-burst.json', JSON.stringify(rows, null, 2));
  console.log('--- SUMMARY (concurrent) ---');
  for (const p of PANELS) {
    const rs = rows.filter(x => x.panel === p);
    const ok = rs.filter(x=>x.envStatus==='ok').length, er = rs.filter(x=>x.envStatus==='error').length;
    const http = [...new Set(rs.map(x=>x.http))].join('/');
    const codes = [...new Set(rs.map(x=>x.errCode).filter(Boolean))].join('|') || '-';
    const lens = rs.map(x=>x.dataLen??0);
    console.log(`${p}: n=${rs.length} ok=${ok} error=${er} http=${http} codes=${codes} dataLen ${Math.min(...lens)}..${Math.max(...lens)}`);
  }
})();
