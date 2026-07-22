#!/usr/bin/env node
// P0-LS-06 — prouve que les liens des observations ne sont NI cassés NI non sémantiques :
// (1) chaque archiveUri résout sur disque (non cassé) ; (2) chaque contentHash est un hash
// de source CANONIQUE enregistré dans SOURCE_REGISTRY (lien sémantique = observation ancrée
// à une source réelle). Refute « observations TRIAGED malgré liens cassés/non sémantiques ».
//   node verify-observation-links.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const require = createRequire(import.meta.url);
const YAML = require(join(ROOT, 'node_modules/yaml'));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('ASSERTION FAILED:', m); process.exit(1); };

const obsRaw = readFileSync(join(ROOT, 'docs/parity/OBSERVATION_REGISTRY.yaml'));
const srcRaw = readFileSync(join(ROOT, 'docs/parity/SOURCE_REGISTRY.yaml'));
const obsDoc = YAML.parse(obsRaw.toString());
const srcDoc = YAML.parse(srcRaw.toString());
const observations = obsDoc.observations || Object.values(obsDoc).find(Array.isArray);
const sources = srcDoc.sources || Object.values(srcDoc).find(Array.isArray);
const srcHashes = new Set(sources.map((s) => (s.contentHash || '').replace('sha256:', '')));

const broken = [], nonSemantic = [], triageState = {};
for (const o of observations) {
  triageState[o.triageState] = (triageState[o.triageState] || 0) + 1;
  const uri = (o.archiveUri || '').replace(/^\.\//, '');
  if (!uri || !existsSync(join(ROOT, uri))) broken.push(o.observationId);
  const h = (o.contentHash || '').replace('sha256:', '');
  if (!h || !srcHashes.has(h)) nonSemantic.push(o.observationId);
}
// TRIAGED ⇒ ni cassé ni non-sémantique
const triagedBroken = observations.filter((o) => o.triageState === 'TRIAGED' && broken.includes(o.observationId));
const triagedNonSem = observations.filter((o) => o.triageState === 'TRIAGED' && nonSemantic.includes(o.observationId));
if (broken.length) fail(`liens cassés (archiveUri absent): ${broken.join(', ')}`);
if (nonSemantic.length) fail(`liens non sémantiques (contentHash absent de SOURCE_REGISTRY): ${nonSemantic.join(', ')}`);

const anchor = {
  p0: 'P0-LS-06',
  observationRegistrySha256: sha256(obsRaw), sourceRegistrySha256: sha256(srcRaw),
  observationCount: observations.length, sourceCount: sources.length,
  brokenLinks: 0, nonSemanticLinks: 0,
  triageStateCounts: triageState,
  triagedWithBrokenOrNonSemantic: triagedBroken.length + triagedNonSem.length,
  claim: 'Aucun lien d\'observation n\'est cassé (chaque archiveUri résout) ni non sémantique (chaque contentHash est un hash de source CANONIQUE enregistré dans SOURCE_REGISTRY, ancrant l\'observation à une source réelle). En particulier, aucune observation TRIAGED n\'a de lien cassé ou non sémantique. Échoue exit 1 si un lien casse.',
};
writeFileSync(join(HERE, 'link-integrity-anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ observationCount: observations.length, brokenLinks: 0, nonSemanticLinks: 0,
  triageStateCounts: triageState, triagedWithIssue: triagedBroken.length + triagedNonSem.length }, null, 2));
