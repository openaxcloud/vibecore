/**
 * IDENTITÉ ET PRIORITÉ DES LANES DE SOUS-AGENTS AU MOMENT D'ÉCRIRE.
 *
 * Le parseur de messages indexe son état par `messageId`
 * (`StreamingMessageParser#messages`). C'est ce qui permet à plusieurs lanes de
 * se parser EN PARALLÈLE sans mélanger leurs artefacts : il suffit de donner à
 * chacune son propre identifiant dérivé. Aucun nouveau chemin d'écriture n'est
 * créé — les lanes empruntent celui du coordinateur, qui fonctionne.
 */

/**
 * L'ordre canonique des rôles, qui est aussi l'ordre de PRIORITÉ de l'arbitre.
 *
 * Il n'est pas choisi ici : c'est celui de l'union `roleId` déjà déclarée dans
 * `app/types/context.ts` et servie par la passerelle. On le reprend tel quel
 * plutôt que de faire transiter un rang par annotation — un ordre déjà stable
 * n'a pas besoin d'être transporté, et une seconde source de vérité finirait
 * par diverger de la première.
 *
 * La lecture produit une hiérarchie défendable : l'architecte pose les
 * fondations et l'emporte sur tous ; le frontend l'emporte sur le backend pour
 * un fichier d'interface disputé ; la QA, qui écrit des tests, cède sur tout
 * fichier de production qu'un autre rôle revendique.
 */
export const RANGS_DES_ROLES = ['architect', 'frontend', 'backend', 'devops', 'qa'] as const;

export type RoleDeLane = (typeof RANGS_DES_ROLES)[number];

const SEPARATEUR = '::lane:';

/** L'identifiant de parseur propre à une lane. */
export function identifiantDeLane(messageId: string, roleId: string): string {
  return `${messageId}${SEPARATEUR}${roleId}`;
}

export interface LaneDecodee {
  messageId: string;
  roleId: string;

  /** Rang de priorité ; les rôles inconnus passent DERRIÈRE tous les connus. */
  rang: number;
}

/**
 * Reconnaît un identifiant de lane et rend son rang.
 *
 * Rend `undefined` pour un identifiant de message ordinaire — c'est ce qui
 * permet aux rappels du parseur de distinguer le flux du coordinateur, qui
 * n'est jamais arbitré, des flux de rôles, qui le sont toujours.
 */
export function decoderLane(identifiant: string): LaneDecodee | undefined {
  const coupure = identifiant.lastIndexOf(SEPARATEUR);

  if (coupure < 0) {
    return undefined;
  }

  const roleId = identifiant.slice(coupure + SEPARATEUR.length);
  const connu = (RANGS_DES_ROLES as readonly string[]).indexOf(roleId);

  return {
    messageId: identifiant.slice(0, coupure),
    roleId,
    rang: connu >= 0 ? connu : RANGS_DES_ROLES.length,
  };
}

interface AnnotationDeLane {
  type?: unknown;
  kind?: unknown;
  roleId?: unknown;
  text?: unknown;
}

/**
 * Recompose le texte complet de chaque lane à partir des annotations du message.
 *
 * Les fragments arrivent en `agentLaneStream {kind:'delta'}` dans l'ordre où le
 * serveur les a écrits ; les concaténer dans l'ordre du tableau restitue le
 * flux du rôle tel qu'il a été émis. C'est ce texte que le parseur lit.
 */
export function textesDesLanes(annotations: unknown): Map<string, string> {
  const textes = new Map<string, string>();

  if (!Array.isArray(annotations)) {
    return textes;
  }

  for (const brut of annotations) {
    const annotation = brut as AnnotationDeLane;

    if (
      !annotation ||
      annotation.type !== 'agentLaneStream' ||
      annotation.kind !== 'delta' ||
      typeof annotation.roleId !== 'string' ||
      typeof annotation.text !== 'string'
    ) {
      continue;
    }

    textes.set(annotation.roleId, (textes.get(annotation.roleId) ?? '') + annotation.text);
  }

  return textes;
}

/*
 * LE REGISTRE DES ARBITRES VIT ICI, PAS DANS LE HOOK.
 *
 * La surface qui affiche l'écart (`AssistantMessage`) doit lire ce qui a été
 * écrit. Quand ce registre vivait dans `useMessageParser`, l'importer depuis le
 * composant y faisait entrer TOUTE la chaîne du hook : un parseur construit au
 * chargement du module, et `workbenchStore` avec ses dépendances de navigateur
 * (`js-cookie`, `file-saver`, `jszip`). Un module d'affichage n'a aucune raison
 * de tirer le moteur d'écriture pour lire un compte.
 *
 * Ce fichier n'importe rien d'autre que lui-même : le composant peut le lire
 * sans conséquence sur le graphe de modules.
 */

import { ArbitreDesLanes } from './agent-lane-arbiter';

const ARBITRES_CONSERVES = 32;

const arbitres = new Map<string, ArbitreDesLanes>();

/**
 * L'arbitre de ce message, créé au besoin.
 *
 * UN PAR MESSAGE, pas un pour la session : la préemption a besoin de l'état des
 * autres lanes du même message — c'est ce qui rend l'état final indépendant de
 * l'ordre d'arrivée — mais un arbitre unique garderait les attributions de la
 * génération précédente, et le second prompt d'un utilisateur verrait ses
 * écritures refusées par des rôles qui ont fini dix minutes plus tôt.
 */
export function arbitreDe(messageId: string): ArbitreDesLanes {
  const existant = arbitres.get(messageId);

  if (existant) {
    return existant;
  }

  const neuf = new ArbitreDesLanes();
  arbitres.set(messageId, neuf);

  /*
   * Borne. Un fil long accumulerait un arbitre par message pour la durée de vie
   * de la page. Les plus anciens retombent à `undefined`, qui est exactement
   * l'état « aucune trace » que la lecture ci-dessous distingue de « rien
   * écrit » — l'éviction ne peut donc pas produire de fausse alerte.
   */
  while (arbitres.size > ARBITRES_CONSERVES) {
    const plusAncien = arbitres.keys().next();

    if (plusAncien.done) {
      break;
    }

    arbitres.delete(plusAncien.value);
  }

  return neuf;
}

/**
 * Les chemins que les sous-agents ont réellement écrits pour ce message.
 *
 * `undefined` et `[]` ne veulent PAS dire la même chose :
 *  - `[]` — on a arbitré ce message et rien n'a été écrit. Écart réel.
 *  - `undefined` — aucune trace. Au rechargement de la page, l'historique se
 *    réaffiche alors que la carte est vide ; sans cette distinction, chaque
 *    ancien message annoncerait « Livraison incomplète » pour la totalité de
 *    ses fichiers, y compris ceux qui sont sur le disque.
 */
export function cheminsEcritsParLesLanes(messageId: string): string[] | undefined {
  const arbitre = arbitres.get(messageId);

  return arbitre ? [...arbitre.attributions().keys()] : undefined;
}
