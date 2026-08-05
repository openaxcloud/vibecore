import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const diffViewEn = {
  'diffView.fullscreen.enter': 'Enter fullscreen',
  'diffView.fullscreen.exit': 'Exit fullscreen',
  'diffView.fullscreen.dialog': 'Fullscreen comparison for {fileName}',
  'diffView.fullscreen.close': 'Close fullscreen comparison',
  'diffView.warning.binary.title': 'Binary file detected',
  'diffView.warning.binary.description': 'The comparison is not available for binary files.',
  'diffView.warning.processing.title': 'Unable to process the file',
  'diffView.warning.processing.description': 'The diff preview could not be generated.',
  'diffView.identical.title': 'Files are identical',
  'diffView.identical.description': 'Both versions match exactly.',
  'diffView.identical.currentContent': 'Current content',
  'diffView.status.modified': 'Modified',
  'diffView.status.modifiedAt': 'Modified {date}',
  'diffView.status.noChanges': 'No changes',
  'diffView.stats.additions.one': '{count} addition',
  'diffView.stats.additions.other': '{count} additions',
  'diffView.stats.deletions.one': '{count} deletion',
  'diffView.stats.deletions.other': '{count} deletions',
  'diffView.loading.title': 'Preparing the comparison…',
  'diffView.loading.description': 'Loading syntax highlighting.',
  'diffView.loading.error.title': 'Unable to load the comparison',
  'diffView.loading.error.description':
    'Syntax highlighting could not be initialized. Your file content has not been changed.',
  'diffView.loading.retry': 'Retry',
  'diffView.empty.title': 'Select a file',
  'diffView.empty.description': 'Choose a file in the explorer to compare its changes.',
  'diffView.revert.action': 'Revert file',
  'diffView.revert.title': 'Revert file?',
  'diffView.revert.description':
    'This restores {fileName} to its content before these edits and saves it. You cannot undo this action here.',
  'diffView.revert.confirming': 'Reverting…',
  'diffView.revert.confirm': 'Revert file',
  'diffView.revert.cancel': 'Keep changes',
  'diffView.revert.error': 'The file could not be reverted. Check your connection and try again.',
  'diffView.renderError.title': 'Unable to display the comparison',
  'diffView.renderError.description': 'Select the file again or reopen the comparison.',
} as const;

export type DiffViewKey = keyof typeof diffViewEn;
export type DiffViewCopy = Readonly<Record<DiffViewKey, string>>;

export const diffViewFr: DiffViewCopy = {
  'diffView.fullscreen.enter': 'Passer en plein écran',
  'diffView.fullscreen.exit': 'Quitter le plein écran',
  'diffView.fullscreen.dialog': 'Comparaison de {fileName} en plein écran',
  'diffView.fullscreen.close': 'Fermer la comparaison en plein écran',
  'diffView.warning.binary.title': 'Fichier binaire détecté',
  'diffView.warning.binary.description': 'La comparaison n’est pas disponible pour les fichiers binaires.',
  'diffView.warning.processing.title': 'Impossible d’analyser le fichier',
  'diffView.warning.processing.description': 'L’aperçu des modifications n’a pas pu être généré.',
  'diffView.identical.title': 'Fichiers identiques',
  'diffView.identical.description': 'Les deux versions correspondent exactement.',
  'diffView.identical.currentContent': 'Contenu actuel',
  'diffView.status.modified': 'Modifié',
  'diffView.status.modifiedAt': 'Modifié le {date}',
  'diffView.status.noChanges': 'Aucune modification',
  'diffView.stats.additions.one': '{count} ajout',
  'diffView.stats.additions.other': '{count} ajouts',
  'diffView.stats.deletions.one': '{count} suppression',
  'diffView.stats.deletions.other': '{count} suppressions',
  'diffView.loading.title': 'Préparation de la comparaison…',
  'diffView.loading.description': 'Chargement de la coloration syntaxique.',
  'diffView.loading.error.title': 'Impossible de charger la comparaison',
  'diffView.loading.error.description':
    'La coloration syntaxique n’a pas pu être initialisée. Le contenu de votre fichier n’a pas été modifié.',
  'diffView.loading.retry': 'Réessayer',
  'diffView.empty.title': 'Sélectionnez un fichier',
  'diffView.empty.description': 'Choisissez un fichier dans l’explorateur pour comparer ses modifications.',
  'diffView.revert.action': 'Rétablir le fichier',
  'diffView.revert.title': 'Rétablir le fichier ?',
  'diffView.revert.description':
    'Cette action restaure le contenu de {fileName} antérieur à ces modifications, puis l’enregistre. Vous ne pourrez pas l’annuler depuis cette vue.',
  'diffView.revert.confirming': 'Rétablissement…',
  'diffView.revert.confirm': 'Rétablir le fichier',
  'diffView.revert.cancel': 'Conserver les modifications',
  'diffView.revert.error': 'Impossible de rétablir le fichier. Vérifiez votre connexion, puis réessayez.',
  'diffView.renderError.title': 'Impossible d’afficher la comparaison',
  'diffView.renderError.description': 'Sélectionnez de nouveau le fichier ou rouvrez la comparaison.',
};

export function resolveDiffViewLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getDiffViewCopy(language?: string | null): DiffViewCopy {
  return resolveDiffViewLanguage(language) === 'fr' ? diffViewFr : diffViewEn;
}

export function formatDiffViewCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatDiffViewNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveDiffViewLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatDiffViewStatLabel(
  kind: 'additions' | 'deletions',
  count: number,
  language?: string | null,
): string {
  const resolvedLanguage = resolveDiffViewLanguage(language);
  const copy = getDiffViewCopy(resolvedLanguage);
  const plural = new Intl.PluralRules(resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US').select(count);
  const suffix = plural === 'one' ? 'one' : 'other';

  return formatDiffViewCopy(copy[`diffView.stats.${kind}.${suffix}`], {
    count: formatDiffViewNumber(count, resolvedLanguage),
  });
}
