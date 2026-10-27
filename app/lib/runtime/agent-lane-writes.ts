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

/*
 * LA CHAÎNE DE DÉMARRAGE APPARTIENT AU COORDINATEUR.
 *
 * Mesuré en production le 2026-09-30, parcours du premier projet, « un compteur
 * avec deux boutons » : trois auteurs — le coordinateur et deux sous-agents —
 * écrivent chacun `package.json`, `vite.config.ts`, `src/main.tsx`,
 * `src/App.tsx`. L'espace de travail finit avec la `package.json` d'un rôle
 * (Vite 4, sans vitest) et le `vite.config.ts` d'un autre (qui importe
 * `vitest/config`) : Vite lui-même refuse de démarrer — « Cannot find module
 * 'vitest/config' » — et l'aperçu reste à 503.
 *
 * Aucun mélange de ces fichiers écrits par des auteurs différents n'est sûr de
 * démarrer. Un seul auteur les écrit : celui qui intègre, le coordinateur. Les
 * rôles gardent leurs composants, leurs tests, leurs fichiers de domaine.
 */
const CHAINE_DE_DEMARRAGE = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^tsconfig(\.[\w-]+)?\.json$/,
  /^index\.html$/,
  /^src\/main\.[jt]sx?$/,
  /^src\/App\.[jt]sx?$/,
];

/** Le chemin appartient-il à la chaîne qui fait démarrer l'application ? */
export function estFichierDeDemarrage(chemin: string): boolean {
  const relatif = chemin.replace(/^\/?(?:home\/project|workspace)\//, '').replace(/^\.?\//, '');

  return CHAINE_DE_DEMARRAGE.some((motif) => motif.test(relatif));
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

import { atom } from 'nanostores';
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

/** Arbitration is authorization only, never a receipt for a runtime write. */
export function cheminsAttribuesParLesLanes(messageId: string): string[] | undefined {
  const arbitre = arbitres.get(messageId);
  return arbitre ? [...arbitre.attributions().keys()] : undefined;
}

/** Runtime paths are case-sensitive; conservative arbitration aliases are not write evidence. */
export function cleDeConfirmation(path: string): string {
  return path
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\//, '');
}

/** Lightweight subscription signal; no runtime, parser or workbench dependency. */
export const confirmationsEcritureVersion = atom(0);

// Parent message -> normalized path -> identity of the latest confirmed proposal.
const confirmations = new Map<string, Map<string, { receiptId: string; order: number }>>();

let ordreDeConfirmation = 0;

const messageParent = (messageId: string) => decoderLane(messageId)?.messageId ?? messageId;

/** Call for a live artifact only. Absence of a historical receipt remains unknown. */
export function observerEcrituresDeMessage(messageId: string): void {
  const parent = messageParent(messageId);

  if (confirmations.has(parent)) {
    return;
  }

  confirmations.set(parent, new Map());

  while (confirmations.size > ARBITRES_CONSERVES) {
    const oldest = confirmations.keys().next();

    if (oldest.done) {
      break;
    }

    confirmations.delete(oldest.value);
  }
  confirmationsEcritureVersion.set(confirmationsEcritureVersion.get() + 1);
}

/**
 * Record only after runtime read-back and project-scope guards succeed.
 * This confirms the accepted proposal, including partial hunks, not every model request.
 */
export function confirmerEcritureDeMessage(messageId: string, path: string, receiptId: string): void {
  const key = cleDeConfirmation(path);

  if (!key) {
    return;
  }

  observerEcrituresDeMessage(messageId);

  const receipts = confirmations.get(messageParent(messageId))!;

  receipts.set(key, { receiptId, order: ++ordreDeConfirmation });
  confirmationsEcritureVersion.set(confirmationsEcritureVersion.get() + 1);
}

/** Latest confirmed proposal for this path across the bounded set of turns. */
export function confirmationCouranteDuChemin(path: string): { messageId: string; receiptId: string } | undefined {
  const key = cleDeConfirmation(path);

  let latest: { messageId: string; receiptId: string; order: number } | undefined;

  for (const [messageId, receipts] of confirmations) {
    const receipt = receipts.get(key);

    if (receipt && (!latest || receipt.order > latest.order)) {
      latest = { messageId, ...receipt };
    }
  }

  return latest ? { messageId: latest.messageId, receiptId: latest.receiptId } : undefined;
}

/** An old undo must not remove a newer proposal's receipt for the same path. */
export function invaliderConfirmationDeMessage(messageId: string, path: string, receiptId: string): void {
  const receipts = confirmations.get(messageParent(messageId));
  const key = cleDeConfirmation(path);

  if (receipts?.get(key)?.receiptId !== receiptId) {
    return;
  }

  receipts.delete(key);
  confirmationsEcritureVersion.set(confirmationsEcritureVersion.get() + 1);
}

/** Project/runtime rebinding invalidates observations; reading old arbiters never recreates them. */
export function reinitialiserConfirmationsEcriture(): void {
  if (!confirmations.size) {
    return;
  }

  confirmations.clear();
  confirmationsEcritureVersion.set(confirmationsEcritureVersion.get() + 1);
}

/**
 * Backwards-compatible name: confirmed runtime proposals from lanes OR coordinator.
 * undefined = unknown (history/eviction/reset); [] = observed, no confirmed proposal.
 * This is not a cloud-backup, build, or QA receipt.
 */
export function cheminsEcritsParLesLanes(messageId: string): string[] | undefined {
  const receipts = confirmations.get(messageParent(messageId));
  return receipts ? [...receipts.keys()] : undefined;
}
