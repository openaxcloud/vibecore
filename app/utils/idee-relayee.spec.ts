import { describe, expect, it } from 'vitest';
import {
  CLE_DATE,
  CLE_IDEE,
  CLE_INTENTION,
  daterLeRelais,
  DUREE_DE_VALIDITE_MS,
  lireIdeeRelayee,
} from './idee-relayee';

/*
 * BUG-QA0928-IDEE-PERDUE-INSCRIPTION — une idée restée dans l'onglet se relançait
 * toute seule au prochain « Nouveau projet », des heures plus tard (mesuré le
 * 2026-09-28 : projet `qa-idee-5521-un-carnet-de-recettes` créé sans demande).
 */

function rangement(initial: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(initial));

  return {
    donnees,
    getItem: (cle: string) => donnees.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void donnees.set(cle, valeur),
    removeItem: (cle: string) => void donnees.delete(cle),
  };
}

const MAINTENANT = 1_800_000_000_000;

describe('idée relayée de l’accueil', () => {
  it('une idée fraîche, avec intention, est rendue telle quelle', () => {
    const r = rangement({ [CLE_IDEE]: ' Un carnet de recettes ', [CLE_INTENTION]: '1' });
    daterLeRelais(r, MAINTENANT - 5 * 60 * 1000);

    expect(lireIdeeRelayee(r, MAINTENANT)).toBe('Un carnet de recettes');
  });

  it('une idée SANS date (déposée avant ce correctif, ou autrement) est oubliée', () => {
    const r = rangement({ [CLE_IDEE]: 'ancienne idée', [CLE_INTENTION]: '1' });

    expect(lireIdeeRelayee(r, MAINTENANT)).toBeNull();
    expect([...r.donnees.keys()], 'le relais est effacé, il ne ressurgira pas').toEqual([]);
  });

  it('une idée plus vieille que la durée de validité est oubliée', () => {
    const r = rangement({
      [CLE_IDEE]: 'idée abandonnée',
      [CLE_INTENTION]: '1',
      [CLE_DATE]: String(MAINTENANT - DUREE_DE_VALIDITE_MS - 1),
    });

    expect(lireIdeeRelayee(r, MAINTENANT)).toBeNull();
    expect(r.donnees.has(CLE_IDEE)).toBe(false);
  });

  it('à la limite de validité, l’idée tient encore', () => {
    const r = rangement({
      [CLE_IDEE]: 'idée',
      [CLE_INTENTION]: '1',
      [CLE_DATE]: String(MAINTENANT - DUREE_DE_VALIDITE_MS),
    });

    expect(lireIdeeRelayee(r, MAINTENANT)).toBe('idée');
  });

  it('une date dans le futur ou illisible n’est pas une date', () => {
    expect(
      lireIdeeRelayee(
        rangement({ [CLE_IDEE]: 'x', [CLE_INTENTION]: '1', [CLE_DATE]: String(MAINTENANT + 60_000) }),
        MAINTENANT,
      ),
    ).toBeNull();
    expect(
      lireIdeeRelayee(rangement({ [CLE_IDEE]: 'x', [CLE_INTENTION]: '1', [CLE_DATE]: 'hier' }), MAINTENANT),
    ).toBeNull();
  });

  it('sans intention de construire, rien n’est soumis', () => {
    const r = rangement({ [CLE_IDEE]: 'idée' });
    daterLeRelais(r, MAINTENANT);

    expect(lireIdeeRelayee(r, MAINTENANT)).toBeNull();
  });
});
