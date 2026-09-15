import type { Message } from 'ai';

/**
 * Un message d'assistant VIDE n'a rien à persister.
 *
 * Mesuré en production sur 10 générations réelles : 20 messages d'assistant
 * écrits, dont 10 vides — une alternance stricte vide → plein, un fantôme par
 * échange. C'est la capture d'Avi : « Agent · 33 messages » avec des blocs ne
 * contenant que le mot « Agent ».
 *
 * Le contenu n'est pas perdu : les réponses arrivent bien. Une ligne vide est
 * créée EN PLUS, parce que la transcription est envoyée pendant le streaming,
 * alors que la bulle de l'agent est encore vide.
 *
 * On ne persiste donc rien tant qu'il n'y a rien — sauf si le message porte
 * déjà des appels d'outils, qui sont un contenu à part entière même sans texte.
 */
export function messageDAssistantVide(message: Message): boolean {
  if (String(message.role) !== 'assistant') {
    return false;
  }

  if ((message.content ?? '').trim().length > 0) {
    return false;
  }

  const invocations = (message as { toolInvocations?: unknown[] }).toolInvocations;

  return !invocations || invocations.length === 0;
}

export function projectAiTranscriptMessages(messages: Message[]) {
  return messages
    .filter((message) => !message.annotations?.includes('no-store'))
    .filter((message) => !messageDAssistantVide(message))
    .map((message, index) => {
      const role = String(message.role);

      if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
        return undefined;
      }

      return {
        /*
         * L'identifiant de repli NE DOIT PAS dépendre du contenu.
         *
         * `role:index:<80 caractères du contenu>` changeait dès que le texte
         * arrivait : la route persiste par `upsert` sur cet identifiant, donc
         * un identifiant instable produit une SECONDE ligne au lieu de mettre à
         * jour la première. C'est le second mécanisme du même défaut, et il
         * survivrait au filtre ci-dessus si un message se remplissait après un
         * premier envoi non vide.
         */
        clientId: message.id || `${role}:${index}`,
        role,
        content: message.content ?? '',
      };
    })
    .filter(
      (
        message,
      ): message is {
        clientId: string;
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
      } => Boolean(message),
    );
}
