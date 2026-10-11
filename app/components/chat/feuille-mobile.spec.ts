/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { cibleFeuilleMobile } from './feuille-mobile';

describe('cible de portail des feuilles du composeur', () => {
  it('rend la racine du gabarit mobile quand elle existe', () => {
    document.body.innerHTML =
      '<div class="bolt-project-ide-shell"><main class="bolt-responsive-ide-mobile"></main></div>';

    expect(cibleFeuilleMobile(document)?.className).toBe('bolt-responsive-ide-mobile');
  });

  it('ne rend rien sur bureau : le menu reste ancré à son déclencheur', () => {
    document.body.innerHTML = '<div class="bolt-project-ide-shell"><main class="bolt-responsive-ide"></main></div>';

    expect(cibleFeuilleMobile(document)).toBeNull();
    expect(cibleFeuilleMobile(null)).toBeNull();
  });
});
