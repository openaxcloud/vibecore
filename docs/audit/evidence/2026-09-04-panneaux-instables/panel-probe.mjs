// Probe /api/projects/:id/ide-panel/:panel and classify each load.
// Discriminating signal is the ENVELOPE, not rendered characters:
//   status:'ok'    + data!=null  -> real content
//   status:'error' + data==null  -> panel will render header+error only  (the "content loss")
// HTTP is 200 in BOTH cases -- that is the whole point.
const APP = process.env.APP_BASE;          // web tier serves /api/projects/... (Remix route)
const TOKEN = process.env.QA_TOKEN;
const PROJECT = process.env.QA_PROJECT;
const PANELS = (process.env.PANELS || 'integrations,collaborators,packages,overview').split(',');
const ROUNDS = Number(process.env.ROUNDS || 6);
const SPACING_MS = Number(process.env.SPACING_MS || 12000);
const LABEL = process.env.LABEL || 'run';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(panel) {
  const url = `${APP}/api/projects/${PROJECT}/ide-panel/${panel}`;
  const t0 = Date.now();
  let res, text;
  try {
    res = await fetch(url, { headers: { accept: 'application/json', cookie: `vc_session=${TOKEN}` } });
    text = await res.text();
  } catch (e) {
    return { panel, http: 0, ms: Date.now() - t0, transport: String(e.message || e) };
  }
  const ms = Date.now() - t0;
  let body = null;
  try { body = JSON.parse(text); } catch {}
  const envStatus = body?.status ?? null;
  const dataNull = body ? body.data === null : null;
  const errCode = typeof body?.error === 'object' ? body.error?.code : (body?.error ?? null);
  // count how much real payload there is
  let dataKeys = null, dataLen = null;
  if (body?.data && typeof body.data === 'object') {
    dataKeys = Object.keys(body.data).length;
    dataLen = JSON.stringify(body.data).length;
  }
  return { panel, http: res.status, ms, envStatus, dataNull, errCode, dataKeys, dataLen, bytes: text.length };
}

(async () => {
  const rows = [];
  // ---- VALIDITY WITNESS -------------------------------------------------
  // Prove the probe can (a) reach a KNOWN-GOOD panel and (b) detect a KNOWN-BAD one.
  const good = await probe('settings');                 // simple panel, should be status ok
  const bad  = await probe('this-panel-does-not-exist'); // must NOT look like a success
  console.log('WITNESS good(settings):', JSON.stringify(good));
  console.log('WITNESS bad(nonexistent):', JSON.stringify(bad));
  if (good.http !== 200) console.log('!! WITNESS FAILED: probe cannot fetch a known-good panel; every "absence" below is meaningless');
  // -----------------------------------------------------------------------
  for (let r = 0; r < ROUNDS; r++) {
    for (const p of PANELS) {
      const row = await probe(p);
      row.round = r; row.label = LABEL;
      rows.push(row);
      console.log(JSON.stringify(row));
      if (SPACING_MS) await sleep(SPACING_MS);
    }
  }
  const out = process.env.OUT || `/tmp/panel-probe-${LABEL}.json`;
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ witness: { good, bad }, rows }, null, 2));
  console.log('--- SUMMARY', LABEL, '---');
  for (const p of PANELS) {
    const rs = rows.filter((x) => x.panel === p);
    const okc = rs.filter((x) => x.envStatus === 'ok').length;
    const errc = rs.filter((x) => x.envStatus === 'error').length;
    const lens = rs.map((x) => x.dataLen ?? 0);
    console.log(`${p}: ok=${okc} error=${errc} n=${rs.length} dataLen min=${Math.min(...lens)} max=${Math.max(...lens)} codes=${[...new Set(rs.map(x=>x.errCode).filter(Boolean))].join('|')||'-'}`);
  }
})();
