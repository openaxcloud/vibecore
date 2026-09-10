import { describe, expect, it } from 'vitest';

import { suiteDuTour } from './annonce-sans-artefact';

const base = { modeConstruction: true, fichierEmis: false, segmentsConsommes: 0, segmentsMax: 3 };

describe('une annonce n’est pas une livraison', () => {
  it('LE DÉFAUT — `stop` en construction sans un seul fichier REDONNE la main', () => {
    /*
     * Les trois applications vides du 09-09 : transcrit complet, phrase finale
     * qui annonce l'artefact, zéro fichier. Avant ce module, ce tour était
     * compté comme une réussite parce que la continuation n'existait que pour
     * `finishReason: 'length'`.
     */
    expect(suiteDuTour({ ...base, finishReason: 'stop' })).toEqual({
      action: 'continuer',
      cause: 'annonce-sans-artefact',
    });
  });

  it('un tour qui a écrit un fichier se termine — on ne relance pas ce qui a livré', () => {
    expect(suiteDuTour({ ...base, finishReason: 'stop', fichierEmis: true })).toEqual({ action: 'terminer' });
  });

  it('hors mode construction, `stop` sans fichier est la BONNE réponse', () => {
    /*
     * « Explique-moi ce fichier » n'écrit rien. Relancer ici ferait payer un
     * second tour pour redemander ce qui a déjà été répondu.
     */
    expect(suiteDuTour({ ...base, finishReason: 'stop', modeConstruction: false })).toEqual({ action: 'terminer' });
  });

  it('la continuation `length` existante n’est pas touchée', () => {
    expect(suiteDuTour({ ...base, finishReason: 'length' })).toEqual({ action: 'continuer', cause: 'longueur' });
    expect(suiteDuTour({ ...base, finishReason: 'length', segmentsConsommes: 3 })).toEqual({ action: 'terminer' });
  });

  it('AU PLAFOND, on termine EN ÉCHEC — jamais en silence', () => {
    /*
     * Une application vide présentée comme une réussite est le défaut que ce
     * module supprime ; le taire au dernier segment le réintroduirait.
     */
    expect(suiteDuTour({ ...base, finishReason: 'stop', segmentsConsommes: 3 })).toEqual({
      action: 'terminer-en-echec',
      cause: 'annonce-sans-artefact-plafond',
    });
  });

  it('les deux causes de continuation restent DISTINCTES', () => {
    /*
     * Les confondre effacerait la mesure : « coupé net » et « s'est arrêté de
     * lui-même » n'ont pas la même cause ni le même correctif.
     */
    const parLongueur = suiteDuTour({ ...base, finishReason: 'length' });
    const parAnnonce = suiteDuTour({ ...base, finishReason: 'stop' });

    expect(parLongueur).not.toEqual(parAnnonce);
  });

  it('TÉMOIN — les quatre issues sont réellement atteignables', () => {
    // Sans lui, une fonction qui rendrait toujours la même chose passerait la moitié des tests.
    const issues = new Set(
      [
        suiteDuTour({ ...base, finishReason: 'stop', fichierEmis: true }),
        suiteDuTour({ ...base, finishReason: 'stop' }),
        suiteDuTour({ ...base, finishReason: 'length' }),
        suiteDuTour({ ...base, finishReason: 'stop', segmentsConsommes: 3 }),
      ].map((suite) => `${suite.action}:${'cause' in suite ? suite.cause : ''}`),
    );

    expect(issues.size).toBe(4);
  });
});
