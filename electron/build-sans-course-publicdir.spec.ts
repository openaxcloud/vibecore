import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import mainConfig from './main/vite.config';
import preloadConfig from './preload/vite.config';

/*
 * BUG-CI-009 — `EBUSY: resource busy or locked, copyfile 'public\…' -> 'build\electron\…'`
 * sur le job « windows desktop build ».
 *
 * Les deux builds Vite (main, preload) émettent dans le MÊME dossier et tournent
 * EN MÊME TEMPS (`electron:build:deps` les lance par `concurrently`). Par défaut
 * Vite recopie `public/**` dans le dossier de sortie : deux copies simultanées
 * du même arbre, et Windows verrouille le fichier que le second écrivain veut
 * ouvrir. Linux et macOS laissent passer la course en silence — seul Windows
 * rougissait, et seulement en CI.
 *
 * Le remède est `publicDir: false` des deux côtés (rien sous build/electron ne
 * consomme ces ressources : le renderer les livre déjà dans build/client). Ce
 * test tient les trois prémisses ensemble : si l'une bouge, il le dit AVANT le
 * runner Windows, quinze minutes plus tôt.
 */
describe('BUG-CI-009 — les deux builds Electron ne recopient pas `public/` dans leur dossier commun', () => {
  const configs = { main: mainConfig, preload: preloadConfig } as const;

  it.each(Object.keys(configs) as Array<keyof typeof configs>)('%s : publicDir désactivé', (nom) => {
    expect(configs[nom].publicDir).toBe(false);
  });

  it.each(Object.keys(configs) as Array<keyof typeof configs>)(
    '%s : ne vide pas le dossier de sortie partagé (le voisin y écrit en même temps)',
    (nom) => {
      expect(configs[nom].build?.emptyOutDir).toBe(false);
    },
  );

  it('les deux builds partagent bien `build/electron` — la prémisse de la course', () => {
    const sortie = (config: typeof mainConfig) => {
      const output = config.build?.rollupOptions?.output;
      return Array.isArray(output) ? output[0]?.dir : output?.dir;
    };

    expect(sortie(mainConfig)).toBe('build/electron');
    expect(sortie(preloadConfig)).toBe('build/electron');
  });

  it('`electron:build:deps` les lance en parallèle — la seconde prémisse de la course', () => {
    const paquet = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(paquet.scripts['electron:build:deps']).toContain('concurrently');
    expect(paquet.scripts['electron:build:deps']).toContain('electron:build:main');
    expect(paquet.scripts['electron:build:deps']).toContain('electron:build:preload');
  });
});
