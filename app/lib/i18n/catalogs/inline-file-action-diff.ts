import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const inlineFileActionDiffEn = {
  'inlineFileDiff.aria.file': 'File action diff for {path}',
  'inlineFileDiff.aria.added_one': '{count} line added',
  'inlineFileDiff.aria.added_other': '{count} lines added',
  'inlineFileDiff.aria.removed_one': '{count} line removed',
  'inlineFileDiff.aria.removed_other': '{count} lines removed',
  'inlineFileDiff.status.newFile': 'New file',
  'inlineFileDiff.status.changes': 'Changes',
  'inlineFileDiff.status.noChanges': 'No changes',
  'inlineFileDiff.decision.group': 'File decision',
  'inlineFileDiff.decision.accept': 'Accept file',
  'inlineFileDiff.decision.reject': 'Reject file',
  'inlineFileDiff.repair.attempt': 'Self-repair attempt {attempt}/{maximum}…',
  'inlineFileDiff.repair.validationFailed': 'Code validation failed. A new repair attempt is in progress.',
  'inlineFileDiff.streaming': 'Streaming patch…',
  'inlineFileDiff.noChanges': 'Content is identical to the file on disk.',
  'inlineFileDiff.selection.selected_one': '{count} hunk selected',
  'inlineFileDiff.selection.selected_other': '{count} hunks selected',
  'inlineFileDiff.selection.excluded_one': '{count} hunk excluded',
  'inlineFileDiff.selection.excluded_other': '{count} hunks excluded',
  'inlineFileDiff.hunk.aria': 'Diff hunk {id}',
  'inlineFileDiff.hunk.show': 'Show diff',
} as const;

export type InlineFileActionDiffKey = keyof typeof inlineFileActionDiffEn;
export type InlineFileActionDiffCopy = Readonly<Record<InlineFileActionDiffKey, string>>;

export const inlineFileActionDiffFr: InlineFileActionDiffCopy = {
  'inlineFileDiff.aria.file': 'Diff des modifications du fichier {path}',
  'inlineFileDiff.aria.added_one': '{count} ligne ajoutée',
  'inlineFileDiff.aria.added_other': '{count} lignes ajoutées',
  'inlineFileDiff.aria.removed_one': '{count} ligne supprimée',
  'inlineFileDiff.aria.removed_other': '{count} lignes supprimées',
  'inlineFileDiff.status.newFile': 'Nouveau fichier',
  'inlineFileDiff.status.changes': 'Modifications',
  'inlineFileDiff.status.noChanges': 'Aucune modification',
  'inlineFileDiff.decision.group': 'Décision pour le fichier',
  'inlineFileDiff.decision.accept': 'Accepter le fichier',
  'inlineFileDiff.decision.reject': 'Refuser le fichier',
  'inlineFileDiff.repair.attempt': 'Tentative d’auto-réparation {attempt}/{maximum}…',
  'inlineFileDiff.repair.validationFailed':
    'La validation du code a échoué. Une nouvelle tentative de réparation est en cours.',
  'inlineFileDiff.streaming': 'Réception du patch…',
  'inlineFileDiff.noChanges': 'Le contenu est identique au fichier sur le disque.',
  'inlineFileDiff.selection.selected_one': '{count} bloc sélectionné',
  'inlineFileDiff.selection.selected_other': '{count} blocs sélectionnés',
  'inlineFileDiff.selection.excluded_one': '{count} bloc exclu',
  'inlineFileDiff.selection.excluded_other': '{count} blocs exclus',
  'inlineFileDiff.hunk.aria': 'Bloc de diff {id}',
  'inlineFileDiff.hunk.show': 'Afficher le diff',
};

export function getInlineFileActionDiffCopy(language?: string | null): InlineFileActionDiffCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? inlineFileActionDiffFr : inlineFileActionDiffEn;
}

export function formatInlineFileActionDiffCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatInlineFileActionDiffPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatInlineFileActionDiffCopy(template, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
