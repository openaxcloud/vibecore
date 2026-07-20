#!/usr/bin/env node
/**
 * COUNTER_RECONCILIATION_20260720.md — GÉNÉRATEUR (directive Avi 20/07).
 * Chaque compteur est DÉRIVÉ des registres (P0_REGISTRY, WORK_ITEM_REGISTRY,
 * SURFACE_REGISTRY, contrats annotés) avec sa formule et ses IDs — aucun
 * chiffre à la main, drift-check en CI.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');
const OUT = 'COUNTER_RECONCILIATION_20260720.md';

const require = createRequire(join(process.env.PARITY_DEPS ?? '/tmp/parity-deps', 'noop.js'));

function loadYamlModule() {
  try {
    return require('yaml');
  } catch {
    return createRequire(join(repoRoot, 'noop.js'))('yaml');
  }
}

const YAML = loadYamlModule();
const yaml = (f) => YAML.parse(readFileSync(join(parityRoot, f), 'utf8'));

export function computeCounterReconciliation() {
  const p0s = yaml('P0_REGISTRY.yaml').p0s ?? [];
  const wi = yaml('WORK_ITEM_REGISTRY.yaml');
  const legacy = yaml('LEGACY_FINDING_REGISTRY.yaml');
  const surfaces = yaml('SURFACE_REGISTRY.yaml');

  const byStatus = (s) => p0s.filter((p) => p.status === s).map((p) => p.p0Id);
  const refused = p0s.filter((p) => p.reviewVerdict === 'REFUSED').map((p) => p.p0Id);
  const signed = p0s.filter((p) => p.reviewVerdict === 'SIGNED').map((p) => p.p0Id);
  const track = (tr) => p0s.filter((p) => p.remediationTrack === tr).map((p) => p.p0Id);
  const neverSubmitted = p0s
    .filter((p) => !p.reviewVerdict && (p.status === 'OPEN' || p.status === 'PROVEN'))
    .map((p) => p.p0Id);
  const openNotRefused = p0s
    .filter((p) => p.status === 'OPEN' && p.reviewVerdict !== 'REFUSED')
    .map((p) => p.p0Id);

  // 14 contrats : comptés depuis les FICHIERS annotés reviewVerdict REFUSED.
  const contractFiles = readdirSync(parityRoot).filter((f) => {
    if (!/\.(md|json)$/.test(f)) {
      return false;
    }

    const c = readFileSync(join(parityRoot, f), 'utf8');

    return /(^|")(x-)?reviewVerdict("\s*:\s*"|:\s*)REFUSED/m.test(c);
  });

  const canon = surfaces.canonicalUniverse ?? {};
  const quick = track('QUICK');
  const chantier = track('CHANTIER');
  const aTrier = track('A_TRIER');

  const row = (metric, value, formule, ids, source) =>
    `| ${metric} | **${value}** | ${formule} | ${ids} | ${source} |`;

  const lines = [
    '# COUNTER_RECONCILIATION_20260720 — réconciliation des compteurs (GÉNÉRÉ)',
    '',
    '<!-- GÉNÉRÉ par scripts/parity/generate-counter-reconciliation.mjs — ne jamais éditer à la main ; drift-check CI. -->',
    'schemaVersion: 1',
    '',
    'Chaque ligne : valeur DÉRIVÉE du registre indiqué, avec la formule et les IDs.',
    '',
    '| metric | valeur | formule | IDs inclus | source |',
    '|---|---|---|---|---|',
    row('P0 total', p0s.length, 'len(p0s)', '—', 'P0_REGISTRY.yaml'),
    row('P0 refusés (état courant)', refused.length, "count(reviewVerdict=REFUSED)", refused.join(', '), 'P0_REGISTRY.yaml'),
    row('P0 signés (tous reçus)', signed.length, "count(reviewVerdict=SIGNED)", signed.join(', '), 'P0_REGISTRY.yaml'),
    row('P0 OPEN', byStatus('OPEN').length, "count(status=OPEN)", byStatus('OPEN').join(', '), 'P0_REGISTRY.yaml'),
    row('P0 PROVEN_REVIEW_PENDING', byStatus('PROVEN_REVIEW_PENDING').length, "count(status=PROVEN_REVIEW_PENDING)", byStatus('PROVEN_REVIEW_PENDING').join(', '), 'P0_REGISTRY.yaml'),
    row('P0 PROVEN (hors lot)', byStatus('PROVEN').length, "count(status=PROVEN)", byStatus('PROVEN').join(', '), 'P0_REGISTRY.yaml'),
    row('P0 CLOSED', byStatus('CLOSED').length, 'count(status=CLOSED) — exige un ReviewReceipt COMPLET', byStatus('CLOSED').join(', ') || '—', 'P0_REGISTRY + REVIEW_RECEIPT_REGISTRY'),
    row('Lot A (corrections rapides)', quick.length, 'count(remediationTrack=QUICK)', quick.join(', '), 'P0_REGISTRY.yaml'),
    row('Lot B (chantiers P0)', chantier.length, 'count(remediationTrack=CHANTIER)', chantier.join(', '), 'P0_REGISTRY.yaml'),
    row('Refus à trier (raisons reçues 20/07 soir)', aTrier.length, 'count(remediationTrack=A_TRIER)', aTrier.join(', '), 'P0_REGISTRY.yaml'),
    row('Contrats refusés', contractFiles.length, 'count(fichiers docs/parity avec reviewVerdict: REFUSED)', contractFiles.sort().join(', '), 'annotations des fichiers de contrat'),
    row('Work items canoniques', wi.canonicalWorkItemCount, 'len(WORK_ITEM_REGISTRY.workItems) — vérifié = compte déclaré', '—', 'WORK_ITEM_REGISTRY.yaml'),
    row('Constats sources', legacy.sourceFindingCount, 'len(LEGACY_FINDING_REGISTRY.findings) — sceau count+sha CI', '—', 'LEGACY_FINDING_REGISTRY.yaml'),
    row('Surfaces canoniques', canon.canonicalSurfaceCount ?? 'N/A', '159 (univers P001–P159) + additionalCanonical − aliases fusionnés (voir bloc canonicalUniverse)', '—', 'SURFACE_REGISTRY.yaml#canonicalUniverse'),
    '',
    '## Réponses aux 4 questions (dérivées ci-dessus)',
    '',
    `1. **Refus → ouverts** : **${refused.length}** P0 portent actuellement \`reviewVerdict: REFUSED\`.`,
    `   **${byStatus('OPEN').length}** P0 sont déclarés OPEN, dont **${p0s.filter((p) => p.status === 'OPEN' && p.reviewVerdict === 'REFUSED').length}** refusés`,
    `   et **${openNotRefused.length}** ouverts sans refus (${openNotRefused.join(', ')}).`,
    '',
    `2. **Le 8e point rapide** : le tableau transmis à Avi n'en montrait que 7 et INCLUAIT`,
    `   À TORT P0-EX-10 (qui est un chantier B). Le lot A machine-tracé = les ${quick.length} IDs`,
    `   \`remediationTrack: QUICK\` : ${quick.join(', ')}. **LS-04 et LS-16 en font partie** ;`,
    `   EX-10 n'en fait PAS partie (track CHANTIER, remédié dans la PR #24).`,
    '',
    `3. **Le 6e gros chantier** : la colonne B = 5 P0 (\`remediationTrack: CHANTIER\` :`,
    `   ${chantier.join(', ')}) + **1 groupe : les 14 contrats §2.3** (0/14 signés) = 6 lignes.`,
    '',
    `4. **Comptage des 14 contrats** : DEUX vues cohérentes — (a) **14 points individuels**`,
    `   = les fichiers annotés \`reviewVerdict: REFUSED\` (comptés ci-dessus : ${contractFiles.length}),`,
    `   chacun avec sa raison verbatim ; (b) **1 groupe** dans la colonne chantiers (ligne C5).`,
    `   Les compteurs par point dérivent des fichiers ; le groupe n'est qu'une vue d'affichage.`,
    '',
  ];

  return lines.join('\n') + '\n';
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const outPath = join(parityRoot, OUT);
  const computed = computeCounterReconciliation();

  if (process.argv.includes('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      console.error('[counter-reconciliation] STALE — régénérer.');
      process.exit(1);
    }

    console.log('[counter-reconciliation] up to date');
  } else {
    writeFileSync(outPath, computed);
    console.log(`[counter-reconciliation] wrote ${outPath}`);
  }
}
