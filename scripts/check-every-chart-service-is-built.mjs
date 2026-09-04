/**
 * AUDX-173 — tout service de chart activé doit être CONSTRUIT par un tier de la
 * chaîne de livraison continue.
 *
 * L'image `admin` ne l'était par aucun des deux fichiers que la CD exécute
 * (`infra/cloudbuild/runtime-tier.yaml`, `infra/cloudbuild/single-web.yaml`).
 * Elle n'existait que dans le `cloudbuild.yaml` racine, réservé aux builds
 * manuels. Et côté déploiement sa ligne portait `tier=none`, donc `rebuilt=false`
 * à chaque run, donc le digest DÉJÀ en production était repris tel quel.
 *
 * Résultat mesuré : 32 commits touchant `apps/admin/` en six mois, aucun livré —
 * et aucun correctif de sécurité non plus, sur un service `enabled: true`,
 * `replicas: 2`, exposé sur `/admin`.
 *
 * Le trou était INVISIBLE parce que chaque moitié semblait cohérente : le build
 * manuel construisait bien l'admin, et le déploiement « épinglait » bien un
 * digest. Personne ne joignait les deux bouts. Ce garde les joint.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

/** Fichiers Cloud Build que la CD exécute réellement (pas le cloudbuild.yaml racine). */
const TIER_FILES = ['infra/cloudbuild/runtime-tier.yaml', 'infra/cloudbuild/single-web.yaml'];

const WORKFLOW = '.github/workflows/deploy-main.yml';
const VALUES_PROD = 'infra/helm/platform/values-prod.yaml';

function read(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

/** Noms d'images poussées par les tiers, depuis leur bloc `images:`. */
function imagesBuiltByTiers() {
  const built = new Set();

  for (const file of TIER_FILES) {
    const doc = parse(read(file));

    for (const image of doc?.images ?? []) {
      // `${_REGION}-docker.pkg.dev/${_PROJECT}/${_REPO}/<name>:<tag>`
      const match = /\/([a-z0-9-]+):\$\{_SHORT_SHA\}$/.exec(String(image));

      if (match) {
        built.add(match[1]);
      }
    }
  }

  return built;
}

/** Services de chart activés en production. */
function enabledChartServices() {
  const values = parse(read(VALUES_PROD));
  const services = values?.services ?? {};

  return Object.entries(services)
    .filter(([, config]) => config && config.enabled !== false)
    .map(([key, config]) => ({ key, image: config.image ?? key }));
}

/** La ligne SERVICES du workflow -> { key: {tier, rebuiltByATier} }. */
function deployServiceTiers() {
  const workflow = read(WORKFLOW);
  const match = /SERVICES="([^"]+)"/.exec(workflow);

  if (!match) {
    throw new Error('AUDX-173: ligne SERVICES introuvable dans le workflow — le garde passerait à vide');
  }

  const entries = {};

  for (const entry of match[1].trim().split(/\s+/)) {
    const [key, image, tier, chartService, rolled] = entry.split(':');
    entries[key] = { image, tier, chartService: chartService === 'true', rolled: rolled === 'true' };
  }

  return entries;
}

const built = imagesBuiltByTiers();
const enabled = enabledChartServices();
const deploy = deployServiceTiers();

if (built.size === 0 || enabled.length === 0 || Object.keys(deploy).length === 0) {
  throw new Error('AUDX-173: une des trois sources est vide — le garde passerait à vide');
}

const problems = [];

for (const service of enabled) {
  const entry = deploy[service.key];

  if (!entry) {
    problems.push(`${service.key} est activé dans values-prod mais absent de la ligne SERVICES du workflow`);
    continue;
  }

  if (!built.has(service.image)) {
    problems.push(
      `${service.key} (image « ${service.image} ») est activé en production mais AUCUN tier ne le construit ` +
        `(${TIER_FILES.join(', ')}) — il ne recevra jamais de correctif`,
    );
  }

  /*
   * `tier=none` est la seconde moitié du même trou : même construite, l'image
   * ne serait pas déployée, puisque `rebuilt=false` fait reprendre le digest
   * déjà en production.
   */
  if (entry.tier === 'none') {
    problems.push(`${service.key} porte tier=none : son digest serait repris de la production à chaque run`);
  }
}

for (const service of enabled) {
  console.log(
    `  ${built.has(service.image) ? '✓' : '✗'} ${service.key.padEnd(20)} image=${String(service.image).padEnd(20)} tier=${deploy[service.key]?.tier ?? '(absent)'}`,
  );
}

if (problems.length > 0) {
  console.error('\nAUDX-173 — des services activés ne sont pas construits par la chaîne de livraison :\n');

  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }

  console.error(
    '\nUn service activé mais jamais reconstruit tourne indéfiniment sur son image\n' +
      "d'origine : aucun correctif de sécurité ne l'atteint.\n",
  );
  process.exit(1);
}

console.log(`\ntous les services activés (${enabled.length}) sont construits par un tier`);
