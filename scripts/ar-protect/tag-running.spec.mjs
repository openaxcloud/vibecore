/*
 * Deux mécanismes, deux tests — et le test porte sur le SCRIPT RÉELLEMENT
 * APPELÉ par le workflow, pas sur une copie de sa logique.
 *
 * Un troisième test épingle le site d'appel : le workflow doit invoquer ce
 * script. Sans lui, remettre la boucle en ligne dans le YAML ferait revenir
 * les deux défauts avec tous les tests au vert.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ICI = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT = join(ICI, 'tag-running.sh');
const REPO = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers';

/**
 * Lance le script avec un faux tagueur qui journalise ses arguments et échoue
 * pour les images nommées dans `echouePour`.
 */
function lancer(images, { echouePour = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ar-protect-'));
  const journal = join(dir, 'appels.txt');
  const faux = join(dir, 'faux-tagueur.sh');

  writeFileSync(
    faux,
    [
      '#!/usr/bin/env bash',
      `echo "$1 -> $2" >> ${JSON.stringify(journal)}`,
      ...echouePour.map((motif) => `case "$1" in *${motif}*) exit 1 ;; esac`),
      'exit 0',
    ].join('\n'),
  );
  chmodSync(faux, 0o755);
  writeFileSync(journal, '');

  let code = 0;
  let sortie = '';

  try {
    sortie = execFileSync('bash', [SCRIPT], {
      input: images.join('\n') + '\n',
      env: { ...process.env, REPO_CONTAINERS: REPO, AR_TAGGER: faux },
      encoding: 'utf8',
    });
  } catch (e) {
    code = e.status ?? 1;
    sortie = String(e.stdout ?? '');
  }

  const appels = readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean);

  return { code, sortie, appels };
}

describe('tag-running.sh — protection des images en service', () => {
  it('1. dérive le paquet d’une référence par DIGEST (le défaut du 29/08)', () => {
    const { code, appels } = lancer([`${REPO}/admin@sha256:475a1df04f698994fbc9184fcd35802480bbd1850df6208`]);

    expect(code).toBe(0);
    expect(appels).toHaveLength(1);

    /*
     * Avant : le paquet devenait `admin@sha256`, et gcloud refusait avec
     * « Image …/admin does not match image …/admin@sha256 ».
     */
    expect(appels[0]).toContain(`${REPO}/admin:running-admin`);
    expect(appels[0]).not.toContain('sha256:running');
    expect(appels[0]).not.toContain('running-admin@sha256');
  });

  it('1 bis. dérive aussi la forme par TAG, qui marchait déjà', () => {
    const { code, appels } = lancer([`${REPO}/api:17fe73df55`]);

    expect(code).toBe(0);
    expect(appels[0]).toContain(`${REPO}/api:running-api`);
  });

  it('2. une image en échec n’empêche PAS les suivantes d’être taguées', () => {
    const images = [
      `${REPO}/admin@sha256:aaaa`, // premier dans l'ordre alphabétique, celui qui échouait
      `${REPO}/ai-gateway@sha256:bbbb`,
      `${REPO}/api@sha256:cccc`,
      `${REPO}/web@sha256:dddd`,
    ];

    const { code, appels } = lancer(images, { echouePour: ['/admin@'] });

    /*
     * Ce qui tient ce mécanisme est la GARDE `if $TAGGER ...; then` du script,
     * pas l'absence de `set -e` : dans une condition `if`, `set -e` est
     * neutralisé de toute façon. Contre-épreuve correspondante : remplacer la
     * garde par un appel nu fait tomber ce test à un seul appel.
     */

    // Les trois suivantes DOIVENT avoir été tentées malgré l'échec du premier.
    expect(appels).toHaveLength(4);
    expect(appels.join('\n')).toContain('running-ai-gateway');
    expect(appels.join('\n')).toContain('running-api');
    expect(appels.join('\n')).toContain('running-web');

    // …et la panne reste visible : le script sort en échec.
    expect(code).not.toBe(0);
  });

  it('3. le workflow appelle bien ce script (site d’appel)', () => {
    const wf = readFileSync(join(ICI, '..', '..', '.github', 'workflows', 'ar-protect-images.yml'), 'utf8');

    /*
     * Les COMMENTAIRES sont retirés avant l'assertion. Sans cela le test
     * trouvait le nom du script dans le commentaire qui le précède et restait
     * vert alors que le workflow ne l'appelait plus — vérifié par
     * contre-épreuve : il épinglait un commentaire, pas le site d'appel.
     */
    const sansCommentaires = wf
      .split('\n')
      .filter((ligne) => !/^\s*#/.test(ligne))
      .join('\n');

    expect(sansCommentaires).toMatch(/\|\s*scripts\/ar-protect\/tag-running\.sh/);

    // La boucle en ligne, celle qui portait les deux défauts, ne doit plus exister.
    expect(sansCommentaires).not.toContain('running-$pkg" --quiet');
  });
});
