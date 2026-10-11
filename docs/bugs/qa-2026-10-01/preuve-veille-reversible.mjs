/*
 * PREUVE — un espace MIS EN VEILLE se rouvre avec ses fichiers intacts.
 * Vrai workspace-manager, vrai Kubernetes (OrbStack, KUBECONFIG isolé), vrai
 * agent (image construite depuis le dépôt), vrai volume (local-path). L'arrêt est
 * la MÊME requête que la mise en veille automatique : POST /workspaces/:id/stop.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const MANAGER = process.env.MANAGER_URL;
const SECRET = process.env.WORKSPACE_MANAGER_SHARED_SECRET;
const NS = 'workspaces';
const ID = `qaveille${Date.now().toString(36)}`;
const IMAGE = 'vibecore-workspace-agent:qa-veille';
const kubectl = (...a) => execFileSync('kubectl', a, { encoding: 'utf8' }).trim();
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const t0 = Date.now(); const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function manager(chemin, init = {}) {
  const r = await fetch(MANAGER + chemin, { ...init, headers: { ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${SECRET}` } });
  const corps = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${chemin} → ${r.status} ${corps.slice(0, 300)}`);
  return corps ? JSON.parse(corps) : null;
}
const demarrer = () => manager('/workspaces/start', { method: 'POST', body: JSON.stringify({ namespace: NS, orgId: 'org_qa', projectId: 'proj_qa', workspaceId: ID, image: IMAGE }) });
async function agent(chemin, init = {}) {
  const { token } = await manager(`/workspaces/${ID}/agent-token`);
  const url = `http://workspace-${ID}.${NS}.svc.cluster.local:8080${chemin}`;
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  const corps = await r.text();
  if (!r.ok) throw new Error(`agent ${chemin} → ${r.status} ${corps.slice(0, 200)}`);
  return corps ? JSON.parse(corps) : null;
}
async function attendreAgent(etape) {
  for (let i = 0; i < 90; i++) {
    try { await agent('/health'); console.log(`${ts()} ${etape} : agent joignable`); return; } catch (e) { if (i % 10 === 0) console.log(`${ts()} ${etape} : attente agent (${String(e.message).slice(0, 80)})`); }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${etape} : agent jamais joignable`);
}

const fichiers = {
  'src/preuve-veille.ts': `export const jeton = '${randomBytes(12).toString('hex')}';\n`,
  'notes/journal du projet.md': `# Travail de l'utilisateur\n${'ligne\n'.repeat(500)}${randomBytes(8).toString('hex')}\n`,
};

console.log(`${ts()} espace ${ID} — démarrage`);
await demarrer();
await attendreAgent('1er démarrage');
for (const [path, content] of Object.entries(fichiers)) await agent('/files/write', { method: 'POST', body: JSON.stringify({ path, content }) });
const avant = {};
for (const path of Object.keys(fichiers)) avant[path] = sha((await agent(`/files/read?path=${encodeURIComponent(path)}`)).content);
console.log(`${ts()} écrit et RELU avant la veille :`, JSON.stringify(avant));
const podAvant = kubectl('get', 'pod', '-n', NS, `workspace-${ID}`, '-o', 'jsonpath={.metadata.uid}');
const pvc = kubectl('get', 'pvc', '-n', NS, '-l', `vibecore.ai/workspace-id=${ID}`, '-o', 'jsonpath={.items[*].metadata.name}') || kubectl('get', 'pvc', '-n', NS, '-o', 'jsonpath={.items[*].metadata.name}');
console.log(`${ts()} pod ${podAvant.slice(0, 8)}…, volume(s) : ${pvc}`);

console.log(`${ts()} MISE EN VEILLE : POST /workspaces/${ID}/stop (la requête de la mise en veille automatique)`);
const arret = await manager(`/workspaces/${ID}/stop`, { method: 'POST' });
console.log(`${ts()} statut rendu par le manager : ${arret?.status}`);
for (let i = 0; i < 60; i++) { if (!kubectl('get', 'pod', '-n', NS, '--ignore-not-found', '-o', 'name').includes(ID)) break; await new Promise((r) => setTimeout(r, 1000)); }
const podsApres = kubectl('get', 'pod', '-n', NS, '--ignore-not-found', '-o', 'name');
const pvcApres = kubectl('get', 'pvc', '-n', NS, '-o', 'jsonpath={range .items[*]}{.metadata.name}={.status.phase} {end}');
console.log(`${ts()} après veille — pod présent ? ${podsApres.includes(ID)} | volumes : ${pvcApres}`);

console.log(`${ts()} RÉOUVERTURE (même identifiant, comme un client qui revient sur son projet)`);
await demarrer();
await attendreAgent('réouverture');
const podApres = kubectl('get', 'pod', '-n', NS, `workspace-${ID}`, '-o', 'jsonpath={.metadata.uid}');
const apres = {};
for (const path of Object.keys(fichiers)) apres[path] = sha((await agent(`/files/read?path=${encodeURIComponent(path)}`)).content);
console.log(`${ts()} relu après réouverture :`, JSON.stringify(apres));
console.log(`${ts()} nouveau pod ? ${podApres !== podAvant} (avant ${podAvant.slice(0, 8)}…, après ${podApres.slice(0, 8)}…)`);
const intacts = Object.keys(fichiers).every((p) => avant[p] === apres[p] && avant[p] === sha(fichiers[p]));
console.log(`VERDICT : ${intacts && podApres !== podAvant && !podsApres.includes(ID) ? 'FICHIERS INTACTS après veille et réouverture (pod remplacé, volume conservé)' : 'ÉCHEC'}`);
console.log(`ESPACE=${ID}`);
