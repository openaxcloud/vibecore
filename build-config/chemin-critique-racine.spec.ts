import { describe, expect, it } from 'vitest';

import { chunksInterdits, lireCheminCritiqueRacine, PLAFOND_CHEMIN_CRITIQUE_OCTETS } from './chemin-critique-racine';

/*
 * BUG-PERF-PRELOAD-ALLROUTES — LA GARDE QUI REGARDAIT À CÔTÉ.
 *
 * `manual-chunks.spec.ts` teste la FONCTION de découpage. C'est utile, et
 * insuffisant : elle ne dit rien du `root-*.js` réellement produit. Rollup peut
 * remonter monaco dans le chunk racine par un autre chemin, et ces quatre tests
 * resteraient verts pendant que 654 Ko reviennent sur CHAQUE page.
 *
 * Ici on tient la lecture du manifeste et le verdict. La mesure sur l'artefact
 * lui-même, elle, ne peut pas vivre dans la suite unitaire — il faut avoir
 * construit. Elle tourne en CI, juste après « Build web »
 * (`scripts/verifier-chemin-critique.ts`), et je le dis plutôt que de laisser
 * croire que ce fichier mesure le bundle.
 */

/** La forme EXACTE mesurée en production le 2026-08-12, réduite à l'essentiel. */
const MANIFESTE_DU_DEFAUT =
  '{"entry":{"module":"/assets/entry.client-x.js"},"routes":{"root":{"id":"root","module":"/assets/root-x.js",' +
  '"imports":["/assets/vendor-react-x.js","/assets/vendor-monaco-core-x.js","/assets/vendor-terminal-x.js"]}}}';

const MANIFESTE_SAIN =
  '{"entry":{"module":"/assets/entry.client-x.js"},"routes":{"root":{"id":"root","module":"/assets/root-x.js",' +
  '"imports":["/assets/vendor-react-x.js","/assets/vendor-vite-helpers-x.js","/assets/runtime-x.js"]}}}';

describe('chemin critique de la route racine', () => {
  it('lit les imports de la racine dans un manifeste réel', () => {
    expect(lireCheminCritiqueRacine(MANIFESTE_SAIN)).toEqual([
      '/assets/vendor-react-x.js',
      '/assets/vendor-vite-helpers-x.js',
      '/assets/runtime-x.js',
    ]);
  });

  it('rend `undefined` plutôt qu’une liste vide quand le manifeste n’est pas lisible', () => {
    /*
     * Règle 14, et c'est le piège de cette garde : un « zéro import » inventé
     * sur un manifeste qu'on n'a pas su lire ferait passer le contrôle pour
     * toujours. `undefined` oblige l'appelant à traiter le cas.
     */
    expect(lireCheminCritiqueRacine('{}')).toBeUndefined();
    expect(lireCheminCritiqueRacine('{"routes":{"root":{"id":"root"}}}')).toBeUndefined();
    expect(lireCheminCritiqueRacine('')).toBeUndefined();
  });

  it('REFUSE la forme exacte mesurée en production le 12/08', () => {
    const imports = lireCheminCritiqueRacine(MANIFESTE_DU_DEFAUT);

    expect(imports, 'le manifeste du défaut n’a pas été lu').toBeDefined();
    expect(chunksInterdits(imports!)).toEqual(['/assets/vendor-monaco-core-x.js', '/assets/vendor-terminal-x.js']);
  });

  it('accepte un chemin critique sain — sinon le verdict dirait « non » à tout', () => {
    /*
     * Un prédicat qui refuserait tout serait aussi inutile qu'un prédicat qui
     * accepte tout : c'est la contre-épreuve dans l'autre sens (règle 6).
     */
    const imports = lireCheminCritiqueRacine(MANIFESTE_SAIN);

    expect(imports).toBeDefined();
    expect(chunksInterdits(imports!)).toEqual([]);
  });

  it('le plafond laisse passer la mesure du 10/09 et arrête un retour de monaco', () => {
    // Mesuré : 3 334 307 octets bruts sur 28 imports ; `vendor-monaco-core` en pèse 2 283 041.
    expect(PLAFOND_CHEMIN_CRITIQUE_OCTETS).toBeGreaterThan(3_334_307);
    expect(
      PLAFOND_CHEMIN_CRITIQUE_OCTETS,
      'un plafond au-dessus de 3 334 307 + 2 283 041 ne verrait pas monaco revenir',
    ).toBeLessThan(3_334_307 + 2_283_041);
  });
});
