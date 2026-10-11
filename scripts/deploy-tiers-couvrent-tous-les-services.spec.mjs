/*
 * AUDX-173 — aucun service du chart ne doit être sans étage de construction.
 *
 * LE DÉFAUT, mesuré le 2026-09-07. L'image `admin` servie en production datait du
 * 2026-07-12 : **56 jours et 1 415 commits** de retard, pendant que les sept autres
 * étages avançaient à chaque poussée. Entre-temps `apps/admin/` avait reçu 9 commits,
 * +1 782 / -456 — dont la localisation française de la plateforme et trois correctifs
 * de contraste sur des libellés illisibles. La console d'administration tournait sur
 * du code de juillet, et RIEN ne le signalait : le déploiement réussissait à chaque
 * fois, puisque l'empreinte de l'admin était simplement reportée.
 *
 * DEUX MÉCANISMES, pas un — et c'est pourquoi ce fichier fait deux familles
 * d'assertions plutôt qu'une :
 *
 *   1. `apps/admin/` ne correspondait à AUCUN motif de détection. Un changement
 *      admin tombait dans le repli « aucun étage identifié → web+runtime ».
 *   2. La table des services déclarait `admin:admin:none:true:false` : étage `none`,
 *      non roulé. Même en forçant la construction, rien ne l'aurait déployée.
 *
 * Corriger l'un sans l'autre ne donne rien. Les deux sont tenus ici.
 *
 * ET LA RÈGLE, pas la première occurrence. Le troisième groupe d'assertions refuse
 * qu'un service du chart ait un étage `none`, et exige que tout étage nommé dans la
 * table ait une étape de construction qui l'invoque. C'est ce qui empêche le PROCHAIN
 * étage de tomber en silence — parce que le vrai défaut n'est pas « admin a été
 * oublié », c'est « rien ne remarque un oubli ».
 *
 * Signe qui aurait dû alerter : `d839c4f65` (2026-08-18) a réparé la
 * constructibilité de l'étage admin — « `app/` manquait au contexte Docker ». Le
 * correctif était juste et n'a rien changé, parce que personne ne construisait cette
 * image. Un correctif sur un chemin que personne n'emprunte.
 *
 * Lancer : pnpm vitest --run scripts/deploy-tiers-couvrent-tous-les-services.spec.mjs
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github/workflows/deploy-main.yml');

const workflow = parseYaml(readFileSync(WORKFLOW_PATH, 'utf8'));
const steps = workflow.jobs['build-and-deploy'].steps;
const stepByName = (nom) => steps.find((s) => s.name === nom);

const DETECTION = stepByName('Detect changed tiers');

/**
 * Exécute le VRAI shell de l'étape de détection sur un dépôt jetable.
 *
 * Pas une paraphrase : le `run:` est lu dans le YAML livré. Modifier l'étape
 * déplace ces tests avec elle, ou les fait rougir.
 *
 * @param {string[]} fichiersModifies chemins touchés par le commit de tête
 * @returns {Record<string,string>} les sorties écrites dans $GITHUB_OUTPUT
 */
function detecterLesEtages(fichiersModifies) {
  const dir = mkdtempSync(join(tmpdir(), 'audx173-tiers-'));

  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });

    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'garde@example.invalid');
    git('config', 'user.name', 'garde');
    writeFileSync(join(dir, 'socle.txt'), 'base\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');

    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();

    for (const chemin of fichiersModifies) {
      mkdirSync(join(dir, dirname(chemin)), { recursive: true });
      writeFileSync(join(dir, chemin), 'change\n');
    }

    git('add', '-A');
    git('commit', '-q', '-m', 'changement');

    /*
     * L'étape interroge `gh` pour retrouver le dernier déploiement RÉUSSI, seule
     * base fiable. On lui rend le premier commit : la fenêtre de comparaison est
     * donc exactement celle du vrai chemin, pas un repli.
     */
    const faux = join(dir, 'faux');
    mkdirSync(faux, { recursive: true });
    writeFileSync(join(faux, 'gh'), `#!/bin/sh\necho ${base}\n`);
    chmodSync(join(faux, 'gh'), 0o755);

    const sortie = join(dir, 'sorties.env');
    writeFileSync(sortie, '');

    execFileSync('bash', ['-c', DETECTION.run], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${faux}:${process.env.PATH}`,
        GITHUB_OUTPUT: sortie,
        GITHUB_REPOSITORY: 'openaxcloud/vibecore',
        BEFORE_SHA: base,
        FORCE_TIERS: '',
        GH_TOKEN: 'jeton-factice',
      },
      stdio: 'pipe',
    });

    return Object.fromEntries(
      readFileSync(sortie, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((ligne) => {
          const i = ligne.indexOf('=');
          return [ligne.slice(0, i), ligne.slice(i + 1)];
        }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** La table `SERVICES=...` de l'étape qui résout les empreintes, telle qu'elle est livrée. */
function tableDesServices() {
  const etape = steps.find((s) => typeof s.run === 'string' && s.run.includes('SERVICES="'));
  const brut = etape.run.match(/SERVICES="([^"]+)"/)[1];

  return brut.split(/\s+/).map((entree) => {
    const [cle, image, etage, serviceDuChart, roule] = entree.split(':');
    return { cle, image, etage, serviceDuChart: serviceDuChart === 'true', roule: roule === 'true' };
  });
}

describe('AUDX-173 — mécanisme 1 : la détection reconnaît le chemin de l’admin', () => {
  it('un changement dans apps/admin/ déclenche l’étage admin', () => {
    const sorties = detecterLesEtages(['apps/admin/src/routes/index.tsx']);

    expect(sorties.admin).toBe('true');
  });

  it('TÉMOIN — la sonde sait distinguer, elle ne rend pas « true » partout', () => {
    /*
     * Sans ce témoin, un `admin=true` inconditionnel passerait le test précédent.
     * Un changement purement runtime ne doit PAS reconstruire l'admin.
     */
    const sorties = detecterLesEtages(['services/api/src/app.ts']);

    expect(sorties.runtime).toBe('true');
    expect(sorties.admin).toBe('false');
  });

  it('les étages voisins ne sont pas emportés par le changement admin', () => {
    const sorties = detecterLesEtages(['apps/admin/src/routes/index.tsx']);

    expect(sorties.web).toBe('false');
    expect(sorties.runtime).toBe('false');
  });

  it('une entrée partagée reconstruit TOUT, admin compris', () => {
    const sorties = detecterLesEtages(['packages/billing/src/index.ts']);

    for (const etage of ['runtime', 'web', 'wsagent', 'admin']) {
      expect(sorties[etage]).toBe('true');
    }
  });
});

describe('AUDX-173 — mécanisme 2 : la table déploie ce qui est construit', () => {
  it('l’admin a un étage et elle est roulée', () => {
    const admin = tableDesServices().find((s) => s.cle === 'admin');

    expect(admin.etage).toBe('admin');
    expect(admin.roule).toBe(true);
  });
});

describe('AUDX-173 — la règle, pas la première occurrence', () => {
  it('AUCUN service du chart n’a d’étage « none »', () => {
    /*
     * L'assertion qui vaut pour le prochain. `admin:admin:none:true:false` était
     * une déclaration explicite : « ce service est dans le chart, et rien ne le
     * construit ». Elle a tenu 56 jours sans que personne la lise.
     */
    const orphelins = tableDesServices().filter((s) => s.serviceDuChart && s.etage === 'none');

    expect(orphelins.map((s) => s.cle)).toEqual([]);
  });

  it('tout étage nommé dans la table a une étape de construction gardée par SA sortie', () => {
    const etages = [...new Set(tableDesServices().map((s) => s.etage))].filter((e) => e !== 'none');

    for (const etage of etages) {
      /*
       * L'invariant est le CHAÎNAGE, pas un nom de fichier : une étape qui soumet
       * une construction et qui est gardée par la sortie de CET étage. `cloudbuild.yaml`
       * savait construire l'admin et n'était invoqué par personne — un fichier qui
       * existe ne construit rien, et un nom de fichier ne prouve pas qu'on l'appelle.
       *
       * Volontairement indépendant du nom du fichier de configuration : l'étage
       * `wsagent` est servi par `workspace-agent.yaml`, et une assertion sur le nom
       * l'aurait déclaré orphelin à tort. Un garde qui refuse le bon est aussi
       * mauvais qu'un garde qui laisse passer le mauvais.
       */
      const etape = steps.find(
        (s) =>
          typeof s.run === 'string' &&
          s.run.includes('gcloud builds submit') &&
          typeof s.if === 'string' &&
          s.if.includes(`steps.tiers.outputs.${etage}`),
      );

      expect(etape, `l'étage ${etage} n'a aucune étape de construction gardée par sa sortie`).toBeTruthy();
      expect(etape.run, `l'étape de l'étage ${etage} n'invoque aucune configuration Cloud Build`).toMatch(
        /--config=infra\/cloudbuild\/[^\s]+\.yaml/,
      );
    }
  });

  it('chaque étage construit expose une sortie que la table sait lire', () => {
    const etages = [...new Set(tableDesServices().map((s) => s.etage))].filter((e) => e !== 'none');
    const shell = steps.map((s) => (typeof s.run === 'string' ? s.run : '')).join('\n');

    for (const etage of etages) {
      expect(shell, `aucune sortie « ${etage}= » écrite par la détection`).toContain(`${etage}=`);
      expect(shell, `la table n'aiguille pas l'étage ${etage}`).toMatch(new RegExp(`${etage}\\)\\s+rebuilt=`));
    }
  });
});
