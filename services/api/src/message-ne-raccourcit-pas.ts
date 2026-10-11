/**
 * UNE ÉCRITURE NE DOIT JAMAIS RACCOURCIR UN MESSAGE DÉJÀ PERSISTÉ.
 *
 * Mesuré en production le 2026-09-08 sur `cmtt810ag00040nah6wkh8z1x` :
 *
 *   22:08:32 → 22:12:48   60 synchronisations `PUT /transcript`, toutes les 2-5 s
 *   22:12:48.869          DERNIÈRE — 84 s avant la fin du flux
 *   22:13:35              le client écrit encore des fichiers
 *   22:14:12              fin du flux, finishReason=stop, 83 703 caractères produits
 *   → en base : 37 611 caractères, soit 45 %
 *
 * La transcription est persistée PROGRESSIVEMENT pendant le flux, en `upsert`
 * sur un identifiant stable : la base garde donc le dernier instantané reçu.
 * Quand la synchronisation s'arrête avant la fin, le message reste tronqué.
 *
 * Ce module ne corrige pas cette perte — il empêche qu'elle s'AGGRAVE.
 *
 * Mesuré le même jour à 22:44:49 : en rouvrant le projet, le client a chargé la
 * version tronquée depuis le serveur et l'a RÉÉCRITE telle quelle. La moitié
 * perdue devient alors irrécupérable, et un utilisateur qui rouvre son projet
 * pour comprendre ce qui s'est passé détruit ce qu'il en restait.
 *
 * LA RÈGLE EST UN PRÉFIXE, PAS UNE LONGUEUR.
 *
 * Refuser toute écriture plus courte casserait une régénération : une réponse
 * refaite peut légitimement être plus brève. Mais un instantané périmé du MÊME
 * message est toujours un PRÉFIXE de ce qui est déjà stocké — c'est la
 * signature exacte du défaut, et elle ne peut pas confondre les deux cas.
 */

export interface DecisionEcriture {
  ecrire: boolean;

  /** Renseigné quand l'écriture est refusée, pour le journal. */
  raison?: 'instantane-perime';
  perdus?: number;
}

const OUVERTURE_REFLEXION = '<div class="__boltThought__">';
const FERMETURE_REFLEXION = '</div>\n';

/**
 * Le texte d'un message SANS ses blocs de raisonnement.
 *
 * Le navigateur enregistre sa copie AVEC le raisonnement (enveloppé par
 * `api.chat.ts` dans `<div class="__boltThought__">…</div>`) ; le serveur
 * écrit la sienne SANS (#609). Les deux versions d'un même message ne se
 * comparent qu'une fois les blocs retirés. Mesuré le 2026-10-01 à 12:52 : sans
 * ce retrait, la copie partielle du navigateur (295 caractères, raisonnement
 * compris) n'était pas un « préfixe » de la réponse complète du serveur
 * (25 459), et la remplaçait à la réouverture du projet.
 *
 * Même règle que `sansReflexion` (app/lib/chat/rattrapage-reprise.ts) — un
 * test les compare, le service ne pouvant pas importer le code du navigateur.
 */
export function texteSansReflexion(contenu: string): string {
  let texte = '';
  let position = 0;

  for (;;) {
    const ouverture = contenu.indexOf(OUVERTURE_REFLEXION, position);

    if (ouverture < 0) {
      return texte + contenu.slice(position);
    }

    texte += contenu.slice(position, ouverture);

    const fermeture = contenu.indexOf(FERMETURE_REFLEXION, ouverture + OUVERTURE_REFLEXION.length);

    if (fermeture < 0) {
      return texte;
    }

    position = fermeture + FERMETURE_REFLEXION.length;
  }
}

export function decisionEcritureMessage(existant: string | null | undefined, entrant: string): DecisionEcriture {
  if (!existant) {
    return { ecrire: true };
  }

  const texteExistant = texteSansReflexion(existant);
  const texteEntrant = texteSansReflexion(entrant);

  if (texteEntrant.length < texteExistant.length && texteExistant.startsWith(texteEntrant)) {
    return { ecrire: false, raison: 'instantane-perime', perdus: texteExistant.length - texteEntrant.length };
  }

  return { ecrire: true };
}
