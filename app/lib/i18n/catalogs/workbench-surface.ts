import { resolveMarketingLanguage } from './marketing';

export const workbenchSurfaceEn = {
  'workbenchSurface.tab.code': 'Code',
  'workbenchSurface.tab.diff': 'Diff',
  'workbenchSurface.tab.preview': 'Preview',
  'workbenchSurface.tab.git': 'Git',
  'workbenchSurface.files.changes': 'File Changes',
  'workbenchSurface.files.search': 'Search files...',
  'workbenchSurface.files.noMatches': 'No matching files',
  'workbenchSurface.files.noModified': 'No modified files',
  'workbenchSurface.files.tryAnotherSearch': 'Try another search',
  'workbenchSurface.files.changesAppear': 'Changes will appear here as you edit',
  'workbenchSurface.files.copySuccess': 'File list copied to clipboard',
  'workbenchSurface.files.copyFailed': 'Failed to copy file list to clipboard',
  'workbenchSurface.files.copy': 'Copy File List',
  'workbenchSurface.files.savedNamed': 'Saved {file}',
  'workbenchSurface.files.saved': 'File saved',
  'workbenchSurface.files.saveFailed': 'Failed to update file content',
  'workbenchSurface.preview.stopFailed': 'Failed to stop preview',
  'workbenchSurface.preview.startFailed': 'Failed to start preview',
  'workbenchSurface.sync.success': 'Files synced successfully',
  'workbenchSurface.sync.failed': 'Failed to sync files',
  'workbenchSurface.agent.hide': 'Hide agent panel',
  'workbenchSurface.agent.show': 'Show agent panel',
  'workbenchSurface.mobile.files': 'Files',
  'workbenchSurface.mobile.search': 'Search',
  'workbenchSurface.mobile.locks': 'Locks',
  'workbenchSurface.mobile.preview': 'Preview',
  'workbenchSurface.mobile.deploy': 'Deploy',
  'workbenchSurface.mobile.editor': 'Editor',
  'workbenchSurface.sync.syncing': 'Syncing...',
  'workbenchSurface.sync.action': 'Sync',
  'workbenchSurface.sync.files': 'Sync Files',
  'workbenchSurface.terminal.toggle': 'Toggle Terminal',
  'workbenchSurface.review.editor': 'Editor',
  'workbenchSurface.review.review': 'Review',
  'workbenchSurface.close': 'Close workbench',
  'workbenchSurface.git.unavailable': 'Open a project workspace to use Git tools.',
  'workbenchSurface.run.startingAria': 'Starting project',
  'workbenchSurface.run.stopAria': 'Stop running',
  'workbenchSurface.run.stoppingAria': 'Stopping project',
  'workbenchSurface.run.retryAria': 'Retry run',
  'workbenchSurface.run.runAria': 'Run project',
  'workbenchSurface.run.starting': 'Starting',
  'workbenchSurface.run.stop': 'Stop',
  'workbenchSurface.run.stopping': 'Stopping',
  'workbenchSurface.run.retry': 'Retry',
  'workbenchSurface.run.run': 'Run',
} as const;

export type WorkbenchSurfaceKey = keyof typeof workbenchSurfaceEn;
export type WorkbenchSurfaceCopy = Readonly<Record<WorkbenchSurfaceKey, string>>;

export const workbenchSurfaceFr: WorkbenchSurfaceCopy = {
  'workbenchSurface.tab.code': 'Code',
  'workbenchSurface.tab.diff': 'Diff',
  'workbenchSurface.tab.preview': 'Aperçu',
  'workbenchSurface.tab.git': 'Git',
  'workbenchSurface.files.changes': 'Modifications des fichiers',
  'workbenchSurface.files.search': 'Rechercher des fichiers…',
  'workbenchSurface.files.noMatches': 'Aucun fichier correspondant',
  'workbenchSurface.files.noModified': 'Aucun fichier modifié',
  'workbenchSurface.files.tryAnotherSearch': 'Essayez une autre recherche',
  'workbenchSurface.files.changesAppear': 'Les modifications apparaîtront ici pendant votre travail',
  'workbenchSurface.files.copySuccess': 'Liste des fichiers copiée dans le presse-papiers',
  'workbenchSurface.files.copyFailed': 'Impossible de copier la liste des fichiers dans le presse-papiers',
  'workbenchSurface.files.copy': 'Copier la liste des fichiers',
  'workbenchSurface.files.savedNamed': '{file} enregistré',
  'workbenchSurface.files.saved': 'Fichier enregistré',
  'workbenchSurface.files.saveFailed': 'Impossible de mettre à jour le contenu du fichier',
  'workbenchSurface.preview.stopFailed': 'Impossible d’arrêter l’aperçu',
  'workbenchSurface.preview.startFailed': 'Impossible de démarrer l’aperçu',
  'workbenchSurface.sync.success': 'Fichiers synchronisés',
  'workbenchSurface.sync.failed': 'Impossible de synchroniser les fichiers',
  'workbenchSurface.agent.hide': 'Masquer le panneau de l’agent',
  'workbenchSurface.agent.show': 'Afficher le panneau de l’agent',
  'workbenchSurface.mobile.files': 'Fichiers',
  'workbenchSurface.mobile.search': 'Recherche',
  'workbenchSurface.mobile.locks': 'Verrous',
  'workbenchSurface.mobile.preview': 'Aperçu',
  'workbenchSurface.mobile.deploy': 'Déployer',
  'workbenchSurface.mobile.editor': 'Éditeur',
  'workbenchSurface.sync.syncing': 'Synchronisation…',
  'workbenchSurface.sync.action': 'Synchroniser',
  'workbenchSurface.sync.files': 'Synchroniser les fichiers',
  'workbenchSurface.terminal.toggle': 'Afficher ou masquer le terminal',
  'workbenchSurface.review.editor': 'Éditeur',
  'workbenchSurface.review.review': 'Révision',
  'workbenchSurface.close': 'Fermer l’espace de travail',
  'workbenchSurface.git.unavailable': 'Ouvrez un espace de travail de projet pour utiliser les outils Git.',
  'workbenchSurface.run.startingAria': 'Démarrage du projet',
  'workbenchSurface.run.stopAria': 'Arrêter l’exécution',
  'workbenchSurface.run.stoppingAria': 'Arrêt du projet',
  'workbenchSurface.run.retryAria': 'Relancer le projet',
  'workbenchSurface.run.runAria': 'Exécuter le projet',
  'workbenchSurface.run.starting': 'Démarrage',
  'workbenchSurface.run.stop': 'Arrêter',
  'workbenchSurface.run.stopping': 'Arrêt',
  'workbenchSurface.run.retry': 'Réessayer',
  'workbenchSurface.run.run': 'Exécuter',
};

export function getWorkbenchSurfaceCopy(language?: string | null): WorkbenchSurfaceCopy {
  return resolveMarketingLanguage(language) === 'fr' ? workbenchSurfaceFr : workbenchSurfaceEn;
}

export function formatWorkbenchSurfaceCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatWorkbenchSurfaceNumber(language: string | null | undefined, value: number): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}
