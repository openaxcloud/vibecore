import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDate, formatUserAreaNumber, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export type ScimTokenSettingsLanguage = 'en' | 'fr';
export type ScimTokenIntent = 'create' | 'rotate' | 'revoke';
export type ScimTokenActionField = 'name';
export type ScimTokenStatusCode = 'created' | 'rotated' | 'revoked';
export type ScimTokenErrorCode =
  | 'organizationUnavailable'
  | 'nameRequired'
  | 'nameTooLong'
  | 'tokenRequired'
  | 'intentInvalid'
  | 'reauthRequired'
  | 'permissionDenied'
  | 'tokenNotFound'
  | 'invalidRequest'
  | 'conflict'
  | 'rateLimited'
  | 'invalidResponse'
  | 'serviceUnavailable'
  | 'createFailed'
  | 'rotateFailed'
  | 'revokeFailed';

export type ScimTokenActionData = Readonly<{
  statusCode?: ScimTokenStatusCode;
  errorCode?: ScimTokenErrorCode;
  field?: ScimTokenActionField;
  token?: string;
}>;

export const scimTokenSettingsEn = {
  'scimTokenSettings.meta.title': 'SCIM token settings — E-Code',
  'scimTokenSettings.meta.description':
    'Create, renew and revoke organization SCIM tokens used by identity providers for member provisioning.',
  'scimTokenSettings.page.title': 'SCIM token settings',
  'scimTokenSettings.page.description':
    'Create bearer tokens for your identity provider to provision and deprovision members over SCIM. Tokens are hashed at rest and shown in full only once, after creation or renewal.',
  'scimTokenSettings.secret.title': 'Copy this token now',
  'scimTokenSettings.secret.description':
    'This is the only time the token is shown. Paste it into your identity provider’s SCIM configuration; you cannot retrieve it again.',
  'scimTokenSettings.secret.copy': 'Copy token',
  'scimTokenSettings.secret.copied': 'Token copied',
  'scimTokenSettings.secret.copyFailed': 'Copy failed',
  'scimTokenSettings.create.title': 'Create a token',
  'scimTokenSettings.create.description':
    'Tokens expire automatically according to your organization’s SCIM token lifetime.',
  'scimTokenSettings.create.name': 'Token name',
  'scimTokenSettings.create.namePlaceholder': 'Okta provisioning',
  'scimTokenSettings.create.submit': 'Create SCIM token',
  'scimTokenSettings.create.submitting': 'Creating SCIM token…',
  'scimTokenSettings.list.title': 'SCIM tokens',
  'scimTokenSettings.list.count_one': '{count} token',
  'scimTokenSettings.list.count_other': '{count} tokens',
  'scimTokenSettings.list.emptyTitle': 'No SCIM tokens yet',
  'scimTokenSettings.list.emptyDescription':
    'Create a token above, then add it to your identity provider’s SCIM configuration.',
  'scimTokenSettings.load.loading': 'Loading SCIM tokens',
  'scimTokenSettings.load.errorTitle': 'SCIM tokens could not load',
  'scimTokenSettings.load.errorDescription':
    'The current token metadata could not be retrieved. No token was changed. Reload this panel to try again.',
  'scimTokenSettings.load.permissionTitle': 'SCIM token access restricted',
  'scimTokenSettings.load.permissionDescription':
    'Your role does not include the scim:manage permission required to view or manage SCIM tokens.',
  'scimTokenSettings.load.retry': 'Reload SCIM tokens',
  'scimTokenSettings.token.expired': 'Expired',
  'scimTokenSettings.token.created': 'Created',
  'scimTokenSettings.token.lastUsed': 'Last used',
  'scimTokenSettings.token.neverUsed': 'Never used',
  'scimTokenSettings.token.expires': 'Expires',
  'scimTokenSettings.token.dateUnavailable': 'Date unavailable',
  'scimTokenSettings.action.rotate': 'Renew',
  'scimTokenSettings.action.rotating': 'Renewing…',
  'scimTokenSettings.action.rotateAria': 'Renew SCIM token {name}',
  'scimTokenSettings.action.rotatingAria': 'Renewing SCIM token {name}',
  'scimTokenSettings.action.revoke': 'Revoke',
  'scimTokenSettings.action.revoking': 'Revoking…',
  'scimTokenSettings.action.revokeAria': 'Revoke SCIM token {name}',
  'scimTokenSettings.action.revokingAria': 'Revoking SCIM token {name}',
  'scimTokenSettings.dialog.title': 'Revoke SCIM token “{name}”?',
  'scimTokenSettings.dialog.description':
    'Your identity provider will immediately lose provisioning access. This action cannot be undone.',
  'scimTokenSettings.dialog.confirm': 'Revoke token',
  'scimTokenSettings.dialog.cancel': 'Cancel',
  'scimTokenSettings.success.created': 'SCIM token created. Copy it now; it is shown only once.',
  'scimTokenSettings.success.rotated':
    'SCIM token renewed. Copy the new value now; it is shown only once. The previous value remains valid for 24 hours.',
  'scimTokenSettings.success.revoked': 'SCIM token revoked.',
  'scimTokenSettings.error.organizationUnavailable': 'Your organization is unavailable. Reload the page and try again.',
  'scimTokenSettings.error.nameRequired': 'Enter a name for this SCIM token.',
  'scimTokenSettings.error.nameTooLong': 'Keep the token name to 256 characters or fewer.',
  'scimTokenSettings.error.tokenRequired': 'The selected SCIM token is unavailable. Reload the list and try again.',
  'scimTokenSettings.error.intentInvalid': 'This SCIM token action is not supported.',
  'scimTokenSettings.error.reauthRequired':
    'Your recent administrator confirmation expired. Re-authenticate, then try again.',
  'scimTokenSettings.error.permissionDenied':
    'Your role does not include the scim:manage permission required for this action.',
  'scimTokenSettings.error.tokenNotFound': 'This SCIM token no longer exists. Reload the list and try again.',
  'scimTokenSettings.error.invalidRequest': 'The SCIM token request is invalid. Check the values and try again.',
  'scimTokenSettings.error.conflict': 'The SCIM token changed during this request. Reload the list and try again.',
  'scimTokenSettings.error.rateLimited': 'Too many SCIM token requests were sent. Wait a moment and try again.',
  'scimTokenSettings.error.invalidResponse':
    'The SCIM token service returned an invalid response. No secret was displayed. Try again.',
  'scimTokenSettings.error.serviceUnavailable':
    'SCIM token management is temporarily unavailable. Try again in a moment.',
  'scimTokenSettings.error.createFailed': 'The SCIM token could not be created. Try again.',
  'scimTokenSettings.error.rotateFailed': 'The SCIM token could not be renewed. Try again.',
  'scimTokenSettings.error.revokeFailed': 'The SCIM token could not be revoked. Try again.',
} as const;

export type ScimTokenSettingsKey = keyof typeof scimTokenSettingsEn;
export type ScimTokenSettingsCopy = Readonly<Record<ScimTokenSettingsKey, string>>;

export const scimTokenSettingsFr: ScimTokenSettingsCopy = {
  'scimTokenSettings.meta.title': 'Paramètres des jetons SCIM — E-Code',
  'scimTokenSettings.meta.description':
    'Créez, renouvelez et révoquez les jetons SCIM utilisés par les fournisseurs d’identité pour provisionner les membres.',
  'scimTokenSettings.page.title': 'Paramètres des jetons SCIM',
  'scimTokenSettings.page.description':
    'Créez des jetons porteurs pour permettre à votre fournisseur d’identité de provisionner et déprovisionner les membres via SCIM. Les jetons sont hachés au repos et affichés en entier une seule fois, après leur création ou leur renouvellement.',
  'scimTokenSettings.secret.title': 'Copiez ce jeton maintenant',
  'scimTokenSettings.secret.description':
    'Le jeton ne sera affiché qu’une seule fois. Collez-le dans la configuration SCIM de votre fournisseur d’identité ; vous ne pourrez pas le récupérer ultérieurement.',
  'scimTokenSettings.secret.copy': 'Copier le jeton',
  'scimTokenSettings.secret.copied': 'Jeton copié',
  'scimTokenSettings.secret.copyFailed': 'Échec de la copie',
  'scimTokenSettings.create.title': 'Créer un jeton',
  'scimTokenSettings.create.description':
    'Les jetons expirent automatiquement selon la durée de validité SCIM définie pour votre organisation.',
  'scimTokenSettings.create.name': 'Nom du jeton',
  'scimTokenSettings.create.namePlaceholder': 'Provisionnement Okta',
  'scimTokenSettings.create.submit': 'Créer le jeton SCIM',
  'scimTokenSettings.create.submitting': 'Création du jeton SCIM…',
  'scimTokenSettings.list.title': 'Jetons SCIM',
  'scimTokenSettings.list.count_one': '{count} jeton',
  'scimTokenSettings.list.count_other': '{count} jetons',
  'scimTokenSettings.list.emptyTitle': 'Aucun jeton SCIM pour le moment',
  'scimTokenSettings.list.emptyDescription':
    'Créez un jeton ci-dessus, puis ajoutez-le à la configuration SCIM de votre fournisseur d’identité.',
  'scimTokenSettings.load.loading': 'Chargement des jetons SCIM',
  'scimTokenSettings.load.errorTitle': 'Impossible de charger les jetons SCIM',
  'scimTokenSettings.load.errorDescription':
    'Impossible de récupérer les métadonnées actuelles des jetons. Aucun jeton n’a été modifié. Rechargez ce panneau pour réessayer.',
  'scimTokenSettings.load.permissionTitle': 'Accès aux jetons SCIM restreint',
  'scimTokenSettings.load.permissionDescription':
    'Votre rôle ne dispose pas de l’autorisation scim:manage nécessaire pour consulter ou gérer les jetons SCIM.',
  'scimTokenSettings.load.retry': 'Recharger les jetons SCIM',
  'scimTokenSettings.token.expired': 'Expiré',
  'scimTokenSettings.token.created': 'Créé le',
  'scimTokenSettings.token.lastUsed': 'Dernière utilisation',
  'scimTokenSettings.token.neverUsed': 'Jamais utilisé',
  'scimTokenSettings.token.expires': 'Expire le',
  'scimTokenSettings.token.dateUnavailable': 'Date indisponible',
  'scimTokenSettings.action.rotate': 'Renouveler',
  'scimTokenSettings.action.rotating': 'Renouvellement…',
  'scimTokenSettings.action.rotateAria': 'Renouveler le jeton SCIM {name}',
  'scimTokenSettings.action.rotatingAria': 'Renouvellement du jeton SCIM {name} en cours',
  'scimTokenSettings.action.revoke': 'Révoquer',
  'scimTokenSettings.action.revoking': 'Révocation…',
  'scimTokenSettings.action.revokeAria': 'Révoquer le jeton SCIM {name}',
  'scimTokenSettings.action.revokingAria': 'Révocation du jeton SCIM {name} en cours',
  'scimTokenSettings.dialog.title': 'Révoquer le jeton SCIM « {name} » ?',
  'scimTokenSettings.dialog.description':
    'Votre fournisseur d’identité perdra immédiatement son accès au provisionnement. Cette action est irréversible.',
  'scimTokenSettings.dialog.confirm': 'Révoquer le jeton',
  'scimTokenSettings.dialog.cancel': 'Annuler',
  'scimTokenSettings.success.created': 'Jeton SCIM créé. Copiez-le maintenant ; il ne sera affiché qu’une seule fois.',
  'scimTokenSettings.success.rotated':
    'Jeton SCIM renouvelé. Copiez la nouvelle valeur maintenant ; elle ne sera affichée qu’une seule fois. L’ancienne valeur reste valide pendant 24 heures.',
  'scimTokenSettings.success.revoked': 'Jeton SCIM révoqué.',
  'scimTokenSettings.error.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'scimTokenSettings.error.nameRequired': 'Saisissez un nom pour ce jeton SCIM.',
  'scimTokenSettings.error.nameTooLong': 'Limitez le nom du jeton à 256 caractères.',
  'scimTokenSettings.error.tokenRequired':
    'Le jeton SCIM sélectionné est indisponible. Rechargez la liste, puis réessayez.',
  'scimTokenSettings.error.intentInvalid': 'Cette action sur le jeton SCIM n’est pas prise en charge.',
  'scimTokenSettings.error.reauthRequired':
    'Votre confirmation administrateur récente a expiré. Réauthentifiez-vous, puis réessayez.',
  'scimTokenSettings.error.permissionDenied':
    'Votre rôle ne dispose pas de l’autorisation scim:manage nécessaire pour cette action.',
  'scimTokenSettings.error.tokenNotFound': 'Ce jeton SCIM n’existe plus. Rechargez la liste, puis réessayez.',
  'scimTokenSettings.error.invalidRequest':
    'La requête concernant le jeton SCIM est invalide. Vérifiez les valeurs, puis réessayez.',
  'scimTokenSettings.error.conflict':
    'Le jeton SCIM a changé pendant cette requête. Rechargez la liste, puis réessayez.',
  'scimTokenSettings.error.rateLimited':
    'Trop de requêtes concernant les jetons SCIM ont été envoyées. Patientez un instant, puis réessayez.',
  'scimTokenSettings.error.invalidResponse':
    'Le service de jetons SCIM a renvoyé une réponse invalide. Aucun secret n’a été affiché. Réessayez.',
  'scimTokenSettings.error.serviceUnavailable':
    'La gestion des jetons SCIM est temporairement indisponible. Réessayez dans quelques instants.',
  'scimTokenSettings.error.createFailed': 'Impossible de créer le jeton SCIM. Réessayez.',
  'scimTokenSettings.error.rotateFailed': 'Impossible de renouveler le jeton SCIM. Réessayez.',
  'scimTokenSettings.error.revokeFailed': 'Impossible de révoquer le jeton SCIM. Réessayez.',
};

const errorKeys: Readonly<Record<ScimTokenErrorCode, ScimTokenSettingsKey>> = {
  organizationUnavailable: 'scimTokenSettings.error.organizationUnavailable',
  nameRequired: 'scimTokenSettings.error.nameRequired',
  nameTooLong: 'scimTokenSettings.error.nameTooLong',
  tokenRequired: 'scimTokenSettings.error.tokenRequired',
  intentInvalid: 'scimTokenSettings.error.intentInvalid',
  reauthRequired: 'scimTokenSettings.error.reauthRequired',
  permissionDenied: 'scimTokenSettings.error.permissionDenied',
  tokenNotFound: 'scimTokenSettings.error.tokenNotFound',
  invalidRequest: 'scimTokenSettings.error.invalidRequest',
  conflict: 'scimTokenSettings.error.conflict',
  rateLimited: 'scimTokenSettings.error.rateLimited',
  invalidResponse: 'scimTokenSettings.error.invalidResponse',
  serviceUnavailable: 'scimTokenSettings.error.serviceUnavailable',
  createFailed: 'scimTokenSettings.error.createFailed',
  rotateFailed: 'scimTokenSettings.error.rotateFailed',
  revokeFailed: 'scimTokenSettings.error.revokeFailed',
};

export function resolveScimTokenSettingsLanguage(language?: string | null): ScimTokenSettingsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveScimTokenSettingsLanguage(language);
}

function locale(language?: string | null): string {
  return resolveScimTokenSettingsLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
}

export function getScimTokenSettingsCopy(language?: string | null): ScimTokenSettingsCopy {
  return resolveScimTokenSettingsLanguage(language) === 'fr' ? scimTokenSettingsFr : scimTokenSettingsEn;
}

export function formatScimTokenSettingsCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatScimTokenCount(count: number, language?: string | null): string {
  const copy = getScimTokenSettingsCopy(language);
  const suffix = new Intl.PluralRules(locale(language)).select(count) === 'one' ? 'one' : 'other';

  return formatScimTokenSettingsCopy(copy[`scimTokenSettings.list.count_${suffix}`], {
    count: formatUserAreaNumber(count, undefined, supportedLanguage(language)),
  });
}

export function formatScimTokenDate(value: string | null | undefined, language?: string | null): string {
  const copy = getScimTokenSettingsCopy(language);

  if (!value) {
    return copy['scimTokenSettings.token.dateUnavailable'];
  }

  return (
    formatUserAreaDate(
      value,
      { year: 'numeric', month: 'short', day: 'numeric', timeZone: USER_AREA_TIME_ZONE },
      supportedLanguage(language),
    ) ?? copy['scimTokenSettings.token.dateUnavailable']
  );
}

export function formatScimTokenStatus(data: ScimTokenActionData, language?: string | null): string | undefined {
  return data.statusCode
    ? getScimTokenSettingsCopy(language)[`scimTokenSettings.success.${data.statusCode}`]
    : undefined;
}

export function formatScimTokenError(data: ScimTokenActionData, language?: string | null): string | undefined {
  return data.errorCode ? getScimTokenSettingsCopy(language)[errorKeys[data.errorCode]] : undefined;
}

export async function readScimTokenApiCode(error: unknown): Promise<string | undefined> {
  if (!(error instanceof Response)) {
    return undefined;
  }

  try {
    const payload = (await error.clone().json()) as { code?: unknown };

    return typeof payload.code === 'string' ? payload.code : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveScimTokenErrorCode(error: unknown, intent: ScimTokenIntent): Promise<ScimTokenErrorCode> {
  if (!(error instanceof Response)) {
    return 'serviceUnavailable';
  }

  const code = await readScimTokenApiCode(error);

  if (code === 'ADMIN_REAUTH_REQUIRED') {
    return 'reauthRequired';
  }

  if (code === 'RBAC_FORBIDDEN') {
    return 'permissionDenied';
  }

  if (code === 'SCIM_TOKEN_NOT_FOUND') {
    return 'tokenNotFound';
  }

  if (code === 'ORG_NOT_FOUND') {
    return 'organizationUnavailable';
  }

  if (error.status === 401 || error.status === 403) {
    return 'permissionDenied';
  }

  if (error.status === 404) {
    return intent === 'create' ? 'organizationUnavailable' : 'tokenNotFound';
  }

  if (error.status === 409) {
    return 'conflict';
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

  return intent === 'create' ? 'createFailed' : intent === 'rotate' ? 'rotateFailed' : 'revokeFailed';
}

export function scimTokenInlineStatus(error: unknown): number {
  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return error.status;
  }

  return 502;
}
