import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { json } from '~/lib/json-response';

export const remainingApiRoutesEn = {
  METHOD_NOT_ALLOWED: 'This request method is not supported.',
  UNAUTHORIZED: 'Sign in to continue.',
  INVALID_JSON_BODY: 'The request body must contain valid JSON.',
  INVALID_JSON_PAYLOAD: 'The JSON payload is invalid.',
  PROJECT_NOT_FOUND: 'The project was not found.',
  WORKSPACE_NOT_FOUND: 'The workspace was not found.',
  CONVERSATION_NOT_FOUND: 'The conversation was not found.',
  MEMORY_NOT_FOUND: 'The memory was not found.',
  PROJECT_OR_PROPOSAL_NOT_FOUND: 'The project or patch proposal was not found.',
  AGENT_CONSENSUS_NOT_FOUND: 'The agent consensus result was not found.',
  TEMPLATE_NOT_FOUND: 'The template was not found.',
  TEMPLATE_ACTION_INVALID: 'This template action is not supported.',
  PROJECT_ACTION_UNSUPPORTED: 'This project action is not supported.',
  PROJECT_EXPORT_AUTH_REQUIRED: 'You do not have permission to export this project.',
  PROJECT_EXPORT_UNAVAILABLE: 'The project could not be exported. Please try again.',
  PROJECT_EXPORT_ARCHIVE_MISSING: 'The project export did not produce an archive. Please try again.',
  PROJECT_EXPORT_ARCHIVE_CORRUPT: 'The project export produced an invalid archive. Please try again.',
  PROJECT_ACTION_AUTH_REQUIRED: 'You do not have permission to perform this project action.',
  PROJECT_ACTION_FAILED: 'The project action could not be completed. Please try again.',
  SELF_REPAIR_PROMPT_REQUIRED: 'Provide a non-empty self-repair prompt.',
  SELF_REPAIR_PROMPT_TOO_LARGE: 'The self-repair prompt exceeds the {maximum}-byte limit.',
  SELF_REPAIR_COOKIE_INVALID: 'The saved provider settings are invalid. Review them and try again.',
  SELF_REPAIR_TRUNCATED: 'The self-repair response was incomplete. Please try again with a smaller file.',
  SELF_REPAIR_FAILED: 'Self-repair could not be completed. Please try again.',
  RATE_LIMIT_EXCEEDED: 'Too many requests were sent. Please wait before trying again.',
  JSON_CONTENT_TYPE_REQUIRED: 'Send this request with the application/json content type.',
  LOG_FORMAT_INVALID: 'The log payload format is invalid.',
  TELEMETRY_PAYLOAD_INVALID: 'The telemetry payload is invalid.',
  AUTH_SCAFFOLD_DISABLED: 'Adding authentication is not enabled on this platform yet.',
  AUTH_SCAFFOLD_FAILED: 'Authentication could not be added. Please try again.',
  AUTH_SCAFFOLD_UNAVAILABLE: 'The authentication setup service is temporarily unavailable. Please try again.',
  CONTACT_GENERAL_INVALID: 'Enter a valid email address and a short message.',
  CONTACT_SALES_INVALID: 'Enter a valid email address, your company, and a short message.',
  CONTACT_RATE_LIMIT: 'Too many attempts were made. Please try again in a minute.',
  CONTACT_GENERAL_FAILED: 'Your message could not be sent. Please try again.',
  CONTACT_SALES_FAILED: 'Your request could not be submitted. Please try again.',
  NEWSLETTER_EMAIL_INVALID: 'Enter a valid email address.',
  NEWSLETTER_SUBSCRIBE_FAILED: 'Your subscription could not be completed. Please try again.',
  PROVIDER_REQUIRED: 'Select a provider.',
  API_KEY_REQUIRED: 'Enter an API key.',
  CONNECTOR_CONFIGURE_FAILED: 'The connector could not be configured. Please try again.',
  OAUTH_PROVIDER_UNSUPPORTED: 'The provider “{provider}” is not supported.',
  OAUTH_START_FAILED: 'The OAuth authorization flow could not be started. Please try again.',
  CONNECTION_ID_REQUIRED: 'Select a connection to disconnect.',
  CONNECTION_REVOKE_REQUEST_INVALID: 'A revoke action and connection ID are required.',
  CONNECTION_REVOKE_FAILED: 'The account could not be disconnected. Please try again.',
  FEEDBACK_INVALID: 'A message ID and a vote of “up”, “down”, or null are required.',
  FEEDBACK_FAILED: 'Your feedback could not be recorded. Please try again.',
  CHAT_SHARE_FAILED: 'The share link could not be created. Please try again.',
  INTEGRATION_REQUEST_INVALID: 'Enter an integration name and describe how you would use it.',
  INTEGRATION_REQUEST_FAILED: 'Your integration request could not be submitted. Please try again.',
  PROJECT_FILE_PATH_INVALID: 'The project file path is invalid.',
  PROJECT_FILE_NOT_FOUND: 'The project file was not found.',
  PROJECT_FILE_AUTH_REQUIRED: 'You do not have permission to access this project file.',
  PROJECT_FILE_READ_FAILED: 'The project file could not be read. Please try again.',
  PROJECT_FILE_WORKSPACE_STARTING: 'Your workspace is still starting. This file will open in a moment.',
  PROJECT_FILE_WRITE_FAILED: 'The project file could not be saved. Please try again.',
  PROJECT_FILE_WRITE_BODY_INVALID: 'The file write payload is invalid.',
  PROJECT_FILE_CONTENT_REQUIRED: 'File content is required.',
  PROJECT_FILE_ENCODING_UNSUPPORTED: 'The requested file encoding is not supported.',
  PROJECT_FILES_AUTH_REQUIRED: 'You do not have permission to access these project files.',
  PROJECT_FILES_FAILED: 'The project files could not be loaded. Please try again.',
  PROJECT_IMPORT_AUTH_REQUIRED: 'You do not have permission to import files into this project.',
  PROJECT_IMPORT_FAILED: 'The project archive could not be imported. Please try again.',
  DATABASE_AUTH_REQUIRED: 'You do not have permission to access this project database.',
  DATABASE_PANEL_FAILED: 'The database information could not be loaded. Please try again.',
  DATABASE_REQUEST_FAILED: 'The database operation could not be completed. Please try again.',
  THUMBNAIL_PREVIEW_URL_REQUIRED: 'A preview URL is required.',
  THUMBNAIL_REFRESH_FAILED: 'The project thumbnail could not be refreshed. Please try again.',
  THUMBNAIL_UPLOAD_FAILED: 'Thumbnail upload is temporarily unavailable. Please try again.',
  MCP_CONFIG_INVALID: 'The MCP server configuration is invalid.',
  MCP_UPDATE_FAILED: 'The MCP configuration could not be updated. Please try again.',
  MCP_CHECK_FAILED: 'The MCP servers could not be checked. Please try again.',
  MCP_SERVER_UNAVAILABLE: 'This MCP server is unavailable. Review its configuration and try again.',
  MCP_INSTALL_ID_REQUIRED: 'Select an MCP installation.',
  MCP_CATALOG_SLUG_REQUIRED: 'Select an MCP catalog entry.',
  CONNECTOR_PROVIDER_UNSUPPORTED: 'This connector provider is not supported.',
  PROJECT_ID_REQUIRED: 'Select a project.',
  SCHEDULED_INTENT_UNSUPPORTED: 'The scheduled-task action “{intent}” is not supported.',
  DISK_INFO_FAILED: 'Disk information could not be loaded. Please try again.',
  projectFallbackName: 'Project',
  projectCopySuffix: 'Copy',
  projectForkSuffix: 'Fork',
  contactDefaultTopic: 'General',
  scheduledJobDefaultName: 'Scheduled job',
  diskFilesystemUnknown: 'Unknown',
} as const;

export type RemainingApiRouteKey = keyof typeof remainingApiRoutesEn;
export type RemainingApiRouteCopy = Readonly<Record<RemainingApiRouteKey, string>>;

export const remainingApiRoutesFr: RemainingApiRouteCopy = {
  METHOD_NOT_ALLOWED: 'Cette méthode de requête n’est pas prise en charge.',
  UNAUTHORIZED: 'Connectez-vous pour continuer.',
  INVALID_JSON_BODY: 'Le corps de la requête doit contenir un JSON valide.',
  INVALID_JSON_PAYLOAD: 'La charge utile JSON est invalide.',
  PROJECT_NOT_FOUND: 'Le projet est introuvable.',
  WORKSPACE_NOT_FOUND: 'L’espace de travail est introuvable.',
  CONVERSATION_NOT_FOUND: 'La conversation est introuvable.',
  MEMORY_NOT_FOUND: 'La mémoire est introuvable.',
  PROJECT_OR_PROPOSAL_NOT_FOUND: 'Le projet ou la proposition de correctif est introuvable.',
  AGENT_CONSENSUS_NOT_FOUND: 'Le résultat du consensus des agents est introuvable.',
  TEMPLATE_NOT_FOUND: 'Le modèle est introuvable.',
  TEMPLATE_ACTION_INVALID: 'Cette action sur le modèle n’est pas prise en charge.',
  PROJECT_ACTION_UNSUPPORTED: 'Cette action sur le projet n’est pas prise en charge.',
  PROJECT_EXPORT_AUTH_REQUIRED: 'Vous n’avez pas l’autorisation d’exporter ce projet.',
  PROJECT_EXPORT_UNAVAILABLE: 'Impossible d’exporter le projet. Veuillez réessayer.',
  PROJECT_EXPORT_ARCHIVE_MISSING: 'L’export du projet n’a produit aucune archive. Veuillez réessayer.',
  PROJECT_EXPORT_ARCHIVE_CORRUPT: 'L’export du projet a produit une archive invalide. Veuillez réessayer.',
  PROJECT_ACTION_AUTH_REQUIRED: 'Vous n’avez pas l’autorisation d’effectuer cette action sur le projet.',
  PROJECT_ACTION_FAILED: 'Impossible d’effectuer l’action sur le projet. Veuillez réessayer.',
  SELF_REPAIR_PROMPT_REQUIRED: 'Saisissez un prompt d’autoréparation non vide.',
  SELF_REPAIR_PROMPT_TOO_LARGE: 'Le prompt d’autoréparation dépasse la limite de {maximum} octets.',
  SELF_REPAIR_COOKIE_INVALID: 'Les paramètres de fournisseur enregistrés sont invalides. Vérifiez-les, puis réessayez.',
  SELF_REPAIR_TRUNCATED: 'La réponse d’autoréparation est incomplète. Veuillez réessayer avec un fichier plus petit.',
  SELF_REPAIR_FAILED: 'Impossible de terminer l’autoréparation. Veuillez réessayer.',
  RATE_LIMIT_EXCEEDED: 'Trop de requêtes ont été envoyées. Veuillez patienter avant de réessayer.',
  JSON_CONTENT_TYPE_REQUIRED: 'Envoyez cette requête avec le type de contenu application/json.',
  LOG_FORMAT_INVALID: 'Le format de la charge utile des journaux est invalide.',
  TELEMETRY_PAYLOAD_INVALID: 'La charge utile de télémétrie est invalide.',
  AUTH_SCAFFOLD_DISABLED: 'L’ajout de l’authentification n’est pas encore activé sur cette plateforme.',
  AUTH_SCAFFOLD_FAILED: 'Impossible d’ajouter l’authentification. Veuillez réessayer.',
  AUTH_SCAFFOLD_UNAVAILABLE:
    'Le service de configuration de l’authentification est temporairement indisponible. Veuillez réessayer.',
  CONTACT_GENERAL_INVALID: 'Saisissez une adresse e-mail valide et un court message.',
  CONTACT_SALES_INVALID: 'Saisissez une adresse e-mail valide, votre entreprise et un court message.',
  CONTACT_RATE_LIMIT: 'Trop de tentatives ont été effectuées. Veuillez réessayer dans une minute.',
  CONTACT_GENERAL_FAILED: 'Impossible d’envoyer votre message. Veuillez réessayer.',
  CONTACT_SALES_FAILED: 'Impossible d’envoyer votre demande. Veuillez réessayer.',
  NEWSLETTER_EMAIL_INVALID: 'Saisissez une adresse e-mail valide.',
  NEWSLETTER_SUBSCRIBE_FAILED: 'Impossible de finaliser votre abonnement. Veuillez réessayer.',
  PROVIDER_REQUIRED: 'Sélectionnez un fournisseur.',
  API_KEY_REQUIRED: 'Saisissez une clé API.',
  CONNECTOR_CONFIGURE_FAILED: 'Impossible de configurer le connecteur. Veuillez réessayer.',
  OAUTH_PROVIDER_UNSUPPORTED: 'Le fournisseur « {provider} » n’est pas pris en charge.',
  OAUTH_START_FAILED: 'Impossible de démarrer le flux d’autorisation OAuth. Veuillez réessayer.',
  CONNECTION_ID_REQUIRED: 'Sélectionnez une connexion à déconnecter.',
  CONNECTION_REVOKE_REQUEST_INVALID: 'Une action de révocation et un identifiant de connexion sont obligatoires.',
  CONNECTION_REVOKE_FAILED: 'Impossible de déconnecter le compte. Veuillez réessayer.',
  FEEDBACK_INVALID: 'Un identifiant de message et un vote « up », « down » ou null sont obligatoires.',
  FEEDBACK_FAILED: 'Impossible d’enregistrer votre avis. Veuillez réessayer.',
  CHAT_SHARE_FAILED: 'Impossible de créer le lien de partage. Veuillez réessayer.',
  INTEGRATION_REQUEST_INVALID: 'Saisissez le nom d’une intégration et décrivez votre cas d’usage.',
  INTEGRATION_REQUEST_FAILED: 'Impossible d’envoyer votre demande d’intégration. Veuillez réessayer.',
  PROJECT_FILE_PATH_INVALID: 'Le chemin du fichier du projet est invalide.',
  PROJECT_FILE_NOT_FOUND: 'Le fichier du projet est introuvable.',
  PROJECT_FILE_AUTH_REQUIRED: 'Vous n’avez pas l’autorisation d’accéder à ce fichier du projet.',
  PROJECT_FILE_READ_FAILED: 'Impossible de lire le fichier du projet. Veuillez réessayer.',
  PROJECT_FILE_WORKSPACE_STARTING: 'Votre espace de travail démarre. Ce fichier s’ouvrira dans un instant.',
  PROJECT_FILE_WRITE_FAILED: 'Impossible d’enregistrer le fichier du projet. Veuillez réessayer.',
  PROJECT_FILE_WRITE_BODY_INVALID: 'La charge utile d’écriture du fichier est invalide.',
  PROJECT_FILE_CONTENT_REQUIRED: 'Le contenu du fichier est obligatoire.',
  PROJECT_FILE_ENCODING_UNSUPPORTED: 'L’encodage de fichier demandé n’est pas pris en charge.',
  PROJECT_FILES_AUTH_REQUIRED: 'Vous n’avez pas l’autorisation d’accéder aux fichiers de ce projet.',
  PROJECT_FILES_FAILED: 'Impossible de charger les fichiers du projet. Veuillez réessayer.',
  PROJECT_IMPORT_AUTH_REQUIRED: 'Vous n’avez pas l’autorisation d’importer des fichiers dans ce projet.',
  PROJECT_IMPORT_FAILED: 'Impossible d’importer l’archive du projet. Veuillez réessayer.',
  DATABASE_AUTH_REQUIRED: 'Vous n’avez pas l’autorisation d’accéder à la base de données de ce projet.',
  DATABASE_PANEL_FAILED: 'Impossible de charger les informations de la base de données. Veuillez réessayer.',
  DATABASE_REQUEST_FAILED: 'Impossible d’effectuer l’opération sur la base de données. Veuillez réessayer.',
  THUMBNAIL_PREVIEW_URL_REQUIRED: 'Une URL d’aperçu est obligatoire.',
  THUMBNAIL_REFRESH_FAILED: 'Impossible d’actualiser la miniature du projet. Veuillez réessayer.',
  THUMBNAIL_UPLOAD_FAILED: 'L’envoi de miniatures est temporairement indisponible. Veuillez réessayer.',
  MCP_CONFIG_INVALID: 'La configuration des serveurs MCP est invalide.',
  MCP_UPDATE_FAILED: 'Impossible de mettre à jour la configuration MCP. Veuillez réessayer.',
  MCP_CHECK_FAILED: 'Impossible de vérifier les serveurs MCP. Veuillez réessayer.',
  MCP_SERVER_UNAVAILABLE: 'Ce serveur MCP est indisponible. Vérifiez sa configuration, puis réessayez.',
  MCP_INSTALL_ID_REQUIRED: 'Sélectionnez une installation MCP.',
  MCP_CATALOG_SLUG_REQUIRED: 'Sélectionnez une entrée du catalogue MCP.',
  CONNECTOR_PROVIDER_UNSUPPORTED: 'Ce fournisseur de connecteur n’est pas pris en charge.',
  PROJECT_ID_REQUIRED: 'Sélectionnez un projet.',
  SCHEDULED_INTENT_UNSUPPORTED: 'L’action de tâche planifiée « {intent} » n’est pas prise en charge.',
  DISK_INFO_FAILED: 'Impossible de charger les informations du disque. Veuillez réessayer.',
  projectFallbackName: 'Projet',
  projectCopySuffix: 'Copie',
  projectForkSuffix: 'Copie',
  contactDefaultTopic: 'Général',
  scheduledJobDefaultName: 'Tâche planifiée',
  diskFilesystemUnknown: 'Inconnu',
};

export function getRemainingApiRouteCopy(language?: string | null): RemainingApiRouteCopy {
  return language?.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? remainingApiRoutesFr : remainingApiRoutesEn;
}

export function interpolateRemainingApiRouteCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
  language?: string | null,
): string {
  const locale = language?.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr-FR' : 'en-US';

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = values[key];

    if (typeof value === 'number') {
      return new Intl.NumberFormat(locale).format(value);
    }

    return typeof value === 'string' ? value : match;
  });
}

export function remainingApiRouteMessage(
  request: Request,
  key: RemainingApiRouteKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const { language } = resolveRequestLocale(request);

  return interpolateRemainingApiRouteCopy(getRemainingApiRouteCopy(language)[key], values, language);
}

export function remainingApiErrorResponse(
  request: Request,
  code: RemainingApiRouteKey,
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
      error: interpolateRemainingApiRouteCopy(
        getRemainingApiRouteCopy(resolution.language)[code],
        options.values ?? {},
        resolution.language,
      ),
      code,
    },
    { status, headers },
  );
}

export function remainingApiLocaleHeaders(request: Request, initial?: HeadersInit): Headers {
  const resolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, resolution);

  for (const [name, value] of new Headers(initial).entries()) {
    headers.set(name, value);
  }

  return headers;
}
