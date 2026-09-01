import { detectUserLanguage, normalizeSupportedLanguage } from '~/lib/i18n/language';

export const clientStoresServicesEn = {
  'clientStores.files.invalidFileWrite': 'EINVAL: The file path is invalid and cannot be written: {path}',
  'clientStores.files.remoteChanged':
    'Remote file changed since it was loaded: {path}. Reload it before saving your changes.',
  'clientStores.files.remoteUnreadable':
    'Could not check the workspace copy of {path} before saving, so your changes were not written — saving anyway could have overwritten a newer version. Try again in a moment.',
  'clientStores.files.invalidFileCreate': 'EINVAL: The file path is invalid and cannot be created: {path}',
  'clientStores.files.invalidFolderCreate': 'EINVAL: The folder path is invalid and cannot be created: {path}',
  'clientStores.files.invalidFileDelete': 'EINVAL: The file path is invalid and cannot be deleted: {path}',
  'clientStores.files.invalidFolderDelete': 'EINVAL: The folder path is invalid and cannot be deleted: {path}',
  'clientStores.github.connectionFailed': 'Could not connect to GitHub (HTTP {status}).',
  'clientStores.github.connectionInitialized': 'GitHub connection initialized.',
  'clientStores.github.connectionInitializationFailed': 'Could not initialize the GitHub connection.',
  'clientStores.github.statsRequestFailed': 'Could not load GitHub statistics (HTTP {status}).',
  'clientStores.github.statsFetched': 'GitHub statistics loaded.',
  'clientStores.github.statsFetchFailed': 'Could not load GitHub statistics.',
  'clientServices.github.tokenRequired': 'Connect your GitHub account before using the GitHub API.',
  'clientServices.github.requestFailed': 'The GitHub API request failed (HTTP {status}).',
  'clientServices.gitlab.userRequestFailed': 'Could not load the GitLab account (HTTP {status}).',
  'clientServices.gitlab.unauthorized':
    'GitLab authentication failed (HTTP 401). Check that your access token is valid and includes the api and read_repository scopes.',
  'clientServices.gitlab.forbidden': 'GitLab refused the request (HTTP 403). Check the access token permissions.',
  'clientServices.gitlab.endpointNotFound': 'The GitLab API endpoint was not found (HTTP 404). Check the GitLab URL.',
  'clientServices.gitlab.rateLimited': 'The GitLab rate limit was reached (HTTP 429). Try again later.',
  'clientServices.gitlab.projectsRequestFailed': 'Could not load GitLab projects (HTTP {status}).',
  'clientServices.gitlab.eventsRequestFailed': 'Could not load GitLab activity (HTTP {status}).',
  'clientServices.gitlab.projectCreateFailed': 'Could not create the GitLab project (HTTP {status}).',
  'clientServices.gitlab.branchCreateFailed': 'Could not create the GitLab branch (HTTP {status}).',
  'clientServices.gitlab.commitFailed': 'Could not commit the files to GitLab (HTTP {status}).',
  'clientServices.gitlab.projectRequestFailed': 'Could not load the GitLab project (HTTP {status}).',
  'clientServices.gitlab.visibilityUpdateFailed': 'Could not update the GitLab project visibility (HTTP {status}).',
  'clientServices.mcp.commandAndUrlConflict':
    'An MCP server cannot define both command and url in the same configuration.',
  'clientServices.mcp.typeRequired': 'The MCP server type is required. Use sse or streamable-http for a remote server.',
  'clientServices.mcp.typeInvalid': 'The MCP server type is invalid. Use stdio, sse, or streamable-http.',
  'clientServices.mcp.stdioDisabled':
    'Local MCP servers (stdio) are disabled on this deployment. Use a remote sse or streamable-http server.',
  'clientServices.mcp.commandRequired': 'A command is required for a local MCP server.',
  'clientServices.mcp.urlRequired': 'A URL is required for a remote MCP server.',
  'clientServices.mcp.urlBlocked':
    'The MCP server URL is not allowed. Use a public HTTPS endpoint instead of a loopback, private, or metadata address.',
  'clientServices.mcp.configurationInvalid': 'The configuration for MCP server {server} is invalid.',
  'clientServices.mcp.commandEmpty': 'The MCP server command cannot be empty.',
  'clientServices.mcp.urlInvalid': 'Enter a valid MCP server URL.',
  'clientServices.mcp.toolDescriptionUnavailable': 'No description is available for this tool.',
  'clientServices.projectOverview.commitWithoutMessage': 'Commit without a message',
  'clientRuntime.hunk.parseFailed': 'The generated code could not be parsed.',
  'clientRuntime.messageParser.supabaseOperationInvalid': 'The Supabase operation is invalid: {operation}',
  'clientRuntime.messageParser.operationUnknown': 'unknown operation',
  'clientRuntime.messageParser.migrationPathRequired': 'A filePath is required for a Supabase migration.',
  'clientRuntime.workspace.projectApiAuth':
    'The project service is unavailable because your session is missing or expired. Sign in again, then reload the IDE.',
  'clientRuntime.workspace.projectApiUnavailable':
    'The project service is unavailable. Start the full local stack with pnpm run dev, then reload the IDE.',
  'clientRuntime.workspace.projectApiFailed': 'The project service is temporarily unavailable. Reload the IDE.',
  'clientRuntime.workspace.persistedHydrationSkipped': 'Stored project files could not be loaded.',
  'clientRuntime.workspace.reattached': 'Reconnected to the running workspace.',
  'clientRuntime.workspace.previewCleanupSkipped': 'The previous preview could not be stopped cleanly.',
  'clientRuntime.workspace.cleanupSkipped': 'Workspace cleanup could not be completed.',
  'clientRuntime.workspace.filesAuth':
    'Project files could not be loaded because your session is missing or expired. Sign in again, then reload the IDE.',
  'clientRuntime.workspace.filesUnavailable':
    'Project files could not be loaded. Start the full local stack with pnpm run dev so the web app and API run together.',
  'clientRuntime.workspace.filesFailed': 'Project files could not be loaded. Reload the IDE and try again.',
  'clientRuntime.workspace.previewAutoStartSkipped': 'The preview could not start automatically.',
  'clientRuntime.workspace.filesSynced': 'Project files synchronized with the workspace runtime.',
  'clientRuntime.workspace.exportFailed': 'The project archive could not be exported (HTTP {status}).',
  'clientRuntime.workspace.exportEmpty': 'The exported project archive is empty.',
  'clientRuntime.workspace.startFailed': 'The workspace could not be started.',
  'clientRuntime.workspace.quota.generic.warning': 'Workspace quota exceeded',
  'clientRuntime.workspace.quota.generic.upgrade': 'Upgrade your plan to start more workspaces.',
  'clientRuntime.workspace.quota.activeWorkspaces.warning': 'You have reached your active workspace limit.',
  'clientRuntime.workspace.quota.activeWorkspaces.upgrade': 'Upgrade your plan to start more active workspaces.',
  'clientRuntime.workspace.quota.concurrentTerminals.warning': 'You have reached your concurrent terminal limit.',
  'clientRuntime.workspace.quota.concurrentTerminals.upgrade': 'Upgrade your plan to start more concurrent terminals.',
  'clientRuntime.artifact.userUpdatedFiles': 'User-updated files',
  'clientRuntime.artifact.shellCommand': 'Shell command',
  'clientStores.logs.performanceMetric': 'Performance: {component} — {operation} took {duration}\u00a0ms',
  'clientStores.logs.auth.message': 'Auth {action} - {result}',
  'clientStores.logs.auth.action.login': 'login',
  'clientStores.logs.auth.action.logout': 'logout',
  'clientStores.logs.auth.action.tokenRefresh': 'token_refresh',
  'clientStores.logs.auth.action.keyValidation': 'key_validation',
  'clientStores.logs.result.success': 'Success',
  'clientStores.logs.result.failed': 'Failed',
  'clientStores.logs.network.message': 'Network {status}',
  'clientStores.logs.network.status.online': 'online',
  'clientStores.logs.network.status.offline': 'offline',
  'clientStores.logs.network.status.reconnecting': 'reconnecting',
  'clientStores.logs.network.status.connected': 'connected',
  'clientStores.logs.database.message': 'DB {operation} - {result} ({duration}ms)',
  'clientRuntime.format.noFormatter': 'No formatter is available for {file}.',
  'clientRuntime.starter.untitled': 'Untitled project',
  'clientRuntime.starter.templateFetchFailed': 'The starter template could not be loaded (HTTP {status}).',
  'clientRuntime.starter.initializing':
    'E-Code is initializing your project with the required files using the {template} template.',
  'clientRuntime.starter.initialFilesTitle': 'Create initial files',
  'clientRuntime.starter.templateInstructions': 'TEMPLATE INSTRUCTIONS:\n{instructions}\n\n---',
  'clientRuntime.starter.protectedFilesRules':
    'STRICT FILE ACCESS RULES — READ CAREFULLY:\n\nThe following files are READ-ONLY and must never be modified:\n{files}\n\nPermitted actions:\n✓ Import these files as dependencies\n✓ Read from these files\n✓ Reference these files\n\nStrictly forbidden actions:\n❌ Modify any content within these files\n❌ Delete these files\n❌ Rename these files\n❌ Move these files\n❌ Create new versions of these files\n❌ Suggest changes to these files\n\nAny attempt to modify these protected files will stop the operation immediately.\n\nIf you need to change the functionality, create new files instead of modifying the protected files listed above.\n---',
  'clientRuntime.starter.continueInstructions':
    'The template import is complete. You can now use the imported files.\nEdit only the files that need to change, and create new files when needed.\nDO NOT EDIT OR WRITE TO EXISTING PROJECT FILES THAT DO NOT NEED TO CHANGE.\n---\nContinue with my original request.\n\nIMPORTANT: Install the dependencies before running the app with `npm install && npm run dev`.',
  'clientRuntime.webcontainer.inspectorLoadFailed': 'The preview inspector could not be loaded (HTTP {status}).',
  'clientRuntime.webcontainer.unhandledRejection': 'Unhandled promise rejection',
  'clientRuntime.webcontainer.uncaughtException': 'Uncaught exception',
  'clientRuntime.webcontainer.unknownError': 'An unknown preview error occurred.',
  'clientRuntime.webcontainer.previewErrorDetails':
    'Preview error at {location}\nPort: {port}\n\nStack trace:\n{stack}',
} as const;

export type ClientStoresServicesKey = keyof typeof clientStoresServicesEn;
export type ClientStoresServicesCopy = Readonly<Record<ClientStoresServicesKey, string>>;
export type ClientStoresServicesLanguage = 'en' | 'fr';

export const clientStoresServicesFr: ClientStoresServicesCopy = {
  'clientStores.files.invalidFileWrite':
    'EINVAL : le chemin du fichier n’est pas valide et ne permet pas l’écriture : {path}',
  'clientStores.files.remoteChanged':
    'Le fichier a changé dans l’espace de travail après son chargement : {path}. Rechargez-le avant d’enregistrer vos modifications.',
  'clientStores.files.remoteUnreadable':
    'Impossible de vérifier la version de {path} dans l’espace de travail avant d’enregistrer : vos modifications n’ont pas été écrites, car elles auraient pu écraser une version plus récente. Réessayez dans un instant.',
  'clientStores.files.invalidFileCreate':
    'EINVAL : le chemin du fichier n’est pas valide et ne permet pas sa création : {path}',
  'clientStores.files.invalidFolderCreate':
    'EINVAL : le chemin du dossier n’est pas valide et ne permet pas sa création : {path}',
  'clientStores.files.invalidFileDelete':
    'EINVAL : le chemin du fichier n’est pas valide et ne permet pas sa suppression : {path}',
  'clientStores.files.invalidFolderDelete':
    'EINVAL : le chemin du dossier n’est pas valide et ne permet pas sa suppression : {path}',
  'clientStores.github.connectionFailed': 'Impossible de se connecter à GitHub (HTTP {status}).',
  'clientStores.github.connectionInitialized': 'Connexion GitHub initialisée.',
  'clientStores.github.connectionInitializationFailed': 'Impossible d’initialiser la connexion GitHub.',
  'clientStores.github.statsRequestFailed': 'Impossible de charger les statistiques GitHub (HTTP {status}).',
  'clientStores.github.statsFetched': 'Statistiques GitHub chargées.',
  'clientStores.github.statsFetchFailed': 'Impossible de charger les statistiques GitHub.',
  'clientServices.github.tokenRequired': 'Connectez votre compte GitHub avant d’utiliser l’API GitHub.',
  'clientServices.github.requestFailed': 'La requête à l’API GitHub a échoué (HTTP {status}).',
  'clientServices.gitlab.userRequestFailed': 'Impossible de charger le compte GitLab (HTTP {status}).',
  'clientServices.gitlab.unauthorized':
    'Échec de l’authentification GitLab (HTTP 401). Vérifiez que votre jeton d’accès est valide et comprend les portées api et read_repository.',
  'clientServices.gitlab.forbidden':
    'GitLab a refusé la requête (HTTP 403). Vérifiez les autorisations du jeton d’accès.',
  'clientServices.gitlab.endpointNotFound':
    'Le point de terminaison de l’API GitLab est introuvable (HTTP 404). Vérifiez l’URL GitLab.',
  'clientServices.gitlab.rateLimited':
    'La limite de requêtes GitLab a été atteinte (HTTP 429). Réessayez ultérieurement.',
  'clientServices.gitlab.projectsRequestFailed': 'Impossible de charger les projets GitLab (HTTP {status}).',
  'clientServices.gitlab.eventsRequestFailed': 'Impossible de charger l’activité GitLab (HTTP {status}).',
  'clientServices.gitlab.projectCreateFailed': 'Impossible de créer le projet GitLab (HTTP {status}).',
  'clientServices.gitlab.branchCreateFailed': 'Impossible de créer la branche GitLab (HTTP {status}).',
  'clientServices.gitlab.commitFailed': 'Impossible de valider les fichiers dans GitLab (HTTP {status}).',
  'clientServices.gitlab.projectRequestFailed': 'Impossible de charger le projet GitLab (HTTP {status}).',
  'clientServices.gitlab.visibilityUpdateFailed':
    'Impossible de modifier la visibilité du projet GitLab (HTTP {status}).',
  'clientServices.mcp.commandAndUrlConflict':
    'Un serveur MCP ne peut pas définir command et url dans la même configuration.',
  'clientServices.mcp.typeRequired':
    'Le type du serveur MCP est requis. Utilisez sse ou streamable-http pour un serveur distant.',
  'clientServices.mcp.typeInvalid': 'Le type du serveur MCP n’est pas valide. Utilisez stdio, sse ou streamable-http.',
  'clientServices.mcp.stdioDisabled':
    'Les serveurs MCP locaux (stdio) sont désactivés sur ce déploiement. Utilisez un serveur distant sse ou streamable-http.',
  'clientServices.mcp.commandRequired': 'Une commande est requise pour un serveur MCP local.',
  'clientServices.mcp.urlRequired': 'Une URL est requise pour un serveur MCP distant.',
  'clientServices.mcp.urlBlocked':
    'L’URL du serveur MCP n’est pas autorisée. Utilisez un point de terminaison HTTPS public plutôt qu’une adresse de bouclage, privée ou de métadonnées.',
  'clientServices.mcp.configurationInvalid': 'La configuration du serveur MCP {server} n’est pas valide.',
  'clientServices.mcp.commandEmpty': 'La commande du serveur MCP ne peut pas être vide.',
  'clientServices.mcp.urlInvalid': 'Saisissez une URL de serveur MCP valide.',
  'clientServices.mcp.toolDescriptionUnavailable': 'Aucune description n’est disponible pour cet outil.',
  'clientServices.projectOverview.commitWithoutMessage': 'Commit sans message',
  'clientRuntime.hunk.parseFailed': 'Impossible d’analyser le code généré.',
  'clientRuntime.messageParser.supabaseOperationInvalid': 'L’opération Supabase n’est pas valide : {operation}',
  'clientRuntime.messageParser.operationUnknown': 'opération inconnue',
  'clientRuntime.messageParser.migrationPathRequired': 'Un filePath est requis pour effectuer une migration Supabase.',
  'clientRuntime.workspace.projectApiAuth':
    'Le service de projet est indisponible, car votre session est absente ou a expiré. Reconnectez-vous, puis rechargez l’IDE.',
  'clientRuntime.workspace.projectApiUnavailable':
    'Le service de projet est indisponible. Démarrez l’environnement local complet avec pnpm run dev, puis rechargez l’IDE.',
  'clientRuntime.workspace.projectApiFailed': 'Le service de projet est temporairement indisponible. Rechargez l’IDE.',
  'clientRuntime.workspace.persistedHydrationSkipped': 'Impossible de charger les fichiers de projet enregistrés.',
  'clientRuntime.workspace.reattached': 'Reconnexion à l’espace de travail en cours d’exécution.',
  'clientRuntime.workspace.previewCleanupSkipped': 'Impossible d’arrêter proprement l’aperçu précédent.',
  'clientRuntime.workspace.cleanupSkipped': 'Impossible de terminer le nettoyage de l’espace de travail.',
  'clientRuntime.workspace.filesAuth':
    'Impossible de charger les fichiers du projet, car votre session est absente ou a expiré. Reconnectez-vous, puis rechargez l’IDE.',
  'clientRuntime.workspace.filesUnavailable':
    'Impossible de charger les fichiers du projet. Démarrez l’environnement local complet avec pnpm run dev afin d’exécuter ensemble l’application web et l’API.',
  'clientRuntime.workspace.filesFailed':
    'Impossible de charger les fichiers du projet. Rechargez l’IDE, puis réessayez.',
  'clientRuntime.workspace.previewAutoStartSkipped': 'Impossible de démarrer automatiquement l’aperçu.',
  'clientRuntime.workspace.filesSynced':
    'Fichiers du projet synchronisés avec l’environnement d’exécution de l’espace de travail.',
  'clientRuntime.workspace.exportFailed': 'Impossible d’exporter l’archive du projet (HTTP {status}).',
  'clientRuntime.workspace.exportEmpty': 'L’archive du projet exportée est vide.',
  'clientRuntime.workspace.startFailed': 'Impossible de démarrer l’espace de travail.',
  'clientRuntime.workspace.quota.generic.warning': 'Quota d’espaces de travail dépassé',
  'clientRuntime.workspace.quota.generic.upgrade':
    'Passez à une offre supérieure pour démarrer davantage d’espaces de travail.',
  'clientRuntime.workspace.quota.activeWorkspaces.warning':
    'Vous avez atteint votre limite d’espaces de travail actifs.',
  'clientRuntime.workspace.quota.activeWorkspaces.upgrade':
    'Passez à une offre supérieure pour démarrer davantage d’espaces de travail actifs.',
  'clientRuntime.workspace.quota.concurrentTerminals.warning':
    'Vous avez atteint votre limite de terminaux simultanés.',
  'clientRuntime.workspace.quota.concurrentTerminals.upgrade':
    'Passez à une offre supérieure pour démarrer davantage de terminaux simultanés.',
  'clientRuntime.artifact.userUpdatedFiles': 'Fichiers modifiés par l’utilisateur',
  'clientRuntime.artifact.shellCommand': 'Commande shell',
  'clientStores.logs.performanceMetric': 'Performances : {component} — {operation} en {duration}\u00a0ms',
  'clientStores.logs.auth.message': 'Authentification : {action} — {result}',
  'clientStores.logs.auth.action.login': 'connexion',
  'clientStores.logs.auth.action.logout': 'déconnexion',
  'clientStores.logs.auth.action.tokenRefresh': 'actualisation du jeton',
  'clientStores.logs.auth.action.keyValidation': 'validation de la clé API',
  'clientStores.logs.result.success': 'Réussite',
  'clientStores.logs.result.failed': 'Échec',
  'clientStores.logs.network.message': 'Réseau : {status}',
  'clientStores.logs.network.status.online': 'en ligne',
  'clientStores.logs.network.status.offline': 'hors ligne',
  'clientStores.logs.network.status.reconnecting': 'reconnexion en cours',
  'clientStores.logs.network.status.connected': 'connecté',
  'clientStores.logs.database.message': 'Base de données : {operation} — {result} ({duration}\u00a0ms)',
  'clientRuntime.format.noFormatter': 'Aucun outil de mise en forme n’est disponible pour {file}.',
  'clientRuntime.starter.untitled': 'Projet sans titre',
  'clientRuntime.starter.templateFetchFailed': 'Impossible de charger le modèle de démarrage (HTTP {status}).',
  'clientRuntime.starter.initializing':
    'E-Code initialise votre projet avec les fichiers requis à partir du modèle {template}.',
  'clientRuntime.starter.initialFilesTitle': 'Créer les fichiers initiaux',
  'clientRuntime.starter.templateInstructions': 'INSTRUCTIONS DU MODÈLE :\n{instructions}\n\n---',
  'clientRuntime.starter.protectedFilesRules':
    'RÈGLES STRICTES D’ACCÈS AUX FICHIERS — LISEZ-LES ATTENTIVEMENT :\n\nLes fichiers suivants sont en LECTURE SEULE et ne doivent jamais être modifiés :\n{files}\n\nActions autorisées :\n✓ Importer ces fichiers comme dépendances\n✓ Lire ces fichiers\n✓ Référencer ces fichiers\n\nActions strictement interdites :\n❌ Modifier le contenu de ces fichiers\n❌ Supprimer ces fichiers\n❌ Renommer ces fichiers\n❌ Déplacer ces fichiers\n❌ Créer de nouvelles versions de ces fichiers\n❌ Suggérer des modifications de ces fichiers\n\nToute tentative de modification de ces fichiers protégés interrompra immédiatement l’opération.\n\nSi vous devez modifier le fonctionnement, créez de nouveaux fichiers au lieu de changer les fichiers protégés répertoriés ci-dessus.\n---',
  'clientRuntime.starter.continueInstructions':
    'L’importation du modèle est terminée. Vous pouvez maintenant utiliser les fichiers importés.\nModifiez uniquement les fichiers qui doivent changer et créez de nouveaux fichiers si nécessaire.\nNE MODIFIEZ PAS LES FICHIERS EXISTANTS DU PROJET QUI N’ONT PAS BESOIN DE CHANGER.\n---\nPoursuivez avec ma requête initiale.\n\nIMPORTANT : installez les dépendances avant d’exécuter l’application avec `npm install && npm run dev`.',
  'clientRuntime.webcontainer.inspectorLoadFailed': 'Impossible de charger l’inspecteur de l’aperçu (HTTP {status}).',
  'clientRuntime.webcontainer.unhandledRejection': 'Rejet de promesse non géré',
  'clientRuntime.webcontainer.uncaughtException': 'Exception non interceptée',
  'clientRuntime.webcontainer.unknownError': 'Une erreur inconnue est survenue dans l’aperçu.',
  'clientRuntime.webcontainer.previewErrorDetails':
    'Erreur de l’aperçu à l’emplacement {location}\nPort : {port}\n\nTrace d’appel :\n{stack}',
};

export function resolveClientStoresServicesLanguage(language?: string | null): ClientStoresServicesLanguage {
  const normalized = normalizeSupportedLanguage(language ?? detectUserLanguage());

  return normalized === 'fr' ? 'fr' : 'en';
}

export function getClientStoresServicesCopy(language?: string | null): ClientStoresServicesCopy {
  return resolveClientStoresServicesLanguage(language) === 'fr' ? clientStoresServicesFr : clientStoresServicesEn;
}

export function formatClientStoresServicesCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function clientStoresServicesText(
  key: ClientStoresServicesKey,
  values: Readonly<Record<string, string | number | bigint>> = {},
  language?: string | null,
): string {
  return formatClientStoresServicesCopy(getClientStoresServicesCopy(language)[key], values);
}
