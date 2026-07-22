#!/usr/bin/env node
// P0-A2-03 — prouve que le modèle Project → Artifacts (PLAN_PARITE §5) est formalisé en
// un schéma COMPLET et EXÉCUTABLE : ajv (draft 2020-12) accepte un projet valide et
// REJETTE les contre-exemples (ArtifactKind inconnu, SERVICE traité comme Artifact,
// projectId manquant, propriété inconnue).  node verify-project-artifacts-schema.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const require = createRequire(import.meta.url);
const AjvMod = require(join(ROOT, 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/2020.js'));
const Ajv = AjvMod.default || AjvMod.Ajv2020 || AjvMod;
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('ASSERTION FAILED:', m); process.exit(1); };

const SCHEMA_FILE = 'docs/parity/PROJECT_ARTIFACTS_SCHEMA.json';
const raw = readFileSync(join(ROOT, SCHEMA_FILE));
const schema = JSON.parse(raw);
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(schema);

const validProject = {
  projectId: 'proj_1',
  artifacts: [{ artifactId: 'a1', kind: 'WEB_APP', deploymentType: 'AUTOSCALE', componentIds: ['c1'] }],
  generatedAssets: [{ assetId: 'g1', kind: 'PDF' }],
  components: [{ componentId: 'c1', kind: 'API' }, { componentId: 'c2', kind: 'SERVICE' }],
  releases: [{ releaseId: 'r1', artifactIds: ['a1'] }],
};
const unknownKind = { projectId: 'p', artifacts: [{ artifactId: 'a', kind: 'BLOCKCHAIN_APP' }] };
const serviceAsArtifact = { projectId: 'p', artifacts: [{ artifactId: 'a', kind: 'SERVICE' }] }; // SERVICE = ComponentKind, PAS ArtifactKind
const missingProjectId = { artifacts: [] };
const extraProp = { ...validProject, bogus: 1 };
const emptyRelease = { projectId: 'p', artifacts: [], releases: [{ releaseId: 'r', artifactIds: [] }] };

const cases = [
  { name: 'projet valide', data: validProject, expectValid: true },
  { name: 'ArtifactKind inconnu (BLOCKCHAIN_APP)', data: unknownKind, expectValid: false, wantRule: 'enum' },
  { name: 'SERVICE traité comme Artifact (interdit §5.2)', data: serviceAsArtifact, expectValid: false, wantRule: 'enum' },
  { name: 'projectId manquant (required)', data: missingProjectId, expectValid: false, wantRule: 'required' },
  { name: 'propriété inconnue (additionalProperties:false)', data: extraProp, expectValid: false, wantRule: 'additionalProperties' },
  { name: 'release vide (minItems:1)', data: emptyRelease, expectValid: false, wantRule: 'minItems' },
];

const results = cases.map((c) => {
  const ok = validate(c.data);
  const errs = (validate.errors || []).map((e) => e.keyword);
  if (ok !== c.expectValid) fail(`cas « ${c.name} » : attendu valid=${c.expectValid}, obtenu ${ok} (errs: ${errs.join(',')})`);
  if (!c.expectValid && c.wantRule && !errs.includes(c.wantRule))
    fail(`cas « ${c.name} » : règle attendue ${c.wantRule} absente (${errs.join(',')})`);
  return { case: c.name, valid: ok, expected: c.expectValid, errorKeywords: errs };
});

const anchor = {
  p0: 'P0-A2-03',
  schemaFile: SCHEMA_FILE, schemaSha256: sha256(raw),
  engine: `ajv ${require(join(ROOT, 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/package.json')).version}`,
  formalizes: 'PLAN_PARITE_REPLIT.md §5 (Project→Artifacts, taxonomie §5.2, release groupée §5.4)',
  cases: results,
  claim: 'Modèle Project→Artifacts formalisé en schéma COMPLET et EXÉCUTABLE : enums verrouillés (ArtifactKind/GeneratedAssetKind/ComponentKind/DeploymentType), additionalProperties:false, relations. ajv accepte un projet valide et rejette les contre-exemples (kind inconnu, SERVICE-comme-Artifact, required, additionalProperties, release vide).',
};
writeFileSync(join(HERE, 'schema-anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ engine: anchor.engine, cases: results }, null, 2));
