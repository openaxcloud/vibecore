import { describe, expect, it } from 'vitest';

import {
  catalogueTropPetit,
  cataloguesManquants,
  chunksPortantLeTemoin,
  cleTemoin,
  fichierDuCatalogue,
  MINIMUM_DE_CLES,
} from './catalogues-emis';

describe('les catalogues JSON émis par le build', () => {
  const emis = [
    'root-abc123.js',
    'catalogue-en-0123456789.json',
    'catalogue-fr-abcdef0123.json',
    'catalogue-es-1111111111.json',
    'catalogue-ar-2222222222.json',
  ];

  it('retrouve chaque langue à son nom empreinté, et rien d’approchant', () => {
    expect(fichierDuCatalogue(emis, 'fr')).toBe('catalogue-fr-abcdef0123.json');
    expect(fichierDuCatalogue(['catalogue-fr.json'], 'fr')).toBeUndefined();
    expect(fichierDuCatalogue(['catalogue-fr-abc.json'], 'fr')).toBeUndefined();
    expect(cataloguesManquants(emis)).toEqual([]);
  });

  it('nomme les langues absentes — un build sans catalogue est un build qui hydrate en « Unavailable »', () => {
    expect(cataloguesManquants(emis.filter((nom) => !nom.includes('-fr-')))).toEqual(['fr']);
    expect(cataloguesManquants([])).toEqual(['en', 'fr', 'es', 'ar']);
  });

  it('refuse un catalogue trop petit, illisible ou qui n’est pas un objet', () => {
    const grand = JSON.stringify(
      Object.fromEntries(Array.from({ length: MINIMUM_DE_CLES.en }, (_, i) => [`k${i}`, 'v'])),
    );

    expect(catalogueTropPetit('en', grand)).toBeUndefined();
    expect(catalogueTropPetit('en', '{"a":"b"}')).toMatch(/1 clés, en dessous du minimum 10000/);
    expect(catalogueTropPetit('es', '{}')).toMatch(/0 clés/);
    expect(catalogueTropPetit('fr', 'pas du json')).toMatch(/illisible/);
    expect(catalogueTropPetit('fr', '[]')).toMatch(/pas un objet/);
  });

  it('prend pour témoin une clé de l’IDE, et le dit quand il n’y en a pas', () => {
    expect(cleTemoin('{"root.loadingPage":"x","chat.copy.addBreakpoint_f0d58392":"Add breakpoint"}')).toBe(
      'chat.copy.addBreakpoint_f0d58392',
    );
    expect(cleTemoin('{"root.loadingPage":"x"}')).toBeUndefined();
  });

  it('retrouve le témoin dans les chunks qui le portent — la forme exacte du défaut du 14/09', () => {
    const chunks = new Map([
      ['runtime-x.js', 'const a={"chat.copy.addBreakpoint_f0d58392":"Add breakpoint"}'],
      ['vendor-react-x.js', 'function React(){}'],
      ['signup-x.js', '{"patchReview.title":"x","chat.copy.addBreakpoint_f0d58392":"Ajouter"}'],
    ]);

    expect(chunksPortantLeTemoin('chat.copy.addBreakpoint_f0d58392', chunks)).toEqual(['runtime-x.js', 'signup-x.js']);
    expect(chunksPortantLeTemoin('chat.copy.addBreakpoint_f0d58392', new Map([['a.js', 'rien']]))).toEqual([]);
  });
});
