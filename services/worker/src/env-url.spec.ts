import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lireUrlDEnvironnement, normaliserUrlDEnvironnement, reinitialiserAvertissementsUrlCitee } from './env-url.js';

/*
 * BUG-REDIS-URL-GUILLEMETS-001, côté worker.
 *
 * Le défaut y mord deux fois, et la seconde est la plus traître :
 * `startWorkers` écrivait `process.env.REDIS_URL ?? 'redis://localhost:6379'`.
 * Une valeur CITÉE n'est pas nulle — elle passe le `??` — puis `ioredis` la
 * jette et part sur `localhost:6379` de son côté. Les deux replis donnant la
 * même adresse, rien ne distinguait « mal configuré » de « configuré en local ».
 */

describe('normalisation, côté worker', () => {
  it('retire une paire de guillemets, et le dit', () => {
    expect(normaliserUrlDEnvironnement('"redis://h:6379"')).toEqual({
      valeur: 'redis://h:6379',
      guillemetsRetires: true,
    });
  });

  it('laisse une valeur saine intacte', () => {
    expect(normaliserUrlDEnvironnement('redis://h:6379')).toEqual({
      valeur: 'redis://h:6379',
      guillemetsRetires: false,
    });
  });

  it('ne touche pas un guillemet orphelin — on ne devine pas l’intention', () => {
    expect(normaliserUrlDEnvironnement('"redis://h:6379').guillemetsRetires).toBe(false);
  });

  it('rend `undefined` sur absent ou vide, pour que le repli de l’appelant joue', () => {
    expect(normaliserUrlDEnvironnement(undefined).valeur).toBeUndefined();
    expect(normaliserUrlDEnvironnement('  ').valeur).toBeUndefined();
    expect(normaliserUrlDEnvironnement('""').valeur).toBeUndefined();
  });
});

describe('l’avertissement ne fait pas fuir ce qu’il signale', () => {
  it('ne nomme que la variable, jamais le mot de passe qu’elle porte', () => {
    reinitialiserAvertissementsUrlCitee();

    const vus: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void vus.push(args.join(' '));

    try {
      const url = lireUrlDEnvironnement('REDIS_URL', { REDIS_URL: '"redis://user:motdepasse@h:6379"' });
      expect(url).toBe('redis://user:motdepasse@h:6379');
    } finally {
      console.warn = original;
    }

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('REDIS_URL');

    // Vérifié par l'ABSENCE : la seule assertion qui ne fasse pas fuir sa mesure (règle 12).
    expect(vus[0]).not.toContain('motdepasse');
  });

  it('ne répète pas l’avertissement — un journal qui se répète finit ignoré', () => {
    reinitialiserAvertissementsUrlCitee();

    const vus: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void vus.push(args.join(' '));

    try {
      lireUrlDEnvironnement('REDIS_URL', { REDIS_URL: '"redis://h:1"' });
      lireUrlDEnvironnement('REDIS_URL', { REDIS_URL: '"redis://h:1"' });
      lireUrlDEnvironnement('REDIS_URL', { REDIS_URL: '"redis://h:1"' });
    } finally {
      console.warn = original;
    }

    expect(vus).toHaveLength(1);
  });
});

/*
 * LA RÈGLE, PAS L'OCCURRENCE (règle 7). Lu commentaires retirés : la prose de
 * ces fichiers cite `process.env.REDIS_URL` pour expliquer le défaut (règle 5).
 */
describe('aucune lecture NUE dans services/worker', () => {
  const FICHIERS = ['src/index.ts', 'src/enqueue-cli.ts'];

  const sources = FICHIERS.map((chemin) => ({
    chemin,
    code: readFileSync(join(process.cwd(), chemin), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, ''),
  }));

  it('les fichiers ont bien été lus — sinon ce bloc ne mesure rien', () => {
    for (const { chemin, code } of sources) {
      expect(code.length, chemin).toBeGreaterThan(500);
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
