import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDate, formatUserAreaNumber, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export type AccountSettingsConnectedLanguage = 'en' | 'fr';
export type AccountSettingsConnectedAction = 'connect' | 'reconnect' | 'dismiss' | 'disconnect';
export type AccountSettingsConnectedStatusCode = 'identityUnlinked';
export type AccountSettingsConnectedErrorCode =
  | 'unsupportedAction'
  | 'invalidProvider'
  | 'lastLoginMethod'
  | 'connectionNotFound'
  | 'sessionExpired'
  | 'permissionDenied'
  | 'rateLimited'
  | 'invalidRequest'
  | 'invalidResponse'
  | 'serviceUnavailable'
  | 'connectFailed'
  | 'reconnectFailed'
  | 'dismissFailed'
  | 'disconnectFailed'
  | 'unlinkFailed'
  | 'popupBlocked'
  | 'popupClosed'
  | 'oauthFailed';

export type AccountSettingsConnectedActionData = Readonly<{
  statusCode?: AccountSettingsConnectedStatusCode;
  errorCode?: AccountSettingsConnectedErrorCode;
}>;

export const accountSettingsConnectedEn = {
  'accountSettingsConnected.meta.title': 'Connected accounts — E-Code',
  'accountSettingsConnected.meta.description':
    'Connect repository integrations and manage identity providers linked to your E-Code account.',
  'accountSettingsConnected.page.title': 'Connected accounts',
  'accountSettingsConnected.page.description':
    'Manage integrations used by the agent and identity providers used to sign in to your account.',
  'accountSettingsConnected.provider.githubIntegration.title': 'GitHub',
  'accountSettingsConnected.provider.githubIntegration.detail':
    'Connected for repository import, push and pull request creation.',
  'accountSettingsConnected.provider.githubIdentity.title': 'GitHub (sign-in)',
  'accountSettingsConnected.provider.githubIdentity.detail': 'Use GitHub to sign in to this account.',
  'accountSettingsConnected.provider.googleIdentity.title': 'Google',
  'accountSettingsConnected.provider.googleIdentity.detail': 'Sign in with Google and verify enterprise domains.',
  'accountSettingsConnected.provider.microsoftIdentity.title': 'Microsoft Entra ID',
  'accountSettingsConnected.provider.microsoftIdentity.detail':
    'OIDC configuration can be enabled from enterprise SSO settings.',
  'accountSettingsConnected.provider.fallback': 'Identity provider',
  'accountSettingsConnected.oauth.linked': '{provider} was linked to your account.',
  'accountSettingsConnected.oauth.linkFailed': 'Could not link {provider}. {reason}',
  'accountSettingsConnected.oauth.error.cancelled': 'The request was cancelled or denied.',
  'accountSettingsConnected.oauth.error.expired': 'The session expired. Start again.',
  'accountSettingsConnected.oauth.error.temporary':
    'The identity provider is temporarily unavailable. Try again shortly.',
  'accountSettingsConnected.oauth.error.generic': 'The request could not be completed. Try again.',
  'accountSettingsConnected.load.integration.loading': 'Loading integration connections',
  'accountSettingsConnected.load.integration.title': 'Integration connections could not load',
  'accountSettingsConnected.load.integration.description':
    'Current integration status is unavailable. No connection was changed. Reload this section to try again.',
  'accountSettingsConnected.load.identity.loading': 'Loading sign-in connections',
  'accountSettingsConnected.load.identity.title': 'Sign-in connections could not load',
  'accountSettingsConnected.load.identity.description':
    'Current sign-in connection status is unavailable. No connection was changed. Reload this section to try again.',
  'accountSettingsConnected.load.alerts.loading': 'Loading connection alerts',
  'accountSettingsConnected.load.alerts.title': 'Connection alerts could not load',
  'accountSettingsConnected.load.alerts.description':
    'Connection health alerts are temporarily unavailable. Reload this section to try again.',
  'accountSettingsConnected.load.permission.description':
    'Your account does not have permission to view this connection information.',
  'accountSettingsConnected.load.retry': 'Reload connected accounts',
  'accountSettingsConnected.status.needsReconnect': 'Needs reconnecting',
  'accountSettingsConnected.status.connected': 'Connected',
  'accountSettingsConnected.status.notConnected': 'Not connected',
  'accountSettingsConnected.status.unavailable': 'Unavailable',
  'accountSettingsConnected.connection.account': 'Account {account}',
  'accountSettingsConnected.connection.linkedSince': 'Linked since {date}',
  'accountSettingsConnected.connection.dateUnavailable': 'Date unavailable',
  'accountSettingsConnected.action.connect': 'Connect',
  'accountSettingsConnected.action.connecting': 'Connecting…',
  'accountSettingsConnected.action.connectAria': 'Connect {provider}',
  'accountSettingsConnected.action.connectingAria': 'Connecting {provider}',
  'accountSettingsConnected.action.link': 'Link',
  'accountSettingsConnected.action.linkAria': 'Link {provider} to this account',
  'accountSettingsConnected.action.reconnect': 'Reconnect',
  'accountSettingsConnected.action.reconnecting': 'Reconnecting…',
  'accountSettingsConnected.action.reconnectAria': 'Reconnect {provider}',
  'accountSettingsConnected.action.reconnectingAria': 'Reconnecting {provider}',
  'accountSettingsConnected.action.dismiss': 'Dismiss',
  'accountSettingsConnected.action.dismissing': 'Dismissing…',
  'accountSettingsConnected.action.dismissAria': 'Dismiss the {provider} reconnection alert',
  'accountSettingsConnected.action.disconnect': 'Disconnect',
  'accountSettingsConnected.action.disconnecting': 'Disconnecting…',
  'accountSettingsConnected.action.disconnectAria': 'Disconnect {provider}',
  'accountSettingsConnected.action.unlink': 'Unlink',
  'accountSettingsConnected.action.unlinking': 'Unlinking…',
  'accountSettingsConnected.action.unlinkAria': 'Unlink {provider} from this account',
  'accountSettingsConnected.alert.count_one': '{count} connection needs reconnecting',
  'accountSettingsConnected.alert.count_other': '{count} connections need reconnecting',
  'accountSettingsConnected.alert.reason.tokenRevoked': 'the stored access token was revoked or expired',
  'accountSettingsConnected.alert.reason.generic': 'the stored credential is no longer valid',
  'accountSettingsConnected.alert.detected': 'Detected {date}',
  'accountSettingsConnected.dialog.disconnect.title': 'Disconnect {provider}?',
  'accountSettingsConnected.dialog.disconnect.description':
    'Agent access through this integration will stop. You will need to reconnect through OAuth to restore access.',
  'accountSettingsConnected.dialog.disconnect.confirm': 'Disconnect integration',
  'accountSettingsConnected.dialog.unlink.title': 'Unlink {provider}?',
  'accountSettingsConnected.dialog.unlink.description':
    'You will no longer be able to use this provider to sign in. Make sure another sign-in method is available.',
  'accountSettingsConnected.dialog.unlink.confirm': 'Unlink provider',
  'accountSettingsConnected.dialog.cancel': 'Cancel',
  'accountSettingsConnected.success.identityUnlinked': 'The sign-in provider was unlinked from your account.',
  'accountSettingsConnected.error.unsupportedAction': 'This connected-account action is not supported.',
  'accountSettingsConnected.error.invalidProvider': 'Select a supported identity provider and try again.',
  'accountSettingsConnected.error.lastLoginMethod':
    'This is your only sign-in method. Set a password or link another provider before unlinking it.',
  'accountSettingsConnected.error.connectionNotFound':
    'This connection no longer exists. Reload connected accounts and try again.',
  'accountSettingsConnected.error.sessionExpired': 'Your session expired. Sign in again and try again.',
  'accountSettingsConnected.error.permissionDenied': 'You do not have permission to change this connection.',
  'accountSettingsConnected.error.rateLimited': 'Too many attempts were made. Wait a moment and try again.',
  'accountSettingsConnected.error.invalidRequest': 'The connection request is invalid. Reload and try again.',
  'accountSettingsConnected.error.invalidResponse':
    'The connection service returned an invalid response. No connection was changed.',
  'accountSettingsConnected.error.serviceUnavailable':
    'Connected-account management is temporarily unavailable. Try again in a moment.',
  'accountSettingsConnected.error.connectFailed': 'Unable to start the connection. Try again.',
  'accountSettingsConnected.error.reconnectFailed': 'Unable to start the reconnection. Try again.',
  'accountSettingsConnected.error.dismissFailed': 'Unable to dismiss this alert. Try again.',
  'accountSettingsConnected.error.disconnectFailed': 'Unable to disconnect this account. Try again.',
  'accountSettingsConnected.error.unlinkFailed': 'Unable to unlink this sign-in provider. Try again.',
  'accountSettingsConnected.error.popupBlocked':
    'The OAuth window was blocked. Allow pop-ups for this site and try again.',
  'accountSettingsConnected.error.popupClosed':
    'The OAuth window was closed before the connection was completed. Try again.',
  'accountSettingsConnected.error.oauthFailed': 'The OAuth connection could not be completed. Try again.',
} as const;

export type AccountSettingsConnectedKey = keyof typeof accountSettingsConnectedEn;
export type AccountSettingsConnectedCopy = Readonly<Record<AccountSettingsConnectedKey, string>>;

export const accountSettingsConnectedFr: AccountSettingsConnectedCopy = {
  'accountSettingsConnected.meta.title': 'Comptes connectés — E-Code',
  'accountSettingsConnected.meta.description':
    'Connectez des intégrations de dépôts et gérez les fournisseurs d’identité associés à votre compte E-Code.',
  'accountSettingsConnected.page.title': 'Comptes connectés',
  'accountSettingsConnected.page.description':
    'Gérez les intégrations utilisées par l’agent et les fournisseurs d’identité utilisés pour vous connecter à votre compte.',
  'accountSettingsConnected.provider.githubIntegration.title': 'GitHub',
  'accountSettingsConnected.provider.githubIntegration.detail':
    'Connecté pour importer des dépôts, effectuer des push et créer des pull requests.',
  'accountSettingsConnected.provider.githubIdentity.title': 'GitHub (connexion)',
  'accountSettingsConnected.provider.githubIdentity.detail': 'Utilisez GitHub pour vous connecter à ce compte.',
  'accountSettingsConnected.provider.googleIdentity.title': 'Google',
  'accountSettingsConnected.provider.googleIdentity.detail':
    'Connectez-vous avec Google et vérifiez les domaines de l’entreprise.',
  'accountSettingsConnected.provider.microsoftIdentity.title': 'Microsoft Entra ID',
  'accountSettingsConnected.provider.microsoftIdentity.detail':
    'La configuration OIDC peut être activée dans les paramètres SSO de l’entreprise.',
  'accountSettingsConnected.provider.fallback': 'Fournisseur d’identité',
  'accountSettingsConnected.oauth.linked': '{provider} a été associé à votre compte.',
  'accountSettingsConnected.oauth.linkFailed': 'Impossible d’associer {provider}. {reason}',
  'accountSettingsConnected.oauth.error.cancelled': 'La demande a été annulée ou refusée.',
  'accountSettingsConnected.oauth.error.expired': 'La session a expiré. Recommencez.',
  'accountSettingsConnected.oauth.error.temporary':
    'Le fournisseur d’identité est temporairement indisponible. Réessayez dans quelques instants.',
  'accountSettingsConnected.oauth.error.generic': 'Impossible de terminer la demande. Réessayez.',
  'accountSettingsConnected.load.integration.loading': 'Chargement des connexions aux intégrations',
  'accountSettingsConnected.load.integration.title': 'Impossible de charger les connexions aux intégrations',
  'accountSettingsConnected.load.integration.description':
    'L’état actuel des intégrations est indisponible. Aucune connexion n’a été modifiée. Rechargez cette section pour réessayer.',
  'accountSettingsConnected.load.identity.loading': 'Chargement des connexions utilisées pour se connecter',
  'accountSettingsConnected.load.identity.title': 'Impossible de charger les connexions utilisées pour se connecter',
  'accountSettingsConnected.load.identity.description':
    'L’état actuel des fournisseurs de connexion est indisponible. Aucune connexion n’a été modifiée. Rechargez cette section pour réessayer.',
  'accountSettingsConnected.load.alerts.loading': 'Chargement des alertes de connexion',
  'accountSettingsConnected.load.alerts.title': 'Impossible de charger les alertes de connexion',
  'accountSettingsConnected.load.alerts.description':
    'Les alertes sur l’état des connexions sont temporairement indisponibles. Rechargez cette section pour réessayer.',
  'accountSettingsConnected.load.permission.description':
    'Votre compte ne dispose pas de l’autorisation nécessaire pour consulter ces informations de connexion.',
  'accountSettingsConnected.load.retry': 'Recharger les comptes connectés',
  'accountSettingsConnected.status.needsReconnect': 'À reconnecter',
  'accountSettingsConnected.status.connected': 'Connecté',
  'accountSettingsConnected.status.notConnected': 'Non connecté',
  'accountSettingsConnected.status.unavailable': 'Indisponible',
  'accountSettingsConnected.connection.account': 'Compte {account}',
  'accountSettingsConnected.connection.linkedSince': 'Associé depuis le {date}',
  'accountSettingsConnected.connection.dateUnavailable': 'Date indisponible',
  'accountSettingsConnected.action.connect': 'Connecter',
  'accountSettingsConnected.action.connecting': 'Connexion…',
  'accountSettingsConnected.action.connectAria': 'Connecter {provider}',
  'accountSettingsConnected.action.connectingAria': 'Connexion à {provider} en cours',
  'accountSettingsConnected.action.link': 'Associer',
  'accountSettingsConnected.action.linkAria': 'Associer {provider} à ce compte',
  'accountSettingsConnected.action.reconnect': 'Reconnecter',
  'accountSettingsConnected.action.reconnecting': 'Reconnexion…',
  'accountSettingsConnected.action.reconnectAria': 'Reconnecter {provider}',
  'accountSettingsConnected.action.reconnectingAria': 'Reconnexion à {provider} en cours',
  'accountSettingsConnected.action.dismiss': 'Ignorer',
  'accountSettingsConnected.action.dismissing': 'Traitement…',
  'accountSettingsConnected.action.dismissAria': 'Ignorer l’alerte de reconnexion à {provider}',
  'accountSettingsConnected.action.disconnect': 'Déconnecter',
  'accountSettingsConnected.action.disconnecting': 'Déconnexion…',
  'accountSettingsConnected.action.disconnectAria': 'Déconnecter {provider}',
  'accountSettingsConnected.action.unlink': 'Dissocier',
  'accountSettingsConnected.action.unlinking': 'Dissociation…',
  'accountSettingsConnected.action.unlinkAria': 'Dissocier {provider} de ce compte',
  'accountSettingsConnected.alert.count_one': '{count} connexion doit être rétablie',
  'accountSettingsConnected.alert.count_other': '{count} connexions doivent être rétablies',
  'accountSettingsConnected.alert.reason.tokenRevoked': 'le jeton d’accès enregistré a été révoqué ou a expiré',
  'accountSettingsConnected.alert.reason.generic': 'les identifiants enregistrés ne sont plus valides',
  'accountSettingsConnected.alert.detected': 'Détectée le {date}',
  'accountSettingsConnected.dialog.disconnect.title': 'Déconnecter {provider} ?',
  'accountSettingsConnected.dialog.disconnect.description':
    'L’accès de l’agent via cette intégration sera interrompu. Vous devrez vous reconnecter via OAuth pour le rétablir.',
  'accountSettingsConnected.dialog.disconnect.confirm': 'Déconnecter l’intégration',
  'accountSettingsConnected.dialog.unlink.title': 'Dissocier {provider} ?',
  'accountSettingsConnected.dialog.unlink.description':
    'Vous ne pourrez plus utiliser ce fournisseur pour vous connecter. Vérifiez qu’une autre méthode de connexion est disponible.',
  'accountSettingsConnected.dialog.unlink.confirm': 'Dissocier le fournisseur',
  'accountSettingsConnected.dialog.cancel': 'Annuler',
  'accountSettingsConnected.success.identityUnlinked': 'Le fournisseur de connexion a été dissocié de votre compte.',
  'accountSettingsConnected.error.unsupportedAction':
    'Cette action sur les comptes connectés n’est pas prise en charge.',
  'accountSettingsConnected.error.invalidProvider':
    'Sélectionnez un fournisseur d’identité pris en charge, puis réessayez.',
  'accountSettingsConnected.error.lastLoginMethod':
    'Il s’agit de votre seule méthode de connexion. Définissez un mot de passe ou associez un autre fournisseur avant de la dissocier.',
  'accountSettingsConnected.error.connectionNotFound':
    'Cette connexion n’existe plus. Rechargez les comptes connectés, puis réessayez.',
  'accountSettingsConnected.error.sessionExpired': 'Votre session a expiré. Connectez-vous de nouveau, puis réessayez.',
  'accountSettingsConnected.error.permissionDenied':
    'Vous ne disposez pas de l’autorisation nécessaire pour modifier cette connexion.',
  'accountSettingsConnected.error.rateLimited':
    'Trop de tentatives ont été effectuées. Patientez un instant, puis réessayez.',
  'accountSettingsConnected.error.invalidRequest':
    'La demande de connexion est invalide. Rechargez la page, puis réessayez.',
  'accountSettingsConnected.error.invalidResponse':
    'Le service de connexion a renvoyé une réponse invalide. Aucune connexion n’a été modifiée.',
  'accountSettingsConnected.error.serviceUnavailable':
    'La gestion des comptes connectés est temporairement indisponible. Réessayez dans quelques instants.',
  'accountSettingsConnected.error.connectFailed': 'Impossible de démarrer la connexion. Réessayez.',
  'accountSettingsConnected.error.reconnectFailed': 'Impossible de démarrer la reconnexion. Réessayez.',
  'accountSettingsConnected.error.dismissFailed': 'Impossible d’ignorer cette alerte. Réessayez.',
  'accountSettingsConnected.error.disconnectFailed': 'Impossible de déconnecter ce compte. Réessayez.',
  'accountSettingsConnected.error.unlinkFailed': 'Impossible de dissocier ce fournisseur de connexion. Réessayez.',
  'accountSettingsConnected.error.popupBlocked':
    'La fenêtre OAuth a été bloquée. Autorisez les fenêtres contextuelles pour ce site, puis réessayez.',
  'accountSettingsConnected.error.popupClosed':
    'La fenêtre OAuth a été fermée avant la fin de la connexion. Réessayez.',
  'accountSettingsConnected.error.oauthFailed': 'Impossible de terminer la connexion OAuth. Réessayez.',
};

const statusKeys: Readonly<Record<AccountSettingsConnectedStatusCode, AccountSettingsConnectedKey>> = {
  identityUnlinked: 'accountSettingsConnected.success.identityUnlinked',
};

const errorKeys: Readonly<Record<AccountSettingsConnectedErrorCode, AccountSettingsConnectedKey>> = {
  unsupportedAction: 'accountSettingsConnected.error.unsupportedAction',
  invalidProvider: 'accountSettingsConnected.error.invalidProvider',
  lastLoginMethod: 'accountSettingsConnected.error.lastLoginMethod',
  connectionNotFound: 'accountSettingsConnected.error.connectionNotFound',
  sessionExpired: 'accountSettingsConnected.error.sessionExpired',
  permissionDenied: 'accountSettingsConnected.error.permissionDenied',
  rateLimited: 'accountSettingsConnected.error.rateLimited',
  invalidRequest: 'accountSettingsConnected.error.invalidRequest',
  invalidResponse: 'accountSettingsConnected.error.invalidResponse',
  serviceUnavailable: 'accountSettingsConnected.error.serviceUnavailable',
  connectFailed: 'accountSettingsConnected.error.connectFailed',
  reconnectFailed: 'accountSettingsConnected.error.reconnectFailed',
  dismissFailed: 'accountSettingsConnected.error.dismissFailed',
  disconnectFailed: 'accountSettingsConnected.error.disconnectFailed',
  unlinkFailed: 'accountSettingsConnected.error.unlinkFailed',
  popupBlocked: 'accountSettingsConnected.error.popupBlocked',
  popupClosed: 'accountSettingsConnected.error.popupClosed',
  oauthFailed: 'accountSettingsConnected.error.oauthFailed',
};

export function resolveAccountSettingsConnectedLanguage(language?: string | null): AccountSettingsConnectedLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveAccountSettingsConnectedLanguage(language);
}

function locale(language?: string | null): string {
  return resolveAccountSettingsConnectedLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
}

export function getAccountSettingsConnectedCopy(language?: string | null): AccountSettingsConnectedCopy {
  return resolveAccountSettingsConnectedLanguage(language) === 'fr'
    ? accountSettingsConnectedFr
    : accountSettingsConnectedEn;
}

export function formatAccountSettingsConnectedCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function connectedAccountProviderLabel(provider: string, language?: string | null): string {
  const copy = getAccountSettingsConnectedCopy(language);

  switch (provider.trim().toLowerCase()) {
    case 'github':
      return 'GitHub';
    case 'google':
      return 'Google';
    case 'microsoft':
    case 'oidc':
      return 'Microsoft Entra ID';
    default:
      return copy['accountSettingsConnected.provider.fallback'];
  }
}

export function connectedAccountOauthError(code: string | null | undefined, language?: string | null): string {
  const copy = getAccountSettingsConnectedCopy(language);

  switch (code?.trim().toLowerCase()) {
    case 'access_denied':
      return copy['accountSettingsConnected.oauth.error.cancelled'];
    case 'invalid_callback':
      return copy['accountSettingsConnected.oauth.error.expired'];
    case 'temporarily_unavailable':
      return copy['accountSettingsConnected.oauth.error.temporary'];
    default:
      return copy['accountSettingsConnected.oauth.error.generic'];
  }
}

export function formatConnectedAccountDate(value: string | null | undefined, language?: string | null): string {
  const copy = getAccountSettingsConnectedCopy(language);

  if (!value) {
    return copy['accountSettingsConnected.connection.dateUnavailable'];
  }

  return (
    formatUserAreaDate(
      value,
      { year: 'numeric', month: 'short', day: 'numeric', timeZone: USER_AREA_TIME_ZONE },
      supportedLanguage(language),
    ) ?? copy['accountSettingsConnected.connection.dateUnavailable']
  );
}

export function formatReconnectionAlertCount(count: number, language?: string | null): string {
  const copy = getAccountSettingsConnectedCopy(language);
  const suffix = new Intl.PluralRules(locale(language)).select(count) === 'one' ? 'one' : 'other';

  return formatAccountSettingsConnectedCopy(copy[`accountSettingsConnected.alert.count_${suffix}`], {
    count: formatUserAreaNumber(count, undefined, supportedLanguage(language)),
  });
}

export function connectedAccountReconnectReason(reason: string, language?: string | null): string {
  const copy = getAccountSettingsConnectedCopy(language);

  return reason === 'token_revoked'
    ? copy['accountSettingsConnected.alert.reason.tokenRevoked']
    : copy['accountSettingsConnected.alert.reason.generic'];
}

export function formatConnectedAccountStatus(
  data: AccountSettingsConnectedActionData,
  language?: string | null,
): string | undefined {
  return data.statusCode ? getAccountSettingsConnectedCopy(language)[statusKeys[data.statusCode]] : undefined;
}

export function formatConnectedAccountError(
  code: AccountSettingsConnectedErrorCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getAccountSettingsConnectedCopy(language)[errorKeys[code]] : undefined;
}

async function readResponseCode(error: Response): Promise<string | undefined> {
  try {
    const payload = (await error.clone().json()) as { code?: unknown };

    return typeof payload.code === 'string' ? payload.code : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveConnectedAccountActionError(error: unknown): Promise<AccountSettingsConnectedErrorCode> {
  if (!(error instanceof Response)) {
    return 'serviceUnavailable';
  }

  const code = await readResponseCode(error);

  if (code === 'LAST_LOGIN_METHOD') {
    return 'lastLoginMethod';
  }

  if (code === 'CONNECTION_NOT_FOUND') {
    return 'connectionNotFound';
  }

  if (error.status === 401) {
    return 'sessionExpired';
  }

  if (error.status === 403) {
    return 'permissionDenied';
  }

  if (error.status === 404) {
    return 'connectionNotFound';
  }

  if (error.status === 429) {
    return 'rateLimited';
  }

  if (error.status === 400 || error.status === 422) {
    return 'invalidRequest';
  }

  if (error.status >= 500) {
    return 'serviceUnavailable';
  }

  return 'unlinkFailed';
}

export function resolveConnectedAccountClientError(
  action: AccountSettingsConnectedAction,
  status?: number,
): AccountSettingsConnectedErrorCode {
  if (status === 401) {
    return 'sessionExpired';
  }

  if (status === 403) {
    return 'permissionDenied';
  }

  if (status === 404 && (action === 'disconnect' || action === 'dismiss')) {
    return 'connectionNotFound';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  return action === 'connect'
    ? 'connectFailed'
    : action === 'reconnect'
      ? 'reconnectFailed'
      : action === 'dismiss'
        ? 'dismissFailed'
        : 'disconnectFailed';
}

export function resolveConnectedAccountPopupError(code?: string): AccountSettingsConnectedErrorCode {
  if (code === 'POPUP_BLOCKED') {
    return 'popupBlocked';
  }

  if (code === 'POPUP_CLOSED') {
    return 'popupClosed';
  }

  if (code === 'CALLBACK_PAYLOAD_INCOMPLETE') {
    return 'invalidResponse';
  }

  return 'oauthFailed';
}

export function connectedAccountInlineStatus(error: unknown): number {
  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return error.status;
  }

  return 502;
}
