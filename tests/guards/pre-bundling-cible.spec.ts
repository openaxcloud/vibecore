import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { transform } from 'esbuild';
import { loadConfigFromFile } from 'vite';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA0928-DEV-WEB-ESBUILD — `pnpm run dev:web` mourait sur toute installation
 * neuve depuis la montée d'esbuild à 0.27.7 (#569) :
 *
 *   ✘ [ERROR] Transforming destructuring to the configured target environment
 *     ("chrome87", "edge88", "es2020", "firefox78", "safari14" + 2 overrides) is not supported yet
 *     node_modules/…/vite-plugin-node-polyfills/shims/buffer/dist/index.cjs:269:7
 *
 * Mesuré le 2026-09-30 : `vite optimize --force` → 4 864 erreurs de ce type
 * avant ; 81 dépendances pré-bundlées, 0 erreur, après `esbuildOptions.target`.
 *
 * La CI ne pouvait pas le voir : elle teste l'image de production, jamais le
 * serveur de dev. Cette garde rejoue le pré-bundling du fichier qui plantait,
 * avec la cible RÉELLE de la configuration.
 */

/** Cible du pré-bundling de Vite 5 quand la configuration n'en donne pas (`ESBUILD_MODULES_TARGET`). */
const CIBLE_PAR_DEFAUT_DE_VITE = ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'];

const racine = join(dirname(new URL(import.meta.url).pathname), '..', '..');

function fichierQuiPlantait(): string {
  // Le paquet n'exporte pas son package.json : on suit le lien pnpm sous node_modules.
  return join(racine, 'node_modules', 'vite-plugin-node-polyfills', 'shims', 'buffer', 'dist', 'index.cjs');
}

describe('pré-bundling du serveur de dev', () => {
  it('la cible configurée sait transformer les dépendances que le serveur de dev pré-bundle', async () => {
    const charge = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      join(racine, 'vite.config.ts'),
      racine,
      'silent',
    );

    expect(charge, 'la configuration Vite se charge').toBeTruthy();

    const cible = charge!.config.optimizeDeps?.esbuildOptions?.target ?? CIBLE_PAR_DEFAUT_DE_VITE;
    const source = readFileSync(fichierQuiPlantait(), 'utf8');

    // Témoin : le fichier contient bien la déstructuration qui faisait échouer esbuild.
    expect(source).toMatch(/const \{ Uint8Array: GlobalUint8Array/);

    await expect(transform(source, { loader: 'js', format: 'esm', target: cible })).resolves.toBeTruthy();
  }, 120_000);

  it('témoin : la cible par défaut de Vite échoue bien sur ce fichier avec l’esbuild épinglé', async () => {
    const source = readFileSync(fichierQuiPlantait(), 'utf8');

    await expect(transform(source, { loader: 'js', format: 'esm', target: CIBLE_PAR_DEFAUT_DE_VITE })).rejects.toThrow(
      /not supported yet/,
    );
  });

  /*
   * Même cause, autre face : les builds de bureau (Electron) échouaient sur
   * TOUTES les propositions depuis le 18/09 (`main/index.mjs`, 11 erreurs en
   * local le 2026-09-30). En mode bibliothèque, Vite garde la même cible par
   * défaut que le pré-bundling quand `build.target` manque.
   */
  for (const config of ['electron/main/vite.config.ts', 'electron/preload/vite.config.ts']) {
    it(`${config} : sa cible de build transforme une déstructuration`, async () => {
      const charge = await loadConfigFromFile(
        { command: 'build', mode: 'production' },
        join(racine, config),
        racine,
        'silent',
      );

      expect(charge, `${config} se charge`).toBeTruthy();

      const cible = charge!.config.build?.target ?? CIBLE_PAR_DEFAUT_DE_VITE;

      await expect(
        transform('const [, ressource, id] = chemin.split("/"); export { ressource, id };', {
          loader: 'js',
          format: 'esm',
          target: cible as string | string[],
        }),
      ).resolves.toBeTruthy();
    }, 120_000);
  }
});
