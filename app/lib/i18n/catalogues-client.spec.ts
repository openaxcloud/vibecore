import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
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
    expect(appels).toHaveBeenCalledWith('/assets/catalogue-fr-app-ddd.json', { signal: expect.any(AbortSignal) });
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
    expect(appels).toHaveBeenCalledWith('/assets/catalogue-fr-app-ddd.json', { signal: expect.any(AbortSignal) });

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

  it.each(['headers', 'body'])('borne une attente indéfinie (%s), abandonne et permet une reprise', async (stage) => {
    vi.useFakeTimers();

    const { client, runtime } = await moduleNeuf();
    const never = new Promise<never>(() => undefined);

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => (stage === 'headers' ? never : Promise.resolve({ ok: true, json: () => never })));
    vi.stubGlobal('fetch', fetchMock);

    const pending = client.chargerCatalogue('en', 'public');
    const rejection = expect(pending).rejects.toMatchObject({ code: 'I18N_CATALOGUE_TIMEOUT', catalogue: 'en-public' });
    await vi.advanceTimersByTimeAsync(client.CATALOGUE_REQUEST_TIMEOUT_MS);
    await rejection;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(runtime.catalogueDisponible('en', 'public')).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ 'root.loadingEcode': 'Loading E-Code' }) });
    await client.chargerCatalogue('en', 'public');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(runtime.catalogueDisponible('en', 'public')).toBe(true);
  });

  it.each(['http', 'json', 'shape'])('refuse un catalogue %s invalide sans enregistrer sa tranche', async (failure) => {
    const { client, runtime } = await moduleNeuf();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: failure !== 'http',
        status: 503,
        json: async () => {
          if (failure === 'json') {
            throw new SyntaxError('invalid JSON');
          }

          return ['not a dictionary'];
        },
      }),
    );
    await expect(client.chargerCatalogue('fr', 'public')).rejects.toMatchObject(
      failure === 'json'
        ? { name: 'SyntaxError' }
        : {
            code: failure === 'http' ? 'I18N_CATALOGUE_HTTP' : 'I18N_CATALOGUE_INVALID',
            catalogue: 'fr-public',
            ...(failure === 'http' ? { status: 503 } : {}),
          },
    );
    expect(runtime.catalogueDisponible('fr', 'public')).toBe(false);
  });
});
