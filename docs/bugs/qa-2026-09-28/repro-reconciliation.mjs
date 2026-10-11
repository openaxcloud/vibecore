// Repro BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE (LOCAL : API 3011, AUCUN workspace-manager).
// Un workspace RUNNING occupe le créneau gratuit ; on démarre le runtime d'un AUTRE projet.
// Attendu (commentaire du code) : manager injoignable = panne transitoire ⇒ créneau GARDÉ ⇒ 429.
// Mesuré : la ligne vivante passe en STOPPED et le démarrage part vers le manager.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const API = 'http://127.0.0.1:3011';
execFileSync('node', [new URL('./fixture-local.mjs', import.meta.url).pathname], { stdio: 'inherit' });
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const sql = q => execFileSync('docker', ['exec', 'vc-qa0928-postgres-1', 'psql', '-U', 'vibecore', '-d', 'vibecore', '-tAc', q]).toString().trim();
const avant = sql(`select status from "Workspace" where "projectId"='${fx.project1}'`);
const r = await fetch(API + '/api/runtime/workspaces', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${fx.token}` }, body: JSON.stringify({ metadata: { projectId: fx.project2 } }) });
const apres = sql(`select status from "Workspace" where "projectId"='${fx.project1}'`);
console.log(JSON.stringify({ ligneOccupeeAvant: avant, demarrageProjet2: r.status, ligneOccupeeApres: apres }));
