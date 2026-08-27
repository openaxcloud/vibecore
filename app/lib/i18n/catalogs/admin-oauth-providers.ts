import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type AdminOauthLanguage = 'en' | 'fr';
export type AdminOauthProviderKind = 'login' | 'connector' | 'apikey';
export type AdminOauthMutationPhase = 'reauth' | 'save';

export const adminOauthProvidersEn = {
  'adminOauth.meta.title': 'OAuth providers — E-Code Admin',
  'adminOauth.meta.description':
    'Configure OAuth sign-in applications, Git connectors and per-user API-key connectors for E-Code.',
  'adminOauth.page.title': 'OAuth providers',
  'adminOauth.page.description':
    'Configure the OAuth applications used for sign-in and Git connectors. Enter each provider’s client ID and secret, then register the callback URL below in its console. Saved changes take effect immediately without a redeployment.',
  'adminOauth.section.login.title': 'Sign-in providers (editable)',
  'adminOauth.section.login.description':
    'These OAuth applications provide social sign-in. Credentials saved here are encrypted and take priority over environment variables. When no database credentials are saved, the service keeps its environment fallback.',
  'adminOauth.section.login.empty': 'No sign-in providers are available.',
  'adminOauth.section.connector.title': 'Git connectors (editable)',
  'adminOauth.section.connector.description':
    'These OAuth applications power the Connect flow in the IDE. They are separate from sign-in applications because they use different callback URLs.',
  'adminOauth.section.connector.empty': 'No Git connectors are available.',
  'adminOauth.section.apikey.title': 'API-key connectors (per-user token)',
  'adminOauth.section.apikey.description':
    'These deployment and database connectors use a personal access token instead of a shared OAuth application. Each user enters a token in the IDE Connect panel; it is validated live and stored encrypted. Enable or disable each connector for the whole instance here.',
  'adminOauth.section.apikey.empty': 'No API-key connectors are available.',
  'adminOauth.count.provider_one': '{count} provider',
  'adminOauth.count.provider_other': '{count} providers',
  'adminOauth.field.callbackUrl': 'Callback / redirect URL (register it in the provider console)',
  'adminOauth.field.readOnlyHint': 'Read-only value. Focus the field to select the complete URL.',
  'adminOauth.field.clientId': 'Client ID',
  'adminOauth.field.clientIdPlaceholder': 'OAuth application client ID',
  'adminOauth.field.clientSecret': 'Client secret',
  'adminOauth.field.clientSecretKeep': 'Client secret (leave blank to keep the current secret)',
  'adminOauth.field.clientSecretPlaceholder': 'OAuth application client secret',
  'adminOauth.field.clientSecretKeepPlaceholder': '•••••••• (unchanged)',
  'adminOauth.field.scopes': 'Scopes (optional, separated by spaces or commas)',
  'adminOauth.field.enabledLogin': 'Enabled (show this sign-in button)',
  'adminOauth.field.enabled': 'Enabled',
  'adminOauth.field.enabledForUsers': 'Enabled (available to users)',
  'adminOauth.field.password': 'Confirm with your password',
  'adminOauth.field.scopesLabel': 'Scopes:',
  'adminOauth.field.tokenConsole': 'Token console:',
  'adminOauth.field.connectEndpoint': 'Per-user connection endpoint:',
  'adminOauth.field.environmentFallback':
    'Environment-variable credentials are currently in use. Saving credentials here overrides that fallback.',
  'adminOauth.action.save': 'Save {provider}',
  'adminOauth.action.saving': 'Saving {provider}…',
  'adminOauth.status.enabledSecret': 'Enabled · secret set',
  'adminOauth.status.enabledNoSecret': 'Enabled · no secret',
  'adminOauth.status.disabled': 'Disabled',
  'adminOauth.status.apiKeyEnabled': 'Enabled · per-user API key',
  'adminOauth.success.loginSaved': '{provider} configuration saved.',
  'adminOauth.success.connectorSaved': '{provider} Git connector configuration saved.',
  'adminOauth.success.apiKeySaved': '{provider} API-key connector configuration saved.',
  'adminOauth.error.providerRequired': 'Select a provider.',
  'adminOauth.error.connectorTypeUnsupported': 'Select a supported provider or connector type.',
  'adminOauth.error.providerUnsupported': 'This provider is not supported for the selected connector type.',
  'adminOauth.error.passwordRequired': 'Enter your password to confirm this change.',
  'adminOauth.error.incorrectPassword': 'Incorrect password. Re-enter it to confirm this change.',
  'adminOauth.error.reauthExpired': 'Re-authentication expired. Enter your password and submit again.',
  'adminOauth.error.platformAdminRequired': 'This action requires a platform administrator account.',
  'adminOauth.error.requestRejected': 'The request was rejected. Check your permissions and try again.',
  'adminOauth.error.invalidConfiguration': 'The provider configuration was rejected. Check the values and try again.',
  'adminOauth.error.conflict': 'The provider configuration changed during this request. Reload the page and try again.',
  'adminOauth.error.rateLimited': 'Too many requests. Wait a moment and try again.',
  'adminOauth.error.saveFailed': 'The provider configuration could not be saved. Try again.',
  'adminOauth.error.serviceUnavailable': 'The admin service is not reachable. Try again in a moment.',
  'adminOauth.howTo.summary': 'How to configure this provider',
  'adminOauth.howTo.console': 'Provider console:',
  'adminOauth.howTo.login.github.consolePath': 'Developer settings → OAuth Apps → New OAuth App',
  'adminOauth.howTo.login.github.step1': 'Set “Authorization callback URL” to the callback URL shown above.',
  'adminOauth.howTo.login.github.step2': 'Copy the client ID and generate a client secret.',
  'adminOauth.howTo.login.github.step3':
    'Enter both values here and save. Sign-in becomes available immediately without a redeployment.',
  'adminOauth.howTo.login.google.consolePath':
    'APIs & Services → Credentials → Create OAuth client ID (Web application)',
  'adminOauth.howTo.login.google.step1': 'Add the callback URL above to “Authorized redirect URIs”.',
  'adminOauth.howTo.login.google.step2':
    'Configure the OAuth consent screen with the email and profile scopes when prompted.',
  'adminOauth.howTo.login.google.step3': 'Copy the client ID and client secret, enter them here and save.',
  'adminOauth.howTo.connector.github.consolePath':
    'Developer settings → OAuth Apps (use an application separate from sign-in)',
  'adminOauth.howTo.connector.github.step1':
    'Use the connector callback URL shown above, ending in /integrations/oauth/github/callback.',
  'adminOauth.howTo.connector.github.step2': 'Grant the repo, read:user and user:email scopes.',
  'adminOauth.howTo.connector.gitlab.consolePath': 'User settings → Applications',
  'adminOauth.howTo.connector.gitlab.step1': 'Set the redirect URI to the connector callback URL shown above.',
  'adminOauth.howTo.connector.gitlab.step2':
    'Grant the read_user, read_api, read_repository and write_repository scopes.',
  'adminOauth.howTo.connector.bitbucket.consolePath': 'Personal settings → OAuth consumers',
  'adminOauth.howTo.connector.bitbucket.step1': 'Set the callback URL to the connector callback URL shown above.',
  'adminOauth.howTo.connector.bitbucket.step2': 'Grant account, repository read/write and pull-request permissions.',
  'adminOauth.howTo.apikey.vercel':
    'Create a token in the account settings. Users enter it in the IDE Connect panel, and deployments target their own Vercel account.',
  'adminOauth.howTo.apikey.netlify':
    'Create a personal access token in the user application settings. It authorizes deployments to the user’s Netlify account.',
  'adminOauth.howTo.apikey.supabase':
    'Generate an access token in the account settings. The Database panel uses it to list projects and establish a connection.',
  'adminOauth.provider.login.github': 'GitHub (sign-in)',
  'adminOauth.provider.login.google': 'Google (sign-in)',
  'adminOauth.provider.connector.github': 'GitHub',
  'adminOauth.provider.connector.gitlab': 'GitLab',
  'adminOauth.provider.connector.bitbucket': 'Bitbucket',
  'adminOauth.provider.apikey.vercel': 'Vercel',
  'adminOauth.provider.apikey.netlify': 'Netlify',
  'adminOauth.provider.apikey.supabase': 'Supabase',
  'adminOauth.provider.unknown': 'Unknown provider',
} as const;

export type AdminOauthProvidersKey = keyof typeof adminOauthProvidersEn;
export type AdminOauthProvidersCopy = Readonly<Record<AdminOauthProvidersKey, string>>;

export const adminOauthProvidersFr: AdminOauthProvidersCopy = {
  'adminOauth.meta.title': 'Fournisseurs OAuth — Administration E-Code',
  'adminOauth.meta.description':
    'Configurez les applications de connexion OAuth, les connecteurs Git et les connecteurs par clé API propres à chaque utilisateur pour E-Code.',
  'adminOauth.page.title': 'Fournisseurs OAuth',
  'adminOauth.page.description':
    'Configurez les applications OAuth utilisées pour l’authentification et les connecteurs Git. Saisissez l’identifiant client et le secret de chaque fournisseur, puis enregistrez l’URL de rappel ci-dessous dans sa console. Les modifications s’appliquent immédiatement, sans redéploiement.',
  'adminOauth.section.login.title': 'Fournisseurs de connexion (modifiables)',
  'adminOauth.section.login.description':
    'Ces applications OAuth permettent la connexion par un service tiers. Les identifiants enregistrés ici sont chiffrés et prioritaires sur les variables d’environnement. En l’absence d’identifiants en base de données, le service conserve le repli vers ces variables.',
  'adminOauth.section.login.empty': 'Aucun fournisseur de connexion n’est disponible.',
  'adminOauth.section.connector.title': 'Connecteurs Git (modifiables)',
  'adminOauth.section.connector.description':
    'Ces applications OAuth alimentent le parcours Connecter dans l’IDE. Elles sont distinctes des applications de connexion, car leurs URL de rappel diffèrent.',
  'adminOauth.section.connector.empty': 'Aucun connecteur Git n’est disponible.',
  'adminOauth.section.apikey.title': 'Connecteurs par clé API (jeton propre à chaque utilisateur)',
  'adminOauth.section.apikey.description':
    'Ces connecteurs de déploiement et de base de données utilisent un jeton d’accès personnel plutôt qu’une application OAuth partagée. Chaque utilisateur saisit son jeton dans le panneau Connecter de l’IDE ; celui-ci est validé en direct et stocké sous forme chiffrée. Activez ou désactivez ici chaque connecteur pour toute l’instance.',
  'adminOauth.section.apikey.empty': 'Aucun connecteur par clé API n’est disponible.',
  'adminOauth.count.provider_one': '{count} fournisseur',
  'adminOauth.count.provider_other': '{count} fournisseurs',
  'adminOauth.field.callbackUrl': 'URL de rappel ou de redirection (à enregistrer dans la console du fournisseur)',
  'adminOauth.field.readOnlyHint':
    'Valeur en lecture seule. Placez le focus dans le champ pour sélectionner l’URL complète.',
  'adminOauth.field.clientId': 'Identifiant client',
  'adminOauth.field.clientIdPlaceholder': 'Identifiant client de l’application OAuth',
  'adminOauth.field.clientSecret': 'Secret client',
  'adminOauth.field.clientSecretKeep': 'Secret client (laissez vide pour conserver le secret actuel)',
  'adminOauth.field.clientSecretPlaceholder': 'Secret client de l’application OAuth',
  'adminOauth.field.clientSecretKeepPlaceholder': '•••••••• (inchangé)',
  'adminOauth.field.scopes': 'Autorisations OAuth (facultatives, séparées par des espaces ou des virgules)',
  'adminOauth.field.enabledLogin': 'Activé (afficher ce bouton de connexion)',
  'adminOauth.field.enabled': 'Activé',
  'adminOauth.field.enabledForUsers': 'Activé (disponible pour les utilisateurs)',
  'adminOauth.field.password': 'Confirmez avec votre mot de passe',
  'adminOauth.field.scopesLabel': 'Autorisations OAuth :',
  'adminOauth.field.tokenConsole': 'Console de création du jeton :',
  'adminOauth.field.connectEndpoint': 'Point de terminaison de connexion par utilisateur :',
  'adminOauth.field.environmentFallback':
    'Les identifiants des variables d’environnement sont actuellement utilisés. L’enregistrement d’identifiants ici remplace ce repli.',
  'adminOauth.action.save': 'Enregistrer {provider}',
  'adminOauth.action.saving': 'Enregistrement de {provider}…',
  'adminOauth.status.enabledSecret': 'Activé · secret configuré',
  'adminOauth.status.enabledNoSecret': 'Activé · aucun secret',
  'adminOauth.status.disabled': 'Désactivé',
  'adminOauth.status.apiKeyEnabled': 'Activé · clé API par utilisateur',
  'adminOauth.success.loginSaved': 'Configuration « {provider} » enregistrée.',
  'adminOauth.success.connectorSaved': 'Configuration du connecteur Git {provider} enregistrée.',
  'adminOauth.success.apiKeySaved': 'Configuration du connecteur par clé API {provider} enregistrée.',
  'adminOauth.error.providerRequired': 'Sélectionnez un fournisseur.',
  'adminOauth.error.connectorTypeUnsupported': 'Sélectionnez un type de fournisseur ou de connecteur pris en charge.',
  'adminOauth.error.providerUnsupported':
    'Ce fournisseur n’est pas pris en charge pour le type de connecteur sélectionné.',
  'adminOauth.error.passwordRequired': 'Saisissez votre mot de passe pour confirmer cette modification.',
  'adminOauth.error.incorrectPassword':
    'Mot de passe incorrect. Saisissez-le de nouveau pour confirmer cette modification.',
  'adminOauth.error.reauthExpired':
    'La réauthentification a expiré. Saisissez votre mot de passe, puis renvoyez le formulaire.',
  'adminOauth.error.platformAdminRequired': 'Cette action nécessite un compte administrateur de la plateforme.',
  'adminOauth.error.requestRejected': 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
  'adminOauth.error.invalidConfiguration':
    'La configuration du fournisseur a été refusée. Vérifiez les valeurs, puis réessayez.',
  'adminOauth.error.conflict':
    'La configuration du fournisseur a changé pendant la requête. Rechargez la page, puis réessayez.',
  'adminOauth.error.rateLimited': 'Trop de requêtes ont été envoyées. Patientez un instant, puis réessayez.',
  'adminOauth.error.saveFailed': 'Impossible d’enregistrer la configuration du fournisseur. Réessayez.',
  'adminOauth.error.serviceUnavailable': 'Le service d’administration est inaccessible. Réessayez dans un instant.',
  'adminOauth.howTo.summary': 'Configurer ce fournisseur',
  'adminOauth.howTo.console': 'Console du fournisseur :',
  'adminOauth.howTo.login.github.consolePath':
    'Paramètres développeur → Applications OAuth → Nouvelle application OAuth',
  'adminOauth.howTo.login.github.step1':
    'Définissez « URL de rappel d’autorisation » sur l’URL de rappel affichée ci-dessus.',
  'adminOauth.howTo.login.github.step2': 'Copiez l’identifiant client et générez un secret client.',
  'adminOauth.howTo.login.github.step3':
    'Saisissez les deux valeurs ici, puis enregistrez. La connexion devient immédiatement disponible, sans redéploiement.',
  'adminOauth.howTo.login.google.consolePath':
    'API et services → Identifiants → Créer un identifiant client OAuth (Application Web)',
  'adminOauth.howTo.login.google.step1': 'Ajoutez l’URL de rappel ci-dessus aux « URI de redirection autorisés ».',
  'adminOauth.howTo.login.google.step2':
    'Configurez l’écran de consentement OAuth avec les autorisations email et profile si nécessaire.',
  'adminOauth.howTo.login.google.step3':
    'Copiez l’identifiant client et le secret client, saisissez-les ici, puis enregistrez.',
  'adminOauth.howTo.connector.github.consolePath':
    'Paramètres développeur → Applications OAuth (utilisez une application distincte de la connexion)',
  'adminOauth.howTo.connector.github.step1':
    'Utilisez l’URL de rappel du connecteur affichée ci-dessus, qui se termine par /integrations/oauth/github/callback.',
  'adminOauth.howTo.connector.github.step2': 'Accordez les autorisations repo, read:user et user:email.',
  'adminOauth.howTo.connector.gitlab.consolePath': 'Paramètres utilisateur → Applications',
  'adminOauth.howTo.connector.gitlab.step1':
    'Définissez l’URI de redirection sur l’URL de rappel du connecteur affichée ci-dessus.',
  'adminOauth.howTo.connector.gitlab.step2':
    'Accordez les autorisations read_user, read_api, read_repository et write_repository.',
  'adminOauth.howTo.connector.bitbucket.consolePath': 'Paramètres personnels → Consommateurs OAuth',
  'adminOauth.howTo.connector.bitbucket.step1':
    'Définissez l’URL de rappel sur l’URL du connecteur affichée ci-dessus.',
  'adminOauth.howTo.connector.bitbucket.step2':
    'Accordez les autorisations de compte, de lecture et d’écriture des dépôts, et de gestion des pull requests.',
  'adminOauth.howTo.apikey.vercel':
    'Créez un jeton dans les paramètres du compte. Les utilisateurs le saisissent dans le panneau Connecter de l’IDE et les déploiements ciblent leur propre compte Vercel.',
  'adminOauth.howTo.apikey.netlify':
    'Créez un jeton d’accès personnel dans les paramètres des applications utilisateur. Il autorise les déploiements vers le compte Netlify de l’utilisateur.',
  'adminOauth.howTo.apikey.supabase':
    'Générez un jeton d’accès dans les paramètres du compte. Le panneau Base de données l’utilise pour répertorier les projets et établir une connexion.',
  'adminOauth.provider.login.github': 'GitHub (connexion)',
  'adminOauth.provider.login.google': 'Google (connexion)',
  'adminOauth.provider.connector.github': 'GitHub',
  'adminOauth.provider.connector.gitlab': 'GitLab',
  'adminOauth.provider.connector.bitbucket': 'Bitbucket',
  'adminOauth.provider.apikey.vercel': 'Vercel',
  'adminOauth.provider.apikey.netlify': 'Netlify',
  'adminOauth.provider.apikey.supabase': 'Supabase',
  'adminOauth.provider.unknown': 'Fournisseur inconnu',
};

export const ADMIN_OAUTH_STATUS_CODES = ['loginSaved', 'connectorSaved', 'apiKeySaved'] as const;
export type AdminOauthStatusCode = (typeof ADMIN_OAUTH_STATUS_CODES)[number];

export const ADMIN_OAUTH_ERROR_CODES = [
  'providerRequired',
  'connectorTypeUnsupported',
  'providerUnsupported',
  'passwordRequired',
  'incorrectPassword',
  'reauthExpired',
  'platformAdminRequired',
  'requestRejected',
  'invalidConfiguration',
  'conflict',
  'rateLimited',
  'saveFailed',
  'serviceUnavailable',
] as const;
export type AdminOauthErrorCode = (typeof ADMIN_OAUTH_ERROR_CODES)[number];

export const ADMIN_OAUTH_PROVIDER_IDS = {
  login: ['github', 'google'],
  connector: ['github', 'gitlab', 'bitbucket'],
  apikey: ['vercel', 'netlify', 'supabase'],
} as const satisfies Record<AdminOauthProviderKind, readonly string[]>;

const PROVIDER_NAME_KEYS = {
  login: {
    github: 'adminOauth.provider.login.github',
    google: 'adminOauth.provider.login.google',
  },
  connector: {
    github: 'adminOauth.provider.connector.github',
    gitlab: 'adminOauth.provider.connector.gitlab',
    bitbucket: 'adminOauth.provider.connector.bitbucket',
  },
  apikey: {
    vercel: 'adminOauth.provider.apikey.vercel',
    netlify: 'adminOauth.provider.apikey.netlify',
    supabase: 'adminOauth.provider.apikey.supabase',
  },
} as const satisfies Record<AdminOauthProviderKind, Readonly<Record<string, AdminOauthProvidersKey>>>;

export function resolveAdminOauthLanguage(language?: string | null): AdminOauthLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveAdminOauthLanguage(language);
}

export function getAdminOauthProvidersCopy(language?: string | null): AdminOauthProvidersCopy {
  return resolveAdminOauthLanguage(language) === 'fr' ? adminOauthProvidersFr : adminOauthProvidersEn;
}

export function formatAdminOauthCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatAdminOauthProviderCount(count: number, language?: string | null): string {
  const copy = getAdminOauthProvidersCopy(language);
  const locale = resolveAdminOauthLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const suffix = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';

  return formatAdminOauthCopy(copy[`adminOauth.count.provider_${suffix}`], {
    count: formatUserAreaNumber(count, undefined, supportedLanguage(language)),
  });
}

export function isAdminOauthProvider(kind: AdminOauthProviderKind, provider: string): boolean {
  return (ADMIN_OAUTH_PROVIDER_IDS[kind] as readonly string[]).includes(provider);
}

export function getAdminOauthProviderName(
  kind: AdminOauthProviderKind,
  provider: string,
  language?: string | null,
): string {
  const copy = getAdminOauthProvidersCopy(language);
  const key = (PROVIDER_NAME_KEYS[kind] as Readonly<Record<string, AdminOauthProvidersKey>>)[provider];

  if (key) {
    return copy[key];
  }

  return /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(provider) ? provider : copy['adminOauth.provider.unknown'];
}

export async function resolveAdminOauthErrorCode(
  error: unknown,
  phase: AdminOauthMutationPhase,
): Promise<AdminOauthErrorCode> {
  if (!(error instanceof Response)) {
    return 'serviceUnavailable';
  }

  let code: string | undefined;

  try {
    const payload = (await error.clone().json()) as { code?: unknown };
    code = typeof payload.code === 'string' ? payload.code : undefined;
  } catch {
    code = undefined;
  }

  if (code === 'ADMIN_REAUTH_REQUIRED') {
    return 'reauthExpired';
  }

  if (code === 'PLATFORM_ADMIN_REQUIRED') {
    return 'platformAdminRequired';
  }

  if (error.status === 401) {
    return phase === 'reauth' ? 'incorrectPassword' : 'requestRejected';
  }

  if (error.status === 403) {
    return 'requestRejected';
  }

  if (error.status === 400 || error.status === 422) {
    return 'invalidConfiguration';
  }

  if (error.status === 404) {
    return 'providerUnsupported';
  }

  if (error.status === 409) {
    return 'conflict';
  }

  if (error.status === 429) {
    return 'rateLimited';
  }

  return 'saveFailed';
}

export function adminOauthInlineStatus(error: unknown): number {
  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return error.status;
  }

  return 502;
}
