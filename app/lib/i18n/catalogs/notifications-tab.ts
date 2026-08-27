import { formatDistanceToNow } from 'date-fns';
import { enUS, fr as frLocale } from 'date-fns/locale';

import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const notificationsTabEn = {
  'notificationsTab.filter.all': 'All Notifications',
  'notificationsTab.filter.system': 'System',
  'notificationsTab.filter.update': 'Updates',
  'notificationsTab.filter.error': 'Errors',
  'notificationsTab.filter.warning': 'Warnings',
  'notificationsTab.filter.info': 'Information',
  'notificationsTab.filter.provider': 'Providers',
  'notificationsTab.filter.network': 'Network',
  'notificationsTab.filter.fallback': 'Filter Notifications',
  'notificationsTab.filter.aria': 'Filter notifications. Current filter: {filter}',
  'notificationsTab.action.clearAll': 'Clear All',
  'notificationsTab.action.clearAria.one': 'Clear {count} notification',
  'notificationsTab.action.clearAria.other': 'Clear {count} notifications',
  'notificationsTab.event.cleared': 'Notifications cleared',
  'notificationsTab.event.updateOpened': 'Update link opened',
  'notificationsTab.event.filterChanged': 'Notification filter changed',
  'notificationsTab.empty.title': 'No Notifications',
  'notificationsTab.empty.description': "You're all caught up!",
  'notificationsTab.empty.filteredTitle': 'No Matching Notifications',
  'notificationsTab.empty.filteredDescription': 'Choose another filter to view different notifications.',
  'notificationsTab.update.currentVersion': 'Current version: {version}',
  'notificationsTab.update.latestVersion': 'Latest version: {version}',
  'notificationsTab.update.branch': 'Branch: {branch}',
  'notificationsTab.update.viewChanges': 'View Changes',
  'notificationsTab.category.label': 'Category: {category}',
  'notificationsTab.category.system': 'System',
  'notificationsTab.category.provider': 'Provider',
  'notificationsTab.category.user': 'User',
  'notificationsTab.category.error': 'Error',
  'notificationsTab.category.api': 'API',
  'notificationsTab.category.auth': 'Authentication',
  'notificationsTab.category.database': 'Database',
  'notificationsTab.category.network': 'Network',
  'notificationsTab.category.performance': 'Performance',
  'notificationsTab.category.settings': 'Settings',
  'notificationsTab.category.task': 'Task',
  'notificationsTab.category.update': 'Update',
  'notificationsTab.category.feature': 'Feature',
  'notificationsTab.error.safeMessage': 'A technical error occurred. Review the affected action and try again.',
  'notificationsTab.time.unknown': 'Unknown date',
} as const;

export type NotificationsTabKey = keyof typeof notificationsTabEn;
export type NotificationsTabCopy = Readonly<Record<NotificationsTabKey, string>>;
export type NotificationsTabPluralCopy = Readonly<{ one: string; other: string }>;

export const notificationsTabFr: NotificationsTabCopy = {
  'notificationsTab.filter.all': 'Toutes les notifications',
  'notificationsTab.filter.system': 'Système',
  'notificationsTab.filter.update': 'Mises à jour',
  'notificationsTab.filter.error': 'Erreurs',
  'notificationsTab.filter.warning': 'Avertissements',
  'notificationsTab.filter.info': 'Informations',
  'notificationsTab.filter.provider': 'Fournisseurs',
  'notificationsTab.filter.network': 'Réseau',
  'notificationsTab.filter.fallback': 'Filtrer les notifications',
  'notificationsTab.filter.aria': 'Filtrer les notifications. Filtre actuel : {filter}',
  'notificationsTab.action.clearAll': 'Tout effacer',
  'notificationsTab.action.clearAria.one': 'Effacer {count} notification',
  'notificationsTab.action.clearAria.other': 'Effacer {count} notifications',
  'notificationsTab.event.cleared': 'Notifications effacées',
  'notificationsTab.event.updateOpened': 'Lien de mise à jour ouvert',
  'notificationsTab.event.filterChanged': 'Filtre de notifications modifié',
  'notificationsTab.empty.title': 'Aucune notification',
  'notificationsTab.empty.description': 'Vous êtes à jour.',
  'notificationsTab.empty.filteredTitle': 'Aucune notification correspondante',
  'notificationsTab.empty.filteredDescription': 'Choisissez un autre filtre pour afficher d’autres notifications.',
  'notificationsTab.update.currentVersion': 'Version actuelle : {version}',
  'notificationsTab.update.latestVersion': 'Dernière version : {version}',
  'notificationsTab.update.branch': 'Branche : {branch}',
  'notificationsTab.update.viewChanges': 'Voir les modifications',
  'notificationsTab.category.label': 'Catégorie : {category}',
  'notificationsTab.category.system': 'Système',
  'notificationsTab.category.provider': 'Fournisseur',
  'notificationsTab.category.user': 'Utilisateur',
  'notificationsTab.category.error': 'Erreur',
  'notificationsTab.category.api': 'API',
  'notificationsTab.category.auth': 'Authentification',
  'notificationsTab.category.database': 'Base de données',
  'notificationsTab.category.network': 'Réseau',
  'notificationsTab.category.performance': 'Performances',
  'notificationsTab.category.settings': 'Paramètres',
  'notificationsTab.category.task': 'Tâche',
  'notificationsTab.category.update': 'Mise à jour',
  'notificationsTab.category.feature': 'Fonctionnalité',
  'notificationsTab.error.safeMessage':
    'Une erreur technique est survenue. Vérifiez l’action concernée, puis réessayez.',
  'notificationsTab.time.unknown': 'Date inconnue',
};

type NotificationsTabInterpolationValue = string | number | bigint;

const CATEGORY_KEYS = {
  system: 'notificationsTab.category.system',
  provider: 'notificationsTab.category.provider',
  user: 'notificationsTab.category.user',
  error: 'notificationsTab.category.error',
  api: 'notificationsTab.category.api',
  auth: 'notificationsTab.category.auth',
  database: 'notificationsTab.category.database',
  network: 'notificationsTab.category.network',
  performance: 'notificationsTab.category.performance',
  settings: 'notificationsTab.category.settings',
  task: 'notificationsTab.category.task',
  update: 'notificationsTab.category.update',
  feature: 'notificationsTab.category.feature',
} as const satisfies Readonly<Record<string, NotificationsTabKey>>;

export function getNotificationsTabCopy(language?: string | null): NotificationsTabCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? notificationsTabFr : notificationsTabEn;
}

export function interpolateNotificationsTabCopy(
  template: string,
  values: Readonly<Record<string, NotificationsTabInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatNotificationsTabNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatNotificationsTabPlural(
  language: string | null | undefined,
  count: number,
  forms: NotificationsTabPluralCopy,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateNotificationsTabCopy(template, {
    count: formatNotificationsTabNumber(count, language),
  });
}

export function formatNotificationsTabRelativeTime(value: string | number | Date, language?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);
  const copy = getNotificationsTabCopy(language);

  if (!Number.isFinite(date.getTime())) {
    return copy['notificationsTab.time.unknown'];
  }

  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: normalizeSupportedLanguage(language) === 'fr' ? frLocale : enUS,
  });
}

export function getNotificationsTabCategoryLabel(category: string, language?: string | null): string {
  const key = CATEGORY_KEYS[category as keyof typeof CATEGORY_KEYS];

  return key ? getNotificationsTabCopy(language)[key] : category;
}

export function getNotificationsTabSafeMessage(
  input: { level: string; category: string; message: string },
  language?: string | null,
): string {
  return input.level === 'error' || input.category === 'error'
    ? getNotificationsTabCopy(language)['notificationsTab.error.safeMessage']
    : input.message;
}
