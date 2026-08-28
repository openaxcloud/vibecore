import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { slugify, slugifyRouteSegment } from '../slugify.js';

/*
 * Constaté en réel : un projet nommé « Crée une page web simple » recevait
 * l'adresse `cr-e-une-page-web-simple`. Chaque lettre accentuée s'effondrait en
 * tiret, et l'adresse portait la faute pendant toute la vie du projet.
 *
 * `slugify.ts` corrigeait déjà cela, et son en-tête met explicitement en garde
 * contre la duplication : « so they live here, on one implementation, instead of
 * being duplicated in prisma-store.ts and app.ts and drifting apart ». Mais
 * `app.ts` n'importait que `slugifyRouteSegment` — la LECTURE d'une adresse était
 * normalisée, son ÉCRITURE ne l'était pas — et refabriquait le slug en ligne à
 * ONZE endroits, tous sans translittération.
 *
 * Ce test vérifie les deux moitiés : le comportement attendu, et l'absence de
 * toute réimplémentation qui le contournerait de nouveau.
 */

const appSource = readFileSync(fileURLToPath(new URL('../app.ts', import.meta.url)), 'utf8');

describe('adresses de projets et d’organisations : les accents', () => {
  it('translittère au lieu de couper — le cas exact remonté', () => {
    expect(slugify('Crée une page web simple')).toBe('cree-une-page-web-simple');
    expect(slugify('Créez une page de tarification')).toBe('creez-une-page-de-tarification');
  });

  it('couvre les diacritiques courants en français', () => {
    expect(slugify('Àéîôùç ÊËÏÖÜ')).toBe('aeiouc-eeiou');
  });

  it('l’adresse écrite est celle que la lecture résout', () => {
    const written = slugify('Crée une page web simple');

    expect(slugifyRouteSegment(written)).toBe(written);
    expect(slugifyRouteSegment(`@${written}`)).toBe(written);
  });

  it('les slugs déjà stockés sans accent ne bougent pas', () => {
    expect(slugify('mon-projet-2')).toBe('mon-projet-2');
    expect(slugify('cr-e-une-page-web-simple')).toBe('cr-e-une-page-web-simple');
  });

  it('app.ts ne refabrique JAMAIS un slug en ligne', () => {
    const inlineSlug = /toLowerCase\(\)\s*\.replace\(\s*\/\[\^a-z0-9\]\+\/g/g;
    const found = appSource.match(inlineSlug) ?? [];

    expect(
      found.length,
      'un slug fabriqué en ligne perd la translittération : passer par slugify() de ./slugify.js',
    ).toBe(0);
  });

  it('app.ts importe bien slugify, pas seulement slugifyRouteSegment', () => {
    expect(appSource).toMatch(/import \{[^}]*\bslugify\b[^}]*\} from '\.\/slugify\.js'/);
  });
});
