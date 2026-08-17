/*
 * Contrôle rouge→vert de BUG-QUOTA-001, indépendant du navigateur.
 *
 * Ouvre DEUX sockets /terminal successifs sur le MÊME sessionId, en gardant le
 * premier ouvert : c'est exactement le cas « rattachement ». Le second doit être
 * admis (correctif) ou rejeté en 429 (code d'avant).
 * Puis ouvre un TROISIÈME socket sur un sessionId RÉELLEMENT différent : celui-là
 * doit être refusé sur un plan à limite 1 — contrôle positif que le quota tient.
 */
import WebSocket from '/Users/hb/dev/vibecore/node_modules/ws/index.js';

const [, , base, workspaceId, token, label] = process.argv;

function open(sessionId, tag) {
  const url = `${base}/api/runtime/workspaces/${workspaceId}/terminal?sessionId=${encodeURIComponent(sessionId)}&cols=80&rows=24&token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url, { rejectUnauthorized: false });

  return new Promise((resolve) => {
    let settled = false;
    const done = (outcome, detail) => { if (!settled) { settled = true; resolve({ tag, sessionId, outcome, detail, socket }); } };
    const timer = setTimeout(() => done('timeout', ''), 15000);
    socket.on('open', () => { clearTimeout(timer); setTimeout(() => done('ADMIS', 'socket ouvert, pas de 429'), 1500); });
    socket.on('unexpected-response', (_q, res) => { clearTimeout(timer); done('REFUSE', `HTTP ${res.statusCode}`); });
    socket.on('close', (code) => { clearTimeout(timer); done('REFUSE', `fermé code ${code}`); });
    socket.on('error', (e) => { clearTimeout(timer); done('REFUSE', e.message); });
  });
}

const sess = `terminal-ctl-${label}`;
const a = await open(sess, 'A — 1re ouverture (nouvelle session)');
console.log(`  A  ${a.outcome.padEnd(7)} ${sess}   ${a.detail}`);
const b = await open(sess, 'B — RATTACHEMENT (même sessionId, A encore ouvert)');
console.log(`  B  ${b.outcome.padEnd(7)} ${sess}   ${b.detail}   <-- LE CAS DU BUG`);
const c = await open(`${sess}-autre`, 'C — 2e terminal réellement distinct');
console.log(`  C  ${c.outcome.padEnd(7)} ${sess}-autre   ${c.detail}   <-- contrôle positif (limite 1)`);

for (const s of [a, b, c]) { try { s.socket.close(); } catch {} }
console.log(JSON.stringify({ label, reattachAdmitted: b.outcome === 'ADMIS', distinctRefused: c.outcome === 'REFUSE' }));
process.exit(0);
