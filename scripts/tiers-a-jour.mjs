#!/usr/bin/env node
/**
 * LES RÉFÉRENCES SOURCES CONFIGURÉES INCLUENT-ELLES LE DERNIER CODE DE LEUR TIER ?
 *
 * Le déploiement ne reconstruit QUE les tiers modifiés — c'est voulu et économe.
 * Conséquence : les services portent normalement des tags DIFFÉRENTS, et
 * comparer les tags entre eux ne veut rien dire. J'ai fait cette erreur le
 * 2026-09-30 en signalant `admin` comme « en retard » ; après mesure, zéro
 * commit n'avait touché `apps/admin/` — son retard était parfaitement légitime.
 *
 * Mais le fait demeure : **si ce retard avait été illégitime, rien ne l'aurait
 * signalé non plus.** L'absence d'alerte ne distinguait pas les deux cas. Ce
 * script fait cette distinction, et elle seule.
 *
 * Usage : node scripts/tiers-a-jour.mjs
 *         node scripts/tiers-a-jour.mjs --json
 *         node scripts/tiers-a-jour.mjs --configured-only --json
 *         node scripts/tiers-a-jour.mjs --release-run <successful-main-run-id>
 *
 * JSON migration: the old row array is now object.services; see docs/TIERS_A_JOUR.md.
 * This is NOT a running-pod verification. Default exit is 2 (runtime unverified).
 * --configured-only explicitly requests comparison exit codes 0/1.
 * Digest pins use a matching GitHub release artifact (gh authentication required).
 * Search at most ten successful deploy-main runs; --release-run may be repeated
 * to select at most ten exact runs. Conflicting source claims fail closed.
 * Older artifacts may prove unchanged images. No matching proof means
 * exit 2, never an inferred source SHA. main is fetched before every verdict.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * La carte tier → chemins, recopiée de `Detect changed tiers` dans
 * .github/workflows/deploy-main.yml. `scripts/tiers-a-jour.spec.mjs` rougit si
 * les deux divergent — une carte recopiée qui dérive silencieusement est pire
 * que pas de carte du tout.
 */
export const CHEMINS_PAR_TIER = {
  web: ['app/', 'electron/', 'vite.config', 'uno.config', 'tsconfig', 'infra/cloudbuild/single-web.yaml'],
  runtime: [
    'services/api/',
    'services/workspace-manager/',
    'services/preview-proxy/',
    'services/ai-gateway/',
    'services/worker/',
    'services/screenshotter/',
    'infra/cloudbuild/runtime-tier.yaml',
  ],
  wsagent: ['services/workspace-agent/', 'infra/cloudbuild/workspace-agent.yaml'],
  admin: ['apps/admin/', 'infra/cloudbuild/admin-tier.yaml'],
};

export const CHEMINS_PARTAGES = [
  'packages/',
  'pnpm-lock.yaml',
  'package.json',
  'pnpm-workspace.yaml',
  'Dockerfile',
  'infra/docker/',
  'infra/cloudbuild/cloudbuild.yaml',
  '.github/workflows/deploy-main.yml',
];

/** Les services Helm qui vivent dans chaque tier. */
export const SERVICES_PAR_TIER = {
  web: ['web'],
  runtime: ['api', 'workspaceManager', 'previewProxy', 'aiGateway', 'worker', 'screenshotter'],
  wsagent: [],
  admin: ['admin'],
};

export function dernierCommitDuTier(chemins, ref = 'origin/main') {
  const sortie = execFileSync(
    'git',
    ['log', '-1', '--format=%H', ref, '--', ...new Set([...CHEMINS_PARTAGES, ...chemins])],
    {
      encoding: 'utf8',
    },
  ).trim();

  return sortie || null;
}

export function estAncetre(commit, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, descendant], {
      stdio: 'ignore',
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    });
    return true;
  } catch {
    return false;
  }
}

/*
 * ⚠️ POURQUOI CETTE FONCTION EXISTE — `estAncetre` NE PEUT PAS DISTINGUER
 * « pas un ancêtre » de « commit inconnu ».
 *
 * `git merge-base --is-ancestor` sort en 1 dans le premier cas et en 128 dans
 * le second ; les deux passent par le même `catch`, qui rend `false`. Ma
 * première version se contentait d'entourer l'appel d'un `try/catch` en
 * pensant y attraper le SHA inconnu : cette branche était du CODE MORT, et un
 * tag servi absent du dépôt local rendait un « en retard » FAUX — exactement
 * le verdict que ce script existe pour ne jamais produire.
 *
 * Mesuré le 2026-09-30 : `estAncetre('HEAD', 'deadbeefdeadbeef')` ne jette
 * rien et rend `false`. Épinglé par scripts/tiers-a-jour.spec.mjs.
 */
export function commitConnu(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      stdio: 'ignore',
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    });
    return true;
  } catch {
    return false;
  }
}

function tagsServis() {
  const brut = execFileSync(
    'helm',
    [
      '-n',
      'vibecore',
      'get',
      'values',
      'vibecore',
      '--all',
      '--kube-context',
      'connectgateway_vibecore-495216_europe-west9_vibecore-prod-app',
      '-o',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );

  return JSON.parse(brut);
}

const REPOSITORY = 'openaxcloud/vibecore';

/** Refresh explicitly, rather than trusting a possibly months-old origin/main. */
export function actualiserMain() {
  execFileSync('git', ['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
    stdio: 'pipe',
  });
  const sha = execFileSync('git', ['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('main invérifiable : aucun verdict possible.');
  // Freeze this fetched snapshot even if another process updates origin/main later.
  return sha;
}

/** Only artifacts of successful production workflow runs on main are evidence. */
export function verifierRunRelease(run) {
  if (
    run?.repository?.full_name !== REPOSITORY ||
    run?.path !== '.github/workflows/deploy-main.yml' ||
    run?.head_branch !== 'main' ||
    run?.status !== 'completed' ||
    run?.conclusion !== 'success' ||
    !['push', 'workflow_dispatch'].includes(run?.event) ||
    !Number.isSafeInteger(run?.id) ||
    run.id <= 0
  )
    throw new Error('Run de livraison non fiable : aucun verdict possible.');
  return `https://github.com/${REPOSITORY}/actions/runs/${run.id}`;
}

export function sourceDuManifeste(service, image, manifest, run) {
  const runUrl = verifierRunRelease(run);
  const digest = /@(?<digest>sha256:[a-f0-9]{64})$/.exec(image)?.groups.digest;
  const entries = manifest?.services?.filter((s) => s.service === service) ?? [];
  const entry = entries[0];
  if (
    !digest ||
    manifest?.schemaVersion !== 1 ||
    manifest?.repository !== REPOSITORY ||
    manifest?.workflowRunUrl !== runUrl ||
    entries.length !== 1 ||
    image !== `${manifest.registry}/${entry.image}@${entry.digest}` ||
    entry.digest !== digest ||
    entry.provenanceKnown !== true ||
    entry.signature?.verified !== true ||
    !/^[a-f0-9]{40}$/.test(entry.sourceSha ?? '')
  )
    throw new Error(`Preuve ${service} absente ou incohérente : aucun verdict possible.`);
  return entry.sourceSha;
}

export function sourceAgentDuManifeste(image, manifest, run) {
  return sourceDuManifeste('workspaceAgent', image, manifest, run);
}

export const MAX_RELEASE_RUNS = 10;

/** Scan the entire bounded evidence set, never silently choose the first claim. */
export function sourceDesPreuves(service, image, preuves) {
  const evidence = Array.isArray(preuves) ? preuves : preuves ? [preuves] : [];
  if (!evidence.length || evidence.length > MAX_RELEASE_RUNS)
    throw new Error('Historique de livraison absent ou trop grand : aucun verdict possible.');
  const sources = new Set();
  const seen = new Set();
  for (const { manifest, run } of evidence) {
    const runUrl = verifierRunRelease(run);
    if (
      seen.has(run.id) ||
      manifest?.schemaVersion !== 1 ||
      manifest?.repository !== REPOSITORY ||
      manifest?.workflowRunUrl !== runUrl ||
      !Array.isArray(manifest?.services)
    )
      throw new Error('Historique de livraison incohérent : aucun verdict possible.');
    seen.add(run.id);
    const entries = manifest.services.filter((entry) => entry.service === service);
    if (entries.length > 1) throw new Error(`Preuve ${service} ambiguë : aucun verdict possible.`);
    const entry = entries[0];
    if (!entry || image !== `${manifest.registry}/${entry.image}@${entry.digest}`) continue;
    // A carried-forward provenance gap makes no source claim. Another trusted run
    // may establish it, but malformed or contradictory claims must not be hidden.
    if (entry.provenanceKnown === false && entry.sourceSha === null && entry.signature?.verified === true) continue;
    sources.add(sourceDuManifeste(service, image, manifest, run));
  }
  if (sources.size !== 1) throw new Error(`Source ${service} absente ou contradictoire : aucun verdict possible.`);
  return [...sources][0];
}

function preuveRelease(runId) {
  const api = (endpoint) => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
  const run = api(`repos/${REPOSITORY}/actions/runs/${runId}`);
  verifierRunRelease(run);
  if (String(run.id) !== runId) throw new Error('Identité du run incohérente : aucun verdict possible.');
  const dir = mkdtempSync(join(tmpdir(), 'vibecore-release-proof-'));
  try {
    execFileSync(
      'gh',
      ['run', 'download', runId, '--repo', REPOSITORY, '--pattern', 'release-manifest-*', '--dir', dir],
      { stdio: 'pipe' },
    );
    const files = readdirSync(dir, { recursive: true }).filter(
      (file) => file === 'release-manifest.json' || file.endsWith('/release-manifest.json'),
    );
    if (files.length !== 1) throw new Error('Manifeste ambigu ou absent : aucun verdict possible.');
    return { manifest: JSON.parse(readFileSync(join(dir, files[0]), 'utf8')), run };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function preuvesRelease(runIds) {
  if (runIds.length === 0) {
    const result = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          `repos/${REPOSITORY}/actions/workflows/deploy-main.yml/runs?branch=main&status=success&per_page=${MAX_RELEASE_RUNS}`,
        ],
        { encoding: 'utf8' },
      ),
    );
    if (!Array.isArray(result.workflow_runs)) throw new Error('Historique de livraison illisible.');
    runIds = result.workflow_runs.map((run) => String(run.id));
  }
  if (
    !runIds.length ||
    runIds.length > MAX_RELEASE_RUNS ||
    new Set(runIds).size !== runIds.length ||
    runIds.some((id) => !/^[1-9][0-9]*$/.test(id))
  )
    throw new Error('Historique de livraison absent, ambigu ou trop grand : aucun verdict possible.');
  // Deliberately read the full bounded set even once every image has a source:
  // a later artifact may contradict an earlier claim for the exact same digest.
  return runIds.map((id) => preuveRelease(id));
}

export function sondesRelease(release, preuve) {
  const sondes = [];
  for (const [tier, services] of Object.entries(SERVICES_PAR_TIER)) {
    for (const service of services) {
      const config = release?.services?.[service];
      // Match Helm's `default`: an empty per-service digest falls back to global.
      const digest = config?.imageDigest || release?.global?.imageDigest;
      if (digest) {
        if (!release?.global?.imageRegistry || !config?.image)
          throw new Error(`Image configurée incomplète pour ${service} : aucun verdict possible.`);
        const image = `${release?.global?.imageRegistry}/${config?.image}@${digest}`;
        const servi = sourceDesPreuves(service, image, preuve);
        sondes.push({ tier, service, servi });
        continue;
      }
      const servi = config?.imageTag || release?.global?.imageTag;
      if (!/^(?:sha-)?[a-f0-9]{7,40}$/.test(servi ?? ''))
        throw new Error(`Version absente ou illisible pour ${service} : aucun verdict possible.`);
      sondes.push({ tier, service, servi: servi.replace(/^sha-/, '') });
    }
  }
  const image = release?.platformEnv?.runtime?.workspaceAgentImage ?? '';
  if (/@sha256:[a-f0-9]{64}$/.test(image)) {
    const servi = sourceDesPreuves('workspaceAgent', image, preuve);
    sondes.push({ tier: 'wsagent', service: 'workspace-agent', servi });
    return sondes;
  }
  if (image.includes('@')) throw new Error('Digest workspace-agent illisible : aucun verdict possible.');
  const agent = /:(?:sha-)?([a-f0-9]{7,40})$/.exec(release?.platformEnv?.runtime?.workspaceAgentImage ?? '');
  if (!agent) throw new Error('Version workspace-agent absente ou sans SHA de code : aucun verdict possible.');
  sondes.push({ tier: 'wsagent', service: 'workspace-agent', servi: agent[1] });
  return sondes;
}

function principal() {
  const main = actualiserMain();
  const release = tagsServis();
  const runIds = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] !== '--release-run') continue;
    const id = process.argv[++i];
    if (!/^[1-9][0-9]*$/.test(id ?? '')) throw new Error('--release-run exige un identifiant numérique.');
    runIds.push(id);
  }
  const hasDigest =
    /@sha256:/.test(release?.platformEnv?.runtime?.workspaceAgentImage ?? '') ||
    Object.values(SERVICES_PAR_TIER)
      .flat()
      .some((service) => release?.services?.[service]?.imageDigest || release?.global?.imageDigest);
  const preuve = hasDigest ? preuvesRelease(runIds) : undefined;
  const sondes = sondesRelease(release, preuve);
  const lignes = [];
  let enRetard = 0;

  for (const [tier, chemins] of Object.entries(CHEMINS_PAR_TIER)) {
    const attendu = dernierCommitDuTier(chemins, main);

    if (!attendu) {
      continue;
    }

    for (const { service, servi } of sondes.filter((sonde) => sonde.tier === tier)) {
      /*
       * ⚠️ Le tag servi est un SHA court. `merge-base` le résout tant que
       * l'objet est connu localement : sans `git fetch` récent, on rendrait un
       * faux « en retard ». D'où l'échec bruyant plutôt qu'un verdict.
       *
       * Et ce contrôle se fait AVANT la comparaison, par `commitConnu` : un
       * `try/catch` autour de `estAncetre` n'attrape rien du tout (voir le
       * commentaire de `commitConnu`).
       */
      if (!commitConnu(servi)) {
        console.error(
          `✖ commit servi ${servi} inconnu localement — lancez 'git fetch origin' d'abord.\n` +
            '  Sans cet objet, la comparaison rendrait « en retard » pour un service peut-être à jour.',
        );
        process.exit(2);
      }

      const aJour = estAncetre(attendu, servi);

      lignes.push({ tier, service, servi, attendu: attendu.slice(0, 10), aJour });

      if (!aJour) {
        enRetard += 1;
      }
    }
  }

  if (lignes.length !== sondes.length)
    throw new Error('Au moins un tier n’a aucun commit de référence. Aucun verdict global possible.');

  const configuredOnly = process.argv.includes('--configured-only');
  const result = {
    scope: 'configured-source-references',
    runtimeVerification: 'not-performed',
    verdict: configuredOnly ? (enRetard === 0 ? 'configured-current' : 'configured-behind') : 'unverified',
    configuredSourcesCurrent: enRetard === 0,
    services: lignes,
  };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Références sources configurées uniquement — exécution réelle non vérifiée.');
    for (const l of lignes) {
      console.log(
        `  ${l.aJour ? '✔' : '✖'} ${l.service.padEnd(18)} référence ${l.servi}   dernier commit du tier ${l.tier} : ${l.attendu}`,
      );
    }
    console.log(
      enRetard === 0
        ? '\nLes références sources configurées incluent les derniers commits de leurs tiers.'
        : `\n${enRetard} référence(s) source configurée(s) en retard sur le code de leur tier.`,
    );
  }

  process.exit(configuredOnly ? (enRetard === 0 ? 0 : 1) : 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    principal();
  } catch {
    console.error(
      '✖ Sources ou référence main invérifiables : aucun verdict possible. Vérifiez git/helm/gh et la preuve de release.',
    );
    process.exitCode = 2;
  }
}
