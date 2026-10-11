import { describe, expect, it } from 'vitest';

import { cadreGare, decisionDeRepointage } from './cadre-apercu-repointage';

describe('un cadre garé', () => {
  it('reconnaît les formes de cadre vide', () => {
    for (const src of ['about:blank', 'about:srcdoc', '', '   ', null, undefined]) {
      expect(cadreGare(src), String(src)).toBe(true);
    }
  });

  it('ne confond pas une vraie page avec un cadre vide', () => {
    expect(cadreGare('https://ws-abc-5173.preview.e-code.ai/')).toBe(false);
  });
});

describe('la décision de repointage', () => {
  const url = 'https://ws-1be0de652f439a74-5173.preview.e-code.ai/';

  /* Le cas mesuré en production : serveur prêt, barre d'adresse remplie, cadre vide. */
  it('repointe un cadre garé quand l’URL est connue', () => {
    expect(decisionDeRepointage({ src: 'about:blank', urlVoulue: url })).toEqual({ repointer: true, vers: url });
  });

  /*
   * L'autre moitié, et elle compte autant : réécrire le `src` d'un cadre qui a
   * déjà chargé le rechargerait pour rien — et sur un aperçu en cours de
   * démarrage, ce rechargement coûte le démarrage lui-même.
   */
  it('ne touche pas un cadre qui porte déjà une page', () => {
    const d = decisionDeRepointage({ src: url, urlVoulue: url });

    expect(d.repointer).toBe(false);
    expect(d).toHaveProperty('raison');
  });

  it('ne repointe pas quand aucune URL n’est connue', () => {
    expect(decisionDeRepointage({ src: 'about:blank', urlVoulue: undefined }).repointer).toBe(false);
  });

  it('repointe aussi un cadre dont le src est vide', () => {
    expect(decisionDeRepointage({ src: '', urlVoulue: url })).toEqual({ repointer: true, vers: url });
  });
});
