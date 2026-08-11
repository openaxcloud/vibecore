#!/usr/bin/env node
/**
 * BUG-RUNTIME-DIVERGENCE — repro live.
 *
 * NE S'EXÉCUTE PAS TOUT SEUL. Exige une session explicite et refuse de tourner
 * contre la production sans un aveu explicite, parce qu'il ÉCRIT des fichiers
 * de projet et provoque des reseeds de pod.
 *
 *   VC_SESSION=<token vc_session>            (obligatoire)
 *   VC_PROJECT_ID=<projectId>                (obligatoire)
 *   VC_API_BASE=https://api.e-code.ai        (défaut : cluster de test audit)
 *   VC_ALLOW_PROD=1                          (obligatoire si VC_API_BASE vise la prod)
 *
 *   node scripts/audit-env/repro-runtime-divergence.mjs
 *
 * CE QU'IL PROUVE — que le signal de fraîcheur observe la mauvaise ressource.
 * Il écrit un fichier de projet SANS jamais toucher `/ide-state`, puis montre
 * que l'ETag d'`/ide-state` — la grandeur que `fetchPersistedProjectRevision()`
 * compare aujourd'hui — n'a PAS bougé. C'est exactement pourquoi un reopen
 * chaud se rattache à un pod périmé.
 *
 * Le script est en LECTURE + une écriture de fichier ; il ne supprime rien et
 * ne touche pas aux autres projets. Voir docs/audit/RUNTIME_DIVERGENCE_FIX_PLAN.md.
 */

import { createHash } from 'node:crypto';
import process from 'node:process';

const SESSION = process.env.VC_SESSION;
const PROJECT_ID = process.env.VC_PROJECT_ID;
const API_BASE = (process.env.VC_API_BASE ?? 'https://api.audit-test.e-code.ai').replace(/\/$/, '');
const ALLOW_PROD = process.env.VC_ALLOW_PROD === '1';

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!SESSION) {
  die('VC_SESSION manquant. Ce script ne fabrique PAS de compte : fournissez une session existante.');
}

if (!PROJECT_ID) {
  die('VC_PROJECT_ID manquant.');
}

/*
 * Garde-fou : la repro provoque des reseeds de pod et écrit des fichiers. Elle
 * est prévue pour le cluster de test audit. Viser la prod doit être un choix
 * conscient, jamais un défaut.
 */
if (/(^|\.)e-code\.ai$/.test(new URL(API_BASE).hostname) && !/audit/.test(API_BASE) && !ALLOW_PROD) {
  die(`${API_BASE} ressemble à la PRODUCTION. Relancez avec VC_ALLOW_PROD=1 si c'est réellement voulu.`);
}

const auth = { authorization: `Bearer ${SESSION}`, accept: 'application/json' };

async function api(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  return response;
}

/** Révision dérivée des métadonnées de fichiers — le signal PROPOSÉ. */
function filesRevision(files) {
  const lines = files
    .map((file) => `${file.path}:${file.updatedAt ?? ''}:${file.sizeBytes ?? ''}`)
    .sort()
    .join('\n');

  return createHash('sha256').update(lines).digest('hex').slice(0, 16);
}

/** ETag d'/ide-state — le signal ACTUEL. */
async function ideStateRevision() {
  const response = await api(`/projects/${encodeURIComponent(PROJECT_ID)}/ide-state`);

  if (!response.ok) {
    return `<http ${response.status}>`;
  }

  const etag = response.headers.get('etag');

  if (etag) {
    return etag;
  }

  const body = await response.json();
  return String(body?.ideState?.version ?? '<none>');
}

async function listFiles() {
  const response = await api(`/projects/${encodeURIComponent(PROJECT_ID)}/files`);

  if (!response.ok) {
    die(`GET /files a répondu ${response.status}. Session ou projectId invalide ?`);
  }

  return (await response.json()).files ?? [];
}

async function main() {
  console.log(`\nAPI      : ${API_BASE}`);
  console.log(`Projet   : ${PROJECT_ID}\n`);

  const beforeIde = await ideStateRevision();
  const beforeFiles = filesRevision(await listFiles());

  console.log('AVANT écriture hors-bande');
  console.log(`  ide-state (signal ACTUEL)   : ${beforeIde}`);
  console.log(`  filesRevision (PROPOSÉ)     : ${beforeFiles}\n`);

  /*
   * L'écriture hors bande : un fichier de projet change, et RIEN ne touche
   * /ide-state — exactement ce que fait une édition venue d'un autre appareil
   * ou le back-sync de l'Agent.
   */
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file(`divergence-probe-${Date.now()}.txt`, `repro BUG-RUNTIME-DIVERGENCE\n`);
  const archive = await zip.generateAsync({ type: 'nodebuffer' });

  const write = await api(`/projects/${encodeURIComponent(PROJECT_ID)}/files/import/zip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ archive: { base64: archive.toString('base64') } }),
  });

  if (!write.ok) {
    die(`L'import zip a répondu ${write.status} — impossible de produire la divergence.`);
  }

  const afterIde = await ideStateRevision();
  const afterFiles = filesRevision(await listFiles());

  console.log('APRÈS écriture hors-bande (aucun PUT /ide-state)');
  console.log(`  ide-state (signal ACTUEL)   : ${afterIde}`);
  console.log(`  filesRevision (PROPOSÉ)     : ${afterFiles}\n`);

  const ideMoved = beforeIde !== afterIde;
  const filesMoved = beforeFiles !== afterFiles;

  console.log(`  ide-state a bougé ?         : ${ideMoved ? 'OUI' : 'NON'}`);
  console.log(`  filesRevision a bougé ?     : ${filesMoved ? 'OUI' : 'NON'}\n`);

  if (!filesMoved) {
    die('Les fichiers n’ont pas changé : la repro n’a rien produit (import ignoré ?).');
  }

  if (ideMoved) {
    console.log(
      '⚠️  ide-state a bougé alors qu’aucun PUT ide-state n’a été émis : une autre\n' +
        '    session écrivait en même temps. Rejouer sur un projet au repos, sinon la\n' +
        '    repro est polluée et ne prouve rien.\n',
    );
    process.exit(2);
  }

  console.log(
    '✓ DÉFAUT REPRODUIT — les fichiers ont changé, l’ide-state non.\n' +
      '  `fetchPersistedProjectRevision()` compare l’ide-state, il conclut donc\n' +
      '  « pas plus récent », `shouldReattachWarmWorkspace` se rattache au pod tiède,\n' +
      '  et l’IDE sert l’ancien arbre.\n\n' +
      '  Étape suivante (manuelle) : rouvrir le projet dans l’IDE et constater que le\n' +
      '  fichier divergence-probe-*.txt est ABSENT du runtime. Après correctif, il doit\n' +
      '  apparaître sans wipe des éditions runtime.\n',
  );
}

main().catch((error) => die(error?.stack ?? String(error)));
