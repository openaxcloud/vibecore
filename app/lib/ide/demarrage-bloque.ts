/**
 * BUG-IDE-006 — un démarrage qui n'aboutit pas doit le DIRE.
 *
 * Observé le 2026-08-12 : pendant ~20 minutes, la barre d'état a affiché
 * « Dév. : démarrage (npm run dev) » et « Aperçu — Détection » alors que le pod
 * n'avait AUCUN `node_modules` et AUCUN processus vite — l'installation ne
 * pouvait pas aboutir. Aucun message, aucun délai d'expiration, aucune action
 * de reprise : l'écran d'un démarrage impossible était rigoureusement le même
 * que celui d'un démarrage lent.
 *
 * C'est la même famille que BUG-UX-014, BUG-CREATE-004 et BUG-PREVIEW-REMOUNT-001 :
 * un écran qui affirme une progression qu'il n'a pas. Ici l'affirmation est
 * implicite — un rouet qui tourne dit « ça avance » — et c'est ce qui la rend
 * difficile à voir.
 *
 * CE QUE CE MODULE NE FAIT PAS, et c'est délibéré : il ne DIAGNOSTIQUE rien. La
 * cause de 2026-08-12 était une NetworkPolicy DNS manquante, hors de portée du
 * navigateur. Prétendre nommer la cause depuis le client serait inventer. Il
 * répond à une seule question, celle que l'utilisateur se pose : « est-ce que
 * ça avance encore, ou est-ce que c'est planté ? »
 */

/**
 * Au-delà de ce silence, un démarrage n'est plus « lent », il est SUSPECT.
 *
 * Les bornes qui l'encadrent, mesurées sur ce produit :
 *   - un `npm install` à froid sur un pod neuf prend 30 à 90 s, et il fait
 *     avancer l'étape en chemin ;
 *   - le symptôme d'origine a duré **20 minutes** sans un seul changement
 *     d'étape.
 * Trois minutes laissent donc passer tout démarrage sain avec une marge large,
 * et coupent court aux dix-sept minutes de silence qui suivaient.
 */
export const SEUIL_DEMARRAGE_BLOQUE_MS = 180_000;

/**
 * Le démarrage n'a plus progressé depuis assez longtemps pour qu'on le dise.
 *
 * @param msDepuisLeDernierProgres temps écoulé depuis le dernier CHANGEMENT
 *   d'étape — pas depuis le début. Un démarrage lent mais qui avance passe
 *   d'étape en étape et ne déclenche jamais cette bascule.
 */
export function demarrageBloque(msDepuisLeDernierProgres: number): boolean {
  if (!Number.isFinite(msDepuisLeDernierProgres)) {
    return false;
  }

  return msDepuisLeDernierProgres >= SEUIL_DEMARRAGE_BLOQUE_MS;
}

/**
 * Le temps écoulé depuis le dernier progrès, à partir des deux horodatages.
 *
 * Rend 0 — donc « pas bloqué » — quand l'horodatage manque ou qu'il est dans le
 * futur. Une horloge qui recule ne doit pas afficher un blocage : ce serait
 * ajouter un mensonge d'état pour en corriger un autre.
 */
export function msDepuisLeDernierProgres(dernierProgresMs: number | undefined, maintenantMs: number): number {
  if (typeof dernierProgresMs !== 'number' || !Number.isFinite(dernierProgresMs)) {
    return 0;
  }

  return Math.max(0, maintenantMs - dernierProgresMs);
}
