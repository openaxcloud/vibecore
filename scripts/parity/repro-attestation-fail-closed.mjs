#!/usr/bin/env node
/**
 * RR-20260723-CODEX-07 — REPRO EXÉCUTABLE DE BOUT EN BOUT du fail-closed.
 *
 * Prouve, sans réseau ni token, que l'absence de mergedCommit / repoCommit /
 * runUrl est REJETÉE aux DEUX étages de la garde :
 *
 *   A. vérificateur PUR  (checkAttestationFields, sans réseau) ;
 *   B. validateur STRUCTUREL (scripts/parity/validate-registries.mjs) exécuté
 *      pour de vrai contre une COPIE amputée de docs/parity/CI_ATTESTATION.yaml
 *      (la copie est écrite dans un dossier temporaire ; l'arbre réel n'est
 *      jamais modifié — PARITY_ATTESTATION_PATH pointe le validateur dessus).
 *
 * Sortie : un tableau PASS/FAIL par champ + un résumé. Code de sortie ≠ 0 si
 * une seule garde ne casse pas → utilisable en CI/preuve.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAttestationFields } from './verify-attestation-run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const attPath = join(repoRoot, 'docs/parity/CI_ATTESTATION.yaml');
const golden = JSON.parse(readFileSync(join(here, 'fixtures', 'golden-run-29802136737.json'), 'utf8'));

// Regex indentée : les 3 champs vivent SOUS `attestation:` (indentés). Un
// `repoCommit:` non indenté existe aussi au niveau racine (schemaVersion) — il
// ne faut PAS le confondre. `[ \t]+` garantit qu'on retire bien la ligne du
// bloc attestation.
const FIELDS = [
  ['mergedCommit', 'sha', /^[ \t]+mergedCommit:.*$/m],
  ['repoCommit', 'sha', /^[ \t]+repoCommit:.*$/m],
  ['runUrl', 'url', /^[ \t]+runUrl:.*$/m],
];

// Attestation cohérente au run golden (tous champs présents et liés).
const goldenAtt = {
  runId: golden.id,
  runCommit: golden.head_sha,
  mergedCommit: golden.head_sha,
  repoCommit: golden.head_sha,
  runUrl: golden.html_url,
  runDate: golden.created_at,
  conclusion: golden.conclusion,
};

let failed = false;
const line = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed = true; };

/* ===== A. Vérificateur PUR — chaque suppression est rejetée ============= */
console.log('A. checkAttestationFields (pur) — suppression par champ :');
line(checkAttestationFields(goldenAtt, golden).length === 0, 'attestation complète → 0 erreur (le valide passe)');
for (const [field, prefix] of FIELDS) {
  const amputated = { ...goldenAtt };
  delete amputated[field];
  const errs = checkAttestationFields(amputated, golden);
  line(errs.some((e) => e.startsWith(prefix + ':') && e.includes(field) && e.includes('ABSENT')),
    `${field} SUPPRIMÉ → erreur "${prefix}: ${field} ABSENT" levée`);
}

/* ===== B. Validateur STRUCTUREL — sur COPIE amputée de l'attestation ==== */
console.log('\nB. validate-registries.mjs (structurel) — copie amputée hors-arbre :');
const attText = readFileSync(attPath, 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'attest-repro-'));

function runValidatorAgainst(text) {
  const p = join(tmp, 'CI_ATTESTATION.yaml');
  writeFileSync(p, text);
  try {
    execFileSync('node', [join(here, 'validate-registries.mjs')], {
      cwd: repoRoot,
      env: { ...process.env, PARITY_ATTESTATION_PATH: p, PARITY_DEPS: process.env.PARITY_DEPS ?? '/tmp/parity-deps' },
      stdio: 'pipe',
    });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// Contrôle : la copie intacte passe le bloc attestation (peut échouer ailleurs
// si l'arbre a d'autres drifts, mais PAS sur l'attestation) — on ne teste ici
// QUE que l'amputation ajoute une violation d'attestation absente sinon.
const intact = runValidatorAgainst(attText);
line(!/CI_ATTESTATION\.yaml.*(mergedCommit|repoCommit|runUrl).*(manquant|obligatoire)/.test(intact.out),
  'copie intacte → aucune violation d\'attestation sur les 3 champs');

for (const [field, , re] of FIELDS) {
  const amputatedText = attText.replace(re, '');
  const r = runValidatorAgainst(amputatedText);
  const rejected = r.code !== 0 && new RegExp(`CI_ATTESTATION\\.yaml.*${field}.*(manquant|obligatoire|vide)`, 'i').test(r.out);
  line(rejected, `${field} retiré du YAML → validate-registries ÉCHOUE (exit ${r.code}) avec violation "${field}"`);
}

console.log(failed
  ? '\n[repro] ÉCHEC — au moins une garde reste fail-open'
  : '\n[repro] OK — fail-closed prouvé aux deux étages (pur + structurel)');
process.exit(failed ? 1 : 0);
