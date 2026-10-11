import { atom } from 'nanostores';

/**
 * Échec du chargement de la mémoire de projet, rendu VISIBLE et réessayable.
 *
 * Le défaut : quand cette lecture échouait, l'utilisateur voyait un toast
 * éphémère puis un panneau d'agent vide, impossible à distinguer d'une
 * conversation qui n'aurait jamais existé. Mesuré le 2026-09-02 —
 * `getProjectIdeMemory` rejetait à 5004 ms sur `AbortError`, `chatMetadata`
 * n'était jamais posé, et la transcription restait vide pour toute la durée de
 * la page. Rien, à l'écran, ne disait qu'il fallait recharger.
 *
 * Un échec terminal silencieux est précisément ce qu'on ne veut plus : mieux
 * vaut « impossible de charger la conversation — réessayer » qu'un panneau muet.
 */
export const chargementMemoireProjetEnEchec = atom(false);

/**
 * Incrémenté par le bouton « réessayer ». `useChatHistory` en dépend, donc le
 * relever relance la lecture — c'est le seul mécanisme qui rouvre la porte.
 */
export const nouvelEssaiMemoireProjet = atom(0);

export function demanderUnNouvelEssaiMemoireProjet() {
  chargementMemoireProjetEnEchec.set(false);
  nouvelEssaiMemoireProjet.set(nouvelEssaiMemoireProjet.get() + 1);
}

export function reinitialiserEchecMemoireProjetPourTest() {
  chargementMemoireProjetEnEchec.set(false);
  nouvelEssaiMemoireProjet.set(0);
}
