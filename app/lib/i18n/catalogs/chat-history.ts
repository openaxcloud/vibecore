import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const chatHistoryEn = {
  'chatHistory.warning.localOnly': 'Chat history is stored locally on this device and will not sync across devices.',
  'chatHistory.fallback.projectAssistant': 'Project assistant',
  'chatHistory.restore.userPrompt': 'Restore project from snapshot',
  'chatHistory.restore.assistantIntro':
    'Restored your chat from a snapshot. You can revert this message to load the full chat history.',
  'chatHistory.restore.artifactTitle': 'Restored Project & Setup',
  'chatHistory.error.persistenceUnavailable': 'Chat persistence is unavailable.',
  'chatHistory.error.loadProjectMemory': 'Failed to load project IDE memory.',
  'chatHistory.error.loadChat': 'Failed to load the chat.',
  'chatHistory.error.saveSnapshot': 'Failed to save the chat snapshot.',
  'chatHistory.error.restoreSnapshot': 'Failed to restore the snapshot files.',
  'chatHistory.error.updateMetadata': 'Failed to update chat metadata.',
  'chatHistory.error.persistProjectMemory': 'Failed to persist project chat memory.',
  'chatHistory.error.missingChatId': 'Failed to save chat messages: the chat ID is missing.',
  'chatHistory.success.duplicated': 'Chat duplicated successfully.',
  'chatHistory.error.duplicate': 'Failed to duplicate the chat.',
  'chatHistory.success.imported': 'Chat imported successfully.',
  'chatHistory.error.import': 'Failed to import the chat.',
  'chatHistory.error.exportNotFound': 'Failed to export the chat: chat not found.',
  'chatHistory.error.export': 'Failed to export the chat.',
  'chatHistory.export.filePrefix': 'chat',
} as const;

export type ChatHistoryKey = keyof typeof chatHistoryEn;
export type ChatHistoryCopy = Readonly<Record<ChatHistoryKey, string>>;

export const chatHistoryFr: ChatHistoryCopy = {
  'chatHistory.warning.localOnly':
    'L’historique des conversations est stocké localement sur cet appareil et ne sera pas synchronisé avec vos autres appareils.',
  'chatHistory.fallback.projectAssistant': 'Assistant de projet',
  'chatHistory.restore.userPrompt': 'Restaurer le projet depuis l’instantané',
  'chatHistory.restore.assistantIntro':
    'Votre conversation a été restaurée depuis un instantané. Vous pouvez revenir sur ce message pour charger l’historique complet.',
  'chatHistory.restore.artifactTitle': 'Projet et configuration restaurés',
  'chatHistory.error.persistenceUnavailable': 'La persistance des conversations est indisponible.',
  'chatHistory.error.loadProjectMemory': 'Impossible de charger la mémoire de l’IDE du projet.',
  'chatHistory.error.loadChat': 'Impossible de charger la conversation.',
  'chatHistory.error.saveSnapshot': 'Impossible d’enregistrer l’instantané de la conversation.',
  'chatHistory.error.restoreSnapshot': 'Impossible de restaurer les fichiers de l’instantané.',
  'chatHistory.error.updateMetadata': 'Impossible de mettre à jour les métadonnées de la conversation.',
  'chatHistory.error.persistProjectMemory': 'Impossible d’enregistrer la conversation du projet.',
  'chatHistory.error.missingChatId':
    'Impossible d’enregistrer les messages : l’identifiant de la conversation est manquant.',
  'chatHistory.success.duplicated': 'Conversation dupliquée.',
  'chatHistory.error.duplicate': 'Impossible de dupliquer la conversation.',
  'chatHistory.success.imported': 'Conversation importée.',
  'chatHistory.error.import': 'Impossible d’importer la conversation.',
  'chatHistory.error.exportNotFound': 'Impossible d’exporter la conversation : conversation introuvable.',
  'chatHistory.error.export': 'Impossible d’exporter la conversation.',
  'chatHistory.export.filePrefix': 'conversation',
};

export type ChatHistoryErrorKey = Extract<ChatHistoryKey, `chatHistory.error.${string}`>;

export function getChatHistoryCopy(language?: string | null): ChatHistoryCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? chatHistoryFr : chatHistoryEn;
}

/**
 * Localize the generated title of a project's default chat without rewriting
 * persisted user content. Historical records may contain either locale's
 * fallback because this field predates locale-aware persistence. Only the two
 * exact generated values are migrated, and only for the canonical project chat
 * id; imported and standalone conversations are deliberately left untouched.
 */
export function resolveProjectAssistantDescription(
  description: string | undefined,
  chatId: string,
  projectId: string,
  language?: string | null,
): string {
  const copy = getChatHistoryCopy(language);
  const localizedFallback = copy['chatHistory.fallback.projectAssistant'];

  if (chatId !== `project:${projectId}`) {
    return description ?? localizedFallback;
  }

  const generatedFallbacks = new Set([
    chatHistoryEn['chatHistory.fallback.projectAssistant'],
    chatHistoryFr['chatHistory.fallback.projectAssistant'],
  ]);

  return description === undefined || generatedFallbacks.has(description) ? localizedFallback : description;
}

/** Arbitrary persistence exceptions must never be rendered in toasts or the event log. */
export function getChatHistorySafeError(key: ChatHistoryErrorKey, language?: string | null, _error?: unknown): string {
  return getChatHistoryCopy(language)[key];
}
