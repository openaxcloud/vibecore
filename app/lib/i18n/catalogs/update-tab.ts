import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const updateTabEn = {
  'updateTab.title': 'Update status',
  'updateTab.status.idle': 'Check upstream/main for changes.',
  'updateTab.status.checking': 'Checking for updates…',
  'updateTab.status.progress': 'Checking for updates… {progress}%',
  'updateTab.status.available': 'Updates are available for review.',
  'updateTab.status.complete': 'The update check is complete.',
  'updateTab.status.failed': 'The update check could not be completed. Try again.',
  'updateTab.action.check': 'Check for updates',
  'updateTab.action.checking': 'Checking…',
  'updateTab.current': 'Current',
  'updateTab.upstream': 'Upstream',
  'updateTab.diff': 'Diff',
  'updateTab.compare': 'Compare changes in the source repository',
  'updateTab.commits_one': '{count} commit',
  'updateTab.commits_other': '{count} commits',
  'updateTab.changedFiles_one': '{count} changed file',
  'updateTab.changedFiles_other': '{count} changed files',
  'updateTab.noCommits': 'No commit message is available.',
  'updateTab.noChangedFiles': 'No changed file is available.',
  'updateTab.upToDate': 'You are up to date — there are no changes to review.',
} as const;

export type UpdateTabKey = keyof typeof updateTabEn;
export type UpdateTabCopy = Readonly<Record<UpdateTabKey, string>>;

export const updateTabFr: UpdateTabCopy = {
  'updateTab.title': 'Statut des mises à jour',
  'updateTab.status.idle': 'Recherchez les modifications sur upstream/main.',
  'updateTab.status.checking': 'Recherche des mises à jour…',
  'updateTab.status.progress': 'Recherche des mises à jour… {progress} %',
  'updateTab.status.available': 'Des mises à jour sont disponibles pour examen.',
  'updateTab.status.complete': 'La recherche de mises à jour est terminée.',
  'updateTab.status.failed': 'Impossible de rechercher les mises à jour. Réessayez.',
  'updateTab.action.check': 'Rechercher les mises à jour',
  'updateTab.action.checking': 'Recherche…',
  'updateTab.current': 'Version actuelle',
  'updateTab.upstream': 'Version distante',
  'updateTab.diff': 'Diff',
  'updateTab.compare': 'Comparer les modifications dans le dépôt source',
  'updateTab.commits_one': '{count} commit',
  'updateTab.commits_other': '{count} commits',
  'updateTab.changedFiles_one': '{count} fichier modifié',
  'updateTab.changedFiles_other': '{count} fichiers modifiés',
  'updateTab.noCommits': 'Aucun message de commit disponible.',
  'updateTab.noChangedFiles': 'Aucun fichier modifié disponible.',
  'updateTab.upToDate': 'Vous êtes à jour — aucune modification à examiner.',
};

export function getUpdateTabCopy(language?: string | null): UpdateTabCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? updateTabFr : updateTabEn;
}

export function formatUpdateTabCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatUpdateTabPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatUpdateTabCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}
