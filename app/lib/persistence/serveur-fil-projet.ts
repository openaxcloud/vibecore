import { projectAiMessagesToChatMessages, type ProjectAiMessagesResponse } from '~/components/chat/projectAiTranscript';
import type { Message } from 'ai';

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
export async function chargerFilDepuisServeur(projectId: string): Promise<Message[]> {
  try {
    const reponseConversations = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ai/conversations?limit=1`,
      { headers: { accept: 'application/json' } },
    );

    if (!reponseConversations.ok) {
      return [];
    }

    const charge = (await reponseConversations.json()) as {
      conversations?: Array<{ id?: string }>;
    };

    const conversationId = charge.conversations?.find((conversation) => conversation?.id)?.id;

    if (!conversationId) {
      return [];
    }

    const reponseMessages = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      { headers: { accept: 'application/json' } },
    );

    if (!reponseMessages.ok) {
      return [];
    }

    const messages = (await reponseMessages.json()) as ProjectAiMessagesResponse;

    /*
     * MÊME convertisseur que le menu des branches de conversation, importé et
     * non réécrit : deux copies de la traduction « message d'API » →
     * « message de chat » divergeraient sur les appels d'outils.
     */
    return projectAiMessagesToChatMessages(messages.messages);
  } catch {
    /*
     * Un repli ne doit JAMAIS casser le chargement. Serveur lent, hors ligne,
     * corps illisible : on rend une liste vide et la chaîne continue vers
     * IndexedDB.
     */
    return [];
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
 *   - un serveur vide ou en échec ne pose RIEN — l'affichage garde ce qu'il a.
 */
export async function completerFilSiVide(
  messagesLocaux: readonly Message[],
  projectId: string,
  poser: (messages: Message[]) => void,
  charger: (projectId: string) => Promise<Message[]> = chargerFilDepuisServeur,
): Promise<void> {
  if (messagesLocaux.length) {
    return;
  }

  const filServeur = await charger(projectId);

  if (filServeur.length) {
    poser(filServeur);
  }
}
