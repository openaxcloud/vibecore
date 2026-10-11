import { describe, expect, it } from 'vitest';

import { DECALAGE_VERTICAL, GOUTTIERE, MARGE_BORD, placerSecondPanneau } from './placement-second-panneau';

const ancre = { left: 200, top: 300, width: 288 };

describe('le second panneau s’ouvre à droite', () => {
  it('collé au premier, à une gouttière près, légèrement plus bas', () => {
    const p = placerSecondPanneau(ancre, 288, 1440);

    expect(p.cote).toBe('droite');
    expect(p.left).toBe(200 + 288 + GOUTTIERE);
    expect(p.top).toBe(300 + DECALAGE_VERTICAL);
  });

  it('tient encore quand il finit pile sur la marge du bord', () => {
    const largeurFenetre = 200 + 288 + GOUTTIERE + 288 + MARGE_BORD;

    expect(placerSecondPanneau(ancre, 288, largeurFenetre).cote).toBe('droite');
  });
});

describe('repli à gauche quand la place manque', () => {
  /* Ancre assez à droite pour que le repli tienne réellement à gauche. */
  const ancreADroite = { left: 700, top: 300, width: 288 };

  it('bascule dès qu’il manque un pixel à droite', () => {
    const justeTrop = 700 + 288 + GOUTTIERE + 288 + MARGE_BORD - 1;
    const p = placerSecondPanneau(ancreADroite, 288, justeTrop);

    expect(p.cote).toBe('gauche');
    expect(p.left).toBe(700 - GOUTTIERE - 288);
  });

  /*
   * Le piège : un repli qui déborde de l'AUTRE côté. Sans borne, un panneau
   * plus large que la place à gauche partait en coordonnée négative — hors
   * écran, donc aussi inutilisable que le débordement qu'on voulait éviter.
   */
  it('ne part jamais en coordonnée négative', () => {
    const p = placerSecondPanneau({ left: 40, top: 100, width: 200 }, 400, 600);

    expect(p.cote).toBe('gauche');
    expect(p.left).toBe(MARGE_BORD);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });

  it('garde le même décalage vertical des deux côtés', () => {
    const droite = placerSecondPanneau(ancre, 288, 1440);
    const gauche = placerSecondPanneau(ancre, 288, 600);

    expect(gauche.top).toBe(droite.top);
  });
});
