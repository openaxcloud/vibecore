import { resolveMarketingLanguage } from './marketing';

export const repositorySelectorEn = {
  'repositorySelector.connect': 'Connect to {{provider}} to browse repositories.',
  'repositorySelector.refreshConnection': 'Refresh connection',
  'repositorySelector.loading': 'Loading repositories…',
  'repositorySelector.loadFailed': 'Could not load repositories',
  'repositorySelector.fetchFailed': 'Could not fetch repositories.',
  'repositorySelector.retry': 'Retry',
  'repositorySelector.tryAgain': 'Try again',
  'repositorySelector.empty': 'No repositories found',
  'repositorySelector.refresh': 'Refresh',
  'repositorySelector.title': 'Select a repository to clone',
  'repositorySelector.count': '{{shown}} of {{total}} repositories',
  'repositorySelector.warningCached': 'Warning: {{reason}} Showing cached data.',
  'repositorySelector.searchAria': 'Search repositories',
  'repositorySelector.searchPlaceholder': 'Search repositories…',
  'repositorySelector.sort.updated': 'Recently updated',
  'repositorySelector.sort.stars': 'Most starred',
  'repositorySelector.sort.name': 'Name (A–Z)',
  'repositorySelector.sort.created': 'Recently created',
  'repositorySelector.filter.all': 'All repositories',
  'repositorySelector.filter.own': 'Own repositories',
  'repositorySelector.filter.forks': 'Forked repositories',
  'repositorySelector.filter.archived': 'Archived repositories',
  'repositorySelector.filter.owned': 'Owned repositories',
  'repositorySelector.filter.member': 'Member repositories',
  'repositorySelector.pagination.range': 'Showing {{start}} to {{end}} of {{total}} repositories',
  'repositorySelector.pagination.previous': 'Previous',
  'repositorySelector.pagination.page': '{{current}} of {{total}}',
  'repositorySelector.pagination.next': 'Next',
  'repositorySelector.noMatch': 'No repositories match your search criteria.',
  'repositorySelector.branch.title': 'Select a branch',
  'repositorySelector.branch.close': 'Close',
  'repositorySelector.branch.loading': 'Loading branches…',
  'repositorySelector.branch.loadFailed': 'Could not fetch branches.',
  'repositorySelector.branch.projectRequired': 'A project ID is required for GitLab repositories.',
  'repositorySelector.branch.search': 'Search branches…',
  'repositorySelector.branch.default': 'Default branch',
  'repositorySelector.branch.protected': 'Protected branch',
  'repositorySelector.branch.noMatch': 'No branches match your search.',
  'repositorySelector.branch.empty': 'No branches available.',
  'repositorySelector.branch.selected': 'Selected:',
  'repositorySelector.branch.cancel': 'Cancel',
  'repositorySelector.branch.clone': 'Clone branch',
  'repositorySelector.card.private': 'Private repository',
  'repositorySelector.card.forked': 'Forked repository',
  'repositorySelector.card.archived': 'Archived repository',
  'repositorySelector.card.stars': 'Stars',
  'repositorySelector.card.forks': 'Forks',
  'repositorySelector.card.defaultBranch': 'Default branch',
  'repositorySelector.card.primaryLanguage': 'Primary language',
  'repositorySelector.card.lastUpdated': 'Last updated',
  'repositorySelector.card.topic': 'Topic: {{topic}}',
  'repositorySelector.card.more': '+{{count}} more',
  'repositorySelector.card.size': 'Size: {{size}} MB',
  'repositorySelector.card.view': 'View',
  'repositorySelector.card.cloneTitle': 'Clone repository',
  'repositorySelector.card.clone': 'Clone',
  'repositorySelector.clone.trigger': 'Clone a repository',
  'repositorySelector.clone.provider.github': 'GitHub',
  'repositorySelector.clone.provider.gitlab': 'GitLab',
  'repositorySelector.clone.close': 'Close',
  'repositorySelector.clone.chooseProvider': 'Choose a repository provider',
  'repositorySelector.clone.githubDescription': 'Clone from your GitHub repositories',
  'repositorySelector.clone.gitlabDescription': 'Clone from your GitLab repositories',
  'repositorySelector.clone.importTitle': 'Import a {{provider}} repository',
  'repositorySelector.clone.importDescription': 'Clone a {{provider}} repository into your workspace',
  'repositorySelector.clone.loading': 'Please wait while the repository is cloned…',
  'repositorySelector.clone.failed': 'Could not import the repository.',
  'repositorySelector.clone.chatCloning': 'Cloning repository {{url}} into {{workdir}}',
  'repositorySelector.clone.skippedHeading': 'Skipped files ({{count}}):',
  'repositorySelector.clone.tooLarge': '{{path}} (too large: {{size}} KB)',
  'repositorySelector.clone.totalLimit': '{{path}} (would exceed the total size limit)',
  'repositorySelector.clone.fileError': '{{path}} (error: {{reason}})',
  'repositorySelector.clone.fileReadFailed': 'could not read this file',
  'repositorySelector.clone.artifactTitle': 'Git cloned files',
  'repositorySelector.clone.projectTitle': 'Git project: {{name}}',
} as const;

export type RepositorySelectorKey = keyof typeof repositorySelectorEn;
export type RepositorySelectorCopy = Readonly<Record<RepositorySelectorKey, string>>;

export const repositorySelectorFr: RepositorySelectorCopy = {
  'repositorySelector.connect': 'Connectez-vous à {{provider}} pour parcourir vos dépôts.',
  'repositorySelector.refreshConnection': 'Actualiser la connexion',
  'repositorySelector.loading': 'Chargement des dépôts…',
  'repositorySelector.loadFailed': 'Impossible de charger les dépôts',
  'repositorySelector.fetchFailed': 'Impossible de récupérer les dépôts.',
  'repositorySelector.retry': 'Réessayer',
  'repositorySelector.tryAgain': 'Réessayer',
  'repositorySelector.empty': 'Aucun dépôt trouvé',
  'repositorySelector.refresh': 'Actualiser',
  'repositorySelector.title': 'Sélectionner un dépôt à cloner',
  'repositorySelector.count': '{{shown}} dépôts sur {{total}}',
  'repositorySelector.warningCached': 'Avertissement : {{reason}} Affichage des données en cache.',
  'repositorySelector.searchAria': 'Rechercher des dépôts',
  'repositorySelector.searchPlaceholder': 'Rechercher des dépôts…',
  'repositorySelector.sort.updated': 'Mis à jour récemment',
  'repositorySelector.sort.stars': 'Plus d’étoiles',
  'repositorySelector.sort.name': 'Nom (A–Z)',
  'repositorySelector.sort.created': 'Créés récemment',
  'repositorySelector.filter.all': 'Tous les dépôts',
  'repositorySelector.filter.own': 'Mes dépôts',
  'repositorySelector.filter.forks': 'Dépôts dupliqués',
  'repositorySelector.filter.archived': 'Dépôts archivés',
  'repositorySelector.filter.owned': 'Dépôts possédés',
  'repositorySelector.filter.member': 'Dépôts dont je suis membre',
  'repositorySelector.pagination.range': 'Affichage de {{start}} à {{end}} sur {{total}} dépôts',
  'repositorySelector.pagination.previous': 'Précédent',
  'repositorySelector.pagination.page': '{{current}} sur {{total}}',
  'repositorySelector.pagination.next': 'Suivant',
  'repositorySelector.noMatch': 'Aucun dépôt ne correspond à vos critères de recherche.',
  'repositorySelector.branch.title': 'Sélectionner une branche',
  'repositorySelector.branch.close': 'Fermer',
  'repositorySelector.branch.loading': 'Chargement des branches…',
  'repositorySelector.branch.loadFailed': 'Impossible de récupérer les branches.',
  'repositorySelector.branch.projectRequired': 'Un identifiant de projet est requis pour les dépôts GitLab.',
  'repositorySelector.branch.search': 'Rechercher des branches…',
  'repositorySelector.branch.default': 'Branche par défaut',
  'repositorySelector.branch.protected': 'Branche protégée',
  'repositorySelector.branch.noMatch': 'Aucune branche ne correspond à votre recherche.',
  'repositorySelector.branch.empty': 'Aucune branche disponible.',
  'repositorySelector.branch.selected': 'Sélection :',
  'repositorySelector.branch.cancel': 'Annuler',
  'repositorySelector.branch.clone': 'Cloner la branche',
  'repositorySelector.card.private': 'Dépôt privé',
  'repositorySelector.card.forked': 'Dépôt dupliqué',
  'repositorySelector.card.archived': 'Dépôt archivé',
  'repositorySelector.card.stars': 'Étoiles',
  'repositorySelector.card.forks': 'Copies',
  'repositorySelector.card.defaultBranch': 'Branche par défaut',
  'repositorySelector.card.primaryLanguage': 'Langage principal',
  'repositorySelector.card.lastUpdated': 'Dernière mise à jour',
  'repositorySelector.card.topic': 'Sujet : {{topic}}',
  'repositorySelector.card.more': '+{{count}} autres',
  'repositorySelector.card.size': 'Taille : {{size}} Mo',
  'repositorySelector.card.view': 'Voir',
  'repositorySelector.card.cloneTitle': 'Cloner le dépôt',
  'repositorySelector.card.clone': 'Cloner',
  'repositorySelector.clone.trigger': 'Cloner un dépôt',
  'repositorySelector.clone.provider.github': 'GitHub',
  'repositorySelector.clone.provider.gitlab': 'GitLab',
  'repositorySelector.clone.close': 'Fermer',
  'repositorySelector.clone.chooseProvider': 'Choisir un hébergeur de dépôt',
  'repositorySelector.clone.githubDescription': 'Cloner l’un de vos dépôts GitHub',
  'repositorySelector.clone.gitlabDescription': 'Cloner l’un de vos dépôts GitLab',
  'repositorySelector.clone.importTitle': 'Importer un dépôt {{provider}}',
  'repositorySelector.clone.importDescription': 'Cloner un dépôt {{provider}} dans votre espace de travail',
  'repositorySelector.clone.loading': 'Veuillez patienter pendant le clonage du dépôt…',
  'repositorySelector.clone.failed': 'Impossible d’importer le dépôt.',
  'repositorySelector.clone.chatCloning': 'Clonage du dépôt {{url}} dans {{workdir}}',
  'repositorySelector.clone.skippedHeading': 'Fichiers ignorés ({{count}}) :',
  'repositorySelector.clone.tooLarge': '{{path}} (trop volumineux : {{size}} Ko)',
  'repositorySelector.clone.totalLimit': '{{path}} (dépasserait la limite de taille totale)',
  'repositorySelector.clone.fileError': '{{path}} (erreur : {{reason}})',
  'repositorySelector.clone.fileReadFailed': 'lecture du fichier impossible',
  'repositorySelector.clone.artifactTitle': 'Fichiers clonés avec Git',
  'repositorySelector.clone.projectTitle': 'Projet Git : {{name}}',
};

export function getRepositorySelectorCopy(language?: string | null): RepositorySelectorCopy {
  return resolveMarketingLanguage(language) === 'fr' ? repositorySelectorFr : repositorySelectorEn;
}

export function formatRepositorySelectorCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatRepositorySelectorNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatRepositorySelectorSize(sizeInKilobytes: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(sizeInKilobytes / 1024);
}

export function formatRepositorySelectorDate(value: string | number | Date, language?: string | null): string {
  return new Intl.DateTimeFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function getRepositorySelectorError(
  language: string | null | undefined,
  error: unknown,
  fallback: string,
): string {
  if (resolveMarketingLanguage(language) === 'fr') {
    return fallback;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
