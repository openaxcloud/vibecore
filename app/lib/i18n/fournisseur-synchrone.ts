/**
 * Un point d'injection minuscule, sans aucune dépendance, pour que le setup
 * par fichier de vitest puisse fournir un lecteur synchrone de catalogues SANS
 * évaluer i18next dans chacun des 1 089 fichiers de test
 * (BUG-PERF-I18N-RACINE-001). En production, rien n'est jamais défini ici.
 */
import type { SupportedLanguage } from './language';

export type FournisseurSynchrone = (langue: SupportedLanguage) => Record<string, string> | undefined;

let fournisseur: FournisseurSynchrone | undefined;

export function definirFournisseurSynchrone(nouveau: FournisseurSynchrone | undefined): void {
  fournisseur = nouveau;
}

export function lireFournisseurSynchrone(): FournisseurSynchrone | undefined {
  return fournisseur;
}
