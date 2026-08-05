import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const chatRenderersEn = {
  'chatRenderers.artifact.restoreFailedTitle': 'Project restore failed',
  'chatRenderers.artifact.setupFailedTitle': 'Project setup failed',
  'chatRenderers.artifact.restoredTitle': 'Project restored',
  'chatRenderers.artifact.createdTitle': 'Project created',
  'chatRenderers.artifact.restoringTitle': 'Restoring project…',
  'chatRenderers.artifact.creatingTitle': 'Creating project…',
  'chatRenderers.artifact.openWorkbench': 'Open the workbench',
  'chatRenderers.artifact.showActions': 'Show actions',
  'chatRenderers.artifact.hideActions': 'Hide actions',
  'chatRenderers.artifact.restoreFiles': 'Restore files from the snapshot',
  'chatRenderers.artifact.initialFilesCreated': 'Initial files created',
  'chatRenderers.artifact.restoreFailed': 'Restore failed',
  'chatRenderers.artifact.setupFailed': 'Project setup failed',
  'chatRenderers.artifact.creatingInitialFiles': 'Creating initial files',
  'chatRenderers.artifact.failureSafe': 'The action failed. Review the failed step and try again.',
  'chatRenderers.artifact.status.pending': 'Queued',
  'chatRenderers.artifact.status.running': 'Running',
  'chatRenderers.artifact.status.complete': 'Done',
  'chatRenderers.artifact.status.failed': 'Failed',
  'chatRenderers.artifact.status.aborted': 'Stopped',
  'chatRenderers.artifact.duration': 'Duration: {duration}',
  'chatRenderers.artifact.createFile': 'Create',
  'chatRenderers.artifact.openFile': 'Open {path}',
  'chatRenderers.artifact.runCommand': 'Run command',
  'chatRenderers.artifact.startApplication': 'Start application',
  'chatRenderers.artifact.showCommand': 'Show command',
  'chatRenderers.artifact.showFailedCommand': 'Show failed command',
  'chatRenderers.artifact.actionFailedSafe': 'This action failed. Review the command or file and try again.',
  'chatRenderers.diff.edit': 'Edit',
  'chatRenderers.diff.targetedPatch': '(targeted patch)',
  'chatRenderers.diff.openFile': 'Open {path}',
  'chatRenderers.diff.added_one': '{count} line added',
  'chatRenderers.diff.added_other': '{count} lines added',
  'chatRenderers.diff.removed_one': '{count} line removed',
  'chatRenderers.diff.removed_other': '{count} lines removed',
  'chatRenderers.diff.summary': '{added}; {removed}',
  'chatRenderers.diff.applyFailedAria': 'The targeted patch could not be applied',
  'chatRenderers.diff.applyFailed': 'Could not apply',
  'chatRenderers.mermaid.label': 'Mermaid diagram',
  'chatRenderers.mermaid.copySource': 'Copy diagram source',
  'chatRenderers.mermaid.copied': 'Copied',
  'chatRenderers.mermaid.canvas': 'Mermaid diagram',
  'chatRenderers.mermaid.rendering': 'Rendering diagram…',
  'chatRenderers.mermaid.renderFailed': 'The Mermaid diagram could not be rendered.',
  'chatRenderers.mermaid.renderHelp': 'Check the diagram syntax, then try again.',
  'chatRenderers.mermaid.retry': 'Try again',
  'chatRenderers.mermaid.source': 'Diagram source',
  'chatRenderers.mermaid.copyFailed': 'The diagram source could not be copied. Try again.',
  'chatRenderers.patchReview.aria': 'Patch review for the assistant message',
  'chatRenderers.patchReview.filesChanged': 'Files changed',
  'chatRenderers.patchReview.files_one': '{count} file',
  'chatRenderers.patchReview.files_other': '{count} files',
  'chatRenderers.patchReview.aggregate': '{added}; {removed}; {files}',
  'chatRenderers.patchReview.decisions': 'Patch review decisions',
  'chatRenderers.patchReview.acceptAll': 'Accept all ({count})',
  'chatRenderers.patchReview.acceptAllAria': 'Accept all ({files})',
  'chatRenderers.patchReview.accepting': 'Accepting…',
  'chatRenderers.patchReview.rejectAll': 'Reject all',
  'chatRenderers.patchReview.rejectAllAria': 'Reject all ({files})',
  'chatRenderers.patchReview.applyFileFailed': 'Could not apply {path}. Try again.',
  'chatRenderers.patchReview.applied_one': '{count} file applied',
  'chatRenderers.patchReview.applied_other': '{count} files applied',
  'chatRenderers.patchReview.failed_one': '{count} file failed',
  'chatRenderers.patchReview.failed_other': '{count} files failed',
  'chatRenderers.patchReview.applySummary': '{applied}; {failed}.',
} as const;

export type ChatRenderersKey = keyof typeof chatRenderersEn;
export type ChatRenderersCopy = Readonly<Record<ChatRenderersKey, string>>;

export const chatRenderersFr: ChatRenderersCopy = {
  'chatRenderers.artifact.restoreFailedTitle': 'Échec de la restauration du projet',
  'chatRenderers.artifact.setupFailedTitle': 'Échec de la configuration du projet',
  'chatRenderers.artifact.restoredTitle': 'Projet restauré',
  'chatRenderers.artifact.createdTitle': 'Projet créé',
  'chatRenderers.artifact.restoringTitle': 'Restauration du projet…',
  'chatRenderers.artifact.creatingTitle': 'Création du projet…',
  'chatRenderers.artifact.openWorkbench': 'Ouvrir l’espace de travail',
  'chatRenderers.artifact.showActions': 'Afficher les actions',
  'chatRenderers.artifact.hideActions': 'Masquer les actions',
  'chatRenderers.artifact.restoreFiles': 'Restaurer les fichiers depuis l’instantané',
  'chatRenderers.artifact.initialFilesCreated': 'Fichiers initiaux créés',
  'chatRenderers.artifact.restoreFailed': 'Échec de la restauration',
  'chatRenderers.artifact.setupFailed': 'Échec de la configuration du projet',
  'chatRenderers.artifact.creatingInitialFiles': 'Création des fichiers initiaux',
  'chatRenderers.artifact.failureSafe': 'L’action a échoué. Vérifiez l’étape concernée, puis réessayez.',
  'chatRenderers.artifact.status.pending': 'En attente',
  'chatRenderers.artifact.status.running': 'En cours',
  'chatRenderers.artifact.status.complete': 'Terminé',
  'chatRenderers.artifact.status.failed': 'Échec',
  'chatRenderers.artifact.status.aborted': 'Arrêté',
  'chatRenderers.artifact.duration': 'Durée : {duration}',
  'chatRenderers.artifact.createFile': 'Créer',
  'chatRenderers.artifact.openFile': 'Ouvrir {path}',
  'chatRenderers.artifact.runCommand': 'Exécuter la commande',
  'chatRenderers.artifact.startApplication': 'Démarrer l’application',
  'chatRenderers.artifact.showCommand': 'Afficher la commande',
  'chatRenderers.artifact.showFailedCommand': 'Afficher la commande en échec',
  'chatRenderers.artifact.actionFailedSafe':
    'Cette action a échoué. Vérifiez la commande ou le fichier, puis réessayez.',
  'chatRenderers.diff.edit': 'Modifier',
  'chatRenderers.diff.targetedPatch': '(patch ciblé)',
  'chatRenderers.diff.openFile': 'Ouvrir {path}',
  'chatRenderers.diff.added_one': '{count} ligne ajoutée',
  'chatRenderers.diff.added_other': '{count} lignes ajoutées',
  'chatRenderers.diff.removed_one': '{count} ligne supprimée',
  'chatRenderers.diff.removed_other': '{count} lignes supprimées',
  'chatRenderers.diff.summary': '{added} ; {removed}',
  'chatRenderers.diff.applyFailedAria': 'Le patch ciblé n’a pas pu être appliqué',
  'chatRenderers.diff.applyFailed': 'Application impossible',
  'chatRenderers.mermaid.label': 'Diagramme Mermaid',
  'chatRenderers.mermaid.copySource': 'Copier la source du diagramme',
  'chatRenderers.mermaid.copied': 'Copié',
  'chatRenderers.mermaid.canvas': 'Diagramme Mermaid',
  'chatRenderers.mermaid.rendering': 'Génération du diagramme…',
  'chatRenderers.mermaid.renderFailed': 'Le diagramme Mermaid n’a pas pu être généré.',
  'chatRenderers.mermaid.renderHelp': 'Vérifiez la syntaxe du diagramme, puis réessayez.',
  'chatRenderers.mermaid.retry': 'Réessayer',
  'chatRenderers.mermaid.source': 'Source du diagramme',
  'chatRenderers.mermaid.copyFailed': 'La source du diagramme n’a pas pu être copiée. Réessayez.',
  'chatRenderers.patchReview.aria': 'Vérification du patch du message de l’assistant',
  'chatRenderers.patchReview.filesChanged': 'Fichiers modifiés',
  'chatRenderers.patchReview.files_one': '{count} fichier',
  'chatRenderers.patchReview.files_other': '{count} fichiers',
  'chatRenderers.patchReview.aggregate': '{added} ; {removed} ; {files}',
  'chatRenderers.patchReview.decisions': 'Décisions de vérification du patch',
  'chatRenderers.patchReview.acceptAll': 'Tout accepter ({count})',
  'chatRenderers.patchReview.acceptAllAria': 'Tout accepter ({files})',
  'chatRenderers.patchReview.accepting': 'Acceptation…',
  'chatRenderers.patchReview.rejectAll': 'Tout refuser',
  'chatRenderers.patchReview.rejectAllAria': 'Tout refuser ({files})',
  'chatRenderers.patchReview.applyFileFailed': 'Impossible d’appliquer {path}. Réessayez.',
  'chatRenderers.patchReview.applied_one': '{count} fichier appliqué',
  'chatRenderers.patchReview.applied_other': '{count} fichiers appliqués',
  'chatRenderers.patchReview.failed_one': 'échec pour {count} fichier',
  'chatRenderers.patchReview.failed_other': 'échec pour {count} fichiers',
  'chatRenderers.patchReview.applySummary': '{applied} ; {failed}.',
};

export function getChatRenderersCopy(language?: string | null): ChatRenderersCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? chatRenderersFr : chatRenderersEn;
}

export function formatChatRenderersCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatChatRenderersPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatChatRenderersCopy(template, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}

export function formatChatRendererDuration(
  language: string | null | undefined,
  milliseconds?: number,
): string | undefined {
  if (!Number.isFinite(milliseconds) || !milliseconds || milliseconds <= 0) {
    return undefined;
  }

  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const integerFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimalFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  if (milliseconds < 1_000) {
    return `${integerFormatter.format(Math.round(milliseconds))}\u00a0ms`;
  }

  if (milliseconds < 60_000) {
    return `${decimalFormatter.format(milliseconds / 1_000)}\u00a0s`;
  }

  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  const formattedMinutes = `${integerFormatter.format(minutes)}\u00a0min`;

  return seconds === 0 ? formattedMinutes : `${formattedMinutes} ${integerFormatter.format(seconds)}\u00a0s`;
}
