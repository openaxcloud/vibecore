import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { en } from './messages/en';
import { fr } from './messages/fr';
import { createI18nInstance, getI18nInstance, resetI18nForTest } from './runtime';

describe('i18next runtime', () => {
  beforeEach(() => {
    resetI18nForTest();
  });

  afterEach(() => {
    resetI18nForTest();
  });

  it('boots with the bundled en + fr resources and resolves a flat dotted key in both', () => {
    const instance = getI18nInstance();

    expect(instance.t('patchReview.title', { lng: 'en' })).toBe(en['patchReview.title']);
    expect(instance.t('patchReview.title', { lng: 'fr' })).toBe(fr['patchReview.title'] ?? en['patchReview.title']);
  });

  it('interpolates {placeholder} params using the legacy `{name}` brace syntax', () => {
    const instance = getI18nInstance();

    expect(instance.t('patchReview.filesCount', { count: 3, lng: 'en' })).toBe('3 files');
    expect(instance.t('patchReview.filesCount', { count: 3, lng: 'fr' })).toBe(
      (fr['patchReview.filesCount'] ?? '{count} files').replace('{count}', '3'),
    );
  });

  it('falls back to the English bundle when the active language is missing a key', () => {
    const instance = getI18nInstance();
    instance.changeLanguage('fr');

    // A programming error must never leak an implementation key to users.
    const missing = instance.t('this.key.does.not.exist');
    expect(missing).toBe(en['common.unavailable']);
  });

  it('returns the same instance on subsequent calls (singleton init)', () => {
    const a = getI18nInstance();
    const b = getI18nInstance();

    expect(a).toBe(b);
  });

  it('keeps request-scoped instances isolated during concurrent SSR renders', async () => {
    const english = createI18nInstance('en');
    const french = createI18nInstance('fr');

    expect(english.t('root.loadingPage')).toBe('Loading page');
    expect(french.t('root.loadingPage')).toBe('Chargement de la page');

    await french.changeLanguage('en');

    expect(english.language).toBe('en');
    expect(french.language).toBe('en');
    await french.changeLanguage('fr');
    expect(english.t('root.loadingPage')).toBe('Loading page');
    expect(french.t('root.loadingPage')).toBe('Chargement de la page');
  });
});

/**
 * BUG-PERF-I18N-RACINE-001 — le registre. Ces cas repartent d'un module NEUF
 * (`vi.resetModules`) : le setup de vitest a installé un fournisseur synchrone
 * sur le module d'origine, et c'est justement le chemin « catalogue absent »
 * qu'il faut pouvoir éprouver ici.
 */
describe('le registre de catalogues', () => {
  async function runtimeNeuf() {
    vi.resetModules();

    return import('./runtime');
  }

  afterEach(() => {
    vi.resetModules();
  });

  it('un document en ou fr ne charge que sa langue ; es et ar chargent aussi le repli anglais', async () => {
    const { languesRequises } = await runtimeNeuf();

    expect(languesRequises('en')).toEqual(['en']);
    expect(languesRequises('fr')).toEqual(['fr']);
    expect(languesRequises('es')).toEqual(['es', 'en']);
    expect(languesRequises('ar')).toEqual(['ar', 'en']);
  });

  it('sans catalogue enregistré, rien n’est disponible et une clé rend le libellé de repli — pas la clé', async () => {
    const { catalogueDisponible, createI18nInstance } = await runtimeNeuf();

    expect(catalogueDisponible('fr')).toBe(false);
    expect(createI18nInstance('fr').t('root.loadingPage')).toBe(en['common.unavailable']);
  });

  it('un catalogue enregistré est vu par une instance créée APRÈS', async () => {
    const { catalogueDisponible, createI18nInstance, enregistrerCatalogue } = await runtimeNeuf();

    enregistrerCatalogue('fr', { 'root.loadingPage': 'Chargement de la page' });

    expect(catalogueDisponible('fr')).toBe(true);
    expect(createI18nInstance('fr').t('root.loadingPage')).toBe('Chargement de la page');
  });

  it('le singleton créé AVANT l’enregistrement le reçoit quand même — l’ordre des modules ne compte pas', async () => {
    const { enregistrerCatalogue, getI18nInstance } = await runtimeNeuf();

    const singleton = getI18nInstance();
    expect(singleton.t('root.loadingPage', { lng: 'fr' })).toBe(en['common.unavailable']);

    enregistrerCatalogue('fr', { 'root.loadingPage': 'Chargement de la page' });

    expect(singleton.t('root.loadingPage', { lng: 'fr' })).toBe('Chargement de la page');
  });

  it('prévient ses abonnés à chaque enregistrement, et plus après désabonnement', async () => {
    const { enregistrerCatalogue, sabonnerAuRegistre } = await runtimeNeuf();

    let notifications = 0;

    const desabonner = sabonnerAuRegistre(() => {
      notifications += 1;
    });

    enregistrerCatalogue('en', {});
    enregistrerCatalogue('fr', {});
    expect(notifications).toBe(2);

    desabonner();
    enregistrerCatalogue('es', {});
    expect(notifications).toBe(2);
  });

  it('enregistrerTousLesCatalogues remplit les quatre langues', async () => {
    const { catalogueDisponible, enregistrerTousLesCatalogues } = await runtimeNeuf();

    enregistrerTousLesCatalogues({
      en: { translation: {} },
      fr: { translation: {} },
      es: { translation: {} },
      ar: { translation: {} },
    });

    for (const langue of ['en', 'fr', 'es', 'ar'] as const) {
      expect(catalogueDisponible(langue), langue).toBe(true);
    }
  });
});
