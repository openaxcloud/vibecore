/**
 * Chargement côté navigateur du catalogue i18n — par LANGUE (#535) et par
 * SURFACE (BUG-PERF-I18N-SURFACE-001).
 *
 * Le navigateur va chercher un JSON par couple (langue requise × surface
 * requise), émis au build par `build-config/catalogues-i18n-plugin.ts`, et
 * l'enregistre dans le runtime AVANT que `entry.client.tsx` n'hydrate.
 * `root.tsx` précharge les mêmes URL dans `<head>`, donc les requêtes partent
 * en parallèle du JavaScript et non après lui.
 *
 * Un document public ne demande que la tranche `public`. Les trois verrous qui
 * empêchent ce gain de se payer en clés brutes sont décrits dans `surfaces.ts` ;
 * les verrous 2 et 3 sont câblés ici (`prechargerLeReste`, `chargeurDeSecours`).
 */
import { URLS } from 'virtual:catalogues-i18n';

import { normalizeSupportedLanguage, type SupportedLanguage } from './language';
import { catalogueDisponible, definirChargeurDeSecours, enregistrerCatalogue, languesRequises } from './runtime';
import { surfacesRequises, SURFACES, type Surface } from './surfaces';

const enCours = new Map<string, Promise<void>>();

// Bound the complete request, including a response body that never finishes.
export const CATALOGUE_REQUEST_TIMEOUT_MS = 10_000;

class CatalogueLoadError extends Error {
  constructor(
    readonly code: 'I18N_CATALOGUE_TIMEOUT' | 'I18N_CATALOGUE_HTTP' | 'I18N_CATALOGUE_INVALID',
    readonly catalogue: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'CatalogueLoadError';
  }
}

async function lireCatalogue(url: string, jeton: string): Promise<Record<string, string>> {
  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new CatalogueLoadError('I18N_CATALOGUE_TIMEOUT', jeton));
      controller.abort();
    }, CATALOGUE_REQUEST_TIMEOUT_MS);
  });
  const request = async () => {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new CatalogueLoadError('I18N_CATALOGUE_HTTP', jeton, response.status);
    }

    const catalogue: unknown = await response.json();

    if (
      !catalogue ||
      typeof catalogue !== 'object' ||
      Array.isArray(catalogue) ||
      !Object.values(catalogue).every((value) => typeof value === 'string')
    ) {
      throw new CatalogueLoadError('I18N_CATALOGUE_INVALID', jeton);
    }

    return catalogue as Record<string, string>;
  };

  try {
    return await Promise.race([request(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function urlDuCatalogue(langue: SupportedLanguage, surface: Surface): string {
  return URLS[langue][surface];
}

export function chargerCatalogue(langue: SupportedLanguage, surface: Surface): Promise<void> {
  if (catalogueDisponible(langue, surface)) {
    return Promise.resolve();
  }

  const jeton = `${langue}-${surface}`;
  const dejaEnCours = enCours.get(jeton);

  if (dejaEnCours) {
    return dejaEnCours;
  }

  const chargement = lireCatalogue(urlDuCatalogue(langue, surface), jeton)
    .then((catalogue) => {
      enregistrerCatalogue(langue, catalogue, [surface]);
    })
    .finally(() => {
      enCours.delete(jeton);
    });

  enCours.set(jeton, chargement);

  return chargement;
}

/**
 * La langue du document telle que le serveur l'a écrite sur `<html lang>` —
 * c'est la seule source qui soit disponible AVANT l'hydratation, et c'est
 * celle avec laquelle le HTML a été rendu.
 */
export function langueDuDocument(lang: string | null | undefined): SupportedLanguage {
  return normalizeSupportedLanguage(lang) ?? 'en';
}

/** Les couples (langue, surface) qu'un document doit avoir chargés avant d'hydrater. */
export function tranchesDuDocument(
  lang: string | null | undefined,
  pathname: string,
): { langue: SupportedLanguage; surface: Surface }[] {
  const tranches: { langue: SupportedLanguage; surface: Surface }[] = [];

  for (const langue of languesRequises(langueDuDocument(lang))) {
    for (const surface of surfacesRequises(pathname)) {
      tranches.push({ langue, surface });
    }
  }

  return tranches;
}

export function chargerLesCataloguesDuDocument(lang: string | null | undefined, pathname: string): Promise<void> {
  return Promise.all(
    tranchesDuDocument(lang, pathname).map(({ langue, surface }) => chargerCatalogue(langue, surface)),
  ).then(() => undefined);
}

/**
 * VERROU 2 — sur un chemin public, la tranche `app` est allée chercher dès que
 * le navigateur est au repos. Une navigation client vers l'IDE la trouve alors
 * déjà dans le registre, sans éclair de clés brutes.
 */
export function prechargerLeReste(lang: string | null | undefined): void {
  const lancer = () => {
    for (const langue of languesRequises(langueDuDocument(lang))) {
      for (const surface of SURFACES) {
        void chargerCatalogue(langue, surface).catch(() => undefined);
      }
    }
  };

  const auRepos = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;

  if (auRepos) {
    auRepos(lancer);
  } else {
    setTimeout(lancer, 1_000);
  }
}

/** VERROU 3 — une clé manquante déclenche sa tranche au lieu de figer « Unavailable ». */
export function cablerLeChargeurDeSecours(): void {
  definirChargeurDeSecours((langue, surface) => {
    void chargerCatalogue(langue, surface).catch(() => undefined);
  });
}
