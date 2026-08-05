import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const integrationOauthCallbackEn = {
  'integrationOauthCallback.meta.title': 'Secure connector callback - E-Code',
  'integrationOauthCallback.meta.description': 'Complete a secure OAuth connector authorization and return to E-Code.',
  'integrationOauthCallback.provider.github': 'GitHub',
  'integrationOauthCallback.provider.gitlab': 'GitLab',
  'integrationOauthCallback.provider.bitbucket': 'Bitbucket',
  'integrationOauthCallback.provider.unknown': 'Connector',
  'integrationOauthCallback.success.title': 'Connection successful',
  'integrationOauthCallback.success.connectedAs': 'Connected to {provider} as {account}.',
  'integrationOauthCallback.success.accountFallback': 'your account',
  'integrationOauthCallback.success.closeHint':
    'This window will close automatically. If it stays open, you can close it manually.',
  'integrationOauthCallback.error.title': '{provider} connection failed',
  'integrationOauthCallback.error.retryHint': 'Return to E-Code and start the connection again.',
  'integrationOauthCallback.error.CONNECTOR_UNKNOWN_PROVIDER':
    'This connector is not available in the integrations panel yet.',
  'integrationOauthCallback.error.PROVIDER_DENIED':
    'Authorization was cancelled or denied. Start the connection again from E-Code.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_MISSING_PARAMS':
    'The OAuth provider did not return the expected information. Start the connection again from E-Code.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_REJECTED':
    'The provider rejected the connection. Check the account permissions, then try again.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_RATE_LIMITED':
    'The provider received too many connection requests. Wait a moment, then try again.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_UNAVAILABLE':
    'The connection service is temporarily unavailable. Try again shortly.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_FAILED':
    'The connection could not be completed. Return to E-Code and try again.',
  'integrationOauthCallback.action.close': 'Close window',
  'integrationOauthCallback.action.closeAria': 'Close this OAuth callback window',
} as const;

export type IntegrationOauthCallbackKey = keyof typeof integrationOauthCallbackEn;
export type IntegrationOauthCallbackCopy = Readonly<Record<IntegrationOauthCallbackKey, string>>;
export type IntegrationOauthCallbackLanguage = 'en' | 'fr';
export type IntegrationOauthCallbackErrorCode =
  | 'CONNECTOR_UNKNOWN_PROVIDER'
  | 'PROVIDER_DENIED'
  | 'OAUTH_CALLBACK_MISSING_PARAMS'
  | 'OAUTH_CALLBACK_REJECTED'
  | 'OAUTH_CALLBACK_RATE_LIMITED'
  | 'OAUTH_CALLBACK_UNAVAILABLE'
  | 'OAUTH_CALLBACK_FAILED';

export const integrationOauthCallbackFr: IntegrationOauthCallbackCopy = {
  'integrationOauthCallback.meta.title': 'Rappel sécurisé du connecteur - E-Code',
  'integrationOauthCallback.meta.description':
    'Finalisez l’autorisation sécurisée d’un connecteur OAuth, puis revenez dans E-Code.',
  'integrationOauthCallback.provider.github': 'GitHub',
  'integrationOauthCallback.provider.gitlab': 'GitLab',
  'integrationOauthCallback.provider.bitbucket': 'Bitbucket',
  'integrationOauthCallback.provider.unknown': 'Connecteur',
  'integrationOauthCallback.success.title': 'Connexion réussie',
  'integrationOauthCallback.success.connectedAs': 'Connexion à {provider} établie pour le compte {account}.',
  'integrationOauthCallback.success.accountFallback': 'votre compte',
  'integrationOauthCallback.success.closeHint':
    'Cette fenêtre va se fermer automatiquement. Si elle reste ouverte, vous pouvez la fermer manuellement.',
  'integrationOauthCallback.error.title': 'Échec de la connexion à {provider}',
  'integrationOauthCallback.error.retryHint': 'Revenez dans E-Code et relancez la connexion.',
  'integrationOauthCallback.error.CONNECTOR_UNKNOWN_PROVIDER':
    'Ce connecteur n’est pas encore disponible dans le panneau des intégrations.',
  'integrationOauthCallback.error.PROVIDER_DENIED':
    'L’autorisation a été annulée ou refusée. Relancez la connexion depuis E-Code.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_MISSING_PARAMS':
    'Le fournisseur OAuth n’a pas renvoyé les informations attendues. Relancez la connexion depuis E-Code.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_REJECTED':
    'Le fournisseur a refusé la connexion. Vérifiez les autorisations du compte, puis réessayez.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_RATE_LIMITED':
    'Le fournisseur a reçu trop de demandes de connexion. Patientez un instant, puis réessayez.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_UNAVAILABLE':
    'Le service de connexion est temporairement indisponible. Veuillez réessayer dans quelques instants.',
  'integrationOauthCallback.error.OAUTH_CALLBACK_FAILED':
    'Impossible de finaliser la connexion. Revenez dans E-Code, puis réessayez.',
  'integrationOauthCallback.action.close': 'Fermer la fenêtre',
  'integrationOauthCallback.action.closeAria': 'Fermer cette fenêtre de rappel OAuth',
};

export function resolveIntegrationOauthCallbackLanguage(language?: string | null): IntegrationOauthCallbackLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getIntegrationOauthCallbackCopy(language?: string | null): IntegrationOauthCallbackCopy {
  return resolveIntegrationOauthCallbackLanguage(language) === 'fr'
    ? integrationOauthCallbackFr
    : integrationOauthCallbackEn;
}

export function formatIntegrationOauthCallbackCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function integrationOauthCallbackProviderLabel(provider: string, language?: string | null): string {
  const copy = getIntegrationOauthCallbackCopy(language);
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === 'github' || normalizedProvider === 'gitlab' || normalizedProvider === 'bitbucket') {
    return copy[`integrationOauthCallback.provider.${normalizedProvider}`];
  }

  return copy['integrationOauthCallback.provider.unknown'];
}

export function integrationOauthCallbackErrorMessage(
  errorCode: IntegrationOauthCallbackErrorCode | undefined,
  language?: string | null,
): string {
  const copy = getIntegrationOauthCallbackCopy(language);
  const safeCode = errorCode ?? 'OAUTH_CALLBACK_FAILED';

  return copy[`integrationOauthCallback.error.${safeCode}`];
}
