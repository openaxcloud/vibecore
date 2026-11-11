#!/usr/bin/env node
/**
 * Production E2E gate.
 *
 * Reads Playwright's JSON reports without failure waivers. Every unexpected
 * failure blocks, including tests formerly covered by the retired policy.
 * Explicit skips, expected failures and successful retries retain Playwright's
 * existing semantics. Report completeness and spec coverage remain mandatory.
 *
 * Usage: node scripts/e2e-gate.mjs <playwright-report.json>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`\n✖ E2E gate: ${message}\n`);
  process.exit(1);
}

const reportPaths = process.argv.slice(2);

if (reportPaths.length === 0) {
  fail('usage: node scripts/e2e-gate.mjs <playwright-report.json> [...]');
}

/*
 * LA PORTE EXIGE SES RAPPORTS, ELLE NE SE CONTENTE PAS DE CEUX QUI ARRIVENT.
 *
 * Quand la suite est découpée en tranches, chaque tranche rend son rapport. Si
 * l'une d'elles disparaît — coureur perdu, artefact non téléversé, job annulé —
 * fusionner ce qui reste donnerait un VERT sur une couverture amputée, et c'est
 * exactement la forme d'affaiblissement qu'une découpe introduit sans le dire.
 *
 * `E2E_EXPECTED_REPORTS` rend ce nombre explicite. Non renseigné, le
 * comportement est celui d'avant : on juge ce qu'on a reçu.
 */
const attendus = process.env.E2E_EXPECTED_REPORTS;

if (attendus !== undefined && attendus !== '') {
  const n = Number(attendus);

  if (!Number.isInteger(n) || n <= 0) {
    fail(`E2E_EXPECTED_REPORTS must be a positive integer; got ${JSON.stringify(attendus)}`);
  }

  if (reportPaths.length !== n) {
    fail(
      `expected ${n} shard report(s), received ${reportPaths.length}. ` +
        'A missing shard means untested specs — the gate does not pass on partial coverage.',
    );
  }
}

const reports = [];

for (const reportPath of reportPaths) {
  try {
    reports.push(JSON.parse(readFileSync(resolve(reportPath), 'utf8')));
  } catch (error) {
    fail(`could not read Playwright report at ${reportPath}: ${error.message}`);
  }
}

/* ---- 1. Collect outcomes from the report. ---- */

const results = new Map();
const flaky = [];
const globalErrors = [];
const incomplete = [];

function walk(suites, trail, vusDansCeRapport) {
  for (const suite of suites ?? []) {
    const here = suite.title ? [...trail, suite.title] : trail;

    for (const spec of suite.specs ?? []) {
      /*
       * Playwright reports `file` as a basename on specs and as a
       * repo-relative path on the top-level suite, depending on nesting. Key on
       * the basename so both the report and the policy normalise to the same
       * shape regardless of which one we got.
       */
      const file = basename(spec.file ?? suite.file ?? '');
      const titlePath = [...here.slice(1), spec.title].filter(Boolean).join(' › ');

      /*
       * Key on file + title, NOT file:line:column. Line numbers shift whenever
       * anyone edits the spec, which silently detached every waiver entry from
       * its test the first time this file was touched. Titles are stable and
       * unique within a spec.
       */
      const key = `${file} › ${titlePath}`;

      const tests = spec.tests ?? [];

      if (tests.length === 0) {
        incomplete.push(`${key}: no reported test variants`);
      }

      for (const test of tests) {
        // Only an explicit expected skip exempts a test from execution.
        if (test.expectedStatus === 'skipped') {
          continue;
        }

        const attempts = test.results ?? [];
        const last = attempts.at(-1);

        if (
          attempts.length === 0 ||
          test.status === 'skipped' ||
          !['passed', 'failed', 'timedOut'].includes(last?.status)
        ) {
          incomplete.push(
            `${key} [${test.projectName ?? test.projectId ?? 'unknown project'}]: ` +
              `expected=${test.expectedStatus ?? 'unspecified'}, outcome=${test.status}, ` +
              `attempts=${attempts.length}, last=${last?.status ?? 'none'}`,
          );
        }
      }

      /*
       * `flaky` means Playwright retried and the test went green. That is not a
       * gate failure — it is reported separately below so the instability stays
       * visible instead of being silently swallowed.
       */
      const ok = (spec.tests ?? []).every(
        (t) => t.status === 'expected' || t.status === 'skipped' || t.status === 'flaky',
      );

      const wasFlaky = (spec.tests ?? []).some((t) => t.status === 'flaky');

      vusDansCeRapport.add(key);

      /*
       * UN ÉCHEC N'EST JAMAIS ÉCRASÉ. Un même test peut figurer dans plusieurs
       * rapports — en mode spec seul, chaque tranche joue tout le spec. Écrire le
       * dernier verdict lu faisait d'un échec en tranche 1 suivi d'une réussite
       * en tranche 4 un « passed » : un faux vert.
       */
      if (results.get(key) !== 'failed') {
        results.set(key, ok ? 'passed' : 'failed');
      }

      if (wasFlaky && !flaky.includes(key)) {
        flaky.push(key);
      }
    }

    walk(suite.suites, here, vusDansCeRapport);
  }
}

const fichiersVus = new Set();

/*
 * Mode spec seul (`workflow_dispatch`, entrée `spec`) : chaque tranche joue TOUT
 * le spec, soit quatre exécutions indépendantes. Une tranche y rejoue donc des
 * tests déjà vus : « vide » veut dire qu'elle ne porte AUCUN test, pas qu'elle
 * n'en apporte aucun de NOUVEAU — sinon ce mode, fait pour prouver un correctif
 * sans la suite entière, rendait la porte rouge à chaque fois.
 */
const specCible = (process.env.E2E_SPEC ?? '').trim();

for (const [index, report] of reports.entries()) {
  for (const error of report.errors ?? []) {
    globalErrors.push(`report ${index + 1}: ${error.message ?? error.value ?? 'unspecified global error'}`);
  }

  const vusDansCeRapport = new Set();
  walk(report.suites, [], vusDansCeRapport);

  if (vusDansCeRapport.size === 0) {
    fail(
      'un rapport ne porte AUCUN test. Une tranche vide est une tranche verte : ' +
        'la porte ne conclut pas sur une couverture amputée.',
    );
  }
}

for (const cle of results.keys()) {
  fichiersVus.add(cle.split(' › ')[0]);
}

/*
 * ---- 2 bis. LA COUVERTURE EST-ELLE COMPLÈTE ? ----
 *
 * LE DÉFAUT QUE CE BLOC EXISTE POUR ATTRAPER, et c'est le plus dangereux de
 * toute la famille des faux verts.
 *
 * Le 2026-10-01, en portant la découpe de deux à quatre tranches, j'ai laissé
 * par contre-épreuve un `--shard=N/2` avec une matrice de quatre. Les SOIXANTE-DIX
 * gardes sont restés verts. Avec un dénominateur trop grand — `/8` pour quatre
 * tranches — un quart de la suite n'est joué par PERSONNE : chaque rapport est
 * plein, chaque test qu'il contient passe, et la porte dit « vert » sur une
 * couverture amputée. Ce n'est pas un rapport manquant (le compte de rapports
 * l'attraperait), c'est une PERTE SILENCIEUSE DE COUVERTURE, invisible même en
 * lisant les résultats un par un.
 *
 * Le même contrôle attrape l'autre moitié du problème, celle qui nous est
 * arrivée cette nuit : des specs ajoutés sans que personne touche à la matrice.
 *
 * ⚠️ POURQUOI L'ENSEMBLE ATTENDU N'EST PAS « TOUS LES FICHIERS DE tests/e2e ».
 * Mesuré avant d'écrire ce bloc, sur de vrais rapports : 48 fichiers vus pour 50
 * présents. Les deux manquants (`critical-paths`, `preview-runtime`) ne portent
 * QUE des tests marqués `@runtime`, et le workflow lance la suite avec
 * `--grep-invert @runtime` — ils tournent dans le passage « E2E Runtime », non
 * bloquant. Un contrôle naïf aurait donc été rouge pour une raison légitime, et
 * on l'aurait désarmé. On exclut ces fichiers par une règle, pas par une liste
 * tenue à la main : un fichier est attendu s'il contient au moins un `test(` qui
 * n'est pas marqué `@runtime`.
 */
const racineSpecs = resolve(repoRoot, 'tests/e2e');

function porteUnTestNonRuntime(chemin) {
  const source = readFileSync(chemin, 'utf8');
  // RegExp.test(...) is not a Playwright declaration. Keep runtime-only specs
  // excluded when their bodies use a regular expression to inspect a URL.
  const appels = source.split(/(?<!\.)\btest(?:\.describe)?\s*\(/u).slice(1);

  if (appels.length === 0) {
    return false;
  }

  /*
   * Un appel est « runtime » si `@runtime` apparaît avant la fin de sa liste
   * d'arguments de tête — en pratique, dans les 400 premiers caractères qui
   * suivent, ce qui couvre le titre et l'objet d'annotations sans déborder sur
   * le corps du test suivant.
   */
  return appels.some((apres) => !apres.slice(0, 400).includes('@runtime'));
}

const fichiersAttendus = specCible
  ? [basename(specCible)]
  : readdirSync(racineSpecs)
      .filter((f) => f.endsWith('.spec.ts'))
      .filter((f) => porteUnTestNonRuntime(resolve(racineSpecs, f)));

const fichiersManquants = fichiersAttendus.filter((f) => !fichiersVus.has(f));

console.log(`  fichiers de specs attendus : ${fichiersAttendus.length}`);
console.log(`  fichiers de specs vus      : ${fichiersVus.size}`);

if (fichiersAttendus.length === 0) {
  fail(
    "aucun fichier de spec attendu n'a été calculé : la règle d'exclusion `@runtime` est " +
      'cassée, et ce contrôle ne mesurerait plus rien. Il refuse plutôt que de rassurer.',
  );
}

if (fichiersManquants.length > 0) {
  fail(
    `${fichiersManquants.length} fichier(s) de specs n'ont été joués par AUCUNE tranche :\n` +
      fichiersManquants.map((f) => `    - ${f}`).join('\n') +
      '\n  Couverture amputée. Causes habituelles : le dénominateur de `--shard` ne ' +
      'correspond pas au nombre de tranches, ou des specs ont été ajoutés sans que la ' +
      'matrice suive.',
  );
}

const failed = [...results.entries()].filter(([, status]) => status === 'failed').map(([key]) => key);

/* ---- 2. Decide. No policy file or runtime option can exempt a failure. ---- */

console.log('E2E gate — no failure waivers');
console.log(`  tests reported : ${results.size}`);
console.log(`  failing        : ${failed.length}`);
console.log(`  flaky (passed on retry): ${flaky.length}`);

if (globalErrors.length) {
  console.error('\n✖ global report errors (cannot be waived):');
  globalErrors.forEach((error) => console.error(`    - ${error}`));
}

if (incomplete.length) {
  console.error('\n✖ incomplete test execution (cannot be waived):');
  incomplete.forEach((test) => console.error(`    - ${test}`));
}

if (flaky.length) {
  console.log('\n⚠ passed only after a retry — real instability, worth diagnosing:');
  flaky.forEach((key) => console.log(`    - ${key}`));
}

if (failed.length) {
  console.error('\n✖ failing tests that are NOT waived:');
  failed.forEach((key) => console.error(`    - ${key}`));
}

if (globalErrors.length || incomplete.length || failed.length) {
  process.exit(1);
}

console.log('\n✔ gate passes: no unexpected failures and no failure waivers.');
