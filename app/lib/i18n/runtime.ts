/**
 * react-i18next runtime that takes over from the legacy `dictionary.ts`
 * lookup. The provider boots i18next with a single flat `translation`
 * namespace per language, keyed by the same "<namespace>.<key>" strings the
 * legacy `t()` used, so moving a call site over is a like-for-like rename.
 *
 * CE MODULE N'IMPORTE AUCUN CATALOGUE — et c'est le point.
 *
 * BUG-PERF-I18N-RACINE-001, mesuré le 2026-09-14 : quand ce fichier importait
 * les 150 catalogues `…En` / `…Fr` pour bâtir `RESOURCES`, `root.tsx` (qui
 * appelle `createI18nInstance` à chaque rendu) traînait 653 Ko de texte anglais
 * ET 738 Ko de texte français sur TOUTE page, accueil marketing compris — le
 * chunk `runtime-*.js` pesait 979 Ko à lui seul, et douze chunks de « route »
 * du chemin critique racine n'étaient que des catalogues.
 *
 * Le runtime ne connaît plus qu'un REGISTRE par langue, rempli de l'extérieur :
 *   - le serveur y enregistre les ressources statiques au démarrage
 *     (`entry.server.tsx` ← `runtime-resources.ts`) ;
 *   - le navigateur y charge UN JSON, celui de la langue du document, AVANT
 *     d'hydrater (`entry.client.tsx` ← `catalogues-client.ts`) ;
 *   - les tests lisent un JSON produit une fois par run (`test.globalSetup`),
 *     à la demande, par un fournisseur synchrone (`test.setupFiles`).
 *
 * Une instance i18next créée avant l'arrivée d'un catalogue (le singleton que
 * des magasins créent au chargement de leur module) le reçoit par
 * `addResourceBundle` : l'ordre d'évaluation des modules ne compte pas.
 */
import i18next, { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { lireFournisseurSynchrone } from './fournisseur-synchrone';
import { detectUserLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './language';
import { en } from './messages/en';

type Catalogue = Record<string, string>;

const registre: Partial<Record<SupportedLanguage, Catalogue>> = {};
const abonnes = new Set<() => void>();

let initialized = false;

/*
 * Tests seulement (voir `fournisseur-synchrone.ts`) : le setup de vitest ne
 * peut pas se permettre d'évaluer 150 catalogues dans CHACUN des 1 089 fichiers
 * de test (mesuré : 2,2 s par fichier) ; il fournit une lecture synchrone d'un
 * JSON produit une fois par run, que le registre n'interroge que si une langue
 * est demandée. En production, aucun fournisseur n'est jamais défini.
 */
function catalogueDuRegistre(langue: SupportedLanguage): Catalogue | undefined {
  if (registre[langue] === undefined) {
    registre[langue] = lireFournisseurSynchrone()?.(langue);
  }

  return registre[langue];
}

/**
 * Les langues qu'un document doit avoir chargées pour se rendre SANS repli
 * manquant. Mesuré le 2026-09-14 : en et fr portent exactement les mêmes
 * 10 548 clés (garde : `runtime-resources.spec.ts`), donc un document français
 * n'a jamais besoin de l'anglais. es et ar ne portent que 45 clés : tout le
 * reste vient du repli `fallbackLng: 'en'`, qui doit donc être chargé aussi.
 */
export function languesRequises(langue: SupportedLanguage): SupportedLanguage[] {
  return langue === 'en' || langue === 'fr' ? [langue] : [langue, 'en'];
}

export function catalogueDisponible(langue: SupportedLanguage): boolean {
  return catalogueDuRegistre(langue) !== undefined;
}

/**
 * Enregistre le catalogue d'une langue et le propage au singleton s'il est
 * déjà initialisé. Idempotent : ré-enregistrer la même langue est sans effet
 * visible (mêmes clés, mêmes valeurs) mais notifie quand même les abonnés.
 */
export function enregistrerCatalogue(langue: SupportedLanguage, catalogue: Catalogue): void {
  registre[langue] = catalogue;

  if (initialized) {
    i18next.addResourceBundle(langue, 'translation', catalogue, true, true);
  }

  for (const abonne of abonnes) {
    abonne();
  }
}

export function enregistrerTousLesCatalogues(ressources: Record<SupportedLanguage, { translation: Catalogue }>): void {
  for (const langue of SUPPORTED_LANGUAGES) {
    enregistrerCatalogue(langue, ressources[langue].translation);
  }
}

/** Abonnement au registre — pensé pour `useSyncExternalStore` dans `root.tsx`. */
export function sabonnerAuRegistre(abonne: () => void): () => void {
  abonnes.add(abonne);

  return () => {
    abonnes.delete(abonne);
  };
}

function ressourcesDuRegistre(): Record<string, { translation: Catalogue }> {
  const ressources: Record<string, { translation: Catalogue }> = {};

  for (const langue of SUPPORTED_LANGUAGES) {
    ressources[langue] = { translation: catalogueDuRegistre(langue) ?? {} };
  }

  return ressources;
}

const runtimeOptions = (language: SupportedLanguage) => ({
  resources: ressourcesDuRegistre(),
  lng: language,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
  returnNull: false,
  returnEmptyString: false,
  initImmediate: false,
  parseMissingKeyHandler: () => en['common.unavailable'],
});

/**
 * Create an isolated, synchronously initialized instance for one document
 * render. SSR must never reuse the mutable global i18next language across two
 * visitors, otherwise a French request can leak into a concurrent English one.
 *
 * L'instance photographie le registre au moment de sa création : `root.tsx`
 * la recrée quand le registre change (abonnement ci-dessus).
 */
export function createI18nInstance(language: SupportedLanguage): I18nInstance {
  const instance = createInstance();

  instance
    .use(initReactI18next)
    .init(runtimeOptions(language))
    .catch(() => undefined);

  return instance;
}

export function getI18nInstance(): I18nInstance {
  if (!initialized) {
    i18next
      .use(initReactI18next)
      .init(runtimeOptions(detectUserLanguage()))
      .catch(() => {
        /*
         * Init only fails on truly bad config; nothing to do at runtime —
         * the fallbackLng path returns the key as the value, which is the
         * same degraded behaviour the old `t()` already had.
         */
      });

    initialized = true;
  }

  return i18next;
}

/**
 * Tests-only reset so a spec can boot i18next fresh between cases without
 * leaking interpolation prefix overrides into the next module. Le registre
 * n'est PAS vidé : les catalogues enregistrés par le setup restent.
 */
export function resetI18nForTest(): void {
  initialized = false;
}
