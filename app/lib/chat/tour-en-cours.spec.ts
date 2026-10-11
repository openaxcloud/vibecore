import { describe, expect, it } from 'vitest';
import {
  effacerLeTourEnCours,
  noterLeTourEnCours,
  tourInterrompuAReprendre,
  VALIDITE_DE_LA_MARQUE_MS,
} from './tour-en-cours';

function memoire() {
  const m = new Map<string, string>();

  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('la marque du tour en cours', () => {
  it('posée à l’envoi, elle dit à la réouverture que le tour n’a pas fini ici', () => {
    const s = memoire();
    noterLeTourEnCours('p1', 1_000, s);

    expect(tourInterrompuAReprendre('p1', 5_000, s)).toBe(true);
  });

  it('effacée à la fin du tour, il n’y a rien à reprendre', () => {
    const s = memoire();
    noterLeTourEnCours('p1', 1_000, s);
    effacerLeTourEnCours('p1', s);

    expect(tourInterrompuAReprendre('p1', 5_000, s)).toBe(false);
  });

  it('elle est propre au projet', () => {
    const s = memoire();
    noterLeTourEnCours('p1', 1_000, s);

    expect(tourInterrompuAReprendre('p2', 5_000, s)).toBe(false);
  });

  it('au-delà d’un jour, elle est oubliée', () => {
    const s = memoire();
    noterLeTourEnCours('p1', 0, s);

    expect(tourInterrompuAReprendre('p1', VALIDITE_DE_LA_MARQUE_MS, s)).toBe(false);
  });

  it('un stockage refusé ou illisible veut dire « rien à reprendre », sans erreur', () => {
    const refuse = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };

    expect(() => noterLeTourEnCours('p1', 1, refuse)).not.toThrow();
    expect(() => effacerLeTourEnCours('p1', refuse)).not.toThrow();
    expect(tourInterrompuAReprendre('p1', 2, refuse)).toBe(false);

    const illisible = memoire();
    illisible.setItem('vibecore.tour-en-cours.p1', '{pas du json');
    expect(tourInterrompuAReprendre('p1', 2, illisible)).toBe(false);
  });
});
