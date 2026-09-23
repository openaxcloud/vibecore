/*
 * La demande de l'utilisateur est écrite AVANT le premier appel au modèle.
 *
 * Défaut mesuré en production le 2026-09-23 : une commande envoyée à 18:09:03
 * depuis un iPhone, l'onglet mis en arrière-plan, et rien — ni la réponse, ni
 * LA QUESTION — dans `AiMessage`. Le dernier enregistrement datait de 17:56:07.
 * La persistance du fil est poussée par le NAVIGATEUR pendant le flux ; quand
 * Safari suspend l'onglet, les envois s'arrêtent et le tour ne laisse aucune
 * trace. L'utilisateur revient et ne retrouve même pas ce qu'il avait demandé.
 *
 * Ce module ne corrige pas l'arrêt du tour — c'est un chantier structurel. Il
 * supprime la PERTE DE DONNÉES, qui en est le pire symptôme et qui, elle, se
 * corrige tout de suite.
 *
 * L'écriture est idempotente par construction : l'API dérive l'identifiant
 * d'un message de `sha256(conversationId:clientId)` et fait un `upsert`. Le
 * serveur et le navigateur qui écrivent la même demande écrivent donc la même
 * ligne, pas deux.
 */
import { createHash } from 'node:crypto';

export interface DemandeAPersister {
  conversationId: string;
  clientId: string;
  content: string;
}

interface MessageEntrant {
  role?: string;
  content?: unknown;
}

/**
 * Le contenu textuel d'un message du fil. Le composeur envoie soit une chaîne,
 * soit un tableau de parties typées ; une image seule ne porte pas de texte et
 * ne vaut pas la peine d'être persistée comme demande.
 */
export function texteDuMessage(message: MessageEntrant | undefined): string {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return '';
  }

  return message.content
    .map((partie) =>
      partie && typeof partie === 'object' && 'text' in partie ? String((partie as { text: unknown }).text ?? '') : '',
    )
    .join('')
    .trim();
}

/** La dernière demande de l'utilisateur dans le fil envoyé. */
export function derniereDemande(messages: MessageEntrant[] | undefined): string {
  if (!Array.isArray(messages)) {
    return '';
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return texteDuMessage(messages[i]);
    }
  }

  return '';
}

/**
 * L'identifiant à utiliser. Le navigateur envoie le sien, et c'est le bon : il
 * garantit que sa propre synchronisation écrira la MÊME ligne.
 *
 * S'il l'oublie, on n'abandonne pas la demande — on en dérive un du contenu.
 * Deux envois identiques retombent alors sur le même identifiant au lieu de
 * multiplier les lignes, et un doublon éventuel avec le fil du navigateur reste
 * très préférable à une demande perdue.
 */
export function identifiantDeDemande(clientMessageId: unknown, contenu: string): string {
  if (typeof clientMessageId === 'string' && clientMessageId.trim().length > 0) {
    return clientMessageId.trim().slice(0, 200);
  }

  return `srv-${createHash('sha256').update(contenu).digest('hex').slice(0, 24)}`;
}

/**
 * Ce qu'il faut écrire, ou `null` quand il n'y a rien à écrire. Rendre `null`
 * plutôt que de jeter : cette écriture ne doit JAMAIS empêcher un tour de
 * partir.
 */
export function demandeAPersister(input: {
  conversationId?: unknown;
  clientMessageId?: unknown;
  messages?: MessageEntrant[];
}): DemandeAPersister | null {
  const conversationId = typeof input.conversationId === 'string' ? input.conversationId.trim() : '';

  if (!conversationId) {
    return null;
  }

  const content = derniereDemande(input.messages);

  if (!content) {
    return null;
  }

  return { conversationId, clientId: identifiantDeDemande(input.clientMessageId, content), content };
}
