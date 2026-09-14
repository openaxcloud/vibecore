/**
 * Chargement côté navigateur du catalogue i18n de la langue du document.
 *
 * BUG-PERF-I18N-RACINE-001 : le navigateur ne reçoit plus les 150 catalogues
 * dans le graphe statique de `root.tsx` ; il va chercher UN JSON par langue
 * requise (`languesRequises`), émis au build par
 * `build-config/catalogues-i18n-plugin.ts`, et l'enregistre dans le runtime
 * AVANT que `entry.client.tsx` n'hydrate. `root.tsx` précharge la même URL
 * dans `<head>` (`<link rel="preload" as="fetch">`), donc la requête part en
 * parallèle du JavaScript et non après lui.
 *
 * Les URL viennent du module virtuel du plugin : en dev, un middleware ; au
 * build, `assets/catalogue-<langue>-<empreinte>.json`.
 */
import { URLS } from 'virtual:catalogues-i18n';

import { normalizeSupportedLanguage, type SupportedLanguage } from './language';
import { catalogueDisponible, enregistrerCatalogue, languesRequises } from './runtime';

const enCours = new Map<SupportedLanguage, Promise<void>>();

export function urlDuCatalogue(langue: SupportedLanguage): string {
  return URLS[langue];
}

export function chargerCatalogue(langue: SupportedLanguage): Promise<void> {
  if (catalogueDisponible(langue)) {
    return Promise.resolve();
  }

  const dejaEnCours = enCours.get(langue);

  if (dejaEnCours) {
    return dejaEnCours;
  }

  const chargement = fetch(urlDuCatalogue(langue))
    .then((reponse) => {
      if (!reponse.ok) {
        // Un code, pas une phrase : ce message n'est jamais affiché, seulement consigné.
        throw new Error(`i18n-catalogue-${langue}-http-${reponse.status}`);
      }

      return reponse.json() as Promise<Record<string, string>>;
    })
    .then((catalogue) => {
      enregistrerCatalogue(langue, catalogue);
    })
    .finally(() => {
      enCours.delete(langue);
    });

  enCours.set(langue, chargement);

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

export function chargerLesCataloguesDuDocument(lang: string | null | undefined): Promise<void> {
  return Promise.all(languesRequises(langueDuDocument(lang)).map(chargerCatalogue)).then(() => undefined);
}
