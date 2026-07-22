#!/usr/bin/env node
// P0-EX-08 — prouve que PROJECT_MANIFEST_SCHEMA.json est EXÉCUTABLE (allOf/contains réels,
// pas « juste une description ») : un VRAI moteur JSON-schema (ajv 8) REJETTE les
// contre-exemples refusés (2 artefacts MOBILE_APP, manifeste minimal invalide) et ACCEPTE
// un manifeste valide. Rejouable :  node verify-manifest-schema.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const require = createRequire(import.meta.url);
// Le schéma déclare draft 2020-12 → classe Ajv2020 (dist/2020.js).
const AjvMod = require(join(ROOT, 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/2020.js'));
const Ajv = AjvMod.default || AjvMod.Ajv2020 || AjvMod;
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('ASSERTION FAILED:', m); process.exit(1); };

const SCHEMA_FILE = 'docs/parity/PROJECT_MANIFEST_SCHEMA.json';
const raw = readFileSync(join(ROOT, SCHEMA_FILE));
const schema = JSON.parse(raw);
// ajv en mode non-strict pour tolérer les mots-clés x-* (annotations), sans affecter la validation.
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(schema);

const baseArtifact = (kind, id) => ({ artifactId: id, kind, sourceRoot: `/${id}` });
const validManifest = {
  manifestVersion: 1, projectId: 'proj_abc', entitlementsRef: 'ent_starter',
  artifacts: [baseArtifact('WEB_APP', 'a1'), baseArtifact('MOBILE_APP', 'a2')],
};
const twoMobile = { ...validManifest, artifacts: [baseArtifact('MOBILE_APP', 'a1'), baseArtifact('MOBILE_APP', 'a2')] };
const minimalInvalid = { manifestVersion: 1 }; // manque projectId + artifacts (required)
const extraProp = { ...validManifest, bogusField: 'x' }; // additionalProperties:false

const cases = [
  { name: 'valid manifest', data: validManifest, expectValid: true },
  { name: '2 MOBILE_APP artifacts (refusé)', data: twoMobile, expectValid: false, wantRule: 'contains' },
  { name: 'manifeste minimal invalide (required)', data: minimalInvalid, expectValid: false, wantRule: 'required' },
  { name: 'propriété inconnue (additionalProperties:false)', data: extraProp, expectValid: false, wantRule: 'additionalProperties' },
];

const results = cases.map((c) => {
  const ok = validate(c.data);
  const errs = (validate.errors || []).map((e) => e.keyword);
  if (ok !== c.expectValid) fail(`cas « ${c.name} » : attendu valid=${c.expectValid}, obtenu ${ok} (errs: ${errs.join(',')})`);
  if (!c.expectValid && c.wantRule && !errs.includes(c.wantRule))
    fail(`cas « ${c.name} » : règle attendue ${c.wantRule} absente des erreurs (${errs.join(',')})`);
  return { case: c.name, valid: ok, expected: c.expectValid, errorKeywords: errs };
});

const anchor = {
  p0: 'P0-EX-08',
  schemaFile: SCHEMA_FILE, schemaSha256: sha256(raw),
  engine: `ajv ${require(join(ROOT, 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/package.json')).version}`,
  cases: results,
  claim: 'Le schéma est EXÉCUTABLE : ajv rejette 2 MOBILE_APP (maxContains:1), le manifeste minimal (required) et une propriété inconnue (additionalProperties:false), et accepte un manifeste valide. allOf/contains ne sont plus « une simple description ».',
};
writeFileSync(join(HERE, 'schema-anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ engine: anchor.engine, cases: results }, null, 2));
