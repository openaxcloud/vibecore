/**
 * Plafonds d'offre — module SANS dépendance, importable côté navigateur.
 *
 * L'index du paquet tire `node:crypto` : importé depuis une route, il bloque la
 * page sur l'écran de chargement (mesuré le 2026-10-01 sur /upgrade). Les
 * valeurs utilisées côté client viennent donc d'ICI, jamais de l'index.
 */

/**
 * Sentinelle « aucun plafond d'OFFRE sur cette dimension ».
 *
 * `assertQuota` bloque dès que la limite vaut 0, et `ensureQuota` lit
 * `limits[key] ?? 0` : une dimension absente bloquerait donc tout. Quand Replit
 * ne publie AUCUN plafond pour une dimension, on ne peut ni inventer un chiffre
 * ni laisser 0 — on déclare explicitement l'absence de plafond commercial.
 */
export const NO_PUBLISHED_CAP = 1_000_000;

/** Une limite à la sentinelle (ou au-delà) n'est pas un plafond : l'interface dit « illimité », jamais « 1 000 000 ». */
export function isUnlimitedLimit(value: number): boolean {
  return value >= NO_PUBLISHED_CAP;
}

/**
 * Plafond de projets de la formule gratuite — DÉCISION D'AVI EN ATTENTE (UIB-06).
 *
 * Aujourd'hui : aucun plafond publié (sentinelle), que /upgrade affichait
 * « 1 000 000 projets ». Si Avi fixe un nombre, il se change ICI, en une ligne :
 * le quota appliqué par l'API et l'affichage suivent tous les deux.
 */
export const FREE_PLAN_PROJECTS_CAP: number = NO_PUBLISHED_CAP;
