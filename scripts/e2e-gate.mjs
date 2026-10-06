#!/usr/bin/env node
/**
 * Production E2E gate.
 *
 * Reads Playwright's JSON report and decides whether the gate passes, applying
 * the bounded waiver in tests/e2e/e2e-waivers.json.
 *
 * The waiver cannot rot and cannot be widened at runtime:
 *   - the policy path is hard-coded here (no CLI override, no env var);
 *   - past `expires` the gate fails ON THE WAIVER, whatever the tests did;
 *   - a waived test that starts PASSING fails the gate until it is removed
 *     from the policy;
 *   - anything failing that is not listed fails the gate normally.
 *
 * Usage: node scripts/e2e-gate.mjs <playwright-report.json>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAIVER_PATH = resolve(repoRoot, 'tests/e2e/e2e-waivers.json');

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

let policy;

try {
  policy = JSON.parse(readFileSync(WAIVER_PATH, 'utf8'));
} catch (error) {
  fail(`could not read waiver policy at ${WAIVER_PATH}: ${error.message}`);
}

/* ---- 1. The waiver must carry a valid, short, unexpired date. ---- */

const expires = policy.expires;

if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
  fail(`waiver "expires" must be an ISO date (YYYY-MM-DD); got ${JSON.stringify(expires)}`);
}

const expiryMs = Date.parse(`${expires}T23:59:59Z`);

if (Number.isNaN(expiryMs)) {
  fail(`waiver "expires" is not a real date: ${expires}`);
}

const now = Date.now();
const MAX_WINDOW_DAYS = 30;
const daysLeft = Math.ceil((expiryMs - now) / 86_400_000);

if (expiryMs < now) {
  fail(`the E2E waiver expired on ${expires}. Fix the tests below or re-scope the waiver — it does not renew itself.`);
}

if (daysLeft > MAX_WINDOW_DAYS) {
  fail(`waiver window is ${daysLeft} days; the maximum is ${MAX_WINDOW_DAYS}. Shorten "expires".`);
}

/* ---- 2. Collect outcomes from the report. ---- */

const results = new Map();
const flaky = [];

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

for (const report of reports) {
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
  const appels = source.split(/\btest(?:\.describe)?\s*\(/u).slice(1);

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
      "correspond pas au nombre de tranches, ou des specs ont été ajoutés sans que la " +
      'matrice suive.',
  );
}

const failed = [...results.entries()].filter(([, status]) => status === 'failed').map(([key]) => key);
const waived = policy.waived ?? [];

/** Normalise a policy entry to the same basename-keyed shape as the report. */
function normaliseKey(key) {
  const [location, ...rest] = key.split(' › ');

  // Tolerate legacy `path:line:col` entries by dropping the position.
  return [basename(location.split(':')[0]), ...rest].join(' › ');
}

const waivedKeys = new Set(waived.map((entry) => normaliseKey(entry.test)));

/* ---- 3. Decide. ---- */

const unwaivedFailures = failed.filter((key) => !waivedKeys.has(key));

/*
 * A waiver must not outlive its problem, so a waived test that PASSES fails the
 * gate until it is removed. The exception is entries explicitly marked
 * `unstable: true` — those are waived *because* they flap, so a green run
 * proves nothing and must not itself break the build. Every unstable entry
 * still carries a reason and dies with the same expiry as the rest.
 */
const staleWaivers = waived
  .filter((entry) => !entry.unstable && results.get(normaliseKey(entry.test)) === 'passed')
  .map((entry) => entry.test);

const unknownWaivers = waived.filter((entry) => !results.has(normaliseKey(entry.test))).map((entry) => entry.test);

console.log(`E2E gate — waiver expires ${expires} (${daysLeft} day(s) left)`);
console.log(`  tests reported : ${results.size}`);
console.log(`  failing        : ${failed.length}`);
console.log(`  waived         : ${waived.length}`);
console.log(`  flaky (passed on retry): ${flaky.length}`);

if (flaky.length) {
  console.log('\n⚠ passed only after a retry — real instability, worth diagnosing:');
  flaky.forEach((key) => console.log(`    - ${key}`));
}

if (unknownWaivers.length) {
  console.log('\n⚠ waived entries that did not appear in this report (renamed or moved?):');
  unknownWaivers.forEach((key) => console.log(`    - ${key}`));
}

if (staleWaivers.length) {
  console.error('\n✖ these tests are waived but PASSED — remove them from tests/e2e/e2e-waivers.json:');
  staleWaivers.forEach((key) => console.error(`    - ${key}`));
}

if (unwaivedFailures.length) {
  console.error('\n✖ failing tests that are NOT waived:');
  unwaivedFailures.forEach((key) => console.error(`    - ${key}`));
}

if (staleWaivers.length || unwaivedFailures.length) {
  process.exit(1);
}

console.log(`\n✔ gate passes: ${failed.length} failure(s), all covered by the waiver expiring ${expires}.`);
