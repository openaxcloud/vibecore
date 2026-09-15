import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { lireUrlDEnvironnement, normaliserUrlDEnvironnement } from './env-url.js';

/*
 * BUG-REDIS-URL-GUILLEMETS-001.
 *
 * Le fait mesuré, avec `ioredis` réel, le 2026-09-10 :
 *
 *     new Redis('redis://127.0.0.1:56379')    -> host=127.0.0.1   port=56379
 *     new Redis('"redis://127.0.0.1:56379"')  -> host="localhost" port=6379
 *
 * Une URL citée n'échoue pas : elle est REMPLACÉE par un défaut plausible. Le
 * port configuré disparaît. C'est ce qui rend le défaut si difficile à voir —
 * les journaux montrent `localhost:6379`, exactement ce qu'on lirait si la
 * variable n'était pas posée du tout.
 */

describe('une URL citée est réparée', () => {
  it('retire une paire de guillemets doubles, et le DIT', () => {
    expect(normaliserUrlDEnvironnement('"redis://h:6379"')).toEqual({
      valeur: 'redis://h:6379',
      guillemetsRetires: true,
    });
  });

  it('retire aussi une paire de guillemets simples', () => {
    expect(normaliserUrlDEnvironnement("'redis://h:6379'")).toEqual({
      valeur: 'redis://h:6379',
      guillemetsRetires: true,
    });
  });

  it('laisse intacte une valeur saine — et ne prétend pas avoir réparé', () => {
    expect(normaliserUrlDEnvironnement('redis://h:6379')).toEqual({
      valeur: 'redis://h:6379',
      guillemetsRetires: false,
    });
  });

  it('rend `undefined` sur absent, vide, ou blanc — l’appelant retombe sur son défaut', () => {
    for (const entree of [undefined, null, '', '   ']) {
      expect(normaliserUrlDEnvironnement(entree)).toEqual({ guillemetsRetires: false });
    }
  });

  it('une paire de guillemets VIDE ne devient pas une URL vide', () => {
    expect(normaliserUrlDEnvironnement('""')).toEqual({ guillemetsRetires: true });
  });
});

describe('ce qu’on NE touche pas', () => {
  /*
   * Un seul guillemet n'est pas le défaut mesuré, et on ne devine pas
   * l'intention : retirer un guillemet orphelin fabriquerait une URL que
   * personne n'a écrite.
   */
  it('un guillemet orphelin est laissé tel quel', () => {
    expect(normaliserUrlDEnvironnement('"redis://h:6379')).toEqual({
      valeur: '"redis://h:6379',
      guillemetsRetires: false,
    });
    expect(normaliserUrlDEnvironnement('redis://h:6379"')).toEqual({
      valeur: 'redis://h:6379"',
      guillemetsRetires: false,
    });
  });

  it('des guillemets À L’INTÉRIEUR ne sont pas touchés', () => {
    expect(normaliserUrlDEnvironnement('redis://user:pa"ss@h:6379').valeur).toBe('redis://user:pa"ss@h:6379');
  });

  it('une paire dépareillée n’est pas une paire', () => {
    expect(normaliserUrlDEnvironnement('"redis://h:6379\'')).toEqual({
      valeur: '"redis://h:6379\'',
      guillemetsRetires: false,
    });
  });
});

describe('l’avertissement dit le NOM, jamais la valeur', () => {
  it('signale la réparation en ne nommant que la variable', () => {
    const vu: string[] = [];

    const url = lireUrlDEnvironnement('REDIS_URL', { REDIS_URL: '"redis://user:motdepasse@h:6379"' }, (nom) =>
      vu.push(nom),
    );

    expect(url).toBe('redis://user:motdepasse@h:6379');

    /*
     * On vérifie l'ABSENCE du secret dans ce qui a été signalé : c'est la seule
     * assertion qui ne fasse pas fuir ce qu'elle mesure (règle 12).
     */
    expect(vu).toEqual(['REDIS_URL']);
    expect(vu.join(' ')).not.toContain('motdepasse');
  });

  it('ne signale RIEN quand il n’y avait rien à réparer', () => {
    const onAvertissement = vi.fn();
    const url = lireUrlDEnvironnement('REDIS_URL', { REDIS_URL: 'redis://h:6379' }, onAvertissement);

    expect(url).toBe('redis://h:6379');
    expect(onAvertissement).not.toHaveBeenCalled();
  });

  it('ne signale rien non plus quand la variable est absente', () => {
    const onAvertissement = vi.fn();

    expect(lireUrlDEnvironnement('REDIS_URL', {}, onAvertissement)).toBeUndefined();
    expect(onAvertissement).not.toHaveBeenCalled();
  });
});

/*
 * LA RÈGLE, PAS L'OCCURRENCE (règle 7).
 *
 * Corriger les six lectures d'aujourd'hui ne protège de rien si la septième
 * s'écrit demain en `process.env.REDIS_URL`. Ce bloc lit la SOURCE et refuse
 * toute lecture nue.
 *
 * Il lit commentaires retirés : la prose de ces fichiers cite
 * `process.env.REDIS_URL` pour expliquer le défaut, et sans cela le test
 * échouerait sur son propre texte (règle 5).
 */
describe('aucune lecture NUE d’une URL de connexion dans services/api', () => {
  const FICHIERS = ['src/app.ts', 'src/deploy-queue.ts'];

  const sansCommentaires = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  const sources = FICHIERS.map((chemin) => ({
    chemin,
    code: sansCommentaires(readFileSync(join(process.cwd(), chemin), 'utf8')),
  }));

  it('les fichiers ont bien été lus — sinon ce bloc ne mesure rien', () => {
    // Contrôle positif (règle 14) : un « zéro lecture nue » sur un fichier vide ne vaut rien.
    for (const { chemin, code } of sources) {
      expect(code.length, chemin).toBeGreaterThan(2000);
      expect(code, chemin).toContain('lireUrlDEnvironnement');
    }
  });

  it('passent toutes par `lireUrlDEnvironnement`', () => {
    const fautives = sources.flatMap(({ chemin, code }) =>
      [...code.matchAll(/process\.env\.REDIS_URL/g)].map((m) => `${chemin}:${m.index}`),
    );

    expect(fautives).toEqual([]);
  });
});
