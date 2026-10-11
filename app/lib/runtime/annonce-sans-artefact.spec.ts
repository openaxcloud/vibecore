import { describe, expect, it } from 'vitest';

import { RELANCE_ARTEFACT_MANQUANT, refusExpliciteDeFichiers, suiteDuTour } from './annonce-sans-artefact';

const CONTINUE = 'Continue your prior response.';

const base = {
  modeConstruction: true,
  fichierEmis: false,
  fichiersRefuses: false,
  segmentsConsommes: 0,
  segmentsMax: 3,
};

describe('une annonce n’est pas une livraison', () => {
  it('LE DÉFAUT — `stop` en construction sans un seul fichier REDONNE la main', () => {
    /*
     * Les trois applications vides du 09-09 : transcrit complet, phrase finale
     * qui annonce l'artefact, zéro fichier. Avant ce module, ce tour était
     * compté comme une réussite parce que la continuation n'existait que pour
     * `finishReason: 'length'`.
     */
    expect(suiteDuTour({ ...base, finishReason: 'stop' }, CONTINUE)).toEqual({
      action: 'continuer',
      cause: 'annonce-sans-artefact',
      relance: RELANCE_ARTEFACT_MANQUANT,
    });
  });

  it('un tour qui a écrit un fichier se termine — on ne relance pas ce qui a livré', () => {
    expect(suiteDuTour({ ...base, finishReason: 'stop', fichierEmis: true }, CONTINUE)).toEqual({
      action: 'terminer',
    });
  });

  it('hors mode construction, `stop` sans fichier est la BONNE réponse', () => {
    /*
     * « Explique-moi ce fichier » n'écrit rien. Relancer ici ferait payer un
     * second tour pour redemander ce qui a déjà été répondu.
     */
    expect(suiteDuTour({ ...base, finishReason: 'stop', modeConstruction: false }, CONTINUE)).toEqual({
      action: 'terminer',
    });
  });

  it('la continuation `length` existante n’est pas touchée', () => {
    expect(suiteDuTour({ ...base, finishReason: 'length' }, CONTINUE)).toEqual({
      action: 'continuer',
      cause: 'longueur',
      relance: CONTINUE,
    });
    expect(suiteDuTour({ ...base, finishReason: 'length', segmentsConsommes: 3 }, CONTINUE)).toEqual({
      action: 'terminer',
    });
  });

  it('AU PLAFOND, on termine EN ÉCHEC — jamais en silence', () => {
    /*
     * Une application vide présentée comme une réussite est le défaut que ce
     * module supprime ; le taire au dernier segment le réintroduirait.
     */
    expect(suiteDuTour({ ...base, finishReason: 'stop', segmentsConsommes: 3 }, CONTINUE)).toEqual({
      action: 'terminer-en-echec',
      cause: 'annonce-sans-artefact-plafond',
    });
  });

  it('les deux causes de continuation restent DISTINCTES', () => {
    /*
     * Les confondre effacerait la mesure : « coupé net » et « s'est arrêté de
     * lui-même » n'ont pas la même cause ni le même correctif.
     */
    const parLongueur = suiteDuTour({ ...base, finishReason: 'length' }, CONTINUE);
    const parAnnonce = suiteDuTour({ ...base, finishReason: 'stop' }, CONTINUE);

    expect(parLongueur).not.toEqual(parAnnonce);
  });

  it('LA RELANCE INSTRUIT — elle ne se contente pas de « continue »', () => {
    /*
     * Mesuré sur le préambule réel du cas fautif : la relance nue rend 2 870
     * caractères et ZÉRO fichier — le modèle réécrit un préambule et s'arrête
     * encore. La relance explicite rend 27 921 caractères et 13 fichiers.
     *
     * Ce test tient l'écart : si la relance de l'annonce redevenait celle de la
     * longueur, on rebrancherait le correctif qui ne change rien.
     */
    const suite = suiteDuTour({ ...base, finishReason: 'stop' }, CONTINUE);

    expect(suite).toMatchObject({ action: 'continuer' });
    expect('relance' in suite && suite.relance).not.toBe(CONTINUE);
    expect(RELANCE_ARTEFACT_MANQUANT).toMatch(/boltArtifact/u);
    expect(RELANCE_ARTEFACT_MANQUANT).toMatch(/MAINTENANT/u);
  });

  it('TÉMOIN — les quatre issues sont réellement atteignables', () => {
    // Sans lui, une fonction qui rendrait toujours la même chose passerait la moitié des tests.
    const issues = new Set(
      [
        suiteDuTour({ ...base, finishReason: 'stop', fichierEmis: true }, CONTINUE),
        suiteDuTour({ ...base, finishReason: 'stop' }, CONTINUE),
        suiteDuTour({ ...base, finishReason: 'length' }, CONTINUE),
        suiteDuTour({ ...base, finishReason: 'stop', segmentsConsommes: 3 }, CONTINUE),
      ].map((suite) => `${suite.action}:${'cause' in suite ? suite.cause : ''}`),
    );

    expect(issues.size).toBe(4);
  });
});

describe('l’utilisateur a dit non — la relance ne passe JAMAIS par-dessus', () => {
  /*
   * La consigne EXACTE du tour de production du 2026-09-28 (projet
   * `cmukvgycf00cp0nf94j2l71js`) : le modèle a obéi, la relance l'a contredit et a
   * écrit onze fichiers refusés.
   */
  const CONSIGNE_DU_28 =
    "Je veux une application de prise de notes en Markdown avec recherche et étiquettes. Pour ce message, n'écris AUCUN fichier et ne produis aucun artefact : présente uniquement ton plan d'architecture en cinq points, puis arrête-toi et attends ma validation.";

  it('LE DÉFAUT — un tour sans fichier sur un refus explicite se TERMINE', () => {
    expect(suiteDuTour({ ...base, finishReason: 'stop', fichiersRefuses: true }, CONTINUE)).toEqual({
      action: 'terminer',
    });
  });

  it('le refus ne devient pas un échec au plafond : ce n’est pas un défaut du modèle', () => {
    expect(
      suiteDuTour({ ...base, finishReason: 'stop', fichiersRefuses: true, segmentsConsommes: 3 }, CONTINUE),
    ).toEqual({ action: 'terminer' });
  });

  it('sans refus, la relance d’annonce est INCHANGÉE — le filet reste en place', () => {
    expect(suiteDuTour({ ...base, finishReason: 'stop', fichiersRefuses: false }, CONTINUE)).toMatchObject({
      action: 'continuer',
      cause: 'annonce-sans-artefact',
    });
  });

  it('la consigne réelle du 28/09 est reconnue comme un refus', () => {
    expect(refusExpliciteDeFichiers(CONSIGNE_DU_28)).toBe(true);
  });

  it.each([
    "N'écris aucun fichier pour l'instant.",
    'ne crée pas de fichiers, explique seulement',
    "Ne génère pas encore le code, on en discute d'abord.",
    'Donne-moi juste le plan.',
    'Plan seulement, merci.',
    'Présente uniquement ton plan.',
    'Attends ma validation avant de coder.',
    'Aucun fichier dans cette réponse.',
    'Réponds sans écrire de fichier.',
    "Don't write any files yet, just explain.",
    'Do not create code for now.',
    'Plan only please.',
    'Wait for my approval before touching anything.',
    'No files yet — describe the architecture.',
  ])('refus reconnu : %s', (texte) => {
    expect(refusExpliciteDeFichiers(texte)).toBe(true);
  });

  it.each([
    "Crée une petite application React + Vite de liste de tâches : ajout, suppression, case à cocher, filtre et persistance dans localStorage. Explique brièvement ta démarche avant d'écrire les fichiers.",
    'Ajoute un fichier README avec les instructions.',
    'Corrige le bug dans App.tsx, le bouton ne répond pas.',
    'Refais la page sans toucher au header.',
    'Build a todo app with React and write the files.',
    'Planifie puis implémente la fonctionnalité de recherche.',
    '',
  ])('pas un refus : %s', (texte) => {
    expect(refusExpliciteDeFichiers(texte)).toBe(false);
  });

  /*
   * UNE RESTRICTION DE PORTÉE N'EST PAS UN REFUS. Mesuré en production le
   * 2026-10-01 à 16:44 (projet cmuprkura…) : « Ajoute à la toute fin de
   * src/App.tsx […] une ligne de commentaire. Ne modifie rien d'autre, aucun
   * autre fichier. » — classé « n'écris aucun fichier » : l'écriture de l'agent
   * est refusée par la barrière (`ecriture.refusee.consigne`), en silence. Le
   * tour annonce son travail, rien n'est écrit.
   */
  it.each([
    "Ajoute à la toute fin de src/App.tsx, après la dernière ligne, une ligne de commentaire // signé par l'agent. Ne modifie rien d'autre, aucun autre fichier.",
    "Change le titre. Ne modifie rien d'autre dans le fichier.",
    'Ne touche à aucun autre fichier.',
    'Corrige le bouton, mais ne modifie pas les autres fichiers.',
    "Ne crée pas d'autres fichiers que App.tsx.",
    'Only change the header. Do not touch any other files.',
    "Fix the bug and don't change anything else in the code.",
  ])('restriction de portée, pas un refus : %s', (texte) => {
    expect(refusExpliciteDeFichiers(texte)).toBe(false);
  });

  it.each([
    "N'écris aucun fichier. Ne modifie rien d'autre.",
    "Ne modifie rien d'autre. N'écris aucun fichier pour l'instant.",
    'Ne modifie aucun fichier.',

    /* La restriction est le PREMIER passage du même motif ; le refus, que seul ce motif reconnaît, vient après. */
    "Ne crée pas d'autres fichiers. Et ne génère pas encore le code.",
  ])('un VRAI refus reste reconnu, même à côté d’une restriction : %s', (texte) => {
    expect(refusExpliciteDeFichiers(texte)).toBe(true);
  });

  it('TÉMOIN — absent, nul ou vide ne lève pas', () => {
    expect(refusExpliciteDeFichiers(undefined)).toBe(false);
    expect(refusExpliciteDeFichiers(null)).toBe(false);
  });
});
