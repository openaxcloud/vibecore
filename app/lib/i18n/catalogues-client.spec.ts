import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:catalogues-i18n', () => ({
  URLS: {
    en: { public: '/assets/catalogue-en-public-aaa.json', app: '/assets/catalogue-en-app-bbb.json' },
    fr: { public: '/assets/catalogue-fr-public-ccc.json', app: '/assets/catalogue-fr-app-ddd.json' },
    es: { public: '/assets/catalogue-es-public-eee.json', app: '/assets/catalogue-es-app-fff.json' },
    ar: { public: '/assets/catalogue-ar-public-ggg.json', app: '/assets/catalogue-ar-app-hhh.json' },
  },
}));

/**
 * BUG-PERF-I18N-SURFACE-001 — les trois verrous, vus depuis le navigateur.
 *
 * Le gain (−77 % sur le catalogue de la page d'accueil) ne vaut que si l'IDE
 * ne s'ouvre jamais sur des clés brutes. Ces cas tiennent ce contrat ; le
 * verrou 1 (la fermeture par défaut) est tenu par `surfaces.spec.ts`.
 */
async function moduleNeuf() {
  vi.resetModules();

  const runtime = await import('./runtime');
  const client = await import('./catalogues-client');

  return { runtime, client };
}

describe('le chargement des tranches par le navigateur', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('demande UNE seule tranche sur un chemin public, et les DEUX ailleurs', async () => {
    const { client } = await moduleNeuf();

    expect(client.tranchesDuDocument('fr', '/')).toEqual([{ langue: 'fr', surface: 'public' }]);
    expect(client.tranchesDuDocument('fr', '/projects/abc/ide')).toEqual([
      { langue: 'fr', surface: 'public' },
      { langue: 'fr', surface: 'app' },
    ]);
  });

  it('charge aussi le repli anglais pour une langue partielle — une tranche par couple', async () => {
    const { client } = await moduleNeuf();

    expect(client.tranchesDuDocument('ar', '/')).toEqual([
      { langue: 'ar', surface: 'public' },
      { langue: 'en', surface: 'public' },
    ]);
  });

  it('enregistre la tranche reçue SANS écraser celle déjà en place', async () => {
    const { runtime, client } = await moduleNeuf();

    runtime.enregistrerCatalogue('fr', { 'common.unavailable': 'Indisponible' }, ['public']);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ 'chat.send': 'Envoyer' }) } as Response)),
    );

    await client.chargerCatalogue('fr', 'app');

    expect(runtime.catalogueDisponible('fr', 'public')).toBe(true);
    expect(runtime.catalogueDisponible('fr', 'app')).toBe(true);

    // La fusion, pas le remplacement : les deux clés coexistent.
    const instance = runtime.createI18nInstance('fr');
    expect(instance.t('common.unavailable')).toBe('Indisponible');
    expect(instance.t('chat.send')).toBe('Envoyer');
  });

  it('ne lance qu’une requête pour deux demandes simultanées de la même tranche', async () => {
    const { client } = await moduleNeuf();
    const appels = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response));

    vi.stubGlobal('fetch', appels);
    await Promise.all([client.chargerCatalogue('fr', 'app'), client.chargerCatalogue('fr', 'app')]);

    expect(appels).toHaveBeenCalledTimes(1);
    expect(appels).toHaveBeenCalledWith('/assets/catalogue-fr-app-ddd.json');
  });

  it('VERROU 3 — une clé de la tranche absente déclenche son chargement, au lieu de figer « Unavailable »', async () => {
    const { runtime, client } = await moduleNeuf();

    runtime.enregistrerCatalogue('fr', { 'common.unavailable': 'Indisponible' }, ['public']);
    client.cablerLeChargeurDeSecours();

    const appels = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ 'chat.send': 'Envoyer' }) } as Response),
    );
    vi.stubGlobal('fetch', appels);

    const instance = runtime.createI18nInstance('fr');

    /*
     * La clé manque : l'affichage dégrade, mais la tranche part être chercher.
     * Le repli est le littéral ANGLAIS `en['common.unavailable']` du bundle, pas
     * la valeur française du registre — comportement d'avant ce lot, mesuré ici
     * pour qu'un changement se voie.
     */
    expect(instance.t('chat.send')).toBe('Unavailable');
    expect(appels).toHaveBeenCalledWith('/assets/catalogue-fr-app-ddd.json');

    await new Promise((resoudre) => setTimeout(resoudre, 0));

    // Et une fois arrivée, la clé se résout — le registre a notifié ses abonnés.
    expect(runtime.catalogueDisponible('fr', 'app')).toBe(true);
    expect(runtime.createI18nInstance('fr').t('chat.send')).toBe('Envoyer');
  });

  it('VERROU 3 — ne redemande RIEN quand la tranche est déjà là (une clé simplement absente)', async () => {
    const { runtime, client } = await moduleNeuf();

    runtime.enregistrerCatalogue('fr', { 'common.unavailable': 'Indisponible' }, ['public', 'app']);
    client.cablerLeChargeurDeSecours();

    const appels = vi.fn();
    vi.stubGlobal('fetch', appels);

    expect(runtime.createI18nInstance('fr').t('chat.send')).toBe('Unavailable');
    expect(appels).not.toHaveBeenCalled();
  });
});
