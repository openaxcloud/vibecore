import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const sourceControlConnectionsEn = {
  'sourceControl.common.loadingConnection': 'Loading connection…',
  'sourceControl.common.connecting': 'Connecting…',
  'sourceControl.common.connect': 'Connect',
  'sourceControl.common.disconnect': 'Disconnect',
  'sourceControl.common.dashboard': 'Dashboard',
  'sourceControl.common.testing': 'Testing…',
  'sourceControl.common.testConnection': 'Test Connection',
  'sourceControl.common.getToken': 'Get your token',
  'sourceControl.common.requiredScopes': 'Required scopes:',
  'sourceControl.common.connectionError': 'The connection could not be completed. Verify your settings and try again.',
  'sourceControl.github.oauth.title': 'Connect with GitHub (OAuth)',
  'sourceControl.github.oauth.description':
    'Authorize through GitHub. We store an encrypted server-side token linked to your E-Code account. You do not need to copy a personal access token, and the token never reaches your browser. Recommended.',
  'sourceControl.github.oauth.waiting': 'Waiting for GitHub authorization…',
  'sourceControl.github.oauth.connect': 'Connect with GitHub (OAuth)',
  'sourceControl.github.oauth.connectionFailed': 'The GitHub OAuth connection could not be completed. Try again.',
  'sourceControl.github.oauth.startFailed': 'The GitHub authorization flow could not be started. Try again.',
  'sourceControl.github.oauth.popupBlocked':
    'The authorization window was blocked. Allow pop-ups for this site and try again.',
  'sourceControl.github.legacy.label': 'Legacy method:',
  'sourceControl.github.legacy.intro':
    'You can also paste a personal access token below. Use this option if you prefer to manage token rotation yourself, or set the',
  'sourceControl.github.legacy.automaticSuffix': 'environment variable to connect automatically.',
  'sourceControl.github.legacy.fineGrainedPrefix': 'For fine-grained tokens, also set',
  'sourceControl.github.token.type': 'Token Type',
  'sourceControl.github.token.classicOption': 'Personal Access Token (Classic)',
  'sourceControl.github.token.fineGrainedOption': 'Fine-grained Token',
  'sourceControl.github.token.classicLabel': 'Personal Access Token',
  'sourceControl.github.token.fineGrainedLabel': 'Fine-grained Token',
  'sourceControl.github.token.classicPlaceholder': 'Enter your GitHub personal access token',
  'sourceControl.github.token.fineGrainedPlaceholder': 'Enter your GitHub fine-grained token',
  'sourceControl.github.scopes.classic': 'repo, read:org, read:user',
  'sourceControl.github.scopes.fineGrained': 'Repository access, organization access',
  'sourceControl.github.connected': 'Connected to GitHub',
  'sourceControl.github.stats.loading': 'Loading GitHub statistics…',
  'sourceControl.github.stats.empty': 'No statistics available',
  'sourceControl.github.stats.title': 'GitHub Stats',
  'sourceControl.github.stats.stale': '(Stale)',
  'sourceControl.github.stats.refreshing': 'Refreshing…',
  'sourceControl.github.stats.refresh': 'Refresh',
  'sourceControl.github.stats.refreshAria': 'Refresh GitHub statistics',
  'sourceControl.github.stats.expandAria': 'Show GitHub statistics',
  'sourceControl.github.stats.collapseAria': 'Hide GitHub statistics',
  'sourceControl.github.stats.topLanguages': 'Top Languages',
  'sourceControl.github.stats.repositoryTooltip.one': '{language}: {size} MB across {count} repository',
  'sourceControl.github.stats.repositoryTooltip.other': '{language}: {size} MB across {count} repositories',
  'sourceControl.github.stats.basis': 'Based on actual codebase size across repositories',
  'sourceControl.github.stats.overview': 'GitHub Overview',
  'sourceControl.github.stats.totalRepositories': 'Total Repositories',
  'sourceControl.github.stats.totalBranches': 'Total Branches',
  'sourceControl.github.stats.organizations': 'Organizations',
  'sourceControl.github.stats.languagesUsed': 'Languages Used',
  'sourceControl.github.stats.activity': 'Activity Summary',
  'sourceControl.github.stats.contributors': 'Contributors',
  'sourceControl.github.stats.issues': 'Issues',
  'sourceControl.github.stats.pullRequests': 'Pull Requests',
  'sourceControl.github.stats.lastUpdated': 'Last updated: {date}',
  'sourceControl.github.stats.never': 'Never',
  'sourceControl.github.boundary.title': 'GitHub Integration Error',
  'sourceControl.github.boundary.description':
    'GitHub data could not be loaded. Check your connection, wait a moment, then try again.',
  'sourceControl.github.boundary.retry': 'Try again',
  'sourceControl.github.boundary.reload': 'Reload page',
  'sourceControl.gitlab.title': 'GitLab Connection',
  'sourceControl.gitlab.tip.label': 'Tip:',
  'sourceControl.gitlab.tip.intro': 'You can also set the',
  'sourceControl.gitlab.tip.automaticSuffix': 'environment variable to connect automatically.',
  'sourceControl.gitlab.tip.selfHostedPrefix': 'For self-hosted GitLab instances, also set',
  'sourceControl.gitlab.urlLabel': 'GitLab URL',
  'sourceControl.gitlab.token.label': 'Access Token',
  'sourceControl.gitlab.token.placeholder': 'Enter your GitLab access token',
  'sourceControl.gitlab.scopes': 'api, read_repository',
  'sourceControl.gitlab.connected': 'Connected to GitLab',
  'sourceControl.gitlab.disconnected': 'Disconnected from GitLab.',
} as const;

export type SourceControlConnectionsKey = keyof typeof sourceControlConnectionsEn;
export type SourceControlConnectionsCopy = Readonly<Record<SourceControlConnectionsKey, string>>;

export const sourceControlConnectionsFr: SourceControlConnectionsCopy = {
  'sourceControl.common.loadingConnection': 'Chargement de la connexion…',
  'sourceControl.common.connecting': 'Connexion…',
  'sourceControl.common.connect': 'Se connecter',
  'sourceControl.common.disconnect': 'Se déconnecter',
  'sourceControl.common.dashboard': 'Tableau de bord',
  'sourceControl.common.testing': 'Test en cours…',
  'sourceControl.common.testConnection': 'Tester la connexion',
  'sourceControl.common.getToken': 'Obtenir votre jeton',
  'sourceControl.common.requiredScopes': 'Autorisations requises :',
  'sourceControl.common.connectionError': 'Impossible d’établir la connexion. Vérifiez vos paramètres, puis réessayez.',
  'sourceControl.github.oauth.title': 'Se connecter à GitHub (OAuth)',
  'sourceControl.github.oauth.description':
    'Autorisez l’accès depuis GitHub. Nous stockons côté serveur un jeton chiffré lié à votre compte E-Code. Vous n’avez aucun jeton d’accès personnel à copier et celui-ci n’atteint jamais votre navigateur. Méthode recommandée.',
  'sourceControl.github.oauth.waiting': 'En attente de l’autorisation GitHub…',
  'sourceControl.github.oauth.connect': 'Se connecter à GitHub (OAuth)',
  'sourceControl.github.oauth.connectionFailed': 'Impossible d’établir la connexion OAuth à GitHub. Réessayez.',
  'sourceControl.github.oauth.startFailed': 'Impossible de lancer l’autorisation GitHub. Réessayez.',
  'sourceControl.github.oauth.popupBlocked':
    'La fenêtre d’autorisation a été bloquée. Autorisez les fenêtres contextuelles pour ce site, puis réessayez.',
  'sourceControl.github.legacy.label': 'Méthode classique :',
  'sourceControl.github.legacy.intro':
    'Vous pouvez également coller un jeton d’accès personnel ci-dessous. Choisissez cette option si vous préférez gérer vous-même le renouvellement du jeton, ou définissez la variable d’environnement',
  'sourceControl.github.legacy.automaticSuffix': 'pour vous connecter automatiquement.',
  'sourceControl.github.legacy.fineGrainedPrefix': 'Pour un jeton à granularité fine, définissez également',
  'sourceControl.github.token.type': 'Type de jeton',
  'sourceControl.github.token.classicOption': 'Jeton d’accès personnel (classique)',
  'sourceControl.github.token.fineGrainedOption': 'Jeton à granularité fine',
  'sourceControl.github.token.classicLabel': 'Jeton d’accès personnel',
  'sourceControl.github.token.fineGrainedLabel': 'Jeton à granularité fine',
  'sourceControl.github.token.classicPlaceholder': 'Saisissez votre jeton d’accès personnel GitHub',
  'sourceControl.github.token.fineGrainedPlaceholder': 'Saisissez votre jeton GitHub à granularité fine',
  'sourceControl.github.scopes.classic': 'repo, read:org, read:user',
  'sourceControl.github.scopes.fineGrained': 'Accès aux dépôts, accès aux organisations',
  'sourceControl.github.connected': 'Connecté à GitHub',
  'sourceControl.github.stats.loading': 'Chargement des statistiques GitHub…',
  'sourceControl.github.stats.empty': 'Aucune statistique disponible',
  'sourceControl.github.stats.title': 'Statistiques GitHub',
  'sourceControl.github.stats.stale': '(obsolètes)',
  'sourceControl.github.stats.refreshing': 'Actualisation…',
  'sourceControl.github.stats.refresh': 'Actualiser',
  'sourceControl.github.stats.refreshAria': 'Actualiser les statistiques GitHub',
  'sourceControl.github.stats.expandAria': 'Afficher les statistiques GitHub',
  'sourceControl.github.stats.collapseAria': 'Masquer les statistiques GitHub',
  'sourceControl.github.stats.topLanguages': 'Langages principaux',
  'sourceControl.github.stats.repositoryTooltip.one': '{language} : {size} Mo dans {count} dépôt',
  'sourceControl.github.stats.repositoryTooltip.other': '{language} : {size} Mo dans {count} dépôts',
  'sourceControl.github.stats.basis': 'Calculé d’après la taille réelle du code dans les dépôts',
  'sourceControl.github.stats.overview': 'Vue d’ensemble GitHub',
  'sourceControl.github.stats.totalRepositories': 'Total des dépôts',
  'sourceControl.github.stats.totalBranches': 'Total des branches',
  'sourceControl.github.stats.organizations': 'Organisations',
  'sourceControl.github.stats.languagesUsed': 'Langages utilisés',
  'sourceControl.github.stats.activity': 'Résumé de l’activité',
  'sourceControl.github.stats.contributors': 'Contributeurs',
  'sourceControl.github.stats.issues': 'Tickets',
  'sourceControl.github.stats.pullRequests': 'Pull requests',
  'sourceControl.github.stats.lastUpdated': 'Dernière actualisation : {date}',
  'sourceControl.github.stats.never': 'Jamais',
  'sourceControl.github.boundary.title': 'Erreur d’intégration GitHub',
  'sourceControl.github.boundary.description':
    'Impossible de charger les données GitHub. Vérifiez votre connexion, patientez un instant, puis réessayez.',
  'sourceControl.github.boundary.retry': 'Réessayer',
  'sourceControl.github.boundary.reload': 'Recharger la page',
  'sourceControl.gitlab.title': 'Connexion GitLab',
  'sourceControl.gitlab.tip.label': 'Conseil :',
  'sourceControl.gitlab.tip.intro': 'Vous pouvez également définir la variable d’environnement',
  'sourceControl.gitlab.tip.automaticSuffix': 'pour vous connecter automatiquement.',
  'sourceControl.gitlab.tip.selfHostedPrefix': 'Pour une instance GitLab auto-hébergée, définissez également',
  'sourceControl.gitlab.urlLabel': 'URL GitLab',
  'sourceControl.gitlab.token.label': 'Jeton d’accès',
  'sourceControl.gitlab.token.placeholder': 'Saisissez votre jeton d’accès GitLab',
  'sourceControl.gitlab.scopes': 'api, read_repository',
  'sourceControl.gitlab.connected': 'Connecté à GitLab',
  'sourceControl.gitlab.disconnected': 'Déconnexion de GitLab réussie.',
};

export function getSourceControlConnectionsCopy(language?: string | null): SourceControlConnectionsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? sourceControlConnectionsFr : sourceControlConnectionsEn;
}

export function interpolateSourceControlCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatSourceControlNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatSourceControlMegabytes(bytes: number, language?: string | null): string {
  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bytes / 1024 / 1024);
}

export function formatSourceControlDateTime(value: Date, language?: string | null): string {
  return new Intl.DateTimeFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function formatRepositoryTooltip(
  language: string | null | undefined,
  input: { languageName: string; bytes: number; repositoryCount: number },
): string {
  const copy = getSourceControlConnectionsCopy(language);
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const suffix = new Intl.PluralRules(locale).select(input.repositoryCount) === 'one' ? 'one' : 'other';

  return interpolateSourceControlCopy(copy[`sourceControl.github.stats.repositoryTooltip.${suffix}`], {
    language: input.languageName,
    size: formatSourceControlMegabytes(input.bytes, language),
    count: formatSourceControlNumber(input.repositoryCount, language),
  });
}
