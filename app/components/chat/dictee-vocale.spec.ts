import { describe, expect, it } from 'vitest';
import {
  composerLaSaisie,
  langueDeDictee,
  messageDErreurDeDictee,
  reduireLaDictee,
  transcriptionDepuisResultats,
} from './dictee-vocale';

describe('dictée vocale — la machine à phases', () => {
  it('un appui au repos demande le micro et démarre le moteur', () => {
    expect(reduireLaDictee('repos', { type: 'appui' })).toEqual({ phase: 'demande', action: 'start' });
  });

  it('le moteur confirme : on écoute', () => {
    expect(reduireLaDictee('demande', { type: 'start' })).toEqual({ phase: 'ecoute' });
  });

  it('un appui pendant l’écoute arrête le moteur', () => {
    expect(reduireLaDictee('ecoute', { type: 'appui' })).toEqual({ phase: 'repos', action: 'stop' });
    expect(reduireLaDictee('demande', { type: 'appui' })).toEqual({ phase: 'repos', action: 'stop' });
  });

  it('quand le moteur s’arrête seul (silence, Safari iOS), l’interface revient au repos — un seul appui relance', () => {
    /*
     * Mesuré avant correction : sans gestionnaire `end`, l'interface restait
     * « en écoute » ; l'appui suivant appelait stop() sur un moteur arrêté, et
     * il fallait un troisième appui pour repartir.
     */
    const apresFin = reduireLaDictee('ecoute', { type: 'end' });

    expect(apresFin).toEqual({ phase: 'repos' });
    expect(reduireLaDictee(apresFin.phase, { type: 'appui' })).toEqual({ phase: 'demande', action: 'start' });
  });

  it('une erreur ramène au repos ; un envoi coupe l’écoute en cours', () => {
    expect(reduireLaDictee('ecoute', { type: 'erreur' })).toEqual({ phase: 'repos' });
    expect(reduireLaDictee('ecoute', { type: 'envoi' })).toEqual({ phase: 'repos', action: 'abort' });
    expect(reduireLaDictee('repos', { type: 'envoi' })).toEqual({ phase: 'repos' });
  });
});

describe('dictée vocale — langue, texte, erreurs', () => {
  it('donne au moteur la langue de l’interface, en étiquette régionale', () => {
    expect(langueDeDictee('fr')).toBe('fr-FR');
    expect(langueDeDictee('fr-CA')).toBe('fr-CA');
    expect(langueDeDictee('en')).toBe('en-US');
    expect(langueDeDictee(undefined)).toBe('en-US');
  });

  it('garde le texte déjà tapé et ajoute la dictée derrière', () => {
    // Mesuré avant correction : « Bonjour  » puis dictée → « je veux une page » (le préfixe effacé).
    expect(composerLaSaisie('Bonjour ', 'je veux une page')).toBe('Bonjour je veux une page');
    expect(composerLaSaisie('Bonjour', 'je veux une page')).toBe('Bonjour je veux une page');
    expect(composerLaSaisie('', 'je veux une page')).toBe('je veux une page');
    expect(composerLaSaisie('Bonjour ', '   ')).toBe('Bonjour ');
  });

  it('joint les phrases d’un moteur continu avec l’espace qui manque', () => {
    expect(transcriptionDepuisResultats([[{ transcript: 'une page' }], [{ transcript: 'de contact' }]])).toBe(
      'une page de contact',
    );
    expect(transcriptionDepuisResultats([[{ transcript: 'une page ' }], [{ transcript: 'de contact' }]])).toBe(
      'une page de contact',
    );
    expect(transcriptionDepuisResultats([])).toBe('');
  });

  it('traduit les codes d’erreur du moteur en messages — et se tait sur « aborted »', () => {
    expect(messageDErreurDeDictee('not-allowed')).toBe('permission');
    expect(messageDErreurDeDictee('service-not-allowed')).toBe('permission');
    expect(messageDErreurDeDictee('audio-capture')).toBe('micro-absent');
    expect(messageDErreurDeDictee('network')).toBe('reseau');
    expect(messageDErreurDeDictee('no-speech')).toBe('silence');
    expect(messageDErreurDeDictee('aborted')).toBeNull();
    expect(messageDErreurDeDictee(undefined)).toBeNull();
  });
});
