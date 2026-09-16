/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearUserLanguagePreference,
  detectUserLanguage,
  setUserLanguagePreference,
  USER_LANGUAGE_STORAGE_KEY,
} from './language';

/*
 * Deux exigences produit, figées ici :
 *
 *   1. la langue est DÉTECTÉE depuis le navigateur au chargement ;
 *   2. le réglage des Paramètres SURCHARGE cette détection, et « Automatique »
 *      la rend.
 *
 * Le point 2 est celui qui casse le plus facilement : le cookie de choix
 * explicite gagne sur `navigator.language`, donc sans un vrai effacement,
 * « Automatique » serait un libellé sans effet.
 */

function poserLangueNavigateur(valeur: string) {
  Object.defineProperty(window.navigator, 'language', { value: valeur, configurable: true });
}

function effacerCookies() {
  for (const segment of document.cookie.split(';')) {
    const nom = segment.split('=')[0]?.trim();

    if (nom) {
      document.cookie = `${nom}=; Path=/; Max-Age=0`;
    }
  }
}

beforeEach(() => {
  effacerCookies();
  localStorage.clear();
});

afterEach(() => {
  effacerCookies();
  localStorage.clear();
});

describe('détection automatique depuis le navigateur', () => {
  it('un navigateur en français donne le français', () => {
    poserLangueNavigateur('fr-FR');

    expect(detectUserLanguage()).toBe('fr');
  });

  it('un navigateur en anglais donne l’anglais', () => {
    poserLangueNavigateur('en-US');

    expect(detectUserLanguage()).toBe('en');
  });

  it('une langue non prise en charge retombe sur l’anglais plutôt que d’échouer', () => {
    poserLangueNavigateur('de-DE');

    expect(detectUserLanguage()).toBe('en');
  });

  it('accepte un tag court comme un tag régional', () => {
    poserLangueNavigateur('fr');

    expect(detectUserLanguage()).toBe('fr');
  });
});

describe('le réglage des Paramètres surcharge la détection', () => {
  it('choisir l’anglais l’emporte sur un navigateur français', () => {
    poserLangueNavigateur('fr-FR');
    setUserLanguagePreference('en');

    expect(detectUserLanguage()).toBe('en');
  });

  it('choisir le français l’emporte sur un navigateur anglais', () => {
    poserLangueNavigateur('en-US');
    setUserLanguagePreference('fr');

    expect(detectUserLanguage()).toBe('fr');
  });

  it('revenir à « Automatique » rend la main au navigateur', () => {
    poserLangueNavigateur('fr-FR');
    setUserLanguagePreference('en');
    expect(detectUserLanguage()).toBe('en');

    clearUserLanguagePreference();

    expect(detectUserLanguage()).toBe('fr');
  });

  it('« Automatique » efface AUSSI la copie en stockage local', () => {
    /*
     * Le stockage local est consulté juste après le cookie : n'effacer que le
     * cookie laisserait le choix explicite survivre par cette seconde porte, et
     * « Automatique » n'aurait toujours aucun effet.
     */
    poserLangueNavigateur('fr-FR');
    setUserLanguagePreference('en');
    expect(localStorage.getItem(USER_LANGUAGE_STORAGE_KEY)).toBe('en');

    clearUserLanguagePreference();

    expect(localStorage.getItem(USER_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(detectUserLanguage()).toBe('fr');
  });
});
