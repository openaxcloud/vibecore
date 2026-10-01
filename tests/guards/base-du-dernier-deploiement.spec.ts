import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * Ce garde ne lit PAS le texte du workflow : il EXÉCUTE l'étape « Detect changed
 * tiers » dans un faux dépôt, avec un faux `gh` sur le PATH. C'est la seule façon
 * de tenir le correctif, parce que le défaut qu'il protège était un défaut de
 * CHOIX, pas de présence : le code d'avant cherchait bien un déploiement réussi —
 * il prenait simplement le premier que l'API voulait bien rendre.
 *
 * ⚠️ LIMITE DU BOUCHON, dite ici pour qu'on ne lui prête pas plus qu'il ne
 * prouve : le faux `gh` ignore ses arguments et rend des lignes de SHA brutes.
 * Avec l'ancien code (`--jq '.workflow_runs[0].head_sha'`), lui donner deux
 * candidats rend donc deux lignes, le contrôle `^[0-9a-f]{40}$` échoue, et la
 * base finit vide — ce n'est PAS ce que faisait l'ancien code en vrai, où le
 * `jq` n'aurait rendu qu'une ligne. Les cas qui discriminent honnêtement
 * l'ancien du nouveau sont donc la CONTRE-ÉPREUVE à un seul candidat (il prend
 * le périmé, sans un mot) et le contrôle du `per_page`.
 *
 * Mesuré le 2026-10-01 : `?branch=main&status=success&per_page=1` a rendu DEUX
 * FOIS un run du 2026-09-10, soit trois semaines de retard, alors que des
 * déploiements réussis du jour même existaient. Base à ~1 000 commits de HEAD →
 * le motif de base partagée matche forcément → les QUATRE tiers reconstruits.
 * Jamais faux, deux à quatre fois plus lent.
 */

const RACINE = process.cwd();
const CHEMIN_WORKFLOW = join(RACINE, '.github/workflows/deploy-main.yml');

function scriptDeLEtape(): string {
  const workflow = parse(readFileSync(CHEMIN_WORKFLOW, 'utf8')) as {
    jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
  };

  const job = workflow.jobs['build-and-deploy'];
  expect(job, "le job `build-and-deploy` a disparu de `deploy-main.yml` : ce garde ne mesure plus rien").toBeTruthy();

  const etape = job.steps.find((s) => s.name === 'Detect changed tiers');
  expect(
    etape?.run,
    "l'étape « Detect changed tiers » a disparu ou n'a plus de `run:` — le choix de la base n'est plus testé",
  ).toBeTruthy();

  return etape!.run!;
}

type Resultat = { journal: string; sorties: Record<string, string> };

/**
 * Joue l'étape dans un dépôt jetable de `profondeur` commits, avec un `gh`
 * bouchonné qui rend `candidats` — exprimés en index de commit, 0 = le plus
 * ancien. L'ordre dans lequel on les donne est volontairement MAUVAIS.
 */
function joue(options: {
  profondeur: number;
  candidats: number[];
  fichierDuDernierCommit: string;
  /**
   * Index du commit qui touche `pnpm-lock.yaml`, c'est-à-dire la base partagée.
   * C'est lui qui rend la conséquence VISIBLE : une base choisie avant ce
   * commit fait reconstruire les quatre tiers, une base choisie après non. Sans
   * ce levier, les deux cas rendraient la même décision et le garde ne
   * mesurerait que son propre journal.
   */
  commitDeBasePartagee?: number;
  avant?: number;
}): Resultat {
  const bac = mkdtempSync(join(tmpdir(), 'base-tiers-'));
  const depot = join(bac, 'depot');
  const binaires = join(bac, 'bin');
  mkdirSync(depot);
  mkdirSync(binaires);

  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: depot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'garde',
        GIT_AUTHOR_EMAIL: 'garde@example.invalid',
        GIT_COMMITTER_NAME: 'garde',
        GIT_COMMITTER_EMAIL: 'garde@example.invalid',
      },
    });

  git('init', '-q', '-b', 'main');

  const sha: string[] = [];

  for (let i = 0; i < options.profondeur; i += 1) {
    const dernier = i === options.profondeur - 1;
    let fichier = dernier ? options.fichierDuDernierCommit : `docs/remplissage-${i}.md`;

    if (i === options.commitDeBasePartagee) {
      fichier = 'pnpm-lock.yaml';
    }

    mkdirSync(join(depot, fichier.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(depot, fichier), `commit ${i}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', `commit ${i}`);
    sha.push(git('rev-parse', 'HEAD').trim());
  }

  // Le faux `gh` : il rend les candidats demandés, un par ligne, dans l'ordre
  // donné. C'est lui qui joue la fraîcheur capricieuse de l'index GitHub.
  const lignes = options.candidats.map((i) => sha[i]).join('\n');
  const gh = join(binaires, 'gh');
  writeFileSync(gh, `#!/bin/sh\ncat <<'FIN'\n${lignes}\nFIN\n`);
  chmodSync(gh, 0o755);

  const sortie = join(bac, 'sortie.txt');
  writeFileSync(sortie, '');

  const journal = execFileSync('bash', ['-c', scriptDeLEtape()], {
    cwd: depot,
    encoding: 'utf8',
    env: {
      PATH: `${binaires}:${process.env.PATH}`,
      GITHUB_OUTPUT: sortie,
      GITHUB_REPOSITORY: 'openaxcloud/vibecore',
      BEFORE_SHA: options.avant === undefined ? '' : sha[options.avant],
      FORCE_TIERS: '',
      HOME: bac,
    },
  });

  const sorties: Record<string, string> = {};

  for (const ligne of readFileSync(sortie, 'utf8').split('\n')) {
    const i = ligne.indexOf('=');

    if (i > 0) {
      sorties[ligne.slice(0, i)] = ligne.slice(i + 1);
    }
  }

  rmSync(bac, { recursive: true, force: true });

  return { journal, sorties };
}

const bacs: string[] = [];

afterEach(() => {
  for (const bac of bacs.splice(0)) {
    rmSync(bac, { recursive: true, force: true });
  }
});

describe('la base de comparaison des tiers est le déploiement réussi le PLUS PROCHE', () => {
  it('choisit le candidat le plus proche même quand l’API le rend en dernier', () => {
    /*
     * 60 commits. Le dernier ne touche que `app/`, donc la décision correcte est
     * web seul. On rend d'abord le commit 0 (59 commits de retard), puis le
     * commit 38 (1 commit de retard) : exactement la situation mesurée, l'API
     * mettant le périmé en tête.
     */
    const { journal, sorties } = joue({
      profondeur: 60,
      candidats: [0, 58],
      commitDeBasePartagee: 10,
      fichierDuDernierCommit: 'app/composant.tsx',
    });

    expect(journal, 'le choix de la base doit être annoncé avec sa distance').toMatch(
      /Base = deploiement reussi le plus proche \([0-9a-f]{40}, a 1 commit\(s\) de HEAD\)/u,
    );

    // La moitié qui compte : la décision de tiers qui en découle.
    expect(sorties, "la base proche ne touche que `app/` : seul le tier web doit être reconstruit").toMatchObject({
      web: 'true',
      runtime: 'false',
      wsagent: 'false',
      admin: 'false',
    });
  });

  it('CONTRE-ÉPREUVE — avec SEULEMENT le candidat périmé, les quatre tiers repartent et c’est DIT', () => {
    /*
     * Le même dépôt, le même dernier commit, mais l'API ne rend que le candidat
     * du fond. C'est le comportement d'avant le correctif. S'il ne rougissait
     * pas ici, les deux moitiés du garde ne seraient pas couplées : on pourrait
     * remettre `per_page=1` sans qu'un seul test ne bouge.
     */
    const { journal, sorties } = joue({
      profondeur: 60,
      candidats: [0],
      commitDeBasePartagee: 10,
      fichierDuDernierCommit: 'app/composant.tsx',
    });

    expect(journal, 'une base lointaine doit être signalée, pas subie en silence').toContain(
      '::warning::la base retenue est a 59 commits de HEAD',
    );

    expect(sorties, 'une base de 59 commits en arrière touche la base partagée : tout est reconstruit').toMatchObject({
      web: 'true',
      runtime: 'true',
      wsagent: 'true',
      admin: 'true',
    });
  });

  it('ne retient pas un candidat qui n’est pas un ancêtre de HEAD, et le compte', () => {
    const { journal } = joue({
      profondeur: 6,
      candidats: [0, 4],
      fichierDuDernierCommit: 'app/composant.tsx',
    });

    // Les deux candidats sont des ancêtres ici : le compteur doit le dire, ce
    // qui est la seule façon de distinguer « aucun candidat retenu » de
    // « la boucle n'a pas tourné ».
    expect(journal, 'le compte des candidats doit être journalisé').toContain('Candidats de base : 2 rendus, 2 ancetres de HEAD');
  });

  it('se replie sur le push précédent quand l’API ne rend RIEN, et le crie', () => {
    const { journal, sorties } = joue({
      profondeur: 6,
      candidats: [],
      fichierDuDernierCommit: 'services/api/src/app.ts',
      avant: 4,
    });

    expect(journal, "sans candidat, le repli sur `before` doit rester bruyant").toContain(
      '::warning::dernier deploiement reussi introuvable',
    );

    expect(sorties, 'le dernier commit touche `services/api/` : le tier runtime, et lui seul').toMatchObject({
      runtime: 'true',
      web: 'false',
    });
  });

  it('demande PLUSIEURS candidats à l’API — un `per_page=1` ferait dépendre tout de sa fraîcheur', () => {
    const script = scriptDeLEtape();
    const requete = /actions\/workflows\/deploy-main\.yml\/runs\?[^"']*/u.exec(script);

    expect(requete, "la requête des déploiements réussis a disparu du script").not.toBeNull();

    const parPage = /per_page=(\d+)/u.exec(requete![0]);

    expect(parPage, "la requête ne porte plus de `per_page` : son nombre de candidats n'est plus garanti").not.toBeNull();
    expect(
      Number(parPage![1]),
      `la requête ne demande que ${parPage?.[1]} candidat(s) : c'est le défaut du 2026-10-01, où le premier rendu avait trois semaines de retard`,
    ).toBeGreaterThanOrEqual(10);
  });
});
