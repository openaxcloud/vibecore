import { detectUserLanguage, normalizeSupportedLanguage } from '~/lib/i18n/language';

export const clientRuntimeResidualEn = {
  'clientRuntime.connection.savedLoadFailed': 'Could not load the saved connection.',
  'clientRuntime.connection.tokenRequired': 'Enter an access token to continue.',
  'clientRuntime.connection.connected': 'Connected to {provider}.',
  'clientRuntime.connection.connectedAs': 'Connected to {provider} as {account}.',
  'clientRuntime.connection.failed':
    'Could not connect to {provider}. Check your credentials and network, then try again.',
  'clientRuntime.connection.disconnected': 'Disconnected from {provider}.',
  'clientRuntime.connection.noneToRefresh': 'There is no {provider} connection to refresh.',
  'clientRuntime.connection.refreshFailed': 'Could not refresh the {provider} connection. Try again.',
  'clientRuntime.connection.statsUnavailable': 'Connect to {provider} before refreshing statistics.',
  'clientRuntime.connection.statsFetchFailed': 'Could not load {provider} statistics. Try again.',
  'clientRuntime.connection.statsUpdated': '{provider} statistics updated.',
  'clientRuntime.connection.statsUpdateFailed': 'Could not update {provider} statistics. Try again.',
  'clientRuntime.connection.repositoriesFetchFailed': 'Could not load {provider} repositories. Try again.',
  'clientRuntime.connection.authenticationRequired': 'Reconnect your {provider} account to continue.',
  'clientRuntime.connection.apiUnavailable': 'The {provider} service is temporarily unavailable. Try again.',
  'clientRuntime.connection.alreadyInProgress': 'A {provider} connection is already in progress.',
  'clientRuntime.connection.authenticationFailed':
    'Could not authenticate with {provider}. Check your credentials, then try again.',
  'clientRuntime.connection.tokenExpired': 'Your {provider} token has expired. Reconnect your account.',
  'clientRuntime.connection.autoConnectedAs': 'Automatically connected to {provider} as {account}.',
  'clientRuntime.connection.autoConnectionFailed': 'Could not connect automatically to {provider}.',
  'clientRuntime.connection.environmentTokenMissing': 'No {provider} token is configured for this environment.',
  'clientRuntime.connection.savedDataInvalid': 'The saved {provider} connection is invalid.',
  'clientRuntime.connection.initializationFailed': 'Could not initialize the {provider} connection.',
  'clientRuntime.connection.projectsFetchFailed': 'Could not load {provider} projects. Try again.',
  'clientRuntime.connection.apiKeysFetchFailed': 'Could not load the project API keys. Try again.',
  'clientRuntime.connection.fallbackProjectName': 'Project {identifier}',
  'clientRuntime.connectionTest.testing': 'Testing connection…',
  'clientRuntime.connectionTest.connected': 'Connected successfully to {service}.',
  'clientRuntime.connectionTest.connectedAs': 'Connected successfully to {service} as {account}.',
  'clientRuntime.connectionTest.failed':
    'Could not connect to {service}. Check your credentials and network, then try again.',
  'clientRuntime.promptEnhancer.failed': 'Could not enhance the prompt. Try again.',
  'clientRuntime.promptEnhancer.success': 'Prompt enhanced.',
  'clientRuntime.shortcuts.toggleTheme': 'Toggle theme',
  'clientRuntime.shortcuts.toggleTerminal': 'Toggle terminal',
  'clientRuntime.chatTitle.inputLabel': 'Chat title',
  'clientRuntime.chatTitle.save': 'Save title',
  'clientRuntime.chatTitle.rename': 'Rename chat',
  'clientRuntime.connector.callbackIncomplete':
    '{provider} did not return the information required to complete the connection. Try again.',
  'clientRuntime.connector.popupBlocked':
    'The authorization window was blocked. Allow pop-ups for this site, then try again.',
  'clientRuntime.connector.popupClosed': 'You closed the authorization window before completing the connection.',
  'clientRuntime.connector.failed': 'Could not complete the {provider} connection. Try again.',
  'clientRuntime.share.createFailed': 'Could not create the share link. Try again.',
  'clientRuntime.share.invalidResponse': 'The share link could not be created. Try again.',
  'clientRuntime.share.clipboardUnavailable': 'Clipboard access is unavailable in this browser.',
  'clientRuntime.share.copyFailed': 'Could not copy the share link. Copy it manually instead.',
  'clientRuntime.mcp.applySavedFailed': 'Could not apply the saved MCP configuration. Review it, then try again.',
  'clientRuntime.mcp.updateInProgress': 'An MCP configuration update is already in progress. Try again shortly.',
  'clientRuntime.mcp.updateFailed': 'Could not update the MCP configuration. Review it, then try again.',
  'clientRuntime.mcp.availabilityFailed': 'Could not check the availability of the MCP servers. Try again.',
  'clientRuntime.debug.highMemory': 'High memory usage detected',
  'clientRuntime.debug.storageQuota': 'Storage quota is nearly reached',
  'clientRuntime.debug.recordedError': 'An application error was recorded',
  'clientRuntime.debug.latestCommit': 'Latest commit',
  'clientRuntime.debug.networkError': 'Network error',
  'clientRuntime.debug.unhandledRejection': 'Unhandled promise rejection',
  'clientRuntime.debugReport.summaryHeader': '{brand} debug log summary',
  'clientRuntime.debugReport.detailsHeader': 'Detailed debug data',
  'clientRuntime.debugReport.generated': 'Generated: {date}',
  'clientRuntime.debugReport.sessionId': 'Session ID: {value}',
  'clientRuntime.debugReport.systemInformation': 'System information',
  'clientRuntime.debugReport.platform': 'Platform: {value}',
  'clientRuntime.debugReport.browser': 'Browser: {value}',
  'clientRuntime.debugReport.screen': 'Screen: {value}',
  'clientRuntime.debugReport.mobile': 'Mobile: {value}',
  'clientRuntime.debugReport.timezone': 'Time zone: {value}',
  'clientRuntime.debugReport.applicationInformation': 'Application information',
  'clientRuntime.debugReport.version': 'Version: {value}',
  'clientRuntime.debugReport.currentModel': 'Current model: {value}',
  'clientRuntime.debugReport.currentProvider': 'Current provider: {value}',
  'clientRuntime.debugReport.projectType': 'Project type: {value}',
  'clientRuntime.debugReport.workbenchView': 'Workbench view: {value}',
  'clientRuntime.debugReport.activePreview': 'Active preview: {value}',
  'clientRuntime.debugReport.unsavedFiles': 'Unsaved files: {value}',
  'clientRuntime.debugReport.gitInformation': 'Git information',
  'clientRuntime.debugReport.branch': 'Branch: {value}',
  'clientRuntime.debugReport.commit': 'Commit: {value}',
  'clientRuntime.debugReport.workingDirectory': 'Working directory: {value}',
  'clientRuntime.debugReport.remote': 'Remote: {value}',
  'clientRuntime.debugReport.lastCommit': 'Last commit: {value}',
  'clientRuntime.debugReport.gitUnavailable': 'Git information is unavailable',
  'clientRuntime.debugReport.sessionStatistics': 'Session statistics',
  'clientRuntime.debugReport.totalLogs': 'Total logs: {value}',
  'clientRuntime.debugReport.errors': 'Errors: {value}',
  'clientRuntime.debugReport.networkRequests': 'Network requests: {value}',
  'clientRuntime.debugReport.userActions': 'User actions: {value}',
  'clientRuntime.debugReport.terminalLogs': 'Terminal logs: {value}',
  'clientRuntime.debugReport.recentAlerts': 'Recent alerts',
  'clientRuntime.debugReport.performance': 'Performance',
  'clientRuntime.debugReport.pageLoadTime': 'Page load time: {value}',
  'clientRuntime.debugReport.domContentLoaded': 'DOM content loaded: {value}',
  'clientRuntime.debugReport.memoryUsage': 'Memory usage: {value}',
  'clientRuntime.debugReport.workbenchState': 'Workbench state',
  'clientRuntime.debugReport.currentView': 'Current view: {value}',
  'clientRuntime.debugReport.showWorkbench': 'Show workbench: {value}',
  'clientRuntime.debugReport.showTerminal': 'Show terminal: {value}',
  'clientRuntime.debugReport.artifacts': 'Artifacts: {value}',
  'clientRuntime.debugReport.files': 'Files: {value}',
  'clientRuntime.debugReport.yes': 'Yes',
  'clientRuntime.debugReport.no': 'No',
  'clientRuntime.debugReport.clean': 'Clean',
  'clientRuntime.debugReport.dirty': 'Dirty',
  'clientRuntime.debugReport.notAvailable': 'Not available',
  'clientRuntime.debugReport.milliseconds': '{value} ms',
  'clientRuntime.debugReport.megabytes': '{value} MB',
  'clientRuntime.promptValidation.empty': 'Describe the project you want to create.',
  'clientRuntime.promptValidation.tooShort_one':
    'Add a little more detail — at least {minimum} word helps the agent build the right thing.',
  'clientRuntime.promptValidation.tooShort_other':
    'Add a little more detail — at least {minimum} words help the agent build the right thing.',
  'clientRuntime.promptValidation.tooLong':
    'Shorten your prompt to {maximum} characters or fewer (currently {current}).',
  'clientRuntime.promptValidation.tooManyLines':
    'Your brief has {current} lines. Keep it to {maximum} lines or fewer, and add long documents to the project instead.',
  'clientRuntime.promptValidation.nonPrintable': 'Invisible or control characters were removed from your prompt.',
  'clientRuntime.promptValidation.injection':
    'Your prompt contains wording commonly used to bypass safety controls. Rephrase it unless this wording is intentional.',
  'clientRuntime.undo.failed_one': 'Could not undo one change. The file may have been modified or locked.',
  'clientRuntime.undo.failed_other': 'Could not undo {count} changes. Some files may have been modified or locked.',
  'clientRuntime.undo.failedGeneric': 'Could not undo the changes.',
} as const;

export type ClientRuntimeResidualKey = keyof typeof clientRuntimeResidualEn;
export type ClientRuntimeResidualCopy = Readonly<Record<ClientRuntimeResidualKey, string>>;
export type ClientRuntimeResidualLanguage = 'en' | 'fr';

export const clientRuntimeResidualFr: ClientRuntimeResidualCopy = {
  'clientRuntime.connection.savedLoadFailed': 'Impossible de charger la connexion enregistrée.',
  'clientRuntime.connection.tokenRequired': 'Saisissez un jeton d’accès pour continuer.',
  'clientRuntime.connection.connected': 'Connexion à {provider} établie.',
  'clientRuntime.connection.connectedAs': 'Connexion à {provider} établie en tant que {account}.',
  'clientRuntime.connection.failed':
    'Impossible de se connecter à {provider}. Vérifiez vos identifiants et votre réseau, puis réessayez.',
  'clientRuntime.connection.disconnected': 'Déconnexion de {provider} effectuée.',
  'clientRuntime.connection.noneToRefresh': 'Aucune connexion à {provider} ne peut être actualisée.',
  'clientRuntime.connection.refreshFailed': 'Impossible d’actualiser la connexion à {provider}. Réessayez.',
  'clientRuntime.connection.statsUnavailable': 'Connectez-vous à {provider} avant d’actualiser les statistiques.',
  'clientRuntime.connection.statsFetchFailed': 'Impossible de charger les statistiques {provider}. Réessayez.',
  'clientRuntime.connection.statsUpdated': 'Statistiques {provider} mises à jour.',
  'clientRuntime.connection.statsUpdateFailed': 'Impossible de mettre à jour les statistiques {provider}. Réessayez.',
  'clientRuntime.connection.repositoriesFetchFailed': 'Impossible de charger les dépôts {provider}. Réessayez.',
  'clientRuntime.connection.authenticationRequired': 'Reconnectez votre compte {provider} pour continuer.',
  'clientRuntime.connection.apiUnavailable': 'Le service {provider} est temporairement indisponible. Réessayez.',
  'clientRuntime.connection.alreadyInProgress': 'Une connexion à {provider} est déjà en cours.',
  'clientRuntime.connection.authenticationFailed':
    'Impossible de vous authentifier auprès de {provider}. Vérifiez vos identifiants, puis réessayez.',
  'clientRuntime.connection.tokenExpired': 'Votre jeton {provider} a expiré. Reconnectez votre compte.',
  'clientRuntime.connection.autoConnectedAs': 'Connexion automatique à {provider} établie en tant que {account}.',
  'clientRuntime.connection.autoConnectionFailed': 'Impossible de se connecter automatiquement à {provider}.',
  'clientRuntime.connection.environmentTokenMissing': 'Aucun jeton {provider} n’est configuré pour cet environnement.',
  'clientRuntime.connection.savedDataInvalid': 'La connexion {provider} enregistrée n’est pas valide.',
  'clientRuntime.connection.initializationFailed': 'Impossible d’initialiser la connexion à {provider}.',
  'clientRuntime.connection.projectsFetchFailed': 'Impossible de charger les projets {provider}. Réessayez.',
  'clientRuntime.connection.apiKeysFetchFailed': 'Impossible de charger les clés API du projet. Réessayez.',
  'clientRuntime.connection.fallbackProjectName': 'Projet {identifier}',
  'clientRuntime.connectionTest.testing': 'Test de la connexion…',
  'clientRuntime.connectionTest.connected': 'Connexion à {service} établie.',
  'clientRuntime.connectionTest.connectedAs': 'Connexion à {service} établie en tant que {account}.',
  'clientRuntime.connectionTest.failed':
    'Impossible de se connecter à {service}. Vérifiez vos identifiants et votre réseau, puis réessayez.',
  'clientRuntime.promptEnhancer.failed': 'Impossible d’améliorer le prompt. Réessayez.',
  'clientRuntime.promptEnhancer.success': 'Prompt amélioré.',
  'clientRuntime.shortcuts.toggleTheme': 'Changer de thème',
  'clientRuntime.shortcuts.toggleTerminal': 'Afficher ou masquer le terminal',
  'clientRuntime.chatTitle.inputLabel': 'Titre de la discussion',
  'clientRuntime.chatTitle.save': 'Enregistrer le titre',
  'clientRuntime.chatTitle.rename': 'Renommer la discussion',
  'clientRuntime.connector.callbackIncomplete':
    '{provider} n’a pas renvoyé les informations nécessaires pour terminer la connexion. Réessayez.',
  'clientRuntime.connector.popupBlocked':
    'La fenêtre d’autorisation a été bloquée. Autorisez les fenêtres contextuelles pour ce site, puis réessayez.',
  'clientRuntime.connector.popupClosed':
    'Vous avez fermé la fenêtre d’autorisation avant d’avoir terminé la connexion.',
  'clientRuntime.connector.failed': 'Impossible de terminer la connexion à {provider}. Réessayez.',
  'clientRuntime.share.createFailed': 'Impossible de créer le lien de partage. Réessayez.',
  'clientRuntime.share.invalidResponse': 'Impossible de créer le lien de partage. Réessayez.',
  'clientRuntime.share.clipboardUnavailable': 'L’accès au presse-papiers n’est pas disponible dans ce navigateur.',
  'clientRuntime.share.copyFailed': 'Impossible de copier le lien de partage. Copiez-le manuellement à la place.',
  'clientRuntime.mcp.applySavedFailed':
    'Impossible d’appliquer la configuration MCP enregistrée. Vérifiez-la, puis réessayez.',
  'clientRuntime.mcp.updateInProgress':
    'Une mise à jour de la configuration MCP est déjà en cours. Réessayez dans quelques instants.',
  'clientRuntime.mcp.updateFailed': 'Impossible de mettre à jour la configuration MCP. Vérifiez-la, puis réessayez.',
  'clientRuntime.mcp.availabilityFailed': 'Impossible de vérifier la disponibilité des serveurs MCP. Réessayez.',
  'clientRuntime.debug.highMemory': 'Utilisation élevée de la mémoire détectée',
  'clientRuntime.debug.storageQuota': 'Le quota de stockage est presque atteint',
  'clientRuntime.debug.recordedError': 'Une erreur de l’application a été enregistrée',
  'clientRuntime.debug.latestCommit': 'Dernier commit',
  'clientRuntime.debug.networkError': 'Erreur réseau',
  'clientRuntime.debug.unhandledRejection': 'Rejet de promesse non géré',
  'clientRuntime.debugReport.summaryHeader': 'Synthèse du journal de diagnostic {brand}',
  'clientRuntime.debugReport.detailsHeader': 'Données de diagnostic détaillées',
  'clientRuntime.debugReport.generated': 'Généré le : {date}',
  'clientRuntime.debugReport.sessionId': 'Identifiant de session : {value}',
  'clientRuntime.debugReport.systemInformation': 'Informations système',
  'clientRuntime.debugReport.platform': 'Plateforme : {value}',
  'clientRuntime.debugReport.browser': 'Navigateur : {value}',
  'clientRuntime.debugReport.screen': 'Écran : {value}',
  'clientRuntime.debugReport.mobile': 'Appareil mobile : {value}',
  'clientRuntime.debugReport.timezone': 'Fuseau horaire : {value}',
  'clientRuntime.debugReport.applicationInformation': 'Informations sur l’application',
  'clientRuntime.debugReport.version': 'Version : {value}',
  'clientRuntime.debugReport.currentModel': 'Modèle actuel : {value}',
  'clientRuntime.debugReport.currentProvider': 'Fournisseur actuel : {value}',
  'clientRuntime.debugReport.projectType': 'Type de projet : {value}',
  'clientRuntime.debugReport.workbenchView': 'Vue de l’espace de travail : {value}',
  'clientRuntime.debugReport.activePreview': 'Aperçu actif : {value}',
  'clientRuntime.debugReport.unsavedFiles': 'Fichiers non enregistrés : {value}',
  'clientRuntime.debugReport.gitInformation': 'Informations Git',
  'clientRuntime.debugReport.branch': 'Branche : {value}',
  'clientRuntime.debugReport.commit': 'Commit : {value}',
  'clientRuntime.debugReport.workingDirectory': 'Répertoire de travail : {value}',
  'clientRuntime.debugReport.remote': 'Dépôt distant : {value}',
  'clientRuntime.debugReport.lastCommit': 'Dernier commit : {value}',
  'clientRuntime.debugReport.gitUnavailable': 'Les informations Git ne sont pas disponibles',
  'clientRuntime.debugReport.sessionStatistics': 'Statistiques de la session',
  'clientRuntime.debugReport.totalLogs': 'Nombre total de journaux : {value}',
  'clientRuntime.debugReport.errors': 'Erreurs : {value}',
  'clientRuntime.debugReport.networkRequests': 'Requêtes réseau : {value}',
  'clientRuntime.debugReport.userActions': 'Actions utilisateur : {value}',
  'clientRuntime.debugReport.terminalLogs': 'Journaux du terminal : {value}',
  'clientRuntime.debugReport.recentAlerts': 'Alertes récentes',
  'clientRuntime.debugReport.performance': 'Performances',
  'clientRuntime.debugReport.pageLoadTime': 'Temps de chargement de la page : {value}',
  'clientRuntime.debugReport.domContentLoaded': 'Chargement du contenu DOM : {value}',
  'clientRuntime.debugReport.memoryUsage': 'Utilisation de la mémoire : {value}',
  'clientRuntime.debugReport.workbenchState': 'État de l’espace de travail',
  'clientRuntime.debugReport.currentView': 'Vue actuelle : {value}',
  'clientRuntime.debugReport.showWorkbench': 'Espace de travail affiché : {value}',
  'clientRuntime.debugReport.showTerminal': 'Terminal affiché : {value}',
  'clientRuntime.debugReport.artifacts': 'Artefacts : {value}',
  'clientRuntime.debugReport.files': 'Fichiers : {value}',
  'clientRuntime.debugReport.yes': 'Oui',
  'clientRuntime.debugReport.no': 'Non',
  'clientRuntime.debugReport.clean': 'Propre',
  'clientRuntime.debugReport.dirty': 'Modifié',
  'clientRuntime.debugReport.notAvailable': 'Non disponible',
  'clientRuntime.debugReport.milliseconds': '{value}\u00a0ms',
  'clientRuntime.debugReport.megabytes': '{value}\u00a0Mo',
  'clientRuntime.promptValidation.empty': 'Décrivez le projet que vous souhaitez créer.',
  'clientRuntime.promptValidation.tooShort_one':
    'Ajoutez un peu de détail : au moins {minimum} mot aidera l’agent à produire le bon résultat.',
  'clientRuntime.promptValidation.tooShort_other':
    'Ajoutez un peu de détail : au moins {minimum} mots aideront l’agent à produire le bon résultat.',
  'clientRuntime.promptValidation.tooLong':
    'Raccourcissez votre prompt à {maximum} caractères maximum (actuellement {current}).',
  'clientRuntime.promptValidation.tooManyLines':
    'Votre brief comporte {current} lignes. Limitez-le à {maximum} lignes et ajoutez plutôt les documents longs au projet.',
  'clientRuntime.promptValidation.nonPrintable':
    'Les caractères invisibles ou de contrôle ont été supprimés de votre prompt.',
  'clientRuntime.promptValidation.injection':
    'Votre prompt contient une formulation souvent utilisée pour contourner les protections. Reformulez-la, sauf si elle est intentionnelle.',
  'clientRuntime.undo.failed_one':
    'Impossible d’annuler une modification. Le fichier a peut-être été modifié ou verrouillé.',
  'clientRuntime.undo.failed_other':
    'Impossible d’annuler {count} modifications. Certains fichiers ont peut-être été modifiés ou verrouillés.',
  'clientRuntime.undo.failedGeneric': 'Impossible d’annuler les modifications.',
};

export function resolveClientRuntimeResidualLanguage(language?: string | null): ClientRuntimeResidualLanguage {
  const normalized = normalizeSupportedLanguage(language ?? detectUserLanguage());

  return normalized === 'fr' ? 'fr' : 'en';
}

export function getClientRuntimeResidualCopy(language?: string | null): ClientRuntimeResidualCopy {
  return resolveClientRuntimeResidualLanguage(language) === 'fr' ? clientRuntimeResidualFr : clientRuntimeResidualEn;
}

export function formatClientRuntimeResidualCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatClientRuntimeResidualNumber(
  value: number,
  language?: string | null,
  options?: Intl.NumberFormatOptions,
): string {
  const locale = resolveClientRuntimeResidualLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatClientRuntimeResidualDateTime(value: Date | string | number, language?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getClientRuntimeResidualCopy(language)['clientRuntime.debugReport.notAvailable'];
  }

  const locale = resolveClientRuntimeResidualLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

export function formatClientRuntimeUndoFailure(count: number, language?: string | null): string {
  const copy = getClientRuntimeResidualCopy(language);

  const key =
    new Intl.PluralRules(resolveClientRuntimeResidualLanguage(language)).select(count) === 'one'
      ? 'clientRuntime.undo.failed_one'
      : 'clientRuntime.undo.failed_other';

  return formatClientRuntimeResidualCopy(copy[key], {
    count: formatClientRuntimeResidualNumber(count, language),
  });
}

export function getClientRuntimeConnectorError(
  errorCode: string | undefined,
  provider: string,
  language?: string | null,
): string {
  const copy = getClientRuntimeResidualCopy(language);

  const key =
    errorCode === 'CALLBACK_PAYLOAD_INCOMPLETE'
      ? 'clientRuntime.connector.callbackIncomplete'
      : errorCode === 'POPUP_BLOCKED'
        ? 'clientRuntime.connector.popupBlocked'
        : errorCode === 'POPUP_CLOSED'
          ? 'clientRuntime.connector.popupClosed'
          : 'clientRuntime.connector.failed';

  return formatClientRuntimeResidualCopy(copy[key], { provider });
}
