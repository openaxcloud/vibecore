import { describe, expect, it } from 'vitest';

import { slugify, slugifyRouteSegment } from './slugify';

/*
 * The project slug is generated from the project NAME, and the name is whatever
 * the customer typed — in French, accented on the very first word. `slugify`
 * filtered on `[^a-z0-9]` without stripping diacritics first, so every accented
 * letter collapsed to a dash:
 *
 *   "Créez une page de tarification"  ->  cr-ez-une-page-de-tarification
 *
 * That slug then sits in the address bar for the whole life of the project.
 * Observed on every project generated from a French prompt on the audit env.
 */
describe('slug de projet — les accents sont translittérés, pas remplacés par un tiret', () => {
  it('transforme "Créez" en "creez" et non "cr-ez"', () => {
    expect(slugify('Créez une page de tarification')).toBe('creez-une-page-de-tarification');
  });

  it('couvre les diacritiques français courants', () => {
    expect(slugify('Créé par Noël')).toBe('cree-par-noel');
    expect(slugify('Où ça ?')).toBe('ou-ca');
    expect(slugify('Gestion des dépenses à l’unité')).toBe('gestion-des-depenses-a-l-unite');
  });

  it('laisse un slug déjà sans accent inchangé — les projets existants continuent de résoudre', () => {
    expect(slugify('cr-ez-une-page-de-tarification')).toBe('cr-ez-une-page-de-tarification');
    expect(slugify('my-project')).toBe('my-project');
  });

  it('ne rend jamais de tiret en tête, en queue, ni doublé', () => {
    expect(slugify('  --- Éé ---  ')).toBe('ee');
    expect(slugify('a   ///   b')).toBe('a-b');
  });
});

/*
 * `slugifyRouteSegment` normalizes an INCOMING url segment; `slugify` generates
 * the stored one. If the two ever transliterated differently, a freshly
 * generated slug would stop resolving — which is why they now share a single
 * implementation rather than being two copies kept in step by hand.
 */
describe('résolution des urls', () => {
  it('normalise un segment entrant exactement comme le slug stocké', () => {
    const nom = 'Créez un tableau de bord';
    expect(slugifyRouteSegment(slugify(nom))).toBe(slugify(nom));
  });

  it('retire le @ de tête des segments de compte', () => {
    expect(slugifyRouteSegment('@org-2h3n3zrk')).toBe('org-2h3n3zrk');
  });

  it('résout un segment accenté sur le même slug que le générateur', () => {
    expect(slugifyRouteSegment('Créez-un-tableau')).toBe('creez-un-tableau');
    expect(slugify('Créez un tableau')).toBe('creez-un-tableau');
  });
});
