import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { json } from '~/lib/json-response';

export const webApiRoutesEn = {
  OWNER_REPOSITORY_REQUIRED: 'The repository owner and name are required.',
  GITHUB_TOKEN_REQUIRED: 'A GitHub token is required.',
  GITHUB_TOKEN_MISSING: 'Connect GitHub before continuing.',
  GITHUB_TOKEN_INVALID: 'Your GitHub connection is no longer valid. Reconnect GitHub and try again.',
  GITHUB_REPOSITORY_NOT_FOUND: 'The GitHub repository was not found.',
  GITHUB_UNAVAILABLE: 'GitHub is temporarily unavailable. Please try again.',
  GITHUB_BRANCHES_FAILED: 'The repository branches could not be loaded. Please try again.',
  GITHUB_STATS_FAILED: 'Your GitHub statistics could not be loaded. Please try again.',
  GITHUB_USER_FAILED: 'Your GitHub profile could not be loaded. Please try again.',
  GITHUB_REQUEST_FAILED: 'The GitHub request could not be completed. Please try again.',
  GITHUB_REPOSITORY_INVALID: 'Enter a valid GitHub repository in owner/repository format.',
  GITHUB_REPOSITORY_REQUIRED: 'Select a GitHub repository.',
  GITHUB_SEARCH_REQUIRED: 'Enter a repository search query.',
  GITHUB_USERNAME_MISSING: 'Your GitHub username is unavailable. Reconnect GitHub and try again.',
  GITHUB_USERNAME_INVALID: 'The GitHub username is invalid.',
  GITHUB_ACTION_INVALID: 'This GitHub action is not supported.',
  GITHUB_TEMPLATE_REPOSITORY_REQUIRED: 'Select a starter-template repository.',
  GITHUB_TEMPLATE_NOT_ALLOWED: 'This repository is not an approved starter template.',
  GITHUB_TEMPLATE_FETCH_FAILED: 'The starter-template files could not be loaded. Please try again.',
  NETLIFY_TOKEN_MISSING: 'Connect Netlify before continuing.',
  NETLIFY_TOKEN_INVALID: 'Your Netlify connection is no longer valid. Reconnect Netlify and try again.',
  NETLIFY_USER_FAILED: 'Your Netlify profile could not be loaded. Please try again.',
  NETLIFY_REQUEST_FAILED: 'The Netlify request could not be completed. Please try again.',
  NETLIFY_ACTION_INVALID: 'This Netlify action is not supported.',
  SUPABASE_TOKEN_MISSING: 'Connect Supabase before continuing.',
  SUPABASE_TOKEN_INVALID: 'Your Supabase connection is no longer valid. Reconnect Supabase and try again.',
  SUPABASE_USER_FAILED: 'Your Supabase profile could not be loaded. Please try again.',
  SUPABASE_REQUEST_FAILED: 'The Supabase request could not be completed. Please try again.',
  SUPABASE_PROJECT_REQUIRED: 'Select a Supabase project.',
  SUPABASE_PROJECT_INVALID: 'The Supabase project ID is invalid.',
  SUPABASE_ACTION_INVALID: 'This Supabase action is not supported.',
  VERCEL_TOKEN_MISSING: 'Connect Vercel before continuing.',
  VERCEL_TOKEN_INVALID: 'Your Vercel connection is no longer valid. Reconnect Vercel and try again.',
  VERCEL_USER_FAILED: 'Your Vercel profile could not be loaded. Please try again.',
  VERCEL_REQUEST_FAILED: 'The Vercel request could not be completed. Please try again.',
  VERCEL_ACTION_INVALID: 'This Vercel action is not supported.',
  VERCEL_PROJECT_TOKEN_REQUIRED: 'A Vercel project and connection are required.',
  VERCEL_PROJECT_INVALID: 'The Vercel project ID is invalid.',
  VERCEL_PROJECT_FETCH_FAILED: 'The Vercel project could not be loaded. Please try again.',
  VERCEL_DEPLOYMENTS_FETCH_FAILED: 'Vercel deployments could not be loaded. Please try again.',
  VERCEL_DEPLOYMENT_FETCH_FAILED: 'The Vercel deployment could not be loaded. Please try again.',
  VERCEL_PROJECT_CREATE_FAILED: 'The Vercel project could not be created. Please try again.',
  VERCEL_DEPLOYMENT_CREATE_FAILED: 'The Vercel deployment could not be created. Please try again.',
  DEPLOYMENT_FAILED: 'The deployment failed. Please try again.',
  DEPLOYMENT_TIMED_OUT: 'The deployment timed out. Check its status with the provider, then try again.',
  NETLIFY_SITE_CREATE_FAILED: 'The Netlify site could not be created. Please try again.',
  NETLIFY_DEPLOYMENT_CREATE_FAILED: 'The Netlify deployment could not be created. Please try again.',
  NETLIFY_DEPLOYMENT_STATUS_FAILED: 'The Netlify deployment status could not be checked. Please try again.',
  NETLIFY_FILE_UPLOAD_FAILED: 'The file {path} could not be uploaded to Netlify.',
  NETLIFY_DEPLOY_PREPARATION_FAILED: 'Netlify could not prepare the deployment. Please try again.',
  NETLIFY_DEPLOY_PREPARATION_TIMED_OUT:
    'Netlify took too long to prepare the deployment. Check its status, then try again.',
  GITLAB_TOKEN_REQUIRED: 'A GitLab token is required.',
  GITLAB_PROJECT_REQUIRED: 'Select a GitLab project.',
  GITLAB_PROJECT_INVALID: 'The GitLab project ID is invalid.',
  GITLAB_URL_INVALID: 'The GitLab URL is invalid.',
  GITLAB_TOKEN_INVALID: 'Your GitLab connection is no longer valid. Reconnect GitLab and try again.',
  GITLAB_PROJECT_NOT_FOUND: 'The GitLab project was not found or you do not have access to it.',
  GITLAB_UNAVAILABLE: 'GitLab is temporarily unavailable. Please try again.',
  GITLAB_BRANCHES_FAILED: 'The GitLab branches could not be loaded. Please try again.',
  GITLAB_PROJECTS_FAILED: 'Your GitLab projects could not be loaded. Please try again.',
  SUPABASE_METHOD_NOT_ALLOWED: 'This request method is not supported.',
  SUPABASE_ACCESS_TOKEN_REQUIRED: 'A Supabase access token is required.',
  SUPABASE_PROJECTS_FAILED: 'Your Supabase projects could not be loaded. Reconnect Supabase and try again.',
  SUPABASE_AUTH_FAILED: 'Supabase authentication failed. Reconnect Supabase and try again.',
  SUPABASE_PROJECT_TOKEN_REQUIRED: 'A Supabase project and connection are required.',
  SUPABASE_API_KEYS_FAILED: 'The Supabase API keys could not be loaded. Please try again.',
  GIT_PROXY_URL_INVALID: 'The Git proxy URL is invalid.',
  GIT_PROXY_UNAUTHORIZED: 'Sign in before using the Git proxy.',
  GIT_PROXY_PATH_INVALID: 'The Git proxy path is invalid.',
  GIT_PROXY_TARGET_FORBIDDEN: 'This Git proxy target is not allowed.',
  GIT_PROXY_REDIRECT_FORBIDDEN: 'The Git proxy blocked an unsafe redirect.',
  GIT_PROXY_FAILED: 'The Git proxy request could not be completed. Please try again.',
  GIT_INFO_FAILED: 'Git information could not be loaded. Please try again.',
  INVOICE_ORGANIZATION_MISSING: 'No organization is available for your account.',
  INVOICE_DOWNLOAD_EMPTY: 'No invoices are available to download yet.',
  TEMPLATE_PROJECT_PAYLOAD_INVALID: 'The template project request is invalid.',
  TEMPLATE_PROJECT_NOT_FOUND: 'The selected template was not found.',
  ABUSE_METHOD_NOT_ALLOWED: 'This request method is not supported.',
  ABUSE_REPORT_INVALID: 'Review the report fields and correct the invalid values.',
  ABUSE_REQUEST_INVALID: 'The report could not be read. Review the form and try again.',
  ABUSE_REPORT_SPAM:
    'This report was flagged as possible spam. Contact abuse@e-code.ai if you believe this is a mistake.',
  ABUSE_RATE_LIMIT: 'Too many reports were submitted. Please wait before trying again.',
  ABUSE_INTAKE_UNAVAILABLE: 'Abuse reporting is temporarily unavailable. Contact abuse@e-code.ai.',
  ABUSE_CONFIGURATION_INVALID: 'Abuse reporting is temporarily unavailable. Contact abuse@e-code.ai.',
  ABUSE_SUBMISSION_FAILED: 'The abuse report could not be submitted. Please try again later.',
  templateProjectDescription: '{name} starter created from the public E-Code template gallery.',
  invoiceManifestSkipped: 'Skipped (download failed):',
  invoiceArchiveFilename: 'invoices-{date}.zip',
  gitInfoUnknown: 'unknown',
  supabaseAccount: 'Supabase account',
  supabasePlan: '{plan} plan',
  supabaseConnectedAccessToken: 'Connected via access token',
  abuseMailSubject: 'E-Code abuse report: {type}',
  abuseMailReportType: 'Report type: {type}',
  abuseMailTargetUrl: 'Target URL: {url}',
  abuseMailUsername: 'Username: {username}',
  abuseMailReporterEmail: 'Reporter email: {email}',
  abuseMailPagePath: 'Page path: {path}',
  abuseMailDescription: 'Description:',
  abuseTypeCode: 'Malicious or harmful code',
  abuseTypeContent: 'Inappropriate content',
  abuseTypeHarassment: 'Harassment or bullying',
  abuseTypeSpam: 'Spam or scam',
  abuseTypeCopyright: 'Copyright infringement',
  abuseTypePrivacy: 'Privacy violation',
  abuseTypeOther: 'Other',
  abuseIssueTitle: '[Abuse report] {type}: {url}',
  abuseIssueHeading: 'Abuse report',
  abuseIssueType: 'Type',
  abuseIssueTargetUrl: 'Target URL',
  abuseIssueUsername: 'Username',
  abuseIssueReporterEmail: 'Reporter email',
  abuseIssueSubmittedFrom: 'Submitted from',
  abuseIssueClientIp: 'Client IP',
  abuseIssueDescription: 'Description',
  abuseIssueFooter: 'Submitted through the public E-Code abuse-report page.',
} as const;

export type WebApiRoutesKey = keyof typeof webApiRoutesEn;
export type WebApiErrorCode = Exclude<
  WebApiRoutesKey,
  | 'templateProjectDescription'
  | 'invoiceManifestSkipped'
  | 'invoiceArchiveFilename'
  | 'gitInfoUnknown'
  | 'supabaseAccount'
  | 'supabasePlan'
  | 'supabaseConnectedAccessToken'
  | 'abuseMailSubject'
  | 'abuseMailReportType'
  | 'abuseMailTargetUrl'
  | 'abuseMailUsername'
  | 'abuseMailReporterEmail'
  | 'abuseMailPagePath'
  | 'abuseMailDescription'
  | 'abuseTypeCode'
  | 'abuseTypeContent'
  | 'abuseTypeHarassment'
  | 'abuseTypeSpam'
  | 'abuseTypeCopyright'
  | 'abuseTypePrivacy'
  | 'abuseTypeOther'
  | 'abuseIssueTitle'
  | 'abuseIssueHeading'
  | 'abuseIssueType'
  | 'abuseIssueTargetUrl'
  | 'abuseIssueUsername'
  | 'abuseIssueReporterEmail'
  | 'abuseIssueSubmittedFrom'
  | 'abuseIssueClientIp'
  | 'abuseIssueDescription'
  | 'abuseIssueFooter'
>;
export type WebApiRoutesCopy = Readonly<Record<WebApiRoutesKey, string>>;

export const webApiRoutesFr: WebApiRoutesCopy = {
  OWNER_REPOSITORY_REQUIRED: 'Le propriétaire et le nom du dépôt sont obligatoires.',
  GITHUB_TOKEN_REQUIRED: 'Un jeton GitHub est obligatoire.',
  GITHUB_TOKEN_MISSING: 'Connectez GitHub pour continuer.',
  GITHUB_TOKEN_INVALID: 'Votre connexion GitHub n’est plus valide. Reconnectez GitHub, puis réessayez.',
  GITHUB_REPOSITORY_NOT_FOUND: 'Le dépôt GitHub est introuvable.',
  GITHUB_UNAVAILABLE: 'GitHub est temporairement indisponible. Veuillez réessayer.',
  GITHUB_BRANCHES_FAILED: 'Impossible de charger les branches du dépôt. Veuillez réessayer.',
  GITHUB_STATS_FAILED: 'Impossible de charger vos statistiques GitHub. Veuillez réessayer.',
  GITHUB_USER_FAILED: 'Impossible de charger votre profil GitHub. Veuillez réessayer.',
  GITHUB_REQUEST_FAILED: 'La requête GitHub n’a pas pu aboutir. Veuillez réessayer.',
  GITHUB_REPOSITORY_INVALID: 'Saisissez un dépôt GitHub valide au format propriétaire/dépôt.',
  GITHUB_REPOSITORY_REQUIRED: 'Sélectionnez un dépôt GitHub.',
  GITHUB_SEARCH_REQUIRED: 'Saisissez une recherche de dépôt.',
  GITHUB_USERNAME_MISSING: 'Votre nom d’utilisateur GitHub est indisponible. Reconnectez GitHub, puis réessayez.',
  GITHUB_USERNAME_INVALID: 'Le nom d’utilisateur GitHub est invalide.',
  GITHUB_ACTION_INVALID: 'Cette action GitHub n’est pas prise en charge.',
  GITHUB_TEMPLATE_REPOSITORY_REQUIRED: 'Sélectionnez un dépôt de modèle de démarrage.',
  GITHUB_TEMPLATE_NOT_ALLOWED: 'Ce dépôt ne fait pas partie des modèles de démarrage autorisés.',
  GITHUB_TEMPLATE_FETCH_FAILED: 'Impossible de charger les fichiers du modèle de démarrage. Veuillez réessayer.',
  NETLIFY_TOKEN_MISSING: 'Connectez Netlify pour continuer.',
  NETLIFY_TOKEN_INVALID: 'Votre connexion Netlify n’est plus valide. Reconnectez Netlify, puis réessayez.',
  NETLIFY_USER_FAILED: 'Impossible de charger votre profil Netlify. Veuillez réessayer.',
  NETLIFY_REQUEST_FAILED: 'La requête Netlify n’a pas pu aboutir. Veuillez réessayer.',
  NETLIFY_ACTION_INVALID: 'Cette action Netlify n’est pas prise en charge.',
  SUPABASE_TOKEN_MISSING: 'Connectez Supabase pour continuer.',
  SUPABASE_TOKEN_INVALID: 'Votre connexion Supabase n’est plus valide. Reconnectez Supabase, puis réessayez.',
  SUPABASE_USER_FAILED: 'Impossible de charger votre profil Supabase. Veuillez réessayer.',
  SUPABASE_REQUEST_FAILED: 'La requête Supabase n’a pas pu aboutir. Veuillez réessayer.',
  SUPABASE_PROJECT_REQUIRED: 'Sélectionnez un projet Supabase.',
  SUPABASE_PROJECT_INVALID: 'L’identifiant du projet Supabase est invalide.',
  SUPABASE_ACTION_INVALID: 'Cette action Supabase n’est pas prise en charge.',
  VERCEL_TOKEN_MISSING: 'Connectez Vercel pour continuer.',
  VERCEL_TOKEN_INVALID: 'Votre connexion Vercel n’est plus valide. Reconnectez Vercel, puis réessayez.',
  VERCEL_USER_FAILED: 'Impossible de charger votre profil Vercel. Veuillez réessayer.',
  VERCEL_REQUEST_FAILED: 'La requête Vercel n’a pas pu aboutir. Veuillez réessayer.',
  VERCEL_ACTION_INVALID: 'Cette action Vercel n’est pas prise en charge.',
  VERCEL_PROJECT_TOKEN_REQUIRED: 'Un projet et une connexion Vercel sont obligatoires.',
  VERCEL_PROJECT_INVALID: 'L’identifiant du projet Vercel est invalide.',
  VERCEL_PROJECT_FETCH_FAILED: 'Impossible de charger le projet Vercel. Veuillez réessayer.',
  VERCEL_DEPLOYMENTS_FETCH_FAILED: 'Impossible de charger les déploiements Vercel. Veuillez réessayer.',
  VERCEL_DEPLOYMENT_FETCH_FAILED: 'Impossible de charger le déploiement Vercel. Veuillez réessayer.',
  VERCEL_PROJECT_CREATE_FAILED: 'Impossible de créer le projet Vercel. Veuillez réessayer.',
  VERCEL_DEPLOYMENT_CREATE_FAILED: 'Impossible de créer le déploiement Vercel. Veuillez réessayer.',
  DEPLOYMENT_FAILED: 'Le déploiement a échoué. Veuillez réessayer.',
  DEPLOYMENT_TIMED_OUT: 'Le délai du déploiement a expiré. Vérifiez son état auprès du fournisseur, puis réessayez.',
  NETLIFY_SITE_CREATE_FAILED: 'Impossible de créer le site Netlify. Veuillez réessayer.',
  NETLIFY_DEPLOYMENT_CREATE_FAILED: 'Impossible de créer le déploiement Netlify. Veuillez réessayer.',
  NETLIFY_DEPLOYMENT_STATUS_FAILED: 'Impossible de vérifier l’état du déploiement Netlify. Veuillez réessayer.',
  NETLIFY_FILE_UPLOAD_FAILED: 'Impossible d’envoyer le fichier {path} vers Netlify.',
  NETLIFY_DEPLOY_PREPARATION_FAILED: 'Netlify n’a pas pu préparer le déploiement. Veuillez réessayer.',
  NETLIFY_DEPLOY_PREPARATION_TIMED_OUT:
    'Netlify a mis trop de temps à préparer le déploiement. Vérifiez son état, puis réessayez.',
  GITLAB_TOKEN_REQUIRED: 'Un jeton GitLab est obligatoire.',
  GITLAB_PROJECT_REQUIRED: 'Sélectionnez un projet GitLab.',
  GITLAB_PROJECT_INVALID: 'L’identifiant du projet GitLab est invalide.',
  GITLAB_URL_INVALID: 'L’URL GitLab est invalide.',
  GITLAB_TOKEN_INVALID: 'Votre connexion GitLab n’est plus valide. Reconnectez GitLab, puis réessayez.',
  GITLAB_PROJECT_NOT_FOUND: 'Le projet GitLab est introuvable ou vous n’y avez pas accès.',
  GITLAB_UNAVAILABLE: 'GitLab est temporairement indisponible. Veuillez réessayer.',
  GITLAB_BRANCHES_FAILED: 'Impossible de charger les branches GitLab. Veuillez réessayer.',
  GITLAB_PROJECTS_FAILED: 'Impossible de charger vos projets GitLab. Veuillez réessayer.',
  SUPABASE_METHOD_NOT_ALLOWED: 'Cette méthode de requête n’est pas prise en charge.',
  SUPABASE_ACCESS_TOKEN_REQUIRED: 'Un jeton d’accès Supabase est obligatoire.',
  SUPABASE_PROJECTS_FAILED: 'Impossible de charger vos projets Supabase. Reconnectez Supabase, puis réessayez.',
  SUPABASE_AUTH_FAILED: 'L’authentification Supabase a échoué. Reconnectez Supabase, puis réessayez.',
  SUPABASE_PROJECT_TOKEN_REQUIRED: 'Un projet et une connexion Supabase sont obligatoires.',
  SUPABASE_API_KEYS_FAILED: 'Impossible de charger les clés API Supabase. Veuillez réessayer.',
  GIT_PROXY_URL_INVALID: 'L’URL du proxy Git est invalide.',
  GIT_PROXY_UNAUTHORIZED: 'Connectez-vous avant d’utiliser le proxy Git.',
  GIT_PROXY_PATH_INVALID: 'Le chemin du proxy Git est invalide.',
  GIT_PROXY_TARGET_FORBIDDEN: 'Cette cible du proxy Git n’est pas autorisée.',
  GIT_PROXY_REDIRECT_FORBIDDEN: 'Le proxy Git a bloqué une redirection non sécurisée.',
  GIT_PROXY_FAILED: 'La requête du proxy Git n’a pas pu aboutir. Veuillez réessayer.',
  GIT_INFO_FAILED: 'Impossible de charger les informations Git. Veuillez réessayer.',
  INVOICE_ORGANIZATION_MISSING: 'Aucune organisation n’est disponible pour votre compte.',
  INVOICE_DOWNLOAD_EMPTY: 'Aucune facture n’est encore disponible au téléchargement.',
  TEMPLATE_PROJECT_PAYLOAD_INVALID: 'La demande de création depuis un modèle est invalide.',
  TEMPLATE_PROJECT_NOT_FOUND: 'Le modèle sélectionné est introuvable.',
  ABUSE_METHOD_NOT_ALLOWED: 'Cette méthode de requête n’est pas prise en charge.',
  ABUSE_REPORT_INVALID: 'Vérifiez les champs du signalement et corrigez les valeurs invalides.',
  ABUSE_REQUEST_INVALID: 'Le signalement n’a pas pu être lu. Vérifiez le formulaire, puis réessayez.',
  ABUSE_REPORT_SPAM:
    'Ce signalement a été identifié comme un possible spam. Contactez abuse@e-code.ai si vous pensez qu’il s’agit d’une erreur.',
  ABUSE_RATE_LIMIT: 'Trop de signalements ont été envoyés. Veuillez patienter avant de réessayer.',
  ABUSE_INTAKE_UNAVAILABLE:
    'Le service de signalement des abus est temporairement indisponible. Contactez abuse@e-code.ai.',
  ABUSE_CONFIGURATION_INVALID:
    'Le service de signalement des abus est temporairement indisponible. Contactez abuse@e-code.ai.',
  ABUSE_SUBMISSION_FAILED: 'Le signalement n’a pas pu être envoyé. Veuillez réessayer plus tard.',
  templateProjectDescription: 'Projet de démarrage {name} créé depuis la galerie publique de modèles E-Code.',
  invoiceManifestSkipped: 'Ignorées (échec du téléchargement) :',
  invoiceArchiveFilename: 'factures-{date}.zip',
  gitInfoUnknown: 'inconnu',
  supabaseAccount: 'Compte Supabase',
  supabasePlan: 'Forfait {plan}',
  supabaseConnectedAccessToken: 'Connecté via un jeton d’accès',
  abuseMailSubject: 'Signalement d’abus E-Code : {type}',
  abuseMailReportType: 'Type de signalement : {type}',
  abuseMailTargetUrl: 'URL concernée : {url}',
  abuseMailUsername: 'Nom d’utilisateur : {username}',
  abuseMailReporterEmail: 'E-mail de la personne déclarante : {email}',
  abuseMailPagePath: 'Page d’envoi : {path}',
  abuseMailDescription: 'Description :',
  abuseTypeCode: 'Code malveillant ou nuisible',
  abuseTypeContent: 'Contenu inapproprié',
  abuseTypeHarassment: 'Harcèlement ou intimidation',
  abuseTypeSpam: 'Spam ou escroquerie',
  abuseTypeCopyright: 'Atteinte au droit d’auteur',
  abuseTypePrivacy: 'Atteinte à la vie privée',
  abuseTypeOther: 'Autre',
  abuseIssueTitle: '[Signalement d’abus] {type} : {url}',
  abuseIssueHeading: 'Signalement d’abus',
  abuseIssueType: 'Type',
  abuseIssueTargetUrl: 'URL concernée',
  abuseIssueUsername: 'Nom d’utilisateur',
  abuseIssueReporterEmail: 'E-mail de la personne déclarante',
  abuseIssueSubmittedFrom: 'Page d’envoi',
  abuseIssueClientIp: 'Adresse IP cliente',
  abuseIssueDescription: 'Description',
  abuseIssueFooter: 'Envoyé depuis la page publique de signalement des abus E-Code.',
};

export function getWebApiRoutesCopy(language?: string | null): WebApiRoutesCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? webApiRoutesFr : webApiRoutesEn;
}

export function interpolateWebApiCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => String(values[key] ?? match));
}

export function webApiErrorResponse(
  request: Request,
  code: WebApiErrorCode,
  status: number,
  options: Readonly<{
    extra?: Readonly<Record<string, unknown>>;
    headers?: HeadersInit;
    values?: Readonly<Record<string, string | number>>;
  }> = {},
): Response {
  const resolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, resolution);

  for (const [name, value] of new Headers(options.headers).entries()) {
    headers.set(name, value);
  }

  return json(
    {
      ...options.extra,
      error: interpolateWebApiCopy(getWebApiRoutesCopy(resolution.language)[code], options.values ?? {}),
      code,
    },
    { status, headers },
  );
}

export function webApiLocaleHeaders(request: Request, initial?: HeadersInit): Headers {
  const resolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, resolution);

  for (const [name, value] of new Headers(initial).entries()) {
    headers.set(name, value);
  }

  return headers;
}
