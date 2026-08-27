import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type EnterpriseSsoSettingsLanguage = 'en' | 'fr';

export const enterpriseSsoSettingsEn = {
  'enterpriseSso.meta.title': 'Enterprise SSO settings — E-Code',
  'enterpriseSso.meta.description':
    'Configure OIDC, Microsoft Entra ID or SAML single sign-on and organization enforcement.',
  'enterpriseSso.page.title': 'Enterprise SSO settings',
  'enterpriseSso.page.description':
    'Configure an OIDC provider, including Microsoft Entra ID, or a SAML identity provider for your organization. Each provider is saved independently and can be enabled or disabled separately.',
  'enterpriseSso.security.prefix':
    'For your organization’s security, provider secrets are encrypted and never shown after saving. These forms therefore start blank. Saving a provider replaces its full configuration. Use',
  'enterpriseSso.security.action': '“Test connection”',
  'enterpriseSso.security.suffix': 'to validate a saved provider without entering its secret again.',
  'enterpriseSso.oidc.title': 'OIDC / Entra ID',
  'enterpriseSso.oidc.description': 'OpenID Connect discovery. Requested scopes:',
  'enterpriseSso.oidc.issuer': 'Issuer',
  'enterpriseSso.oidc.issuerPlaceholder': 'https://login.example.com',
  'enterpriseSso.oidc.clientId': 'Client ID',
  'enterpriseSso.oidc.clientSecret': 'Client secret',
  'enterpriseSso.oidc.authorizationUrl': 'Authorization URL (optional)',
  'enterpriseSso.oidc.tokenUrl': 'Token URL (optional)',
  'enterpriseSso.oidc.jwksUrl': 'JWKS URL (optional)',
  'enterpriseSso.oidc.discoveryPlaceholder': 'Discovered from the issuer when omitted',
  'enterpriseSso.oidc.enabled': 'Enable OIDC sign-in',
  'enterpriseSso.oidc.saving': 'Saving…',
  'enterpriseSso.oidc.save': 'Save OIDC provider',
  'enterpriseSso.saml.title': 'SAML 2.0',
  'enterpriseSso.saml.description':
    'Enter the identity provider’s entity ID, single sign-on URL and X.509 signing certificate.',
  'enterpriseSso.saml.entityId': 'Entity ID',
  'enterpriseSso.saml.entityIdPlaceholder': 'urn:example:idp',
  'enterpriseSso.saml.ssoUrl': 'SSO URL',
  'enterpriseSso.saml.ssoUrlPlaceholder': 'https://idp.example.com/sso',
  'enterpriseSso.saml.certificate': 'X.509 certificate',
  'enterpriseSso.saml.certificatePlaceholder': '-----BEGIN CERTIFICATE-----',
  'enterpriseSso.saml.enabled': 'Enable SAML sign-in',
  'enterpriseSso.saml.saving': 'Saving…',
  'enterpriseSso.saml.save': 'Save SAML provider',
  'enterpriseSso.connection.testing': 'Testing…',
  'enterpriseSso.connection.test': 'Test connection',
  'enterpriseSso.connection.passed': 'Connection test passed. The stored configuration is reachable and valid.',
  'enterpriseSso.connection.failed': 'The connection test found problems with the stored configuration.',
  'enterpriseSso.connection.check.name.clientIdStored': 'Client ID stored',
  'enterpriseSso.connection.check.name.issuerUrl': 'Issuer URL',
  'enterpriseSso.connection.check.name.discoveryDocument': 'Discovery document',
  'enterpriseSso.connection.check.name.entityId': 'Entity ID',
  'enterpriseSso.connection.check.name.signingCertificate': 'Signing certificate',
  'enterpriseSso.connection.check.name.ssoUrl': 'SSO URL',
  'enterpriseSso.connection.check.name.ssoEndpointReachable': 'SSO endpoint reachable',
  'enterpriseSso.connection.check.name.unknown': 'Provider check',
  'enterpriseSso.connection.check.detail.clientIdStored': 'A client ID is stored.',
  'enterpriseSso.connection.check.detail.clientIdMissing': 'No client ID is stored.',
  'enterpriseSso.connection.check.detail.issuerValid': 'The issuer is a valid public HTTPS URL.',
  'enterpriseSso.connection.check.detail.issuerInvalid': 'The issuer must be a public HTTPS URL.',
  'enterpriseSso.connection.check.detail.issuerSkipped':
    'Skipped because the issuer is not a reachable HTTPS endpoint.',
  'enterpriseSso.connection.check.detail.discoveryUnreachable': 'The discovery endpoint could not be reached.',
  'enterpriseSso.connection.check.detail.discoveryHttpStatus': 'The discovery endpoint returned HTTP {status}.',
  'enterpriseSso.connection.check.detail.discoveryValid':
    'The discovery document is reachable and includes the required OIDC endpoints.',
  'enterpriseSso.connection.check.detail.discoveryMissingFields':
    'The discovery document is missing required fields: {fields}.',
  'enterpriseSso.connection.check.detail.entityIdStored': 'An entity ID is stored.',
  'enterpriseSso.connection.check.detail.entityIdMissing': 'No entity ID is stored.',
  'enterpriseSso.connection.check.detail.certificateValid': 'A well-formed X.509 certificate is stored.',
  'enterpriseSso.connection.check.detail.certificateInvalid': 'The stored certificate is not a well-formed PEM block.',
  'enterpriseSso.connection.check.detail.ssoUrlValid': 'The SSO URL is a valid public HTTPS URL.',
  'enterpriseSso.connection.check.detail.ssoUrlInvalid': 'The SSO URL must be a public HTTPS URL.',
  'enterpriseSso.connection.check.detail.ssoSkipped': 'Skipped because the SSO URL is not a reachable HTTPS endpoint.',
  'enterpriseSso.connection.check.detail.ssoResponded': 'The SSO endpoint responded (HTTP {status}).',
  'enterpriseSso.connection.check.detail.ssoUnreachable': 'The SSO endpoint could not be reached.',
  'enterpriseSso.connection.check.detail.genericPassed': 'This provider check passed.',
  'enterpriseSso.connection.check.detail.genericFailed': 'This provider check failed.',
  'enterpriseSso.connection.httpRedirect': 'redirect',
  'enterpriseSso.enforcement.title': 'Enforce SSO',
  'enterpriseSso.enforcement.description_one':
    'Require members to sign in through your identity provider. Enforcement begins after a {count}-day grace period so members have time to migrate. Organization owners are always exempt, preventing an identity-provider misconfiguration from locking out your team.',
  'enterpriseSso.enforcement.description_other':
    'Require members to sign in through your identity provider. Enforcement begins after a {count}-day grace period so members have time to migrate. Organization owners are always exempt, preventing an identity-provider misconfiguration from locking out your team.',
  'enterpriseSso.enforcement.label': 'Require SSO for all members',
  'enterpriseSso.enforcement.loadError':
    'The current SSO enforcement status could not be loaded. The control is disabled to avoid changing an unknown security state. Provider settings remain available.',
  'enterpriseSso.enforcement.active':
    'SSO is now enforced. Members other than owners must sign in through your identity provider; password sign-in is blocked for them.',
  'enterpriseSso.enforcement.grace':
    'Members must switch to SSO by {date}. Until then, password sign-in remains available. Owners remain exempt.',
  'enterpriseSso.status.settingsSaved': 'SSO settings saved.',
  'enterpriseSso.status.enforcementEnabled': 'SSO enforcement enabled.',
  'enterpriseSso.status.enforcementDisabled': 'SSO enforcement disabled.',
  'enterpriseSso.error.organizationUnavailable': 'Your organization is unavailable. Reload the page and try again.',
  'enterpriseSso.error.requestRejected': 'The request was rejected. Check your permissions and try again.',
  'enterpriseSso.error.providerNotConfigured': 'Save this provider before testing its connection.',
  'enterpriseSso.error.invalidConfiguration':
    'The provider configuration was rejected. Check every required value and try again.',
  'enterpriseSso.error.conflict': 'These SSO settings changed during your request. Reload the page and try again.',
  'enterpriseSso.error.rateLimited': 'Too many requests. Wait a moment and try again.',
  'enterpriseSso.error.testFailed': 'The connection could not be tested. Try again.',
  'enterpriseSso.error.enforcementFailed': 'SSO enforcement could not be updated. Try again.',
  'enterpriseSso.error.saveFailed': 'SSO settings could not be saved. Try again.',
  'enterpriseSso.common.dateUnavailable': 'date unavailable',
} as const;

export type EnterpriseSsoSettingsKey = keyof typeof enterpriseSsoSettingsEn;
export type EnterpriseSsoSettingsCopy = Readonly<Record<EnterpriseSsoSettingsKey, string>>;

export const enterpriseSsoSettingsFr: EnterpriseSsoSettingsCopy = {
  'enterpriseSso.meta.title': 'Paramètres SSO d’entreprise — E-Code',
  'enterpriseSso.meta.description':
    'Configurez l’authentification unique avec OIDC, Microsoft Entra ID ou SAML, ainsi que son application obligatoire dans l’organisation.',
  'enterpriseSso.page.title': 'Paramètres SSO d’entreprise',
  'enterpriseSso.page.description':
    'Configurez un fournisseur OIDC, dont Microsoft Entra ID, ou un fournisseur d’identité SAML pour votre organisation. Chaque fournisseur est enregistré séparément et peut être activé ou désactivé indépendamment.',
  'enterpriseSso.security.prefix':
    'Pour protéger votre organisation, les secrets des fournisseurs sont chiffrés et ne sont plus affichés après leur enregistrement. Ces formulaires sont donc initialement vides. L’enregistrement d’un fournisseur remplace toute sa configuration. Utilisez',
  'enterpriseSso.security.action': '« Tester la connexion »',
  'enterpriseSso.security.suffix': 'pour valider un fournisseur enregistré sans saisir de nouveau son secret.',
  'enterpriseSso.oidc.title': 'OIDC / Entra ID',
  'enterpriseSso.oidc.description': 'Détection automatique OpenID Connect. Autorisations demandées :',
  'enterpriseSso.oidc.issuer': 'Émetteur',
  'enterpriseSso.oidc.issuerPlaceholder': 'https://login.example.com',
  'enterpriseSso.oidc.clientId': 'Identifiant client',
  'enterpriseSso.oidc.clientSecret': 'Secret client',
  'enterpriseSso.oidc.authorizationUrl': 'URL d’autorisation (facultative)',
  'enterpriseSso.oidc.tokenUrl': 'URL de jeton (facultative)',
  'enterpriseSso.oidc.jwksUrl': 'URL JWKS (facultative)',
  'enterpriseSso.oidc.discoveryPlaceholder': 'Détectée depuis l’émetteur si elle est omise',
  'enterpriseSso.oidc.enabled': 'Activer l’authentification OIDC',
  'enterpriseSso.oidc.saving': 'Enregistrement…',
  'enterpriseSso.oidc.save': 'Enregistrer le fournisseur OIDC',
  'enterpriseSso.saml.title': 'SAML 2.0',
  'enterpriseSso.saml.description':
    'Saisissez l’identifiant d’entité, l’URL d’authentification unique et le certificat de signature X.509 du fournisseur d’identité.',
  'enterpriseSso.saml.entityId': 'Identifiant d’entité',
  'enterpriseSso.saml.entityIdPlaceholder': 'urn:example:idp',
  'enterpriseSso.saml.ssoUrl': 'URL SSO',
  'enterpriseSso.saml.ssoUrlPlaceholder': 'https://idp.example.com/sso',
  'enterpriseSso.saml.certificate': 'Certificat X.509',
  'enterpriseSso.saml.certificatePlaceholder': '-----BEGIN CERTIFICATE-----',
  'enterpriseSso.saml.enabled': 'Activer l’authentification SAML',
  'enterpriseSso.saml.saving': 'Enregistrement…',
  'enterpriseSso.saml.save': 'Enregistrer le fournisseur SAML',
  'enterpriseSso.connection.testing': 'Test en cours…',
  'enterpriseSso.connection.test': 'Tester la connexion',
  'enterpriseSso.connection.passed':
    'Le test de connexion a réussi. La configuration enregistrée est accessible et valide.',
  'enterpriseSso.connection.failed': 'Le test de connexion a détecté des problèmes dans la configuration enregistrée.',
  'enterpriseSso.connection.check.name.clientIdStored': 'Identifiant client enregistré',
  'enterpriseSso.connection.check.name.issuerUrl': 'URL de l’émetteur',
  'enterpriseSso.connection.check.name.discoveryDocument': 'Document de découverte',
  'enterpriseSso.connection.check.name.entityId': 'Identifiant d’entité',
  'enterpriseSso.connection.check.name.signingCertificate': 'Certificat de signature',
  'enterpriseSso.connection.check.name.ssoUrl': 'URL SSO',
  'enterpriseSso.connection.check.name.ssoEndpointReachable': 'Accessibilité du point de terminaison SSO',
  'enterpriseSso.connection.check.name.unknown': 'Vérification du fournisseur',
  'enterpriseSso.connection.check.detail.clientIdStored': 'Un identifiant client est enregistré.',
  'enterpriseSso.connection.check.detail.clientIdMissing': 'Aucun identifiant client n’est enregistré.',
  'enterpriseSso.connection.check.detail.issuerValid': 'L’émetteur est une URL HTTPS publique valide.',
  'enterpriseSso.connection.check.detail.issuerInvalid': 'L’émetteur doit être une URL HTTPS publique.',
  'enterpriseSso.connection.check.detail.issuerSkipped':
    'Vérification ignorée, car l’émetteur n’est pas un point de terminaison HTTPS accessible.',
  'enterpriseSso.connection.check.detail.discoveryUnreachable':
    'Impossible d’accéder au point de terminaison de découverte.',
  'enterpriseSso.connection.check.detail.discoveryHttpStatus':
    'Le point de terminaison de découverte a renvoyé le statut HTTP {status}.',
  'enterpriseSso.connection.check.detail.discoveryValid':
    'Le document de découverte est accessible et contient les points de terminaison OIDC requis.',
  'enterpriseSso.connection.check.detail.discoveryMissingFields':
    'Le document de découverte ne contient pas les champs requis suivants : {fields}.',
  'enterpriseSso.connection.check.detail.entityIdStored': 'Un identifiant d’entité est enregistré.',
  'enterpriseSso.connection.check.detail.entityIdMissing': 'Aucun identifiant d’entité n’est enregistré.',
  'enterpriseSso.connection.check.detail.certificateValid': 'Un certificat X.509 correctement formé est enregistré.',
  'enterpriseSso.connection.check.detail.certificateInvalid':
    'Le certificat enregistré n’est pas un bloc PEM correctement formé.',
  'enterpriseSso.connection.check.detail.ssoUrlValid': 'L’URL SSO est une URL HTTPS publique valide.',
  'enterpriseSso.connection.check.detail.ssoUrlInvalid': 'L’URL SSO doit être une URL HTTPS publique.',
  'enterpriseSso.connection.check.detail.ssoSkipped':
    'Vérification ignorée, car l’URL SSO n’est pas un point de terminaison HTTPS accessible.',
  'enterpriseSso.connection.check.detail.ssoResponded': 'Le point de terminaison SSO a répondu (HTTP {status}).',
  'enterpriseSso.connection.check.detail.ssoUnreachable': 'Impossible d’accéder au point de terminaison SSO.',
  'enterpriseSso.connection.check.detail.genericPassed': 'Cette vérification du fournisseur a réussi.',
  'enterpriseSso.connection.check.detail.genericFailed': 'Cette vérification du fournisseur a échoué.',
  'enterpriseSso.connection.httpRedirect': 'redirection',
  'enterpriseSso.enforcement.title': 'Imposer le SSO',
  'enterpriseSso.enforcement.description_one':
    'Obligez les membres à se connecter auprès de votre fournisseur d’identité. Cette règle s’applique après un délai de grâce de {count} jour afin de leur laisser le temps de migrer. Les propriétaires de l’organisation restent toujours exemptés pour éviter qu’une mauvaise configuration du fournisseur d’identité ne bloque votre équipe.',
  'enterpriseSso.enforcement.description_other':
    'Obligez les membres à se connecter auprès de votre fournisseur d’identité. Cette règle s’applique après un délai de grâce de {count} jours afin de leur laisser le temps de migrer. Les propriétaires de l’organisation restent toujours exemptés pour éviter qu’une mauvaise configuration du fournisseur d’identité ne bloque votre équipe.',
  'enterpriseSso.enforcement.label': 'Imposer le SSO à tous les membres',
  'enterpriseSso.enforcement.loadError':
    'Impossible de charger l’état actuel de l’obligation d’utiliser le SSO. La commande est désactivée afin de ne pas modifier un état de sécurité inconnu. Les paramètres des fournisseurs restent disponibles.',
  'enterpriseSso.enforcement.active':
    'Le SSO est maintenant imposé. Les membres autres que les propriétaires doivent se connecter auprès de votre fournisseur d’identité ; la connexion par mot de passe leur est bloquée.',
  'enterpriseSso.enforcement.grace':
    'Les membres doivent passer au SSO avant le {date}. D’ici là, la connexion par mot de passe reste disponible. Les propriétaires restent exemptés.',
  'enterpriseSso.status.settingsSaved': 'Paramètres SSO enregistrés.',
  'enterpriseSso.status.enforcementEnabled': 'Le SSO est désormais obligatoire.',
  'enterpriseSso.status.enforcementDisabled': 'Le SSO n’est plus obligatoire.',
  'enterpriseSso.error.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'enterpriseSso.error.requestRejected': 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
  'enterpriseSso.error.providerNotConfigured': 'Enregistrez ce fournisseur avant de tester sa connexion.',
  'enterpriseSso.error.invalidConfiguration':
    'La configuration du fournisseur a été refusée. Vérifiez toutes les valeurs requises, puis réessayez.',
  'enterpriseSso.error.conflict':
    'Ces paramètres SSO ont changé pendant la requête. Rechargez la page, puis réessayez.',
  'enterpriseSso.error.rateLimited': 'Trop de requêtes ont été envoyées. Patientez un instant, puis réessayez.',
  'enterpriseSso.error.testFailed': 'Impossible de tester la connexion. Réessayez.',
  'enterpriseSso.error.enforcementFailed': 'Impossible de modifier l’obligation d’utiliser le SSO. Réessayez.',
  'enterpriseSso.error.saveFailed': 'Impossible d’enregistrer les paramètres SSO. Réessayez.',
  'enterpriseSso.common.dateUnavailable': 'date indisponible',
};

export const ENTERPRISE_SSO_STATUS_CODES = ['settingsSaved', 'enforcementEnabled', 'enforcementDisabled'] as const;
export type EnterpriseSsoStatusCode = (typeof ENTERPRISE_SSO_STATUS_CODES)[number];

export const ENTERPRISE_SSO_ERROR_CODES = [
  'organizationUnavailable',
  'requestRejected',
  'providerNotConfigured',
  'invalidConfiguration',
  'conflict',
  'rateLimited',
  'testFailed',
  'enforcementFailed',
  'saveFailed',
] as const;
export type EnterpriseSsoErrorCode = (typeof ENTERPRISE_SSO_ERROR_CODES)[number];
export type EnterpriseSsoActionIntent = 'test' | 'enforce' | 'save';

export const ENTERPRISE_SSO_CHECK_NAME_CODES = [
  'clientIdStored',
  'issuerUrl',
  'discoveryDocument',
  'entityId',
  'signingCertificate',
  'ssoUrl',
  'ssoEndpointReachable',
  'unknown',
] as const;
export type EnterpriseSsoCheckNameCode = (typeof ENTERPRISE_SSO_CHECK_NAME_CODES)[number];

export const ENTERPRISE_SSO_CHECK_DETAIL_CODES = [
  'clientIdStored',
  'clientIdMissing',
  'issuerValid',
  'issuerInvalid',
  'issuerSkipped',
  'discoveryUnreachable',
  'discoveryHttpStatus',
  'discoveryValid',
  'discoveryMissingFields',
  'entityIdStored',
  'entityIdMissing',
  'certificateValid',
  'certificateInvalid',
  'ssoUrlValid',
  'ssoUrlInvalid',
  'ssoSkipped',
  'ssoResponded',
  'ssoUnreachable',
  'genericPassed',
  'genericFailed',
] as const;
export type EnterpriseSsoCheckDetailCode = (typeof ENTERPRISE_SSO_CHECK_DETAIL_CODES)[number];

export type EnterpriseSsoCheck = {
  nameCode: EnterpriseSsoCheckNameCode;
  detailCode: EnterpriseSsoCheckDetailCode;
  ok: boolean;
  values?: Readonly<{ status?: string; fields?: string }>;
};

type RawSsoCheck = { name?: unknown; ok?: unknown; detail?: unknown };

const CHECK_NAME_BY_SERVER_VALUE: Readonly<Record<string, EnterpriseSsoCheckNameCode>> = {
  'Client ID stored': 'clientIdStored',
  'Issuer URL': 'issuerUrl',
  'Discovery document': 'discoveryDocument',
  'Entity ID': 'entityId',
  'Signing certificate': 'signingCertificate',
  'SSO URL': 'ssoUrl',
  'SSO endpoint reachable': 'ssoEndpointReachable',
};

const CHECK_DETAIL_BY_SERVER_VALUE: Readonly<Record<string, EnterpriseSsoCheckDetailCode>> = {
  'A client ID is stored.': 'clientIdStored',
  'No client ID is stored.': 'clientIdMissing',
  'Issuer is a valid HTTPS URL to a public host.': 'issuerValid',
  'Issuer must be an HTTPS URL to a public host.': 'issuerInvalid',
  'Skipped — the issuer URL is not a reachable HTTPS endpoint.': 'issuerSkipped',
  'The discovery endpoint could not be reached.': 'discoveryUnreachable',
  'Discovery document is reachable and advertises the required OIDC endpoints.': 'discoveryValid',
  'An entity ID is stored.': 'entityIdStored',
  'No entity ID is stored.': 'entityIdMissing',
  'A well-formed X.509 certificate is stored.': 'certificateValid',
  'The stored certificate is not a well-formed PEM block.': 'certificateInvalid',
  'SSO URL is a valid HTTPS URL to a public host.': 'ssoUrlValid',
  'SSO URL must be an HTTPS URL to a public host.': 'ssoUrlInvalid',
  'Skipped — the SSO URL is not a reachable HTTPS endpoint.': 'ssoSkipped',
  'The SSO endpoint could not be reached.': 'ssoUnreachable',
};

function resolveEnterpriseSsoLanguage(language?: string | null): EnterpriseSsoSettingsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveEnterpriseSsoLanguage(language);
}

export function getEnterpriseSsoSettingsCopy(language?: string | null): EnterpriseSsoSettingsCopy {
  return resolveEnterpriseSsoLanguage(language) === 'fr' ? enterpriseSsoSettingsFr : enterpriseSsoSettingsEn;
}

export function formatEnterpriseSsoCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatEnterpriseSsoNumber(value: number | bigint, language?: string | null): string {
  return formatUserAreaNumber(value, undefined, supportedLanguage(language));
}

export function formatEnterpriseSsoDateTime(value: Date | string | number, language?: string | null): string | null {
  return formatUserAreaDateTime(
    value,
    { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    supportedLanguage(language),
  );
}

export function formatEnterpriseSsoGracePeriod(count: number, language?: string | null): string {
  const copy = getEnterpriseSsoSettingsCopy(language);
  const locale = resolveEnterpriseSsoLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const suffix = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';

  return formatEnterpriseSsoCopy(copy[`enterpriseSso.enforcement.description_${suffix}`], {
    count: formatEnterpriseSsoNumber(count, language),
  });
}

export function resolveEnterpriseSsoActionErrorCode(
  status: number,
  intent: EnterpriseSsoActionIntent,
): EnterpriseSsoErrorCode {
  if (status === 401 || status === 403) {
    return 'requestRejected';
  }

  if (status === 404 && intent === 'test') {
    return 'providerNotConfigured';
  }

  if (status === 409) {
    return 'conflict';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  if (status === 400 && intent === 'save') {
    return 'invalidConfiguration';
  }

  return intent === 'test' ? 'testFailed' : intent === 'enforce' ? 'enforcementFailed' : 'saveFailed';
}

function normalizeCheckDetail(detail: string, ok: boolean): Pick<EnterpriseSsoCheck, 'detailCode' | 'values'> {
  const exactCode = CHECK_DETAIL_BY_SERVER_VALUE[detail];

  if (exactCode) {
    return { detailCode: exactCode };
  }

  const discoveryStatus = /^The discovery endpoint returned HTTP (\d{3})\.$/u.exec(detail);

  if (discoveryStatus?.[1]) {
    return { detailCode: 'discoveryHttpStatus', values: { status: discoveryStatus[1] } };
  }

  const missingFields = /^Discovery document is missing required fields: ([A-Za-z0-9_, ]+)\.$/u.exec(detail);

  if (missingFields?.[1]) {
    const fields = missingFields[1]
      .split(',')
      .map((field) => field.trim())
      .filter((field) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(field))
      .join(', ');

    if (fields) {
      return { detailCode: 'discoveryMissingFields', values: { fields } };
    }
  }

  const ssoStatus = /^The SSO endpoint responded \(HTTP (\d{3}|redirect)\)\.$/u.exec(detail);

  if (ssoStatus?.[1]) {
    return { detailCode: 'ssoResponded', values: { status: ssoStatus[1] } };
  }

  return { detailCode: ok ? 'genericPassed' : 'genericFailed' };
}

export function normalizeEnterpriseSsoChecks(value: unknown): EnterpriseSsoCheck[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((candidate) => {
    const check = candidate && typeof candidate === 'object' ? (candidate as RawSsoCheck) : {};
    const name = typeof check.name === 'string' ? check.name : '';
    const detail = typeof check.detail === 'string' ? check.detail : '';
    const ok = check.ok === true;

    return {
      nameCode: CHECK_NAME_BY_SERVER_VALUE[name] ?? 'unknown',
      ok,
      ...normalizeCheckDetail(detail, ok),
    };
  });
}

export function localizeEnterpriseSsoCheck(
  check: EnterpriseSsoCheck,
  language?: string | null,
): { name: string; detail: string } {
  const copy = getEnterpriseSsoSettingsCopy(language);
  const name = copy[`enterpriseSso.connection.check.name.${check.nameCode}`];

  const status =
    check.values?.status === 'redirect' ? copy['enterpriseSso.connection.httpRedirect'] : check.values?.status;
  const detail = formatEnterpriseSsoCopy(copy[`enterpriseSso.connection.check.detail.${check.detailCode}`], {
    ...(status ? { status } : {}),
    ...(check.values?.fields ? { fields: check.values.fields } : {}),
  });

  return { name, detail };
}
