import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const gitMergeEditorEn = {
  'gitMergeEditor.conflicts_one': '{count} conflict',
  'gitMergeEditor.conflicts_other': '{count} conflicts',
  'gitMergeEditor.hunkView': 'Hunk view',
  'gitMergeEditor.editRaw': 'Edit raw',
  'gitMergeEditor.close': 'Close merge editor',
  'gitMergeEditor.raw.aria': 'Raw merge result',
  'gitMergeEditor.accept.current': 'Accept current',
  'gitMergeEditor.accept.incoming': 'Accept incoming',
  'gitMergeEditor.accept.both': 'Accept both',
  'gitMergeEditor.status.removeMarkers': 'Remove all conflict markers before resolving.',
  'gitMergeEditor.status.ready': 'Ready to mark resolved.',
  'gitMergeEditor.status.allChosen': 'All conflicts chosen.',
  'gitMergeEditor.status.choose': 'Choose a side for each conflict ({chosen}/{total}).',
  'gitMergeEditor.markResolved': 'Mark resolved',
} as const;

export type GitMergeEditorKey = keyof typeof gitMergeEditorEn;
export type GitMergeEditorCopy = Readonly<Record<GitMergeEditorKey, string>>;

export const gitMergeEditorFr: GitMergeEditorCopy = {
  'gitMergeEditor.conflicts_one': '{count} conflit',
  'gitMergeEditor.conflicts_other': '{count} conflits',
  'gitMergeEditor.hunkView': 'Vue par bloc',
  'gitMergeEditor.editRaw': 'Modifier le contenu brut',
  'gitMergeEditor.close': 'Fermer l’éditeur de fusion',
  'gitMergeEditor.raw.aria': 'Résultat brut de la fusion',
  'gitMergeEditor.accept.current': 'Accepter la version actuelle',
  'gitMergeEditor.accept.incoming': 'Accepter la version entrante',
  'gitMergeEditor.accept.both': 'Accepter les deux',
  'gitMergeEditor.status.removeMarkers': 'Supprimez tous les marqueurs de conflit avant de valider.',
  'gitMergeEditor.status.ready': 'Prêt à marquer comme résolu.',
  'gitMergeEditor.status.allChosen': 'Tous les conflits ont été traités.',
  'gitMergeEditor.status.choose': 'Choisissez une version pour chaque conflit ({chosen}/{total}).',
  'gitMergeEditor.markResolved': 'Marquer comme résolu',
};

export function getGitMergeEditorCopy(language?: string | null): GitMergeEditorCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? gitMergeEditorFr : gitMergeEditorEn;
}

export function formatGitMergeEditorCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatGitMergeEditorConflicts(count: number, language?: string | null): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const copy = getGitMergeEditorCopy(language);
  const suffix = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';

  return formatGitMergeEditorCopy(copy[`gitMergeEditor.conflicts_${suffix}`], {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
