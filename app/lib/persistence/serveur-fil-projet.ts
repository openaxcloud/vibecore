import type { Message } from 'ai';
import { projectAiMessagesToChatMessages, type ProjectAiMessagesResponse } from '~/components/chat/projectAiTranscript';

/*
 * LA BANQUE SERVEUR DU FIL — la seule des trois que la restauration ne
 * consultait pas.
 *
 * Trois banques portent le fil de conversation d'un projet :
 *
 *   1. `ide-state.chat.messages` — écrite par le CLIENT, consultée en premier ;
 *   2. IndexedDB                 — repli, LOCAL au navigateur ;
 *   3. `/ai/conversations/…/messages` — remplie par le SERVEUR pendant le flux.
 *
 * La troisième est la plus fiable : mesurée à 210 conversations sur 224 en
 * production. Elle n'était consultée nulle part au chargement.
 *
 * Ce que ça cassait, mesuré le 2026-09-06 sur l'environnement d'audit :
 *
 *   - l'écriture cliente de (1) perd une course sur quatre pendant qu'un agent
 *     génère (6 refus `412` sur 24 tentatives, l'écrivain « workspace » ayant
 *     déjà avancé l'ETag). Ce n'est qu'un RETARD — 18 écritures sur 29 passent
 *     et portent bien le fil — mais le fil du dernier tour peut manquer ;
 *   - un CONTEXTE NAVIGATEUR NEUF n'a pas d'IndexedDB. Autre appareil, cache
 *     vidé, navigation privée : (1) manquant + (2) vide = écran sans aucun
 *     message, alors que le serveur détient tout.
 *
 * Interroger (3) avant (2) rend la course sans conséquence, quelle que soit son
 * issue, et répare l'appareil neuf. IndexedDB reste en DERNIER recours : il
 * sert hors ligne et ne coûte rien à cette place.
 */
/**
 * Ce que le serveur détient : le fil ET l'identité de la conversation d'où il
 * vient.
 *
 * L'IDENTITÉ N'EST PAS UN DÉTAIL, et la jeter coûtait une DUPLICATION EN BASE.
 * On restaurait le fil sans reprendre la conversation : sur un contexte neuf —
 * autre appareil, cache vidé, navigation privée — la banque serveur est la
 * SEULE à savoir de quelle conversation vient ce qui s'affiche. Personne ne le
 * notait, donc `ensureProjectAiConversation` ne trouvait aucun identifiant au
 * premier message suivant et en ouvrait une NEUVE ; `syncProjectAiTranscript`
 * y repoussait la transcription ENTIÈRE, à côté de l'ancienne. Le même fil
 * existait alors deux fois.
 */
export type FilServeur = { messages: Message[]; conversationId?: string };

export async function chargerFilDepuisServeur(projectId: string): Promise<FilServeur> {
  try {
    const reponseConversations = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ai/conversations?limit=1`,
      { headers: { accept: 'application/json' } },
    );

    if (!reponseConversations.ok) {
      return { messages: [] };
    }

    const charge = (await reponseConversations.json()) as {
      conversations?: Array<{ id?: string }>;
    };

    const conversationId = charge.conversations?.find((conversation) => conversation?.id)?.id;

    if (!conversationId) {
      return { messages: [] };
    }

    const reponseMessages = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      { headers: { accept: 'application/json' } },
    );

    if (!reponseMessages.ok) {
      return { messages: [] };
    }

    const messages = (await reponseMessages.json()) as ProjectAiMessagesResponse;

    /*
     * MÊME convertisseur que le menu des branches de conversation, importé et
     * non réécrit : deux copies de la traduction « message d'API » →
     * « message de chat » divergeraient sur les appels d'outils.
     */
    return { messages: projectAiMessagesToChatMessages(messages.messages), conversationId };
  } catch (erreur) {
    /*
     * Un repli ne doit JAMAIS casser le chargement. Serveur lent, hors ligne,
     * corps illisible : on rend une liste vide et la chaîne continue vers
     * IndexedDB.
     *
     * Mais on le DIT. Un `catch` totalement muet est ce qui a rendu
     * `provisionWorkspaceOnDemand` indiagnosticable — `void managerRequest(…)
     * .catch(() => undefined)`, aucune trace, aucune remontée. Une ligne de
     * journal coûte peu et évite un diagnostic à l'aveugle.
     */
    console.debug('[fil serveur] repli indisponible, on continue vers IndexedDB', erreur);
    return { messages: [] };
  }
}

/**
 * LE SITE D'APPEL, extrait pour être testable.
 *
 * C'est ici que vit la règle de priorité, et c'est elle qu'un refactor peut
 * défaire sans qu'aucun test du chargeur ne rougisse : le chargeur peut être
 * parfait et n'être jamais appelé.
 *
 * Contrat :
 *   - des messages locaux non vides gagnent, et le serveur n'est PAS interrogé
 *     (ni requête inutile, ni écrasement d'un fil plus frais) ;
 *   - vides, on demande au serveur et on POSE le résultat s'il y en a un ;
 *   - un serveur vide ou en échec ne pose RIEN — l'affichage garde ce qu'il a ;
 *   - et quand on pose un fil, on ADOPTE la conversation d'où il vient.
 *
 * Cette dernière ligne est celle qui manquait, et son absence ne se voyait pas
 * à l'écran : le fil s'affichait correctement. Le dégât n'apparaissait qu'au
 * message SUIVANT, en base, sous la forme d'une seconde conversation portant
 * une copie du fil. Un défaut de données silencieux, donc — la pire espèce.
 *
 * L'adoption est FAITE AVANT la pose. Si elle échouait après, on aurait affiché
 * un fil que le prochain envoi dupliquerait quand même : l'ordre est le
 * correctif, pas un détail de style.
 */
export async function completerFilSiVide(
  messagesLocaux: readonly Message[],
  projectId: string,
  poser: (messages: Message[]) => void,
  charger: (projectId: string) => Promise<FilServeur> = chargerFilDepuisServeur,
  adopter?: (conversationId: string) => void,
): Promise<void> {
  if (messagesLocaux.length) {
    return;
  }

  const filServeur = await charger(projectId);

  if (!filServeur.messages.length) {
    return;
  }

  /*
   * On n'adopte QUE si on pose. Adopter une conversation dont on n'affiche pas
   * le fil ferait pointer l'identité sur autre chose que ce que voit
   * l'utilisateur — on remplacerait une duplication par un mélange, ce qui est
   * pire.
   */
  if (filServeur.conversationId) {
    adopter?.(filServeur.conversationId);
  }

  poser(filServeur.messages);
}
