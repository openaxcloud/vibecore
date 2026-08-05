import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const projectCardMenuEn = {
  'projectCardMenu.actions.ariaLabel': 'Project actions for {name}',
  'projectCardMenu.actions.rename': 'Rename',
  'projectCardMenu.actions.duplicate': 'Duplicate',
  'projectCardMenu.actions.restore': 'Restore',
  'projectCardMenu.actions.archive': 'Archive',
  'projectCardMenu.actions.delete': 'Delete',
  'projectCardMenu.duplicate.name': '{name} Copy',
  'projectCardMenu.error.actionFailed': 'The project action could not be completed. Try again.',
  'projectCardMenu.error.restoreFailed': 'The project could not be restored. Try again.',
  'projectCardMenu.error.renameFailed': 'The project could not be renamed. Try again.',
  'projectCardMenu.toast.restored': 'Restored “{name}”',
  'projectCardMenu.toast.duplicated': 'Duplicated “{name}”',
  'projectCardMenu.toast.deleted': 'Deleted “{name}”',
  'projectCardMenu.toast.archived': 'Archived “{name}”',
  'projectCardMenu.toast.undo': 'Undo',
  'projectCardMenu.delete.title': 'Delete project',
  'projectCardMenu.delete.description':
    'This permanently deletes “{name}” and all of its data. This action cannot be undone.',
  'projectCardMenu.delete.deploymentWarning': 'This project has an active deployment. Type its name below to confirm.',
  'projectCardMenu.delete.typeName': 'Type {name} to confirm deletion',
  'projectCardMenu.delete.cancel': 'Cancel',
  'projectCardMenu.delete.confirm': 'Delete project',
  'projectCardMenu.rename.ariaLabel': 'Rename project {name}',
} as const;

export type ProjectCardMenuKey = keyof typeof projectCardMenuEn;
export type ProjectCardMenuCopy = Readonly<Record<ProjectCardMenuKey, string>>;

export const projectCardMenuFr: ProjectCardMenuCopy = {
  'projectCardMenu.actions.ariaLabel': 'Actions du projet {name}',
  'projectCardMenu.actions.rename': 'Renommer',
  'projectCardMenu.actions.duplicate': 'Dupliquer',
  'projectCardMenu.actions.restore': 'Restaurer',
  'projectCardMenu.actions.archive': 'Archiver',
  'projectCardMenu.actions.delete': 'Supprimer',
  'projectCardMenu.duplicate.name': '{name} — copie',
  'projectCardMenu.error.actionFailed': 'Impossible d’effectuer cette action sur le projet. Réessayez.',
  'projectCardMenu.error.restoreFailed': 'Impossible de restaurer le projet. Réessayez.',
  'projectCardMenu.error.renameFailed': 'Impossible de renommer le projet. Réessayez.',
  'projectCardMenu.toast.restored': '« {name} » restauré',
  'projectCardMenu.toast.duplicated': '« {name} » dupliqué',
  'projectCardMenu.toast.deleted': '« {name} » supprimé',
  'projectCardMenu.toast.archived': '« {name} » archivé',
  'projectCardMenu.toast.undo': 'Annuler',
  'projectCardMenu.delete.title': 'Supprimer le projet',
  'projectCardMenu.delete.description':
    'Cette action supprime définitivement « {name} » et toutes ses données. Elle est irréversible.',
  'projectCardMenu.delete.deploymentWarning':
    'Ce projet possède un déploiement actif. Saisissez son nom ci-dessous pour confirmer.',
  'projectCardMenu.delete.typeName': 'Saisissez {name} pour confirmer la suppression',
  'projectCardMenu.delete.cancel': 'Annuler',
  'projectCardMenu.delete.confirm': 'Supprimer le projet',
  'projectCardMenu.rename.ariaLabel': 'Renommer le projet {name}',
};

export function getProjectCardMenuCopy(language?: string | null): ProjectCardMenuCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? projectCardMenuFr : projectCardMenuEn;
}

export function formatProjectCardMenuCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
