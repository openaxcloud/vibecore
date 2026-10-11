// CONTRE-ÉPREUVE : la même lecture DÉTECTE la perte quand on SUPPRIME l'espace au lieu de le mettre en veille.
import { execFileSync } from 'node:child_process';
const MANAGER = process.env.MANAGER_URL, SECRET = process.env.WORKSPACE_MANAGER_SHARED_SECRET, NS = 'workspaces', ID = process.env.ESPACE;
const kubectl = (...a) => execFileSync('kubectl', a, { encoding: 'utf8' }).trim();
const m = async (c, i = {}) => { const r = await fetch(MANAGER + c, { ...i, headers: { ...(typeof i.body === 'string' ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${SECRET}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${c} ${r.status} ${t.slice(0,200)}`); return t ? JSON.parse(t) : null; };
const lire = async (path) => { const { token } = await m(`/workspaces/${ID}/agent-token`); const r = await fetch(`http://workspace-${ID}.${NS}.svc.cluster.local:8080/files/read?path=${encodeURIComponent(path)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }); return r.status; };
console.log('avant suppression — lecture :', await lire('src/preuve-veille.ts'));
await m(`/workspaces/${ID}`, { method: 'DELETE' });
for (let i = 0; i < 60; i++) { if (!kubectl('get', 'pvc', '-n', NS, '--ignore-not-found', '-o', 'name').includes(ID)) break; await new Promise((r) => setTimeout(r, 1000)); }
console.log('volume après SUPPRESSION :', kubectl('get', 'pvc', '-n', NS, '--ignore-not-found', '-o', 'name').includes(ID) ? 'présent' : 'DÉTRUIT');
await m('/workspaces/start', { method: 'POST', body: JSON.stringify({ namespace: NS, orgId: 'org_qa', projectId: 'proj_qa', workspaceId: ID, image: 'vibecore-workspace-agent:qa-veille' }) });
for (let i = 0; i < 90; i++) { try { const s = await lire('src/preuve-veille.ts'); console.log('après suppression + réouverture — lecture du fichier :', s, s === 200 ? '(TOUJOURS LÀ ?!)' : '(PERDU — la lecture sait détecter une perte)'); break; } catch { await new Promise((r) => setTimeout(r, 2000)); } }
