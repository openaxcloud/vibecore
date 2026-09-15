import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * BUG-PERF-LOAD — la coquille marketing ne doit pas voyager avec `root.tsx`.
 *
 * `root.tsx` importe `LinkButton` et `PublicShell` depuis `SaaSLayout`. Un
 * import STATIQUE de la coquille marketing dans `SaaSLayout` fait donc entrer
 * toute la vitrine dans le chunk racine — donc sur CHAQUE page, y compris
 * l'IDE. Mesuré le 2026-09-15 : `LandingCTA` 32,6 Ko + `LandingTestimonials`
 * 32,3 Ko dans les imports statiques du chunk racine, pour un composant que
 * `root` n'utilise QUE dans `RootErrorView`.
 *
 * Le correctif tient dans un `lazy()`. Rien d'autre ne l'empêche d'être défait
 * par un « on remet l'import en haut, c'est plus simple à lire » — d'où ce
 * test, et sa contre-épreuve dans les deux sens (règle 6) :
 *   - retirer le `lazy()` doit rougir (le cas 2 le voit) ;
 *   - retirer la coquille entièrement doit rougir aussi (le cas 1 l'exige).
 */

const SAAS_LAYOUT = join(process.cwd(), 'app', 'components', 'dashboard', 'SaaSLayout.tsx');
const source = readFileSync(SAAS_LAYOUT, 'utf8');

/** Le CODE seul — une assertion ancrée sur de la prose se fait piéger par sa propre explication. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');

/** Les spécificateurs d'un import STATIQUE — `import … from 'x'`, jamais `import('x')`. */
function importsStatiques(code: string): string[] {
  const specificateurs: string[] = [];
  const motif = /(?:^|\n)\s*import\s(?:[^;'"]*?\sfrom\s)?['"]([^'"]+)['"]/g;

  let trouve: RegExpExecArray | null;

  while ((trouve = motif.exec(code))) {
    specificateurs.push(trouve[1]);
  }

  return specificateurs;
}

describe('la coquille marketing vue depuis la racine', () => {
  it('mesure bien quelque chose : SaaSLayout porte des imports statiques', () => {
    // Règle 4 : une liste vide rendrait le cas suivant vert sans rien vérifier.
    expect(importsStatiques(source).length).toBeGreaterThan(20);
    expect(code.length, 'le retrait des commentaires ne doit pas vider le fichier').toBeGreaterThan(source.length / 3);
  });

  it("n'est atteinte par AUCUN import statique de SaaSLayout", () => {
    const fuites = importsStatiques(source).filter((specificateur) => /components\/marketing\//.test(specificateur));

    expect(fuites, 'ces imports remettraient la vitrine dans le chunk racine').toEqual([]);
  });

  it('reste bien rendue — par un import dynamique, pas par une suppression', () => {
    expect(source, "la coquille n'est plus chargée du tout").toMatch(
      /import\(\s*['"]~\/components\/marketing\/ecode-exact\/EcodeExactShell['"]\s*\)/,
    );

    // Un chargement différé sans rien à l'écran pendant l'attente casse le rendu.
    expect(source, 'aucun état d’attente pendant le chargement').toContain('aria-busy="true"');

    /*
     * Le chargement passe par un cache de module exporté, PAS par `lazy()`.
     * Mesuré le 2026-09-15 : avec `lazy()` + `Suspense`, neuf assertions de
     * copie française rougissaient — `renderToStaticMarkup` est synchrone et
     * ne franchit pas une frontière Suspense, les specs marketing n'obtenaient
     * que le repli. Le cache se préchauffe (`prechaufferCoquillePublique`).
     */
    expect(source).toContain('export function chargerCoquillePublique()');
    expect(code, 'lazy() ferait rougir les rendus synchrones des specs marketing').not.toContain('lazy(');
  });
});
