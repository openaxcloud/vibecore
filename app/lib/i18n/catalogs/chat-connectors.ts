import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const chatConnectorsEn = {
  'chatConnectors.apiKey.label': '{provider} API key:',
  'chatConnectors.apiKey.checkingEnvironment': 'Checking environment configuration…',
  'chatConnectors.apiKey.environmentCheckFailed': 'Environment configuration could not be verified.',
  'chatConnectors.apiKey.setInUi': 'Set in E-Code',
  'chatConnectors.apiKey.setInEnvironment': 'Set with an environment variable',
  'chatConnectors.apiKey.notSet': 'Not set — add it here or through an environment variable.',
  'chatConnectors.apiKey.placeholder': 'Enter API key',
  'chatConnectors.apiKey.inputLabel': '{provider} API key',
  'chatConnectors.apiKey.revealSubject': 'the API key',
  'chatConnectors.apiKey.save': 'Save API key',
  'chatConnectors.apiKey.cancel': 'Cancel',
  'chatConnectors.apiKey.edit': 'Edit API key',
  'chatConnectors.apiKey.get': 'Get API key',
  'chatConnectors.apiKey.getLmStudio': 'Get LMStudio',
  'chatConnectors.apiKey.downloadOllama': 'Download Ollama',
  'chatConnectors.connection.connectedTo': 'Connected to {provider}',
  'chatConnectors.connection.as': 'as {account}',
  'chatConnectors.connection.failed': '{provider} connection failed',
  'chatConnectors.connection.failureDefault': 'The connection could not be completed. Try again.',
  'chatConnectors.connection.code': 'Code: {code}',
  'chatConnectors.connection.retry': 'Try again',
  'chatConnectors.connection.connect': 'Connect {provider}',
  'chatConnectors.connection.connectNew': 'Connect a new {provider} account',
  'chatConnectors.connection.logoAlt': '{provider} logo',
  'chatConnectors.connection.permissions_one': '{count} requested permission',
  'chatConnectors.connection.permissions_other': '{count} requested permissions',
  'chatConnectors.connection.existing': 'Use an existing connection:',
  'chatConnectors.connection.scopesMatch': 'Permissions match',
  'chatConnectors.connection.scopesDiffer': 'Different permissions — authorization may be required again',
  'chatConnectors.connection.linking': 'Linking…',
  'chatConnectors.connection.useThis': 'Use this connection',
  'chatConnectors.connection.waiting': 'Waiting for {provider}…',
  'chatConnectors.connection.startFailed': 'Could not start the authorization flow. Try again.',
  'chatConnectors.connection.linkFailed': 'Could not link the existing connection. Try again.',
  'chatConnectors.secret.projectMissing': 'Open this connector from a project before saving the secret.',
  'chatConnectors.secret.fieldRequired': '{field} is required.',
  'chatConnectors.secret.saveFailed': 'The secret could not be saved. Check the fields and try again.',
  'chatConnectors.secret.saved': '{name} saved to',
  'chatConnectors.secret.provide': 'Provide {name}',
  'chatConnectors.secret.saving': 'Saving…',
  'chatConnectors.secret.save': 'Save {name}',
  'chatConnectors.secret.projectHint': 'Open this card from a project to save the secret securely.',
} as const;

export type ChatConnectorsKey = keyof typeof chatConnectorsEn;
export type ChatConnectorsCopy = Readonly<Record<ChatConnectorsKey, string>>;

export const chatConnectorsFr: ChatConnectorsCopy = {
  'chatConnectors.apiKey.label': 'Clé API {provider} :',
  'chatConnectors.apiKey.checkingEnvironment': 'Vérification de la configuration de l’environnement…',
  'chatConnectors.apiKey.environmentCheckFailed': 'Impossible de vérifier la configuration de l’environnement.',
  'chatConnectors.apiKey.setInUi': 'Configurée dans E-Code',
  'chatConnectors.apiKey.setInEnvironment': 'Configurée par une variable d’environnement',
  'chatConnectors.apiKey.notSet': 'Non configurée — ajoutez-la ici ou au moyen d’une variable d’environnement.',
  'chatConnectors.apiKey.placeholder': 'Saisissez la clé API',
  'chatConnectors.apiKey.inputLabel': 'Clé API {provider}',
  'chatConnectors.apiKey.revealSubject': 'la clé API',
  'chatConnectors.apiKey.save': 'Enregistrer la clé API',
  'chatConnectors.apiKey.cancel': 'Annuler',
  'chatConnectors.apiKey.edit': 'Modifier la clé API',
  'chatConnectors.apiKey.get': 'Obtenir une clé API',
  'chatConnectors.apiKey.getLmStudio': 'Obtenir LMStudio',
  'chatConnectors.apiKey.downloadOllama': 'Télécharger Ollama',
  'chatConnectors.connection.connectedTo': 'Connecté à {provider}',
  'chatConnectors.connection.as': 'avec le compte {account}',
  'chatConnectors.connection.failed': 'Échec de la connexion à {provider}',
  'chatConnectors.connection.failureDefault': 'Impossible d’établir la connexion. Réessayez.',
  'chatConnectors.connection.code': 'Code : {code}',
  'chatConnectors.connection.retry': 'Réessayer',
  'chatConnectors.connection.connect': 'Connecter {provider}',
  'chatConnectors.connection.connectNew': 'Connecter un nouveau compte {provider}',
  'chatConnectors.connection.logoAlt': 'Logo de {provider}',
  'chatConnectors.connection.permissions_one': '{count} autorisation demandée',
  'chatConnectors.connection.permissions_other': '{count} autorisations demandées',
  'chatConnectors.connection.existing': 'Utiliser une connexion existante :',
  'chatConnectors.connection.scopesMatch': 'Les autorisations correspondent',
  'chatConnectors.connection.scopesDiffer':
    'Autorisations différentes — une nouvelle autorisation peut être nécessaire',
  'chatConnectors.connection.linking': 'Association…',
  'chatConnectors.connection.useThis': 'Utiliser cette connexion',
  'chatConnectors.connection.waiting': 'En attente de {provider}…',
  'chatConnectors.connection.startFailed': 'Impossible de démarrer l’autorisation. Réessayez.',
  'chatConnectors.connection.linkFailed': 'Impossible d’associer la connexion existante. Réessayez.',
  'chatConnectors.secret.projectMissing': 'Ouvrez ce connecteur depuis un projet avant d’enregistrer le secret.',
  'chatConnectors.secret.fieldRequired': 'Le champ {field} est obligatoire.',
  'chatConnectors.secret.saveFailed': 'Impossible d’enregistrer le secret. Vérifiez les champs, puis réessayez.',
  'chatConnectors.secret.saved': '{name} a été enregistré dans',
  'chatConnectors.secret.provide': 'Renseignez {name}',
  'chatConnectors.secret.saving': 'Enregistrement…',
  'chatConnectors.secret.save': 'Enregistrer {name}',
  'chatConnectors.secret.projectHint':
    'Ouvrez cette carte depuis un projet pour enregistrer le secret de manière sécurisée.',
};

export function getChatConnectorsCopy(language?: string | null): ChatConnectorsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? chatConnectorsFr : chatConnectorsEn;
}

export function formatChatConnectorsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatChatConnectorsPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatChatConnectorsCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}
