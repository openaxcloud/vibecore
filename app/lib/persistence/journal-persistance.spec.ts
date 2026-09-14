import { describe, expect, it } from 'vitest';

import { caracteresDuFil, evenementPersistance } from './journal-persistance';

describe('journal de persistance', () => {
  it('somme les contenus du fil — c’est ce nombre qui doit croître', () => {
    expect(caracteresDuFil([{ content: 'abc' }, { content: 'de' }])).toBe(5);
  });

  it('un message sans contenu ne fausse pas la somme', () => {
    expect(caracteresDuFil([{ content: 'abc' }, {}, { content: null }])).toBe(3);
  });

  it('un fil vide vaut zéro, pas NaN', () => {
    expect(caracteresDuFil([])).toBe(0);
  });

  it('la ligne porte rang, cible, étape et longueur', () => {
    const ligne = JSON.parse(
      evenementPersistance({ rang: 7, cible: 'serveur', etape: 'entree', caracteres: 1234, messages: 2 }),
    );

    expect(ligne).toMatchObject({
      event: 'persistance.tour',
      rang: 7,
      cible: 'serveur',
      etape: 'entree',
      caracteres: 1234,
      messages: 2,
    });
  });

  it('un rejet porte son message d’erreur et sa durée', () => {
    const ligne = JSON.parse(
      evenementPersistance({
        rang: 3,
        cible: 'local',
        etape: 'rejet',
        caracteres: 10,
        messages: 1,
        dureeMs: 42,
        erreur: 'HTTP 412',
      }),
    );

    expect(ligne.etape).toBe('rejet');
    expect(ligne.erreur).toBe('HTTP 412');
    expect(ligne.dureeMs).toBe(42);
  });

  it('le préfixe est stable — la consigne d’analyse filtre dessus', () => {
    expect(evenementPersistance({ rang: 1, cible: 'local', etape: 'sortie', caracteres: 0, messages: 0 })).toContain(
      '"event":"persistance.tour"',
    );
  });
});
