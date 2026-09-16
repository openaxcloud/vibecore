import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * BUG-CREATE-011 — « Utiliser le modèle » inatteignable en mobile.
 *
 * La section des modèles était masquée par défaut sous 640px et ne réapparaissait
 * que sous `[data-open='true']`, attribut piloté par le dépliant « Avancé » —
 * dont le libellé et le résumé parlent du type d'artefact, jamais de modèles.
 *
 * Mesuré en 390 sur l'environnement de test : les quatre boutons « Utiliser le
 * modèle » sont bien dans le DOM, mais à 0×0 px sous un ancêtre
 * `SECTION.vc-new-project-templates` en `display: none`. Créer un projet depuis
 * un modèle était donc impossible sur téléphone, sans le moindre indice.
 *
 * Ces gardes lisent la source : c'est une règle de mise en page et un attribut
 * de balisage, il n'y a rien à appeler.
 */

const FEUILLE = 'app/styles/index.scss';
const ROUTE = 'app/routes/projects.new.tsx';

/*
 * TOUS les blocs qui stylent la section, pas seulement celui qu'on croit lire.
 * Une première version de cette garde cherchait la règle « après la media query
 * mobile » et tombait sur la règle de base : remettre `display: none` la
 * laissait verte. Un test qui ne sait pas devenir rouge ne garde rien.
 */
function blocsTemplates(styles: string): string[] {
  const blocs: string[] = [];
  const marqueur = '.vc-new-project-templates {';

  let index = styles.indexOf(marqueur);

  while (index !== -1) {
    blocs.push(styles.slice(index, styles.indexOf('}', index)));
    index = styles.indexOf(marqueur, index + marqueur.length);
  }

  expect(blocs.length, 'la section doit être stylée quelque part').toBeGreaterThan(0);

  return blocs;
}

describe('galerie de modèles en mobile', () => {
  const styles = readFileSync(FEUILLE, 'utf8');
  const route = readFileSync(ROUTE, 'utf8');

  it('n’est masquée nulle part — ni en mobile, ni ailleurs', () => {
    for (const bloc of blocsTemplates(styles)) {
      expect(bloc).not.toMatch(/display:\s*none/u);
    }
  });

  it('ne dépend plus d’un `data-open` pour être visible', () => {
    expect(styles).not.toContain(".vc-new-project-templates[data-open='true']");
    expect(route).not.toMatch(/vc-new-project-templates"[\s\S]{0,200}?data-open=/u);
  });

  it('le dépliant « Avancé » ne prétend plus contrôler la section des modèles', () => {
    /*
     * `aria-controls` annonçait `vc-new-project-templates` : une technologie
     * d'assistance suivait donc un lien vers une section que le bouton ne pilote
     * plus. La corriger fait partie du même défaut, pas d'un nettoyage à part.
     */
    expect(route).not.toContain('aria-controls="vc-new-project-advanced-content vc-new-project-templates"');
    expect(route).toContain('aria-controls="vc-new-project-advanced-content"');
  });

  it('la section existe toujours et rend bien la galerie', () => {
    expect(route).toContain('id="vc-new-project-templates"');
    expect(route).toContain('<TemplateGallery compact');
  });
});
