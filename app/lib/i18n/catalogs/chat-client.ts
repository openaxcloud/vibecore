import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const chatClientEn = {
  'chatClient.project.agent': 'Project agent',
  'chatClient.project.conversation': 'Project conversation',
  'chatClient.history.saveFailed': 'Could not save the conversation history. Try again.',
  'chatClient.history.resetFailed': 'Could not reset the conversation history. Try again.',
  'chatClient.history.loadFailed': 'Could not load your conversation history. Try again.',
  'chatClient.generation.stalled': 'The generation stalled and was stopped. Send your message again.',
  'chatClient.generation.stopped': 'The current generation was stopped. Send your message again.',
  'chatClient.generation.powerNudge':
    'Still iterating? Power mode handles complex tasks in fewer turns. Select it from the mode menu.',
  'chatClient.attachment.readFailed': 'Could not read “{name}”. Your message will be sent without this attachment.',
  'chatClient.starter.rateLimited':
    'The starter template was skipped because of a rate limit. Continuing with a blank template.',
  'chatClient.starter.importFailed': 'The starter template could not be imported. Continuing with a blank template.',
  'chatClient.project.promptQueueFailed':
    'The project was created, but its initial prompt could not be queued. You can submit it again.',
  'chatClient.project.aiFallback':
    'AI generation failed. An empty project was created so you can keep your prompt and try again.',
  'chatClient.error.title.request': 'Request failed',
  'chatClient.error.title.authentication': 'Authentication error',
  'chatClient.error.title.quota': 'Usage limit reached',
  'chatClient.error.title.rateLimit': 'Rate limit reached',
  'chatClient.error.title.server': 'Service unavailable',
  'chatClient.error.provider': 'AI provider',
  'chatClient.error.authentication': 'Authentication with {provider} failed. Check your API key.',
  'chatClient.error.rateLimit': 'The rate limit for {provider} was reached. Wait a moment, then try again.',
  'chatClient.error.quota':
    'You have reached your plan’s AI usage limit for this billing period. Upgrade your plan or review your account limits; the allowance renews next period.',
  'chatClient.error.generic': 'Your request could not be processed. Try again.',
  'chatClient.error.retry': 'Try again',
  'chatClient.error.retryWith.aria': 'Try again with a different model',
  'chatClient.error.retryWith': 'Try again with…',
  'chatClient.error.viewPlan': 'View plan and limits',
  'chatClient.error.openSettings': 'Open settings',
  'chatClient.error.dismiss': 'Dismiss',
} as const;

export type ChatClientKey = keyof typeof chatClientEn;
export type ChatClientCopy = Readonly<Record<ChatClientKey, string>>;

export const chatClientFr: ChatClientCopy = {
  'chatClient.project.agent': 'Agent du projet',
  'chatClient.project.conversation': 'Conversation du projet',
  'chatClient.history.saveFailed': 'Impossible d’enregistrer l’historique de la conversation. Réessayez.',
  'chatClient.history.resetFailed': 'Impossible de réinitialiser l’historique de la conversation. Réessayez.',
  'chatClient.history.loadFailed': 'Impossible de charger l’historique de votre conversation. Réessayez.',
  'chatClient.generation.stalled': 'La génération ne répondait plus et a été arrêtée. Renvoyez votre message.',
  'chatClient.generation.stopped': 'La génération en cours a été arrêtée. Renvoyez votre message.',
  'chatClient.generation.powerNudge':
    'Vous avancez toujours par itérations ? Le mode Power traite les tâches complexes en moins d’étapes. Sélectionnez-le dans le menu des modes.',
  'chatClient.attachment.readFailed':
    'Impossible de lire « {name} ». Votre message sera envoyé sans cette pièce jointe.',
  'chatClient.starter.rateLimited':
    'Le modèle de démarrage a été ignoré en raison d’une limite de requêtes. Un modèle vide sera utilisé.',
  'chatClient.starter.importFailed': 'Impossible d’importer le modèle de démarrage. Un modèle vide sera utilisé.',
  'chatClient.project.promptQueueFailed':
    'Le projet a été créé, mais son prompt initial n’a pas pu être mis en attente. Vous pouvez le renvoyer.',
  'chatClient.project.aiFallback':
    'La génération par l’IA a échoué. Un projet vide a été créé afin que vous puissiez conserver votre prompt et réessayer.',
  'chatClient.error.title.request': 'Échec de la requête',
  'chatClient.error.title.authentication': 'Erreur d’authentification',
  'chatClient.error.title.quota': 'Limite d’utilisation atteinte',
  'chatClient.error.title.rateLimit': 'Limite de requêtes atteinte',
  'chatClient.error.title.server': 'Service indisponible',
  'chatClient.error.provider': 'fournisseur d’IA',
  'chatClient.error.authentication': 'L’authentification auprès de {provider} a échoué. Vérifiez votre clé API.',
  'chatClient.error.rateLimit':
    'La limite de requêtes de {provider} est atteinte. Patientez un instant, puis réessayez.',
  'chatClient.error.quota':
    'Vous avez atteint la limite d’utilisation de l’IA de votre forfait pour cette période de facturation. Changez de forfait ou consultez les limites de votre compte ; le quota sera renouvelé à la prochaine période.',
  'chatClient.error.generic': 'Impossible de traiter votre requête. Réessayez.',
  'chatClient.error.retry': 'Réessayer',
  'chatClient.error.retryWith.aria': 'Réessayer avec un autre modèle',
  'chatClient.error.retryWith': 'Réessayer avec…',
  'chatClient.error.viewPlan': 'Voir le forfait et les limites',
  'chatClient.error.openSettings': 'Ouvrir les paramètres',
  'chatClient.error.dismiss': 'Fermer',
};

export function getChatClientCopy(language?: string | null): ChatClientCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? chatClientFr : chatClientEn;
}

export function formatChatClientCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
