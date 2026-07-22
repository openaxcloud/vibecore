#!/usr/bin/env node
/**
 * CTR-PROJECT-MANIFEST-SCHEMA v3 — tests négatifs REJOUABLES (réserve relecteur v2 :
 * « aucun fichier de tests négatifs rejouable n'est fourni dans le dossier »).
 *
 * Charge docs/parity/PROJECT_MANIFEST_SCHEMA.json puis :
 *   - valide TOUS les fixtures docs/parity/manifest-samples/valid/*.json   → chacun DOIT passer ;
 *   - valide TOUS les fixtures docs/parity/manifest-samples/invalid/*.json → chacun DOIT échouer,
 *     ET le message d'erreur DOIT contenir le motif déclaré dans `x-expectedError`
 *     (retiré du fixture avant validation — il violerait additionalProperties:false).
 *
 * Exit 1 au moindre écart. AUCUNE dépendance : ajv n'est PAS présent dans les
 * node_modules du repo racine (pnpm store seulement, jamais installé en CI par ce
 * workflow) → mini-validateur couvrant EXACTEMENT les mots-clés utilisés par le
 * schéma. Garde-fou : si le schéma introduit un mot-clé non implémenté, le script
 * ÉCHOUE au lieu de valider silencieusement à tort.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = join(ROOT, 'docs', 'parity', 'PROJECT_MANIFEST_SCHEMA.json');
const SAMPLES_DIR = join(ROOT, 'docs', 'parity', 'manifest-samples');

/* ------------------------------------------------------------------ *
 * Garde-fou : mots-clés implémentés. Tout mot-clé de VALIDATION inconnu
 * dans le schéma => échec immédiat (jamais de faux vert).
 * ------------------------------------------------------------------ */
const KNOWN_KEYWORDS = new Set([
  // annotations (sans effet de validation)
  '$schema', '$id', 'title', 'description',
  // validation implémentée ci-dessous
  'type', 'required', 'properties', 'additionalProperties',
  'enum', 'const', 'minLength', 'minimum',
  'minItems', 'maxItems', 'items',
  'contains', 'minContains', 'maxContains',
  'allOf',
]);

function assertSchemaSupported(schema, path = '#') {
  if (typeof schema !== 'object' || schema === null) return;
  for (const key of Object.keys(schema)) {
    if (key.startsWith('x-')) continue; // extensions maison (métadonnées contrat)
    if (!KNOWN_KEYWORDS.has(key)) {
      throw new Error(
        `${path}: mot-clé de schéma non supporté par le mini-validateur : "${key}" — ` +
        `étendre scripts/parity/validate-project-manifest-samples.mjs avant de durcir le schéma.`,
      );
    }
  }
  if (schema.properties) {
    for (const [name, sub] of Object.entries(schema.properties)) {
      assertSchemaSupported(sub, `${path}/properties/${name}`);
    }
  }
  if (typeof schema.additionalProperties === 'object') {
    assertSchemaSupported(schema.additionalProperties, `${path}/additionalProperties`);
  }
  if (schema.items) assertSchemaSupported(schema.items, `${path}/items`);
  if (schema.contains) assertSchemaSupported(schema.contains, `${path}/contains`);
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((sub, i) => assertSchemaSupported(sub, `${path}/allOf/${i}`));
  }
}

/* ------------------------------------------------------------------ *
 * Mini-validateur JSON Schema (draft 2020-12, sous-ensemble EXACT du schéma).
 * ------------------------------------------------------------------ */
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value; // 'object' | 'string' | 'number' | 'boolean'
}

function matchesType(value, type) {
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeOf(value) === 'object';
  return typeOf(value) === type;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateNode(schema, data, path, errors) {
  if (schema.type !== undefined && !matchesType(data, schema.type)) {
    errors.push(`${path}: type: attendu ${schema.type}, reçu ${typeOf(data)}`);
    return; // les autres mots-clés supposent le bon type
  }

  if (schema.enum !== undefined && !schema.enum.some((v) => deepEqual(v, data))) {
    errors.push(`${path}: enum: valeur ${JSON.stringify(data)} hors de [${schema.enum.join(', ')}]`);
  }

  if (schema.const !== undefined && !deepEqual(schema.const, data)) {
    errors.push(`${path}: const: attendu ${JSON.stringify(schema.const)}`);
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path}: minLength: chaîne de longueur ${data.length} < ${schema.minLength}`);
    }
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${path}: minimum: ${data} < ${schema.minimum}`);
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${path}: minItems: ${data.length} élément(s) < ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`${path}: maxItems: ${data.length} élément(s) > ${schema.maxItems}`);
    }
    if (schema.items !== undefined) {
      data.forEach((item, i) => validateNode(schema.items, item, `${path}/${i}`, errors));
    }
    if (schema.contains !== undefined) {
      const matching = data.filter((item) => {
        const scratch = [];
        validateNode(schema.contains, item, path, scratch);
        return scratch.length === 0;
      }).length;
      const min = schema.minContains ?? 1;
      const max = schema.maxContains ?? Infinity;
      if (matching < min) {
        errors.push(`${path}: minContains: ${matching} élément(s) conforme(s) à "contains" < ${min}`);
      }
      if (matching > max) {
        errors.push(`${path}: maxContains: ${matching} éléments conformes à "contains" > ${max}`);
      }
    }
  }

  if (typeOf(data) === 'object') {
    if (schema.required) {
      for (const name of schema.required) {
        if (!(name in data)) {
          errors.push(`${path}: required: propriété requise "${name}" manquante`);
        }
      }
    }
    const props = schema.properties ?? {};
    for (const [name, sub] of Object.entries(props)) {
      if (name in data) validateNode(sub, data[name], `${path}/${name}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const name of Object.keys(data)) {
        if (!(name in props)) {
          errors.push(`${path}: additionalProperties: propriété inconnue "${name}" interdite`);
        }
      }
    } else if (typeof schema.additionalProperties === 'object') {
      for (const name of Object.keys(data)) {
        if (!(name in props)) {
          validateNode(schema.additionalProperties, data[name], `${path}/${name}`, errors);
        }
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validateNode(sub, data, path, errors);
  }
}

function validate(schema, data) {
  const errors = [];
  validateNode(schema, data, '#', errors);
  return errors;
}

/* ------------------------------------------------------------------ *
 * Exécution.
 * ------------------------------------------------------------------ */
function listJson(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    throw new Error(`${dir}: aucun fixture *.json — un dossier vide rendrait le contrôle silencieusement vert.`);
  }
  return files;
}

function main() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  assertSchemaSupported(schema);

  let failures = 0;

  const validDir = join(SAMPLES_DIR, 'valid');
  console.log('== Fixtures VALIDES (chacun doit passer) ==');
  for (const file of listJson(validDir)) {
    const data = JSON.parse(readFileSync(join(validDir, file), 'utf8'));
    const errors = validate(schema, data);
    if (errors.length === 0) {
      console.log(`  PASS  valid/${file}`);
    } else {
      failures += 1;
      console.error(`  FAIL  valid/${file} — devait passer, ${errors.length} erreur(s) :`);
      for (const e of errors) console.error(`          ${e}`);
    }
  }

  const invalidDir = join(SAMPLES_DIR, 'invalid');
  console.log('== Fixtures INVALIDES (chacun doit être rejeté avec le motif attendu) ==');
  for (const file of listJson(invalidDir)) {
    const data = JSON.parse(readFileSync(join(invalidDir, file), 'utf8'));
    const expected = data['x-expectedError'];
    if (typeof expected !== 'string' || expected.length === 0) {
      failures += 1;
      console.error(`  FAIL  invalid/${file} — champ "x-expectedError" (string non vide) obligatoire dans chaque fixture négatif.`);
      continue;
    }
    delete data['x-expectedError']; // retiré AVANT validation (violerait additionalProperties:false)
    const errors = validate(schema, data);
    if (errors.length === 0) {
      failures += 1;
      console.error(`  FAIL  invalid/${file} — ACCEPTÉ à tort (contre-exemple non rejeté).`);
      continue;
    }
    const joined = errors.join('\n');
    if (!joined.includes(expected)) {
      failures += 1;
      console.error(`  FAIL  invalid/${file} — rejeté, mais motif attendu "${expected}" absent des erreurs :`);
      for (const e of errors) console.error(`          ${e}`);
      continue;
    }
    console.log(`  PASS  invalid/${file} — rejeté avec le motif attendu ("${expected}") : ${errors.find((e) => e.includes(expected))}`);
  }

  if (failures > 0) {
    console.error(`\nÉCHEC : ${failures} fixture(s) en écart avec le contrat. Exit 1.`);
    process.exit(1);
  }
  console.log('\nOK : tous les fixtures valides passent, tous les contre-exemples sont rejetés avec le motif attendu.');
}

main();
