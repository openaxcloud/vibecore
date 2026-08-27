import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const githubTabEn = {
  'githubTab.title': 'GitHub Integration',
  'githubTab.loading.connection': 'Checking GitHub connection…',
  'githubTab.connection.errorTitle': 'Connection Error',
  'githubTab.connection.errorMessage': 'The GitHub connection could not be loaded. Please try again.',
  'githubTab.connection.reload': 'Reload Page',
  'githubTab.connection.disconnectedDescription':
    'Connect your GitHub account to enable advanced repository management features, statistics, and seamless integration.',
  'githubTab.connection.connectedDescription':
    'Manage your GitHub integration with advanced repository features and comprehensive statistics.',
  'githubTab.refreshing': 'Refreshing…',
  'githubTab.rateLimit': 'API: {remaining}/{limit}',
  'githubTab.test.noConnection': 'No connection established',
  'githubTab.test.testing': 'Testing connection…',
  'githubTab.test.success': 'Connected successfully as {username}',
  'githubTab.test.failed': 'Connection test failed. Please try again.',
  'githubTab.test.withTimestamp': '{message} · {date}',
  'githubTab.repositories.heading.one': 'Repository ({count})',
  'githubTab.repositories.heading.other': 'All Repositories ({count})',
  'githubTab.repositories.showFewer': 'Show fewer repositories',
  'githubTab.repositories.showMore.one': 'Show {count} more repository',
  'githubTab.repositories.showMore.other': 'Show {count} more repositories',
  'githubTab.repositories.emptyTitle': 'No repositories found',
  'githubTab.repositories.emptyDescription':
    'This account has no repositories visible to E-Code yet. Create a repository on GitHub, or check that your token grants access to the repositories you expect.',
  'githubTab.stats.errorTitle': 'Failed to Load Statistics',
  'githubTab.stats.errorMessage': 'GitHub statistics could not be loaded. Please try again.',
  'githubTab.stats.retry': 'Retry',
  'githubTab.cache.title': 'GitHub cache management',
  'githubTab.cache.refresh': 'Refresh cache information',
  'githubTab.cache.loading': 'Loading GitHub cache information…',
  'githubTab.cache.errorTitle': 'Cache information could not be loaded',
  'githubTab.cache.errorDescription':
    'GitHub cache information is temporarily unavailable. Check browser storage access and try again.',
  'githubTab.cache.retry': 'Try again',
  'githubTab.cache.stats.totalSize': 'Total size',
  'githubTab.cache.stats.entries': 'Entries',
  'githubTab.cache.stats.oldest': 'Oldest',
  'githubTab.cache.stats.status': 'Status',
  'githubTab.cache.stats.active': 'Active',
  'githubTab.cache.stats.empty': 'Empty',
  'githubTab.cache.notAvailable': 'Not available',
  'githubTab.cache.entriesHeading.one': 'Cache entry ({count})',
  'githubTab.cache.entriesHeading.other': 'Cache entries ({count})',
  'githubTab.cache.emptyTitle': 'The GitHub cache is empty',
  'githubTab.cache.emptyDescription': 'Cached GitHub data will appear here after it is stored by E-Code.',
  'githubTab.cache.entry.remove': 'Remove {key} from the cache',
  'githubTab.cache.actions.clearExpired': 'Clear expired entries',
  'githubTab.cache.actions.compact': 'Compact cache',
  'githubTab.cache.actions.clearAll': 'Clear all cache data',
  'githubTab.cache.feedback.clearedAll': 'Cache cleared successfully at {time}.',
  'githubTab.cache.feedback.clearedExpired.none': 'No expired cache entries were found.',
  'githubTab.cache.feedback.clearedExpired.one': 'Removed {count} expired cache entry.',
  'githubTab.cache.feedback.clearedExpired.other': 'Removed {count} expired cache entries.',
  'githubTab.cache.feedback.compacted': 'The GitHub cache was compacted successfully.',
  'githubTab.cache.feedback.removedEntry': 'Removed {key} from the cache.',
  'githubTab.cache.feedback.error': 'The cache operation could not be completed. Please try again.',
} as const;

export type GitHubTabKey = keyof typeof githubTabEn;
export type GitHubTabCopy = Readonly<Record<GitHubTabKey, string>>;
export type GitHubTabPluralCopy = Readonly<{ one: string; other: string }>;

export const githubTabFr: GitHubTabCopy = {
  'githubTab.title': 'Intégration GitHub',
  'githubTab.loading.connection': 'Vérification de la connexion GitHub…',
  'githubTab.connection.errorTitle': 'Erreur de connexion',
  'githubTab.connection.errorMessage': 'Impossible de charger la connexion GitHub. Veuillez réessayer.',
  'githubTab.connection.reload': 'Recharger la page',
  'githubTab.connection.disconnectedDescription':
    'Connectez votre compte GitHub pour bénéficier de fonctions avancées de gestion des dépôts, de statistiques et d’une intégration fluide.',
  'githubTab.connection.connectedDescription':
    'Gérez votre intégration GitHub, ses fonctions avancées de dépôt et ses statistiques détaillées.',
  'githubTab.refreshing': 'Actualisation…',
  'githubTab.rateLimit': 'API : {remaining}/{limit}',
  'githubTab.test.noConnection': 'Aucune connexion établie',
  'githubTab.test.testing': 'Test de la connexion…',
  'githubTab.test.success': 'Connexion réussie avec le compte {username}',
  'githubTab.test.failed': 'Échec du test de connexion. Veuillez réessayer.',
  'githubTab.test.withTimestamp': '{message} · {date}',
  'githubTab.repositories.heading.one': 'Dépôt ({count})',
  'githubTab.repositories.heading.other': 'Tous les dépôts ({count})',
  'githubTab.repositories.showFewer': 'Afficher moins de dépôts',
  'githubTab.repositories.showMore.one': 'Afficher {count} dépôt supplémentaire',
  'githubTab.repositories.showMore.other': 'Afficher {count} dépôts supplémentaires',
  'githubTab.repositories.emptyTitle': 'Aucun dépôt trouvé',
  'githubTab.repositories.emptyDescription':
    'Ce compte ne contient encore aucun dépôt visible par E-Code. Créez un dépôt sur GitHub ou vérifiez que votre jeton donne accès aux dépôts attendus.',
  'githubTab.stats.errorTitle': 'Impossible de charger les statistiques',
  'githubTab.stats.errorMessage': 'Impossible de charger les statistiques GitHub. Veuillez réessayer.',
  'githubTab.stats.retry': 'Réessayer',
  'githubTab.cache.title': 'Gestion du cache GitHub',
  'githubTab.cache.refresh': 'Actualiser les informations du cache',
  'githubTab.cache.loading': 'Chargement des informations du cache GitHub…',
  'githubTab.cache.errorTitle': 'Impossible de charger les informations du cache',
  'githubTab.cache.errorDescription':
    'Les informations du cache GitHub sont temporairement indisponibles. Vérifiez l’accès au stockage du navigateur, puis réessayez.',
  'githubTab.cache.retry': 'Réessayer',
  'githubTab.cache.stats.totalSize': 'Taille totale',
  'githubTab.cache.stats.entries': 'Entrées',
  'githubTab.cache.stats.oldest': 'Plus ancienne',
  'githubTab.cache.stats.status': 'État',
  'githubTab.cache.stats.active': 'Actif',
  'githubTab.cache.stats.empty': 'Vide',
  'githubTab.cache.notAvailable': 'Indisponible',
  'githubTab.cache.entriesHeading.one': 'Entrée en cache ({count})',
  'githubTab.cache.entriesHeading.other': 'Entrées en cache ({count})',
  'githubTab.cache.emptyTitle': 'Le cache GitHub est vide',
  'githubTab.cache.emptyDescription':
    'Les données GitHub mises en cache apparaîtront ici après leur enregistrement par E-Code.',
  'githubTab.cache.entry.remove': 'Retirer {key} du cache',
  'githubTab.cache.actions.clearExpired': 'Effacer les entrées expirées',
  'githubTab.cache.actions.compact': 'Compacter le cache',
  'githubTab.cache.actions.clearAll': 'Effacer toutes les données du cache',
  'githubTab.cache.feedback.clearedAll': 'Cache effacé à {time}.',
  'githubTab.cache.feedback.clearedExpired.none': 'Aucune entrée de cache expirée n’a été trouvée.',
  'githubTab.cache.feedback.clearedExpired.one': '{count} entrée de cache expirée a été supprimée.',
  'githubTab.cache.feedback.clearedExpired.other': '{count} entrées de cache expirées ont été supprimées.',
  'githubTab.cache.feedback.compacted': 'Le cache GitHub a bien été compacté.',
  'githubTab.cache.feedback.removedEntry': '{key} a été retiré du cache.',
  'githubTab.cache.feedback.error': 'Impossible d’effectuer l’opération sur le cache. Veuillez réessayer.',
};

type GitHubTabInterpolationValue = string | number | bigint;

export function getGitHubTabCopy(language?: string | null): GitHubTabCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? githubTabFr : githubTabEn;
}

export function interpolateGitHubTabCopy(
  template: string,
  values: Readonly<Record<string, GitHubTabInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatGitHubTabNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatGitHubTabDateTime(value: Date, language?: string | null): string {
  return new Intl.DateTimeFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function formatGitHubTabDate(value: string | number | Date, language?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(date);
}

export function formatGitHubTabTime(value: string | number | Date, language?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    timeStyle: 'short',
  }).format(date);
}

export function formatGitHubTabCacheSize(bytes: number, language?: string | null): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const isFrench = normalizeSupportedLanguage(language) === 'fr';
  const units = isFrench ? ['o', 'Ko', 'Mo', 'Go'] : ['B', 'KB', 'MB', 'GB'];

  if (safeBytes === 0) {
    return `0\u00a0${units[0]}`;
  }

  const exponent = Math.min(Math.floor(Math.log(safeBytes) / Math.log(1024)), units.length - 1);
  const value = safeBytes / 1024 ** exponent;

  const formatted = new Intl.NumberFormat(isFrench ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value);

  return `${formatted}\u00a0${units[exponent]}`;
}

export function formatGitHubTabCacheEntriesHeading(count: number, language?: string | null): string {
  const copy = getGitHubTabCopy(language);

  const template =
    count === 1 ? copy['githubTab.cache.entriesHeading.one'] : copy['githubTab.cache.entriesHeading.other'];

  return interpolateGitHubTabCopy(template, { count: formatGitHubTabNumber(count, language) });
}

export function formatGitHubTabExpiredCacheResult(count: number, language?: string | null): string {
  const copy = getGitHubTabCopy(language);

  if (count === 0) {
    return copy['githubTab.cache.feedback.clearedExpired.none'];
  }

  return formatGitHubTabPlural(language, count, {
    one: copy['githubTab.cache.feedback.clearedExpired.one'],
    other: copy['githubTab.cache.feedback.clearedExpired.other'],
  });
}

/** Never expose browser-storage exceptions or cached payload contents in the settings UI. */
export function getGitHubTabCacheSafeError(language?: string | null, _error?: unknown): string {
  return getGitHubTabCopy(language)['githubTab.cache.feedback.error'];
}

export function formatGitHubTabPlural(
  language: string | null | undefined,
  count: number,
  forms: GitHubTabPluralCopy,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateGitHubTabCopy(template, { count: formatGitHubTabNumber(count, language) });
}
