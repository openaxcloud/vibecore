/*
 * Le mécanisme que le test E2E NE PEUT PAS atteindre.
 *
 * `ui-details.spec.ts` monte un document synthétique sans React : il exerce le
 * REPLI CSS (`clamp`), jamais la valeur mesurée à l'exécution. Les deux chemins
 * doivent tenir le même invariant — la réserve couvre barre + boîte de saisie —
 * donc chacun a sa garde.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeComposerReservedSpace, shouldRewriteReservedSpace } from './composer-reserved-space';

describe('réserve de défilement du composer', () => {
  it('1. inclut la barre de navigation, et non un padding fixe', () => {
    /*
     * Valeurs MESURÉES le 2026-09-01 sur les cinq viewports de
     * `ui-details.spec.ts` : barre 72 px, boîte de saisie 123,4375 px.
     * L'ancienne formule `hauteur + 16` rendait 139 — soit 56 px de moins que
     * le nécessaire, exactement la hauteur de barre non comptée.
     */
    expect(computeComposerReservedSpace(123.4375, 72)).toBe(195);
    expect(computeComposerReservedSpace(123.4375, 72)).not.toBe(Math.round(123.4375) + 16);
  });

  it('2. suit la barre quand elle change — zone de sécurité du téléphone', () => {
    const sansZoneSecurite = computeComposerReservedSpace(133, 72);
    const avecZoneSecurite = computeComposerReservedSpace(133, 72 + 34);

    expect(avecZoneSecurite - sansZoneSecurite).toBe(34);
  });

  it('3. reste correct quand la barre est absente (bureau, pas de barre du bas)', () => {
    expect(computeComposerReservedSpace(173, 0)).toBe(173);
  });

  it('4. ne se laisse pas empoisonner par une mesure négative', () => {
    expect(computeComposerReservedSpace(-10, -5)).toBe(0);
    expect(computeComposerReservedSpace(120, -5)).toBe(120);
  });

  it('5. n’écrit que sur un écart significatif — sinon le transcript resaute', () => {
    expect(shouldRewriteReservedSpace(195, 197)).toBe(false);
    expect(shouldRewriteReservedSpace(195, 201)).toBe(true);

    // Le tout premier calcul doit toujours écrire (sentinelle -1).
    expect(shouldRewriteReservedSpace(-1, 195)).toBe(true);
  });

  it('6. BaseChat appelle bien cette fonction (site d’appel)', () => {
    const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

    /*
     * Commentaires retirés : une garde qui matche un commentaire ne garde rien.
     * Vérifié par contre-épreuve — deux gardes écrites plus tôt le même jour
     * épinglaient le commentaire au-dessus de l'appel, pas l'appel.
     */
    const sansCommentaires = source
      .split('\n')
      .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
      .join('\n');

    expect(sansCommentaires).toMatch(/computeComposerReservedSpace\(\s*height\s*,\s*navHeight\s*\)/);
    expect(sansCommentaires).toMatch(/shouldRewriteReservedSpace\(/);

    // Le padding fixe qui portait le défaut ne doit plus exister.
    expect(sansCommentaires).not.toMatch(/Math\.round\(height\)\s*\+\s*16/);
  });
});
