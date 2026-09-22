/**
 * @vitest-environment jsdom
 */

/*
 * Le choix de modèle qui survit — et ce qui sort du stockage n'est jamais cru.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLE_CHOIX_DE_MODELE,
  EVENEMENT_CHOIX_DE_MODELE,
  appliquerChoix,
  ecrireChoix,
  lireChoix,
  normaliserChoix,
} from './choix-de-modele';

beforeEach(() => {
  window.localStorage.clear();
});

describe('normalisation', () => {
  it('garde un choix complet', () => {
    expect(normaliserChoix({ max: { modele: 'claude-opus-5', serviceTier: 'fast', effort: 'high' } })).toEqual({
      max: { modele: 'claude-opus-5', serviceTier: 'fast', effort: 'high' },
    });
  });

  it('jette un mode inconnu', () => {
    expect(normaliserChoix({ ultra: { modele: 'x' } })).toEqual({});
  });

  it('jette un palier de service inventé', () => {
    const sortie = normaliserChoix({ power: { modele: 'gpt-5.6-sol', serviceTier: 'priority' } });
    expect(sortie.power).toEqual({ modele: 'gpt-5.6-sol' });
  });

  it('jette un cran d’effort qui n’existe pas', () => {
    const sortie = normaliserChoix({ power: { modele: 'gpt-5.6-sol', effort: 'ludicrous' } });
    expect(sortie.power).toEqual({ modele: 'gpt-5.6-sol' });
  });

  /*
   * Le piège : un réglage sans modèle. `{ effort: 'high' }` seul veut dire
   * « je règle l'effort du choix automatique », ce qui n'a pas de sens — le
   * choix automatique change de modèle. On le jette au lieu de le porter.
   */
  it('jette un réglage qui n’épingle aucun modèle', () => {
    expect(normaliserChoix({ power: { effort: 'high' } })).toEqual({});
  });

  it('survit à du JSON qui n’est pas un objet', () => {
    expect(normaliserChoix('bonjour')).toEqual({});
    expect(normaliserChoix(null)).toEqual({});
    expect(normaliserChoix(42)).toEqual({});
  });
});

describe('persistance', () => {
  it('ce qui est écrit est relu à l’identique', () => {
    ecrireChoix({ max: { modele: 'claude-fable-5-1', serviceTier: 'fast' } });

    expect(lireChoix()).toEqual({ max: { modele: 'claude-fable-5-1', serviceTier: 'fast' } });
  });

  it('un stockage corrompu rend une carte vide, pas une exception', () => {
    window.localStorage.setItem(CLE_CHOIX_DE_MODELE, '{ceci n’est pas du json');

    expect(lireChoix()).toEqual({});
  });

  it('l’écriture DIFFUSE — sans quoi la requête ne verrait jamais le choix', () => {
    const vu = vi.fn();
    window.addEventListener(EVENEMENT_CHOIX_DE_MODELE, vu);

    ecrireChoix({ power: { modele: 'gpt-5.6-sol' } });

    expect(vu).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENEMENT_CHOIX_DE_MODELE, vu);
  });
});

describe('application', () => {
  it('épingler un modèle n’affecte pas les autres modes', () => {
    const avant = { lite: { modele: 'claude-haiku-4-5' } } as const;
    const apres = appliquerChoix(avant, 'max', { modele: 'claude-opus-5' });

    expect(apres.lite).toEqual({ modele: 'claude-haiku-4-5' });
    expect(apres.max).toEqual({ modele: 'claude-opus-5' });
  });

  /* Revenir à « choisir automatiquement » doit EFFACER l'entrée, pas la vider. */
  it('revenir à l’automatique retire l’entrée', () => {
    const apres = appliquerChoix({ max: { modele: 'claude-opus-5' } }, 'max', {});

    expect('max' in apres).toBe(false);
  });

  it('n’altère pas la carte reçue', () => {
    const avant = { max: { modele: 'claude-opus-5' } };
    appliquerChoix(avant, 'lite', { modele: 'claude-haiku-4-5' });

    expect(avant).toEqual({ max: { modele: 'claude-opus-5' } });
  });
});
