// Fixture LOCALE (API 127.0.0.1:3011 uniquement) : un compte de test gratuit, deux projets,
// et un workspace RUNNING sur le premier — le quota gratuit `workspaces.active` = 1 est donc plein.
// Usage : API=http://127.0.0.1:3011 PGURL=postgresql://vibecore:vibecore@127.0.0.1:55532/vibecore node fixture-local.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const API = process.env.API || 'http://127.0.0.1:3011';
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(API)) throw new Error('fixture réservée à une API locale');
const tag = Date.now().toString(36);
const email = `qa-${tag}@example.test`;
const j = async (path, init = {}, token) => {
  const r = await fetch(API + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${r.status} ${t.slice(0, 300)}`);
  return b;
};
const reg = await j('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: `Qa-${tag}-Local!9`, name: 'QA Local', organizationName: `QA ${tag}` }) });
const token = reg.token, orgId = reg.organization?.id;
const p1 = await j(`/orgs/${orgId}/projects`, { method: 'POST', body: JSON.stringify({ name: 'QA projet 1', framework: 'react' }) }, token);
const p2 = await j(`/orgs/${orgId}/projects`, { method: 'POST', body: JSON.stringify({ name: 'QA projet 2', framework: 'react' }) }, token);
const id1 = (p1.project || p1).id, id2 = (p2.project || p2).id;
if (process.env.OCCUPY !== '0') {
  execFileSync('docker', ['exec', 'vc-qa0928-postgres-1', 'psql', '-U', 'vibecore', '-d', 'vibecore', '-c',
    `INSERT INTO "Workspace"(id,"projectId",name,status,"runtimeMode","updatedAt") VALUES ('ws-qaoccupe${tag}','${id1}','occupé','RUNNING','remote',now())`]);
}
const out = { email, token, orgId, project1: id1, project2: id2 };
fs.writeFileSync(new URL('./.fixture.json', import.meta.url), JSON.stringify(out));
console.log('FIXTURE OK', JSON.stringify({ orgId, project1: id1, project2: id2 }));
