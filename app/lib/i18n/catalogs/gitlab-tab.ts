import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const gitLabTabEn = {
  'gitLabTab.title': 'GitLab Integration',
  'gitLabTab.loading.connection': 'Loading your GitLab connection…',
  'gitLabTab.connection.errorTitle': 'GitLab connection unavailable',
  'gitLabTab.connection.errorDescription':
    'Your GitLab connection could not be loaded. Reload the page, then try again.',
  'gitLabTab.connection.reload': 'Reload page',
  'gitLabTab.connection.disconnectedDescription':
    'Connect your GitLab account to manage repositories, review statistics, and work with your projects in E-Code.',
  'gitLabTab.oauth.title': 'Recommended: connect with GitLab OAuth',
  'gitLabTab.oauth.description':
    'We never access your password. Your encrypted token is stored securely on the server. Use this flow to replace the legacy personal access token method below.',
  'gitLabTab.connection.connectedDescription': 'Manage your GitLab integration, repositories, and account statistics.',
  'gitLabTab.rateLimit': 'API: {remaining}/{limit}',
  'gitLabTab.connectionTest.noConnection': 'No GitLab connection is currently active.',
  'gitLabTab.connectionTest.testing': 'Testing the GitLab connection…',
  'gitLabTab.connectionTest.success': 'Connected successfully as {username}.',
  'gitLabTab.connectionTest.failed': 'The GitLab connection test failed. Check your connection and try again.',
  'gitLabTab.connectionTest.checkedAt': 'Checked {date}',
  'gitLabTab.user.fallbackName': 'GitLab user',
  'gitLabTab.user.avatarAlt': 'Avatar for {username}',
  'gitLabTab.statistics.title': 'Statistics',
  'gitLabTab.statistics.repositoriesTitle': 'Repository statistics',
  'gitLabTab.statistics.contributionsTitle': 'Contribution statistics',
  'gitLabTab.statistics.publicRepositories_one': 'Public repository',
  'gitLabTab.statistics.publicRepositories_other': 'Public repositories',
  'gitLabTab.statistics.privateRepositories_one': 'Private repository',
  'gitLabTab.statistics.privateRepositories_other': 'Private repositories',
  'gitLabTab.statistics.stars_one': 'Star',
  'gitLabTab.statistics.stars_other': 'Stars',
  'gitLabTab.statistics.forks_one': 'Fork',
  'gitLabTab.statistics.forks_other': 'Forks',
  'gitLabTab.statistics.followers_one': 'Follower',
  'gitLabTab.statistics.followers_other': 'Followers',
  'gitLabTab.statistics.empty': 'These GitLab statistics do not contain any activity yet.',
  'gitLabTab.statistics.lastUpdated': 'Last updated: {date}',
  'gitLabTab.statistics.refresh': 'Refresh statistics',
  'gitLabTab.statistics.refreshing': 'Refreshing statistics…',
  'gitLabTab.date.unavailable': 'Date unavailable',
  'gitLabTab.refresh.errorTitle': 'Refresh failed',
  'gitLabTab.refresh.errorDescription': 'GitLab data could not be refreshed. Wait a moment, then try again.',
  'gitLabTab.refresh.retry': 'Try again',
  'gitLabTab.repositories.count_one': '{count} repository',
  'gitLabTab.repositories.count_other': '{count} repositories',
  'gitLabTab.repositories.refresh': 'Refresh repositories',
  'gitLabTab.repositories.refreshing': 'Refreshing repositories…',
  'gitLabTab.repositories.searchLabel': 'Search repositories',
  'gitLabTab.repositories.searchPlaceholder': 'Search repositories…',
  'gitLabTab.repositories.emptySearch': 'No repositories match your search.',
  'gitLabTab.repositories.empty': 'No repositories are available.',
  'gitLabTab.repositories.range_one': 'Showing {start}–{end} of {count} repository',
  'gitLabTab.repositories.range_other': 'Showing {start}–{end} of {count} repositories',
  'gitLabTab.repositories.previous': 'Previous page',
  'gitLabTab.repositories.next': 'Next page',
  'gitLabTab.repositories.page': 'Page {current} of {total}',
} as const;

export type GitLabTabKey = keyof typeof gitLabTabEn;
export type GitLabTabCopy = Readonly<Record<GitLabTabKey, string>>;

export const gitLabTabFr: GitLabTabCopy = {
  'gitLabTab.title': 'Intégration GitLab',
  'gitLabTab.loading.connection': 'Chargement de votre connexion GitLab…',
  'gitLabTab.connection.errorTitle': 'Connexion GitLab indisponible',
  'gitLabTab.connection.errorDescription':
    'Impossible de charger votre connexion GitLab. Rechargez la page, puis réessayez.',
  'gitLabTab.connection.reload': 'Recharger la page',
  'gitLabTab.connection.disconnectedDescription':
    'Connectez votre compte GitLab pour gérer vos dépôts, consulter vos statistiques et travailler sur vos projets dans E-Code.',
  'gitLabTab.oauth.title': 'Recommandé : connectez-vous avec OAuth GitLab',
  'gitLabTab.oauth.description':
    'Nous n’accédons jamais à votre mot de passe. Votre jeton chiffré est stocké de manière sécurisée sur le serveur. Utilisez ce parcours pour remplacer l’ancienne méthode par jeton d’accès personnel ci-dessous.',
  'gitLabTab.connection.connectedDescription':
    'Gérez votre intégration GitLab, vos dépôts et les statistiques de votre compte.',
  'gitLabTab.rateLimit': 'API : {remaining}/{limit}',
  'gitLabTab.connectionTest.noConnection': 'Aucune connexion GitLab n’est active actuellement.',
  'gitLabTab.connectionTest.testing': 'Test de la connexion GitLab…',
  'gitLabTab.connectionTest.success': 'Connexion réussie avec le compte {username}.',
  'gitLabTab.connectionTest.failed':
    'Le test de la connexion GitLab a échoué. Vérifiez votre connexion, puis réessayez.',
  'gitLabTab.connectionTest.checkedAt': 'Vérification effectuée le {date}',
  'gitLabTab.user.fallbackName': 'Utilisateur GitLab',
  'gitLabTab.user.avatarAlt': 'Avatar de {username}',
  'gitLabTab.statistics.title': 'Statistiques',
  'gitLabTab.statistics.repositoriesTitle': 'Statistiques des dépôts',
  'gitLabTab.statistics.contributionsTitle': 'Statistiques de contribution',
  'gitLabTab.statistics.publicRepositories_one': 'Dépôt public',
  'gitLabTab.statistics.publicRepositories_other': 'Dépôts publics',
  'gitLabTab.statistics.privateRepositories_one': 'Dépôt privé',
  'gitLabTab.statistics.privateRepositories_other': 'Dépôts privés',
  'gitLabTab.statistics.stars_one': 'Étoile',
  'gitLabTab.statistics.stars_other': 'Étoiles',
  'gitLabTab.statistics.forks_one': 'Copie comptabilisée',
  'gitLabTab.statistics.forks_other': 'Copies comptabilisées',
  'gitLabTab.statistics.followers_one': 'Abonné',
  'gitLabTab.statistics.followers_other': 'Abonnés',
  'gitLabTab.statistics.empty': 'Ces statistiques GitLab ne comptabilisent encore aucune activité.',
  'gitLabTab.statistics.lastUpdated': 'Dernière actualisation : {date}',
  'gitLabTab.statistics.refresh': 'Actualiser les statistiques',
  'gitLabTab.statistics.refreshing': 'Actualisation des statistiques…',
  'gitLabTab.date.unavailable': 'Date indisponible',
  'gitLabTab.refresh.errorTitle': 'Échec de l’actualisation',
  'gitLabTab.refresh.errorDescription':
    'Impossible d’actualiser les données GitLab. Patientez un instant, puis réessayez.',
  'gitLabTab.refresh.retry': 'Réessayer',
  'gitLabTab.repositories.count_one': '{count} dépôt',
  'gitLabTab.repositories.count_other': '{count} dépôts',
  'gitLabTab.repositories.refresh': 'Actualiser les dépôts',
  'gitLabTab.repositories.refreshing': 'Actualisation des dépôts…',
  'gitLabTab.repositories.searchLabel': 'Rechercher des dépôts',
  'gitLabTab.repositories.searchPlaceholder': 'Rechercher des dépôts…',
  'gitLabTab.repositories.emptySearch': 'Aucun dépôt ne correspond à votre recherche.',
  'gitLabTab.repositories.empty': 'Aucun dépôt n’est disponible.',
  'gitLabTab.repositories.range_one': 'Affichage de {start} à {end} sur {count} dépôt',
  'gitLabTab.repositories.range_other': 'Affichage de {start} à {end} sur {count} dépôts',
  'gitLabTab.repositories.previous': 'Page précédente',
  'gitLabTab.repositories.next': 'Page suivante',
  'gitLabTab.repositories.page': 'Page {current} sur {total}',
};

export function getGitLabTabCopy(language?: string | null): GitLabTabCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? gitLabTabFr : gitLabTabEn;
}

export function interpolateGitLabTabCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatGitLabTabNumber(value: number | bigint, language?: string | null): string {
  const safeValue = typeof value === 'number' && !Number.isFinite(value) ? 0 : value;

  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(safeValue);
}

export function formatGitLabTabPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return interpolateGitLabTabCopy(template, {
    ...values,
    count: new Intl.NumberFormat(locale).format(count),
  });
}

export function formatGitLabTabDateTime(
  value: Date | string | number | null | undefined,
  language?: string | null,
): string {
  if (value === null || value === undefined) {
    return getGitLabTabCopy(language)['gitLabTab.date.unavailable'];
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getGitLabTabCopy(language)['gitLabTab.date.unavailable'];
  }

  return new Intl.DateTimeFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
