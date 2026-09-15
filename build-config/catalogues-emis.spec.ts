import { describe, expect, it } from 'vitest';

import {
  catalogueTropPetit,
  cataloguesManquants,
  chunksPortantLeTemoin,
  cleTemoin,
  fichierDuCatalogue,
  MINIMUM_DE_CLES,
  temoinDansLaTranchePublique,
} from './catalogues-emis';

describe('les catalogues JSON émis par le build', () => {
  const emis = [
    'root-abc123.js',
    'catalogue-en-public-0123456789.json',
    'catalogue-en-app-0123456780.json',
    'catalogue-fr-public-abcdef0123.json',
    'catalogue-fr-app-abcdef0124.json',
    'catalogue-es-public-1111111111.json',
    'catalogue-es-app-1111111112.json',
    'catalogue-ar-public-2222222222.json',
    'catalogue-ar-app-2222222223.json',
  ];

  it('retrouve chaque tranche à son nom empreinté, et rien d’approchant', () => {
    expect(fichierDuCatalogue(emis, 'fr', 'public')).toBe('catalogue-fr-public-abcdef0123.json');
    expect(fichierDuCatalogue(emis, 'fr', 'app')).toBe('catalogue-fr-app-abcdef0124.json');
    expect(fichierDuCatalogue(['catalogue-fr-public.json'], 'fr', 'public')).toBeUndefined();
    expect(fichierDuCatalogue(['catalogue-fr-public-abc.json'], 'fr', 'public')).toBeUndefined();

    // Le nom SANS surface est celui d'avant le 2026-09-15 : il ne compte plus.
    expect(fichierDuCatalogue(['catalogue-fr-abcdef0123.json'], 'fr', 'public')).toBeUndefined();
    expect(cataloguesManquants(emis)).toEqual([]);
  });

  it('nomme les tranches absentes — un build sans catalogue est un build qui hydrate en « Unavailable »', () => {
    expect(cataloguesManquants(emis.filter((nom) => !nom.includes('-fr-app-')))).toEqual(['fr/app']);
    expect(cataloguesManquants(emis.filter((nom) => !nom.includes('-fr-')))).toEqual(['fr/public', 'fr/app']);
    expect(cataloguesManquants([])).toEqual([
      'en/public',
      'en/app',
      'fr/public',
      'fr/app',
      'es/public',
      'es/app',
      'ar/public',
      'ar/app',
    ]);
  });

  it('refuse un catalogue trop petit, illisible ou qui n’est pas un objet', () => {
    const grand = JSON.stringify(
      Object.fromEntries(Array.from({ length: MINIMUM_DE_CLES.en.app }, (_, i) => [`k${i}`, 'v'])),
    );

    expect(catalogueTropPetit('en', 'app', grand)).toBeUndefined();
    expect(catalogueTropPetit('en', 'app', '{"a":"b"}')).toMatch(/1 clés, en dessous du minimum 8000/);
    expect(catalogueTropPetit('en', 'public', '{"a":"b"}')).toMatch(/1 clés, en dessous du minimum 2000/);
    expect(catalogueTropPetit('fr', 'public', 'pas du json')).toMatch(/illisible/);
    expect(catalogueTropPetit('fr', 'public', '[]')).toMatch(/pas un objet/);
  });

  it('tolère une tranche `app` VIDE en espagnol et en arabe — toutes leurs clés sont publiques', () => {
    // 45 clés par langue, aucune côté application : le repli anglais fait le reste.
    expect(catalogueTropPetit('es', 'app', '{}')).toBeUndefined();
    expect(catalogueTropPetit('ar', 'app', '{}')).toBeUndefined();

    // Mais leur tranche PUBLIQUE, elle, doit être là.
    expect(catalogueTropPetit('es', 'public', '{}')).toMatch(/0 clés, en dessous du minimum 40/);
  });

  it('voit une clé d’IDE livrée dans la tranche publique — le contrat du découpage par surface', () => {
    expect(temoinDansLaTranchePublique('chat.copy.x', '{"chat.copy.x":"y","common.unavailable":"z"}')).toBe(true);
    expect(temoinDansLaTranchePublique('chat.copy.x', '{"common.unavailable":"z"}')).toBe(false);
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
