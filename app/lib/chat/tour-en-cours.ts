/**
 * LE TOUR QUE CE NAVIGATEUR A VU PARTIR ET PAS FINIR.
 *
 * Mesuré en production le 2026-10-01 à 12:48 : connexion perdue, onglet fermé,
 * le serveur va au bout (13 fichiers) ; à la réouverture, personne n'écrit ses
 * fichiers — le message relu est protégé contre le rejeu (BUG-QA0929), et le
 * rattrapage (#622) ne vit que dans la page qui a vu la coupure.
 *
 * Seul CE navigateur sait que le tour n'est pas arrivé jusqu'à lui : une marque
 * posée à chaque envoi, effacée quand le tour se termine ici (fin normale,
 * arrêt volontaire, erreur rendue par le serveur, rattrapage réussi). Si elle
 * est encore là à la réouverture, le dernier tour est repris EN REVUE (voir
 * `workbenchStore.reprendreLeTourInterrompu`).
 *
 * Le stockage local peut être absent ou refusé (navigation privée) : chaque
 * accès est protégé, et l'absence de marque veut seulement dire « rien à
 * reprendre » — le comportement d'avant.
 */

/** Au-delà, la marque est oubliée : un tour vieux d'un jour n'est plus « en cours ». */
export const VALIDITE_DE_LA_MARQUE_MS = 24 * 60 * 60_000;

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const cle = (projectId: string) => `vibecore.tour-en-cours.${projectId}`;

function stockageParDefaut(): Stockage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function noterLeTourEnCours(projectId: string, maintenant = Date.now(), stockage = stockageParDefaut()) {
  try {
    stockage?.setItem(cle(projectId), JSON.stringify({ debut: maintenant }));
  } catch {
    // stockage refusé : rien à reprendre plus tard, comme avant
  }
}

export function effacerLeTourEnCours(projectId: string, stockage = stockageParDefaut()) {
  try {
    stockage?.removeItem(cle(projectId));
  } catch {
    // idem
  }
}

/** Le dernier tour de ce projet est-il parti d'ici sans y finir ? */
export function tourInterrompuAReprendre(
  projectId: string,
  maintenant = Date.now(),
  stockage = stockageParDefaut(),
): boolean {
  try {
    const brut = stockage?.getItem(cle(projectId));

    if (!brut) {
      return false;
    }

    const { debut } = JSON.parse(brut) as { debut?: unknown };

    return typeof debut === 'number' && maintenant - debut >= 0 && maintenant - debut < VALIDITE_DE_LA_MARQUE_MS;
  } catch {
    return false;
  }
}
