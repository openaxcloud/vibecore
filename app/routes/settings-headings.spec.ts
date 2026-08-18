import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * BUG-UX-016 / BUG-UX-017 — deux pages de réglages sans titre de niveau 1.
 *
 * Mesuré live sur l'environnement de test, aux trois formats (390 / 768 / 1440) :
 *
 *   /workspace-settings -> h1 = 0, premier titre = h2 « Paramètres de l'espace… »
 *   /settings           -> h1 = 0, premier titre = h2 « Panneau de configuration »
 *
 * Un document qui démarre au niveau 2 ne donne aucun point d'entrée à un lecteur
 * d'écran (WCAG 1.3.1). Les deux routes montent leur coque avec `hideHeader`,
 * donc rien d'autre ne fournissait ce niveau 1.
 *
 * `/settings` est un cas particulier : c'est un DIALOGUE servi comme page. En
 * dialogue au-dessus d'une autre page, `h2` reste correct — la page en dessous
 * porte son propre `h1`. D'où le drapeau `asPage`, plutôt qu'un changement
 * global qui aurait donné deux `h1` à toutes les pages ouvrant ce panneau.
 */

describe('titres de niveau 1 des pages de réglages', () => {
  it('/workspace-settings porte son titre en h1', () => {
    const source = readFileSync('app/components/settings/WorkspaceSettings.tsx', 'utf8');

    expect(source).toMatch(/<h1[^>]*>\{copy\.header\.title\}<\/h1>/u);
    expect(source).not.toMatch(/<h2[^>]*>\{copy\.header\.title\}<\/h2>/u);
  });

  it('/settings passe `asPage` pour que son titre devienne le h1', () => {
    const route = readFileSync('app/routes/settings.tsx', 'utf8');

    expect(route).toContain('asPage');
  });

  it('le panneau ne rend un h1 QUE servi comme page', () => {
    /*
     * En dialogue, un `h1` volerait le niveau 1 de la page qui l'ouvre : deux
     * niveaux 1 dans un même document est un défaut d'accessibilité, pas une
     * amélioration.
     */
    const panel = readFileSync('app/components/@settings/core/ControlPanel.tsx', 'utf8');

    expect(panel).toContain('asPage?: boolean');
    expect(panel).toContain('asChild={asPage}');
    expect(panel).toMatch(/asPage \? \(\s*<h1>/u);
  });
});

describe('infobulle du rail d’outils de l’IDE', () => {
  /*
   * BUG-IDE-010 (résidu) — mesuré en réel à 1440, dans une interface française :
   *
   *     title="Bibliothèque. Unavailable. 7 fichiers"
   *
   * `IDE_TOOL_DESCRIPTIONS` contient des CLÉS de catalogue, pas du texte.
   * Utilisée brute, la clé ne résout pas et l'infobulle retombait sur
   * l'étiquette de secours anglaise. Le même tableau est traduit ailleurs dans
   * le fichier ; c'est à cet endroit qu'on l'avait oublié.
   */
  const baseChat = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');

  it('la description passe par le catalogue', () => {
    expect(baseChat).toContain('t(IDE_TOOL_DESCRIPTIONS[item.panel])');
  });

  it('plus aucune description utilisée brute', () => {
    expect(baseChat).not.toMatch(/:\s*IDE_TOOL_DESCRIPTIONS\[item\.panel\]/u);
  });
});
