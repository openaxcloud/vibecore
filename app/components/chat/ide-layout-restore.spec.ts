import { describe, expect, it } from 'vitest';
import { laDispositionPeutEtreRestauree } from './ide-layout-restore';

const parDefaut = { id: 'pane-main', type: 'leaf', tabs: ['webview'] };

describe('restauration de la disposition IDE', () => {
  it('restaure quand personne n’a touché à la disposition', () => {
    expect(laDispositionPeutEtreRestauree({ ...parDefaut }, parDefaut)).toBe(true);
  });

  it('NE restaure PAS par-dessus une disposition que l’utilisateur vient de changer', () => {
    /*
     * Le cas mesuré : l'utilisateur demande un split, la restauration arrive
     * 257 ms plus tard et remet l'ancienne disposition. Son geste disparaît.
     */
    const apresUnSplit = {
      id: 'split-1',
      type: 'split',
      direction: 'vertical',
      children: [parDefaut, { id: 'pane-2', type: 'leaf', tabs: [] }],
    };

    expect(laDispositionPeutEtreRestauree(apresUnSplit, parDefaut)).toBe(false);
  });

  it('ne se laisse pas tromper par l’ordre des clés', () => {
    /*
     * Une comparaison de chaînes JSON refuserait cette restauration pourtant
     * légitime, uniquement parce que les clés ont été écrites dans un autre
     * ordre.
     */
    const memeChoseAutreOrdre = { tabs: ['webview'], type: 'leaf', id: 'pane-main' };

    expect(laDispositionPeutEtreRestauree(memeChoseAutreOrdre, parDefaut)).toBe(true);
  });

  it('distingue deux dispositions de même forme mais de contenu différent', () => {
    expect(laDispositionPeutEtreRestauree({ ...parDefaut, tabs: ['terminal'] }, parDefaut)).toBe(false);
  });

  it('traite un tableau plus long comme une différence', () => {
    expect(laDispositionPeutEtreRestauree({ ...parDefaut, tabs: ['webview', 'terminal'] }, parDefaut)).toBe(false);
  });
});
