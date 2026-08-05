import { detectUserLanguage, normalizeSupportedLanguage } from '~/lib/i18n/language';

export const persistenceRuntimeEn = {
  'persistence.error.invalidTimestamp': 'The timestamp is invalid.',
  'persistence.error.transactionAborted': 'The local database transaction was cancelled.',
  'persistence.error.transactionFailed': 'The local database transaction failed.',
  'persistence.error.idReservationAborted': 'The new discussion could not be reserved locally.',
  'persistence.error.chatNotFound': 'The discussion could not be found.',
  'persistence.error.messageNotFound': 'The message could not be found.',
  'persistence.error.descriptionEmpty': 'Enter a discussion title.',
  'persistence.error.database': 'Local database error: {message}',
  'persistence.error.databaseInitialization': 'The local database could not be initialized.',
  'persistence.error.databaseNotInitialized': 'The local database is not ready. Try again in a moment.',
  'persistence.error.exportChats': 'Could not export discussions: {message}',
  'persistence.error.invalidApiKeyValue': 'The value for {key} is not valid.',
  'persistence.error.unknown': 'Unknown error',
  'persistence.ide.concurrentChange': 'The IDE state was modified in another session. Retrying…',
  'persistence.ide.saveFailed': 'Could not save the project IDE state (HTTP {status}).',
  'persistence.ide.saveFailedGeneric': 'Could not save the project IDE state.',
  'persistence.apiKeys.templateComment':
    "Enter each provider's API key. Keys are stored under the provider name (for example, OpenAI). The legacy Provider_API_KEY format is also supported.",
  'persistence.chat.forkSuffix': '{description} (fork)',
  'persistence.chat.forkFallback': 'Forked discussion',
  'persistence.chat.copySuffix': '{description} (copy)',
  'persistence.chat.defaultTitle': 'Discussion',
} as const;

export type PersistenceRuntimeKey = keyof typeof persistenceRuntimeEn;
export type PersistenceRuntimeCopy = Readonly<Record<PersistenceRuntimeKey, string>>;

export const persistenceRuntimeFr: PersistenceRuntimeCopy = {
  'persistence.error.invalidTimestamp': 'L’horodatage n’est pas valide.',
  'persistence.error.transactionAborted': 'La transaction de la base locale a été annulée.',
  'persistence.error.transactionFailed': 'La transaction de la base locale a échoué.',
  'persistence.error.idReservationAborted': 'Impossible de réserver la nouvelle discussion localement.',
  'persistence.error.chatNotFound': 'Discussion introuvable.',
  'persistence.error.messageNotFound': 'Message introuvable.',
  'persistence.error.descriptionEmpty': 'Saisissez un titre pour la discussion.',
  'persistence.error.database': 'Erreur de la base locale : {message}',
  'persistence.error.databaseInitialization': 'Impossible d’initialiser la base locale.',
  'persistence.error.databaseNotInitialized': 'La base locale n’est pas prête. Réessayez dans quelques instants.',
  'persistence.error.exportChats': 'Impossible d’exporter les discussions : {message}',
  'persistence.error.invalidApiKeyValue': 'La valeur de {key} n’est pas valide.',
  'persistence.error.unknown': 'Erreur inconnue',
  'persistence.ide.concurrentChange': 'L’état de l’IDE a été modifié dans une autre session. Nouvelle tentative…',
  'persistence.ide.saveFailed': 'Impossible d’enregistrer l’état de l’IDE du projet (HTTP {status}).',
  'persistence.ide.saveFailedGeneric': 'Impossible d’enregistrer l’état de l’IDE du projet.',
  'persistence.apiKeys.templateComment':
    'Saisissez la clé API de chaque fournisseur. Les clés sont stockées sous le nom du fournisseur (par exemple OpenAI). L’ancien format Fournisseur_API_KEY reste pris en charge.',
  'persistence.chat.forkSuffix': '{description} (branche)',
  'persistence.chat.forkFallback': 'Discussion dérivée',
  'persistence.chat.copySuffix': '{description} (copie)',
  'persistence.chat.defaultTitle': 'Discussion',
};

export function getPersistenceRuntimeCopy(language?: string | null): PersistenceRuntimeCopy {
  const resolved = normalizeSupportedLanguage(language ?? detectUserLanguage());

  return resolved === 'fr' ? persistenceRuntimeFr : persistenceRuntimeEn;
}

export function formatPersistenceRuntimeCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => values[key] ?? token);
}

export function formatForkedDiscussionTitle(description: string | undefined, language?: string | null): string {
  const copy = getPersistenceRuntimeCopy(language);

  return description
    ? formatPersistenceRuntimeCopy(copy['persistence.chat.forkSuffix'], { description })
    : copy['persistence.chat.forkFallback'];
}

export function formatDuplicatedDiscussionTitle(description: string | undefined, language?: string | null): string {
  const copy = getPersistenceRuntimeCopy(language);

  return formatPersistenceRuntimeCopy(copy['persistence.chat.copySuffix'], {
    description: description || copy['persistence.chat.defaultTitle'],
  });
}
