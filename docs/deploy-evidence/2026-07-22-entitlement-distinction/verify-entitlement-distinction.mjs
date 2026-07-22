#!/usr/bin/env node
// P0-EX-05 — prouve que le modèle d'entitlement DISTINGUE « apps publiées » (compte) des
// « types d'Artifact » (ensemble) : ajv accepte un entitlement bien structuré et REJETTE
// toute confusion (kinds fourni comme nombre, quota fourni comme tableau de kinds, kind
// inconnu).  node verify-entitlement-distinction.mjs
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

const SCHEMA_FILE = 'docs/parity/ENTITLEMENT_ARTIFACT_SCHEMA.json';
const raw = readFileSync(join(ROOT, SCHEMA_FILE));
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(JSON.parse(raw));

// Starter = 1 app publiée expirant 30j (baseline connue) ; kinds non observés → UNKNOWN (honnête).
const starter = { planId: 'starter', publishedAppQuota: { count: 1, expiryDays: 30 }, allowedArtifactKinds: 'UNKNOWN' };
const coreKnownKinds = { planId: 'core', publishedAppQuota: { count: 5, expiryDays: null }, allowedArtifactKinds: ['WEB_APP', 'MOBILE_APP'] };
// CONFUSIONS refusées :
const kindsAsNumber = { planId: 'x', publishedAppQuota: { count: 1 }, allowedArtifactKinds: 3 }; // types comme NOMBRE
const quotaAsKinds = { planId: 'x', publishedAppQuota: ['WEB_APP'], allowedArtifactKinds: ['WEB_APP'] }; // compte comme ENSEMBLE
const unknownKind = { planId: 'x', publishedAppQuota: { count: 1 }, allowedArtifactKinds: ['BLOCKCHAIN'] };
const missingDim = { planId: 'x', publishedAppQuota: { count: 1 } }; // manque la 2e dimension

const cases = [
  { name: 'starter (1 app publiée, kinds UNKNOWN)', data: starter, expectValid: true },
  { name: 'core (compte + kinds explicites)', data: coreKnownKinds, expectValid: true },
  { name: 'types d\'Artifact fournis comme NOMBRE (confusion)', data: kindsAsNumber, expectValid: false },
  { name: 'quota d\'apps fourni comme ENSEMBLE de kinds (confusion)', data: quotaAsKinds, expectValid: false },
  { name: 'ArtifactKind inconnu', data: unknownKind, expectValid: false },
  { name: 'dimension allowedArtifactKinds manquante (required)', data: missingDim, expectValid: false, wantRule: 'required' },
];

const results = cases.map((c) => {
  const ok = validate(c.data);
  const errs = (validate.errors || []).map((e) => e.keyword);
  if (ok !== c.expectValid) fail(`cas « ${c.name} » : attendu valid=${c.expectValid}, obtenu ${ok} (${errs.join(',')})`);
  if (!c.expectValid && c.wantRule && !errs.includes(c.wantRule)) fail(`cas « ${c.name} » : règle ${c.wantRule} absente (${errs.join(',')})`);
  return { case: c.name, valid: ok, expected: c.expectValid, errorKeywords: errs };
});

const anchor = {
  p0: 'P0-EX-05',
  schemaFile: SCHEMA_FILE, schemaSha256: sha256(raw),
  engine: `ajv ${require(join(ROOT, 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/package.json')).version}`,
  cases: results,
  claim: 'Le modèle distingue structurellement publishedAppQuota (COMPTE d\'apps publiées) et allowedArtifactKinds (ENSEMBLE de types d\'Artifact §5.2). ajv rejette toute confusion (kinds-comme-nombre, quota-comme-ensemble, kind inconnu) et accepte Starter (1 app publiée, kinds UNKNOWN honnête). Les deux dimensions ne sont jamais interchangeables.',
};
writeFileSync(join(HERE, 'entitlement-anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ engine: anchor.engine, cases: results }, null, 2));
