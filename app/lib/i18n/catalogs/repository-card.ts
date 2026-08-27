import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const repositoryCardEn = {
  'repositoryCard.action.open': 'Open repository {repository}',
  'repositoryCard.action.view': 'View',
  'repositoryCard.status.private': 'Private repository',
  'repositoryCard.status.forked': 'Forked repository',
  'repositoryCard.status.archived': 'Archived repository',
  'repositoryCard.badge.archived': 'Archived',
  'repositoryCard.badge.forked': 'Forked',
  'repositoryCard.health.label': 'Repository health: {status}',
  'repositoryCard.health.archived': 'Archived',
  'repositoryCard.health.veryActive': 'Very active',
  'repositoryCard.health.healthy': 'Healthy',
  'repositoryCard.health.needsAttention': 'Needs attention',
  'repositoryCard.health.score': 'Health score: {percentage} ({score}/{maximum})',
  'repositoryCard.metrics.value': '{label}: {value}',
  'repositoryCard.metrics.stars': 'Stars',
  'repositoryCard.metrics.forks': 'Forks',
  'repositoryCard.metrics.openIssues': 'Open issues',
  'repositoryCard.metrics.pullRequests': 'Pull requests',
  'repositoryCard.metrics.defaultBranch': 'Default branch',
  'repositoryCard.metrics.totalBranches': 'Total branches',
  'repositoryCard.metrics.contributors': 'Contributors',
  'repositoryCard.metrics.size': 'Size',
  'repositoryCard.metrics.lastUpdated': 'Last updated',
  'repositoryCard.metrics.primaryLanguage': 'Primary language',
  'repositoryCard.metrics.topics': 'Topics: {topics}',
  'repositoryCard.updated.today': 'Today',
  'repositoryCard.updated.days.one': '{count} day ago',
  'repositoryCard.updated.days.other': '{count} days ago',
  'repositoryCard.updated.weeks.one': '{count} week ago',
  'repositoryCard.updated.weeks.other': '{count} weeks ago',
  'repositoryCard.updated.unavailable': 'Date unavailable',
  'repositoryCard.sizeUnit.byte': 'B',
  'repositoryCard.sizeUnit.kilobyte': 'KB',
  'repositoryCard.sizeUnit.megabyte': 'MB',
  'repositoryCard.sizeUnit.gigabyte': 'GB',
  'repositoryCard.sizeUnit.terabyte': 'TB',
} as const;

export type RepositoryCardKey = keyof typeof repositoryCardEn;
export type RepositoryCardCopy = Readonly<Record<RepositoryCardKey, string>>;
export type RepositoryCardLanguage = 'en' | 'fr';

export const repositoryCardFr: RepositoryCardCopy = {
  'repositoryCard.action.open': 'Ouvrir le dépôt {repository}',
  'repositoryCard.action.view': 'Voir',
  'repositoryCard.status.private': 'Dépôt privé',
  'repositoryCard.status.forked': 'Dépôt dupliqué',
  'repositoryCard.status.archived': 'Dépôt archivé',
  'repositoryCard.badge.archived': 'Archivé',
  'repositoryCard.badge.forked': 'Dupliqué',
  'repositoryCard.health.label': 'État du dépôt : {status}',
  'repositoryCard.health.archived': 'Archivé',
  'repositoryCard.health.veryActive': 'Très actif',
  'repositoryCard.health.healthy': 'Sain',
  'repositoryCard.health.needsAttention': 'À surveiller',
  'repositoryCard.health.score': 'Score de santé : {percentage} ({score}/{maximum})',
  'repositoryCard.metrics.value': '{label} : {value}',
  'repositoryCard.metrics.stars': 'Étoiles',
  'repositoryCard.metrics.forks': 'Copies',
  'repositoryCard.metrics.openIssues': 'Tickets ouverts',
  'repositoryCard.metrics.pullRequests': 'Pull requests',
  'repositoryCard.metrics.defaultBranch': 'Branche par défaut',
  'repositoryCard.metrics.totalBranches': 'Nombre total de branches',
  'repositoryCard.metrics.contributors': 'Contributeurs',
  'repositoryCard.metrics.size': 'Taille',
  'repositoryCard.metrics.lastUpdated': 'Dernière mise à jour',
  'repositoryCard.metrics.primaryLanguage': 'Langage principal',
  'repositoryCard.metrics.topics': 'Sujets : {topics}',
  'repositoryCard.updated.today': 'Aujourd’hui',
  'repositoryCard.updated.days.one': 'Il y a {count} jour',
  'repositoryCard.updated.days.other': 'Il y a {count} jours',
  'repositoryCard.updated.weeks.one': 'Il y a {count} semaine',
  'repositoryCard.updated.weeks.other': 'Il y a {count} semaines',
  'repositoryCard.updated.unavailable': 'Date indisponible',
  'repositoryCard.sizeUnit.byte': 'o',
  'repositoryCard.sizeUnit.kilobyte': 'Ko',
  'repositoryCard.sizeUnit.megabyte': 'Mo',
  'repositoryCard.sizeUnit.gigabyte': 'Go',
  'repositoryCard.sizeUnit.terabyte': 'To',
};

type RepositoryCardInterpolationValue = string | number | bigint;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveRepositoryCardLanguage(language?: string | null): RepositoryCardLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getRepositoryCardCopy(language?: string | null): RepositoryCardCopy {
  return resolveRepositoryCardLanguage(language) === 'fr' ? repositoryCardFr : repositoryCardEn;
}

export function formatRepositoryCardCopy(
  template: string,
  values: Readonly<Record<string, RepositoryCardInterpolationValue>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatRepositoryCardNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(resolveRepositoryCardLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatRepositoryCardPercentage(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveRepositoryCardLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function getRepositoryCardDaysSinceUpdate(
  value: string | number | Date,
  now: string | number | Date = Date.now(),
): number | null {
  const updatedAt = new Date(value).getTime();
  const currentTime = new Date(now).getTime();

  if (!Number.isFinite(updatedAt) || !Number.isFinite(currentTime)) {
    return null;
  }

  return Math.max(0, Math.floor((currentTime - updatedAt) / MILLISECONDS_PER_DAY));
}

export function formatRepositoryCardUpdatedAt(
  value: string | number | Date,
  language?: string | null,
  now: string | number | Date = Date.now(),
): string {
  const copy = getRepositoryCardCopy(language);
  const date = new Date(value);
  const daysSinceUpdate = getRepositoryCardDaysSinceUpdate(date, now);

  if (daysSinceUpdate === null) {
    return copy['repositoryCard.updated.unavailable'];
  }

  if (daysSinceUpdate === 0) {
    return copy['repositoryCard.updated.today'];
  }

  if (daysSinceUpdate < 7) {
    const key = new Intl.PluralRules(resolveRepositoryCardLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').select(
      daysSinceUpdate,
    );
    const template =
      key === 'one' ? copy['repositoryCard.updated.days.one'] : copy['repositoryCard.updated.days.other'];

    return formatRepositoryCardCopy(template, {
      count: formatRepositoryCardNumber(daysSinceUpdate, language),
    });
  }

  if (daysSinceUpdate < 30) {
    const weeks = Math.floor(daysSinceUpdate / 7);

    const key = new Intl.PluralRules(resolveRepositoryCardLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').select(
      weeks,
    );
    const template =
      key === 'one' ? copy['repositoryCard.updated.weeks.one'] : copy['repositoryCard.updated.weeks.other'];

    return formatRepositoryCardCopy(template, {
      count: formatRepositoryCardNumber(weeks, language),
    });
  }

  return new Intl.DateTimeFormat(resolveRepositoryCardLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatRepositoryCardSize(sizeInKilobytes: number, language?: string | null): string {
  const copy = getRepositoryCardCopy(language);

  const units: RepositoryCardKey[] = [
    'repositoryCard.sizeUnit.byte',
    'repositoryCard.sizeUnit.kilobyte',
    'repositoryCard.sizeUnit.megabyte',
    'repositoryCard.sizeUnit.gigabyte',
    'repositoryCard.sizeUnit.terabyte',
  ];

  let size = Math.max(0, Number.isFinite(sizeInKilobytes) ? sizeInKilobytes * 1024 : 0);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted = new Intl.NumberFormat(resolveRepositoryCardLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(size);

  return `${formatted}\u00a0${copy[units[unitIndex]]}`;
}
