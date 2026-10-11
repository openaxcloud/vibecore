/**
 * Faut-il afficher une transcription arrivée APRÈS le montage ?
 *
 * Le défaut, établi le 2026-09-02 : dans `Chat.client`,
 *
 *     const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
 *
 * `chatStarted` est donc calculé UNE SEULE FOIS, au premier rendu. Or
 * `initialMessages` vient de `useChatHistory`, qui lit la mémoire de projet de
 * façon asynchrone. Quand cette lecture aboutit après le montage — le cas
 * ordinaire dès que le réseau n'est pas instantané — `chatStarted` reste faux.
 *
 * Et c'est bien lui qui commande l'affichage : `BaseChat` reçoit
 * `chatStarted={forceWorkbench || chatStarted}`, puis rend la liste des
 * messages ou l'état de départ selon cette valeur. Le panneau affiche donc
 * « Agent prêt » alors que la transcription est arrivée.
 *
 * Deux sources pour une même vérité, et c'est la mauvaise qui commande :
 * `chatStore.setKey('started', initialMessages.length > 0)` EST, lui, recalculé
 * dans un effet qui dépend de `initialMessages`. Le store sait que la
 * conversation a commencé ; le composant l'ignore.
 *
 * Les deux autres chemins qui posent `chatStarted` ne couvrent pas ce cas :
 * l'un est l'envoi d'un message par l'utilisateur, l'autre l'hydratation depuis
 * le serveur — laquelle exige un identifiant de conversation, précisément ce qui
 * manque quand la métadonnée a été perdue.
 */
export interface EtatDeTranscription {
  /** Mode IDE de projet : le seul où la transcription vient de la mémoire de projet. */
  modeProjet: boolean;

  /** Nombre de messages restaurés depuis la mémoire de projet. */
  messagesRestaures: number;

  /** Nombre de messages actuellement affichés. */
  messagesAffiches: number;

  /**
   * Cette transcription a-t-elle DÉJÀ été adoptée ?
   *
   * Sans cette garde, un fil vidé par « Effacer l'historique » se remplissait
   * à nouveau : `initialMessages` gardait la transcription restaurée, le fil
   * repassait à zéro message, et l'effet la réadoptait. Mesuré le 06/09 sur
   * la maquette (sonde probe-clear.mjs) : quatre messages avant, quatre après
   * confirmation, puis quatre re-persistés dans une conversation NEUVE.
   */
  dejaAdoptee?: boolean;
}

export function fautIlAdopterLaTranscriptionRestauree(etat: EtatDeTranscription): boolean {
  if (!etat.modeProjet) {
    return false;
  }

  /*
   * On n'adopte que dans un fil VIDE. S'il y a déjà quelque chose à l'écran —
   * une hydratation qui a abouti, un message que l'utilisateur vient d'envoyer —
   * cet état est plus récent, et le remplacer serait le même défaut à l'envers.
   */
  if (etat.dejaAdoptee) {
    return false;
  }

  return etat.messagesRestaures > 0 && etat.messagesAffiches === 0;
}
