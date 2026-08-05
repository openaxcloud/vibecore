import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const connectionFormEn = {
  'connectionForm.form.label': 'Connect to {serviceName}',
  'connectionForm.tip.label': 'Tip:',
  'connectionForm.tip.environmentPrefix': 'You can also set the',
  'connectionForm.tip.environmentSuffix': 'environment variable to connect automatically.',
  'connectionForm.tokenType.label': 'Token type',
  'connectionForm.token.defaultLabel': 'Access token',
  'connectionForm.token.defaultPlaceholder': 'Enter your {serviceName} access token',
  'connectionForm.token.required': 'Enter an access token to continue.',
  'connectionForm.token.get': 'Get your token',
  'connectionForm.token.openInNewTab': 'Open the token creation page in a new tab',
  'connectionForm.action.connect': 'Connect',
  'connectionForm.action.connecting': 'Connecting…',
  'connectionForm.action.connectAria': 'Connect to {serviceName}',
  'connectionForm.action.disconnect': 'Disconnect',
  'connectionForm.action.disconnectAria': 'Disconnect from {serviceName}',
  'connectionForm.status.connected': 'Connected to {serviceName}',
  'connectionForm.error.title': 'Connection failed',
  'connectionForm.error.connectionFailed': 'We could not connect to {serviceName}. Check the token, then try again.',
  'connectionForm.error.invalidToken':
    '{serviceName} rejected this token. Check its permissions or create a new token, then try again.',
  'connectionForm.error.networkUnavailable':
    'We could not reach {serviceName}. Check your network connection, then try again.',
} as const;

export type ConnectionFormKey = keyof typeof connectionFormEn;
export type ConnectionFormCopy = Readonly<Record<ConnectionFormKey, string>>;
export type ConnectionFormErrorCode = 'connectionFailed' | 'invalidToken' | 'networkUnavailable';

export const connectionFormFr: ConnectionFormCopy = {
  'connectionForm.form.label': 'Connexion à {serviceName}',
  'connectionForm.tip.label': 'Conseil :',
  'connectionForm.tip.environmentPrefix': 'Vous pouvez également définir la variable d’environnement',
  'connectionForm.tip.environmentSuffix': 'pour vous connecter automatiquement.',
  'connectionForm.tokenType.label': 'Type de jeton',
  'connectionForm.token.defaultLabel': 'Jeton d’accès',
  'connectionForm.token.defaultPlaceholder': 'Saisissez votre jeton d’accès {serviceName}',
  'connectionForm.token.required': 'Saisissez un jeton d’accès pour continuer.',
  'connectionForm.token.get': 'Obtenir votre jeton',
  'connectionForm.token.openInNewTab': 'Ouvrir la page de création du jeton dans un nouvel onglet',
  'connectionForm.action.connect': 'Se connecter',
  'connectionForm.action.connecting': 'Connexion…',
  'connectionForm.action.connectAria': 'Se connecter à {serviceName}',
  'connectionForm.action.disconnect': 'Se déconnecter',
  'connectionForm.action.disconnectAria': 'Se déconnecter de {serviceName}',
  'connectionForm.status.connected': 'Connecté à {serviceName}',
  'connectionForm.error.title': 'Échec de la connexion',
  'connectionForm.error.connectionFailed':
    'Impossible d’établir la connexion à {serviceName}. Vérifiez le jeton, puis réessayez.',
  'connectionForm.error.invalidToken':
    '{serviceName} a refusé ce jeton. Vérifiez ses autorisations ou créez-en un nouveau, puis réessayez.',
  'connectionForm.error.networkUnavailable':
    'Impossible de joindre {serviceName}. Vérifiez votre connexion réseau, puis réessayez.',
};

export function resolveConnectionFormLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getConnectionFormCopy(language?: string | null): ConnectionFormCopy {
  return resolveConnectionFormLanguage(language) === 'fr' ? connectionFormFr : connectionFormEn;
}

export function formatConnectionFormCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function getConnectionFormErrorMessage(
  errorCode: ConnectionFormErrorCode | undefined,
  serviceName: string,
  language?: string | null,
): string {
  const copy = getConnectionFormCopy(language);
  const key = `connectionForm.error.${errorCode ?? 'connectionFailed'}` as const;

  return formatConnectionFormCopy(copy[key], { serviceName });
}
