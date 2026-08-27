import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const sharedComponentsEn = {
  'sharedUi.breadcrumbs': 'Breadcrumbs',
  'sharedUi.clearSearch': 'Clear search',
  'sharedUi.legal.lastUpdated': 'Last updated: {date}',
  'examplePrompts.workouts': 'Create a mobile app for tracking workouts',
  'examplePrompts.todo': 'Build a to-do app in React using Tailwind',
  'examplePrompts.blog': 'Build a simple blog using Astro',
  'examplePrompts.cookies': 'Create a cookie consent form using Material UI',
  'examplePrompts.spaceInvaders': 'Make a space invaders game',
  'examplePrompts.ticTacToe': 'Make a Tic-Tac-Toe game using only HTML, CSS, and JavaScript',
  'timezone.label': 'Time zone',
  'timezone.search': 'Search time zones',
  'timezone.useDetected.aria': 'Use detected time zone',
  'timezone.useDetected': 'Use detected',
  'timezone.useNamed': 'Use {timeZone}',
  'timezone.detecting': 'Detecting time zone…',
  'timezone.detected': 'Detected: {timeZone}',
  'timezone.invalid': 'Choose a valid IANA time zone.',
  'repositoryStats.title': 'Repository statistics',
  'repositoryStats.files': 'Total files: {count}',
  'repositoryStats.size': 'Total size: {size}',
  'repositoryStats.languages': 'Languages:',
  'repositoryStats.more_one': '+{count} more',
  'repositoryStats.more_other': '+{count} more',
  'repositoryStats.dependencies': 'Dependencies',
} as const;

export type SharedComponentsKey = keyof typeof sharedComponentsEn;
export type SharedComponentsCopy = Readonly<Record<SharedComponentsKey, string>>;

export const sharedComponentsFr: SharedComponentsCopy = {
  'sharedUi.breadcrumbs': 'Fil d’Ariane',
  'sharedUi.clearSearch': 'Effacer la recherche',
  'sharedUi.legal.lastUpdated': 'Dernière mise à jour\u00a0: {date}',
  'examplePrompts.workouts': 'Créer une application mobile de suivi des entraînements',
  'examplePrompts.todo': 'Créer une application de tâches avec React et Tailwind',
  'examplePrompts.blog': 'Créer un blog simple avec Astro',
  'examplePrompts.cookies': 'Créer un formulaire de consentement aux cookies avec Material UI',
  'examplePrompts.spaceInvaders': 'Créer un jeu de type Space Invaders',
  'examplePrompts.ticTacToe': 'Créer un jeu de morpion uniquement avec HTML, CSS et JavaScript',
  'timezone.label': 'Fuseau horaire',
  'timezone.search': 'Rechercher un fuseau horaire',
  'timezone.useDetected.aria': 'Utiliser le fuseau horaire détecté',
  'timezone.useDetected': 'Utiliser le fuseau détecté',
  'timezone.useNamed': 'Utiliser {timeZone}',
  'timezone.detecting': 'Détection du fuseau horaire…',
  'timezone.detected': 'Détecté : {timeZone}',
  'timezone.invalid': 'Choisissez un fuseau horaire IANA valide.',
  'repositoryStats.title': 'Statistiques du dépôt',
  'repositoryStats.files': 'Nombre total de fichiers : {count}',
  'repositoryStats.size': 'Taille totale : {size}',
  'repositoryStats.languages': 'Langages :',
  'repositoryStats.more_one': '+{count} autre',
  'repositoryStats.more_other': '+{count} autres',
  'repositoryStats.dependencies': 'Dépendances',
};

export function getSharedComponentsCopy(language?: string | null): SharedComponentsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? sharedComponentsFr : sharedComponentsEn;
}

export function formatSharedComponentsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatSharedComponentsPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatSharedComponentsCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}

export function formatSharedComponentsSize(bytes: number, language?: string | null): string {
  const french = normalizeSupportedLanguage(language) === 'fr';
  const units = french ? ['o', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB'];
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;

  let size = safeBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const locale = french ? 'fr-FR' : 'en-US';
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(size);

  return `${number}\u00a0${units[unitIndex]}`;
}
