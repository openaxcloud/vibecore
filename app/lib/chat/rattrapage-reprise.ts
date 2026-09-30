/**
 * LE RATTRAPAGE À LA REPRISE.
 *
 * Mesuré en production le 2026-09-30, connexion coupée à 42 s d'un tour :
 * le serveur va au bout (19 932 caractères) et facture le tour ; le navigateur
 * n'en garde que 1 080, et les fichiers écrits après la coupure n'existent pas.
 * Avi paie un travail qu'il ne reçoit pas.
 *
 * Depuis #609, le serveur écrit lui-même la réponse complète en fin de tour.
 * Ce module décide, côté navigateur, quand et comment la reprendre : après une
 * fin de flux ANORMALE (erreur réseau, chien de garde), on relit la
 * conversation jusqu'à trouver la version complète, puis on la rejoue — ce qui
 * écrit aussi les fichiers qu'elle contient.
 */

/** Intervalle entre deux lectures de la conversation. */
export const RATTRAPAGE_INTERVALLE_MS = 4_000;

/**
 * Durée maximale d'attente. Un tour long dépasse dix minutes ; au-delà de
 * quinze, le serveur a abandonné ou la réponse ne viendra plus.
 */
export const RATTRAPAGE_DUREE_MAX_MS = 15 * 60_000;

/**
 * L'identifiant sous lequel l'API range un message envoyé avec `clientId`.
 *
 * Même règle que `aiTranscriptMessageId` (services/api/src/app.ts) : un
 * identifiant déjà serveur (`aimsg_…`) est gardé tel quel, sinon c'est
 * `aimsg_` + les 32 premiers caractères hexadécimaux du SHA-256 de
 * `<conversation>:<clientId>`. Un écart entre les deux calculs ferait chercher
 * le rattrapage sous un nom que personne n'écrit — d'où le test qui les compare.
 */
export async function identifiantServeurDuMessage(conversationId: string, clientId: string): Promise<string> {
  if (clientId.startsWith('aimsg_')) {
    return clientId;
  }

  const octets = new TextEncoder().encode(`${conversationId}:${clientId}`);
  const empreinte = await crypto.subtle.digest('SHA-256', octets);
  const hex = Array.from(new Uint8Array(empreinte), (octet) => octet.toString(16).padStart(2, '0')).join('');

  return `aimsg_${hex.slice(0, 32)}`;
}

const OUVERTURE_REFLEXION = '<div class="__boltThought__">';
const FERMETURE_REFLEXION = '</div>\n';

/**
 * Le texte d'un message SANS ses blocs de raisonnement, et si le dernier bloc
 * est resté ouvert.
 *
 * Le navigateur reçoit le raisonnement comme du texte, enveloppé par le
 * serveur dans `<div class="__boltThought__">…</div>` (api.chat.ts). Le
 * serveur, lui, n'enregistre que la réponse du modèle, sans ce raisonnement.
 * Les deux versions ne se comparent donc qu'une fois les blocs retirés.
 */
export function sansReflexion(contenu: string): { texte: string; reflexionOuverte: boolean } {
  let texte = '';
  let position = 0;

  for (;;) {
    const ouverture = contenu.indexOf(OUVERTURE_REFLEXION, position);

    if (ouverture < 0) {
      texte += contenu.slice(position);
      return { texte, reflexionOuverte: false };
    }

    texte += contenu.slice(position, ouverture);

    const fermeture = contenu.indexOf(FERMETURE_REFLEXION, ouverture + OUVERTURE_REFLEXION.length);

    if (fermeture < 0) {
      return { texte, reflexionOuverte: true };
    }

    position = fermeture + FERMETURE_REFLEXION.length;
  }
}

/**
 * Le contenu à reprendre, ou `null` s'il n'y a rien à reprendre.
 *
 * La règle est un PRÉFIXE, comme la garde d'écriture côté API
 * (`message-ne-raccourcit-pas.ts`) : la version du serveur ne remplace la nôtre
 * que si elle la PROLONGE, raisonnement mis à part. Une version différente —
 * régénérée, éditée — n'est pas la suite de ce qu'on a vu, et la substituer
 * effacerait autre chose.
 *
 * Le résultat GARDE ce que le navigateur a déjà : son texte, raisonnement
 * compris, n'est jamais réécrit — seule la suite est ajoutée. C'est ce qui
 * permet au parseur de rejouer le message à l'identique jusqu'à la coupure :
 * mêmes artefacts, mêmes actions, mêmes identifiants.
 */
export function contenuARattraper(local: string, serveur: string | null | undefined): string | null {
  if (typeof serveur !== 'string') {
    return null;
  }

  const { texte, reflexionOuverte } = sansReflexion(local);

  if (serveur.length <= texte.length || !serveur.startsWith(texte)) {
    return null;
  }

  /* Coupé en plein raisonnement : on referme le bloc avant d'ajouter la réponse. */
  return local + (reflexionOuverte ? FERMETURE_REFLEXION : '') + serveur.slice(texte.length);
}

/** Faut-il encore attendre ? */
export function rattrapageEncoreOuvert(debut: number, maintenant: number): boolean {
  return maintenant - debut < RATTRAPAGE_DUREE_MAX_MS;
}

export interface MessageDuFil {
  id: string;
  role: string;
  content: string;
}

export type PlanDeRattrapage =
  | { type: 'completer'; messageId: string; contenu: string }
  | { type: 'ajouter'; message: MessageDuFil };

/**
 * Ce que la conversation du serveur apporte au fil affiché, ou `null`.
 *
 * On part du DERNIER message de l'utilisateur, puis on prend la réponse qui le
 * suit côté serveur. Deux cas :
 *
 *  - le navigateur a commencé à recevoir la réponse → on la COMPLÈTE, sous son
 *    identifiant local (c'est celui que la synchronisation du fil réutilise) ;
 *  - la coupure est tombée avant le premier mot → on AJOUTE la réponse du
 *    serveur, sous son identifiant serveur.
 */
export async function planDeRattrapage(
  conversationId: string,
  local: readonly MessageDuFil[],
  serveur: readonly Partial<MessageDuFil>[],
): Promise<PlanDeRattrapage | null> {
  let rangUtilisateur = -1;

  for (let rang = local.length - 1; rang >= 0; rang--) {
    if (local[rang].role === 'user') {
      rangUtilisateur = rang;
      break;
    }
  }

  if (rangUtilisateur < 0) {
    return null;
  }

  const idUtilisateur = await identifiantServeurDuMessage(conversationId, local[rangUtilisateur].id);
  const rangServeur = serveur.findIndex((message) => message.id === idUtilisateur);

  if (rangServeur < 0) {
    return null;
  }

  let reponseServeur: Partial<MessageDuFil> | undefined;

  for (const message of serveur.slice(rangServeur + 1)) {
    if (message.role === 'user') {
      break;
    }

    if (message.role === 'assistant') {
      reponseServeur = message;
    }
  }

  if (!reponseServeur?.id || typeof reponseServeur.content !== 'string') {
    return null;
  }

  const reponseLocale = local.slice(rangUtilisateur + 1).find((message) => message.role === 'assistant');

  if (reponseLocale) {
    const contenu = contenuARattraper(reponseLocale.content, reponseServeur.content);

    return contenu ? { type: 'completer', messageId: reponseLocale.id, contenu } : null;
  }

  if (!reponseServeur.content.trim()) {
    return null;
  }

  return {
    type: 'ajouter',
    message: { id: reponseServeur.id, role: 'assistant', content: reponseServeur.content },
  };
}

/**
 * L'erreur vient-elle du RÉSEAU (connexion perdue, onglet suspendu) et non du
 * serveur ? `fetch` rejette alors un `TypeError` — « Load failed » sous Safari,
 * « Failed to fetch » / « network error » sous Chromium, « NetworkError » sous
 * Firefox. Une erreur rendue par le serveur arrive, elle, comme une partie du
 * flux et devient une `Error` ordinaire.
 */
export function estUneCoupureReseau(erreur: unknown): boolean {
  if (erreur instanceof TypeError) {
    return true;
  }

  const message = erreur instanceof Error ? erreur.message : String(erreur ?? '');

  return /load failed|failed to fetch|network ?error|networkerror|network connection was lost/i.test(message);
}
