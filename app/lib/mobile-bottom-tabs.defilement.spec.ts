import { describe, expect, it } from 'vitest';
import { defilementPourMontrer } from './mobile-bottom-tabs';

describe('defilementPourMontrer — l’onglet actif de la barre du bas est entièrement visible', () => {
  it('cas mesuré en prod (390, « Activité ») : défile de ce qui dépasse à droite', () => {
    expect(defilementPourMontrer({ left: 122, right: 268, scrollLeft: 0 }, { left: 260, right: 304 })).toBe(36);
  });

  it('onglet coupé à gauche : revient de ce qui dépasse, jamais sous 0', () => {
    expect(defilementPourMontrer({ left: 122, right: 268, scrollLeft: 36 }, { left: 100, right: 144 })).toBe(14);
    expect(defilementPourMontrer({ left: 122, right: 268, scrollLeft: 5 }, { left: 80, right: 124 })).toBe(0);
  });

  it('onglet déjà entier : rien ne bouge', () => {
    expect(defilementPourMontrer({ left: 122, right: 268, scrollLeft: 12 }, { left: 170, right: 214 })).toBe(12);
  });
});
