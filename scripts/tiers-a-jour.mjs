#!/usr/bin/env node
/**
 * CHAQUE SERVICE TOURNE-T-IL SUR LE DERNIER COMMIT QUI A TOUCHÉ SON PROPRE CODE ?
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
 */
import { execSync } from 'node:child_process';

/*
 * La carte tier → chemins, recopiée de `Detect changed tiers` dans
 * .github/workflows/deploy-main.yml. `scripts/tiers-a-jour.spec.mjs` rougit si
 * les deux divergent — une carte recopiée qui dérive silencieusement est pire
 * que pas de carte du tout.
 */
export const CHEMINS_PAR_TIER = {
  web: ['app/', 'electron/', 'vite.config', 'uno.config', 'tsconfig', 'infra/cloudbuild/single-web.yaml'],
  runtime: ['services/api/', 'services/workspace-manager/', 'services/preview-proxy/', 'services/ai-gateway/', 'services/worker/', 'infra/cloudbuild/runtime-tier.yaml'],
  wsagent: ['services/workspace-agent/', 'infra/cloudbuild/workspace-agent.yaml'],
  admin: ['apps/admin/', 'infra/cloudbuild/admin-tier.yaml'],
};

/** Les services Helm qui vivent dans chaque tier. */
export const SERVICES_PAR_TIER = {
  web: ['web'],
  runtime: ['api', 'workspaceManager', 'previewProxy', 'aiGateway', 'worker'],
  wsagent: [],
  admin: ['admin'],
};

export function dernierCommitDuTier(chemins, ref = 'origin/main') {
  const sortie = execSync(`git log -1 --format=%H ${ref} -- ${chemins.map((c) => `'${c}'`).join(' ')}`, {
    encoding: 'utf8',
  }).trim();

  return sortie || null;
}

export function estAncetre(commit, descendant) {
  try {
    execSync(`git merge-base --is-ancestor ${commit} ${descendant}`, { stdio: 'ignore' });
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
    execSync(`git cat-file -e ${sha}^{commit}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function tagsServis() {
  const brut = execSync(
    'helm -n vibecore get values vibecore --kube-context connectgateway_vibecore-495216_europe-west9_vibecore-prod-app -o json',
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );

  return JSON.parse(brut).services ?? {};
}

function principal() {
  const services = tagsServis();
  const lignes = [];
  let enRetard = 0;

  for (const [tier, chemins] of Object.entries(CHEMINS_PAR_TIER)) {
    const attendu = dernierCommitDuTier(chemins);

    if (!attendu) {
      continue;
    }

    for (const service of SERVICES_PAR_TIER[tier] ?? []) {
      const servi = services[service]?.imageTag;

      if (!servi) {
        continue;
      }

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
            "  Sans cet objet, la comparaison rendrait « en retard » pour un service peut-être à jour.",
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

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(lignes, null, 2));
  } else {
    for (const l of lignes) {
      console.log(`  ${l.aJour ? '✔' : '✖'} ${l.service.padEnd(18)} sert ${l.servi}   dernier commit du tier ${l.tier} : ${l.attendu}`);
    }
    console.log(
      enRetard === 0
        ? '\n✔ chaque service tourne sur le dernier commit qui a touché son propre code.'
        : `\n✖ ${enRetard} service(s) en retard SUR LEUR PROPRE code — ce n'est pas un écart de tags normal.`,
    );
  }

  process.exit(enRetard === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal();
}
