import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const settingsConnectorsResidualEn = {
  'settingsResidual.apiKey.tokenLabel': 'Access token',
  'settingsResidual.apiKey.help': 'Generate a token',
  'settingsResidual.apiKey.connect': 'Connect {provider} (API key)',
  'settingsResidual.apiKey.formLabel': 'Connect {provider} using an API key',
  'settingsResidual.apiKey.placeholder': 'Paste your {provider} access token',
  'settingsResidual.apiKey.validating': 'Validating…',
  'settingsResidual.apiKey.save': 'Save token',
  'settingsResidual.apiKey.cancel': 'Cancel',
  'settingsResidual.apiKey.connected': 'Connected as {account}',
  'settingsResidual.apiKey.error.validation':
    'The {provider} token could not be validated. Check the token, then try again.',
  'settingsResidual.apiKey.error.network':
    'The {provider} connection could not be completed. Check your network, then try again.',
  'settingsResidual.gitlabOauth.waiting': 'Waiting for GitLab authorization…',
  'settingsResidual.gitlabOauth.connect': 'Connect with GitLab (OAuth)',
  'settingsResidual.gitlabOauth.connected': 'Connected as {account}',
  'settingsResidual.gitlabOauth.error.connection': 'The GitLab OAuth connection could not be completed. Try again.',
  'settingsResidual.gitlabOauth.error.start': 'The GitLab authorization flow could not be started. Try again.',
  'settingsResidual.gitlabOauth.error.popup':
    'The authorization window was blocked. Allow pop-ups for this site and try again.',
  'settingsResidual.githubProfile.label': 'GitHub profile for {account}',
  'settingsResidual.githubProfile.avatarAlt': '{account}’s GitHub avatar',
  'settingsResidual.githubProfile.followers.one': '{count} follower',
  'settingsResidual.githubProfile.followers.other': '{count} followers',
  'settingsResidual.githubProfile.repositories.one': '{count} public repository',
  'settingsResidual.githubProfile.repositories.other': '{count} public repositories',
  'settingsResidual.githubProfile.gists.one': '{count} public gist',
  'settingsResidual.githubProfile.gists.other': '{count} public gists',
  'settingsResidual.state.loading': 'Loading…',
  'settingsResidual.state.error.title': 'Error',
  'settingsResidual.state.error.retry': 'Try again',
  'settingsResidual.state.success.title': 'Success',
  'settingsResidual.state.success.continue': 'Continue',
  'settingsResidual.state.githubRequired.title': 'GitHub connection required',
  'settingsResidual.state.githubRequired.description':
    'Connect your GitHub account to browse repositories, push code, and manage the integration.',
  'settingsResidual.state.githubRequired.action': 'Connect GitHub',
  'settingsResidual.state.information.dismiss': 'Got it',
  'settingsResidual.state.connection.success': 'Connection successful',
  'settingsResidual.state.connection.error': 'Connection failed',
  'settingsResidual.state.connection.testing': 'Testing connection…',
  'settingsResidual.serviceError.title': 'Something went wrong',
  'settingsResidual.serviceError.message':
    'This service is temporarily unavailable. Your settings were not changed. Try again.',
  'settingsResidual.serviceError.details': 'Technical details',
  'settingsResidual.serviceError.code': 'Error code',
  'settingsResidual.serviceError.service': 'Service',
  'settingsResidual.serviceError.operation': 'Operation',
  'settingsResidual.serviceError.retry': 'Try again',
  'settingsResidual.serviceError.dismiss': 'Dismiss',
  'settingsResidual.serviceError.connectionTitle': 'Could not connect to {service}',
  'settingsResidual.serviceError.connectionRetry': 'Retry connection',
  'settingsResidual.serviceHeader.testing': 'Testing…',
  'settingsResidual.serviceHeader.test': 'Test connection',
  'settingsResidual.debug.title': 'Runtime diagnostics',
  'settingsResidual.debug.loading': 'Loading runtime diagnostics…',
  'settingsResidual.debug.empty': 'No active diagnostic issues detected',
  'settingsResidual.debug.summary.one': '{count} issue detected',
  'settingsResidual.debug.summary.other': '{count} issues detected',
  'settingsResidual.debug.loadFailed': 'Runtime diagnostics could not be loaded. Try again.',
  'settingsResidual.debug.retry': 'Try again',
  'settingsResidual.debug.warning': 'Warning',
  'settingsResidual.debug.error': 'Error',
  'settingsResidual.debug.issue.highMemory': 'High memory usage detected',
  'settingsResidual.debug.issue.storageQuota': 'Storage quota is nearly reached',
  'settingsResidual.debug.issue.warning': 'A runtime warning was recorded',
  'settingsResidual.debug.issue.error': 'An application error was recorded',
  'settingsResidual.debug.timestampUnavailable': 'Time unavailable',
  'settingsResidual.branches.invalidRepository': 'Invalid repository name.',
  'settingsResidual.branches.fetchFailed': 'Could not fetch branches.',
} as const;

export type SettingsConnectorsResidualKey = keyof typeof settingsConnectorsResidualEn;
export type SettingsConnectorsResidualCopy = Readonly<Record<SettingsConnectorsResidualKey, string>>;
export type SettingsConnectorsResidualLanguage = 'en' | 'fr';

export const settingsConnectorsResidualFr: SettingsConnectorsResidualCopy = {
  'settingsResidual.apiKey.tokenLabel': 'Jeton d’accès',
  'settingsResidual.apiKey.help': 'Générer un jeton',
  'settingsResidual.apiKey.connect': 'Se connecter à {provider} (clé API)',
  'settingsResidual.apiKey.formLabel': 'Se connecter à {provider} avec une clé API',
  'settingsResidual.apiKey.placeholder': 'Collez votre jeton d’accès {provider}',
  'settingsResidual.apiKey.validating': 'Validation…',
  'settingsResidual.apiKey.save': 'Enregistrer le jeton',
  'settingsResidual.apiKey.cancel': 'Annuler',
  'settingsResidual.apiKey.connected': 'Connecté en tant que {account}',
  'settingsResidual.apiKey.error.validation': 'Impossible de valider le jeton {provider}. Vérifiez-le, puis réessayez.',
  'settingsResidual.apiKey.error.network':
    'Impossible d’établir la connexion à {provider}. Vérifiez votre réseau, puis réessayez.',
  'settingsResidual.gitlabOauth.waiting': 'En attente de l’autorisation GitLab…',
  'settingsResidual.gitlabOauth.connect': 'Se connecter à GitLab (OAuth)',
  'settingsResidual.gitlabOauth.connected': 'Connecté en tant que {account}',
  'settingsResidual.gitlabOauth.error.connection': 'Impossible d’établir la connexion OAuth à GitLab. Réessayez.',
  'settingsResidual.gitlabOauth.error.start': 'Impossible de lancer l’autorisation GitLab. Réessayez.',
  'settingsResidual.gitlabOauth.error.popup':
    'La fenêtre d’autorisation a été bloquée. Autorisez les fenêtres contextuelles pour ce site, puis réessayez.',
  'settingsResidual.githubProfile.label': 'Profil GitHub de {account}',
  'settingsResidual.githubProfile.avatarAlt': 'Avatar GitHub de {account}',
  'settingsResidual.githubProfile.followers.one': '{count} abonné',
  'settingsResidual.githubProfile.followers.other': '{count} abonnés',
  'settingsResidual.githubProfile.repositories.one': '{count} dépôt public',
  'settingsResidual.githubProfile.repositories.other': '{count} dépôts publics',
  'settingsResidual.githubProfile.gists.one': '{count} gist public',
  'settingsResidual.githubProfile.gists.other': '{count} gists publics',
  'settingsResidual.state.loading': 'Chargement…',
  'settingsResidual.state.error.title': 'Erreur',
  'settingsResidual.state.error.retry': 'Réessayer',
  'settingsResidual.state.success.title': 'Opération réussie',
  'settingsResidual.state.success.continue': 'Continuer',
  'settingsResidual.state.githubRequired.title': 'Connexion GitHub requise',
  'settingsResidual.state.githubRequired.description':
    'Connectez votre compte GitHub pour parcourir vos dépôts, pousser du code et gérer l’intégration.',
  'settingsResidual.state.githubRequired.action': 'Se connecter à GitHub',
  'settingsResidual.state.information.dismiss': 'Compris',
  'settingsResidual.state.connection.success': 'Connexion réussie',
  'settingsResidual.state.connection.error': 'Échec de la connexion',
  'settingsResidual.state.connection.testing': 'Test de la connexion…',
  'settingsResidual.serviceError.title': 'Une erreur est survenue',
  'settingsResidual.serviceError.message':
    'Ce service est temporairement indisponible. Vos paramètres n’ont pas été modifiés. Réessayez.',
  'settingsResidual.serviceError.details': 'Détails techniques',
  'settingsResidual.serviceError.code': 'Code d’erreur',
  'settingsResidual.serviceError.service': 'Service',
  'settingsResidual.serviceError.operation': 'Opération',
  'settingsResidual.serviceError.retry': 'Réessayer',
  'settingsResidual.serviceError.dismiss': 'Fermer',
  'settingsResidual.serviceError.connectionTitle': 'Impossible de se connecter à {service}',
  'settingsResidual.serviceError.connectionRetry': 'Réessayer la connexion',
  'settingsResidual.serviceHeader.testing': 'Test en cours…',
  'settingsResidual.serviceHeader.test': 'Tester la connexion',
  'settingsResidual.debug.title': 'Diagnostics de l’environnement d’exécution',
  'settingsResidual.debug.loading': 'Chargement des diagnostics de l’environnement d’exécution…',
  'settingsResidual.debug.empty': 'Aucun problème de diagnostic actif détecté',
  'settingsResidual.debug.summary.one': '{count} problème détecté',
  'settingsResidual.debug.summary.other': '{count} problèmes détectés',
  'settingsResidual.debug.loadFailed':
    'Impossible de charger les diagnostics de l’environnement d’exécution. Réessayez.',
  'settingsResidual.debug.retry': 'Réessayer',
  'settingsResidual.debug.warning': 'Avertissement',
  'settingsResidual.debug.error': 'Erreur',
  'settingsResidual.debug.issue.highMemory': 'Utilisation élevée de la mémoire détectée',
  'settingsResidual.debug.issue.storageQuota': 'Le quota de stockage est presque atteint',
  'settingsResidual.debug.issue.warning': 'Un avertissement de l’environnement d’exécution a été enregistré',
  'settingsResidual.debug.issue.error': 'Une erreur de l’application a été enregistrée',
  'settingsResidual.debug.timestampUnavailable': 'Heure indisponible',
  'settingsResidual.branches.invalidRepository': 'Nom de dépôt non valide.',
  'settingsResidual.branches.fetchFailed': 'Impossible de récupérer les branches.',
};

export function resolveSettingsConnectorsResidualLanguage(
  language?: string | null,
): SettingsConnectorsResidualLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getSettingsConnectorsResidualCopy(language?: string | null): SettingsConnectorsResidualCopy {
  return resolveSettingsConnectorsResidualLanguage(language) === 'fr'
    ? settingsConnectorsResidualFr
    : settingsConnectorsResidualEn;
}

export function formatSettingsConnectorsResidualCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatSettingsConnectorsResidualNumber(value: number, language?: string | null): string {
  const locale = resolveSettingsConnectorsResidualLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale).format(value);
}

export function formatSettingsConnectorsResidualDateTime(
  value: string | number | Date,
  language?: string | null,
): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const locale = resolveSettingsConnectorsResidualLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export type GitHubProfileMetric = 'followers' | 'repositories' | 'gists';

export function formatGitHubProfileMetric(
  metric: GitHubProfileMetric,
  count: number,
  language?: string | null,
): string {
  const resolvedLanguage = resolveSettingsConnectorsResidualLanguage(language);
  const copy = getSettingsConnectorsResidualCopy(resolvedLanguage);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const suffix = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';

  return formatSettingsConnectorsResidualCopy(copy[`settingsResidual.githubProfile.${metric}.${suffix}`], {
    count: formatSettingsConnectorsResidualNumber(count, resolvedLanguage),
  });
}

export function formatDebugIssueSummary(count: number, language?: string | null): string {
  const resolvedLanguage = resolveSettingsConnectorsResidualLanguage(language);
  const copy = getSettingsConnectorsResidualCopy(resolvedLanguage);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const suffix = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';

  return formatSettingsConnectorsResidualCopy(copy[`settingsResidual.debug.summary.${suffix}`], {
    count: formatSettingsConnectorsResidualNumber(count, resolvedLanguage),
  });
}

export function getSafeDebugIssueMessage(
  issue: { id: string; type: 'warning' | 'error' },
  language?: string | null,
): string {
  const copy = getSettingsConnectorsResidualCopy(language);

  if (issue.id === 'high-memory-usage') {
    return copy['settingsResidual.debug.issue.highMemory'];
  }

  if (issue.id === 'storage-quota-warning') {
    return copy['settingsResidual.debug.issue.storageQuota'];
  }

  return copy[`settingsResidual.debug.issue.${issue.type}`];
}
