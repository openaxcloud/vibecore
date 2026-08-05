import { resolveMarketingLanguage } from './marketing';

export const projectSettingsEn = {
  'projectSettings.metaTitle': 'Project settings - E-Code',
  'projectSettings.title': 'Project settings',
  'projectSettings.description': 'Update persistent project metadata, visibility, and runtime preferences.',
  'projectSettings.fields.name': 'Project name',
  'projectSettings.fields.description': 'Description',
  'projectSettings.fields.repositoryUrl': 'Git repository URL',
  'projectSettings.fields.defaultBranch': 'Default branch',
  'projectSettings.actions.saving': 'Saving…',
  'projectSettings.actions.save': 'Save changes',
  'projectSettings.slug.title': 'Project URL slug',
  'projectSettings.slug.description':
    "Changing the slug updates the project's canonical URL. The old URL redirects here for 30 days, so existing links keep working.",
  'projectSettings.slug.label': 'Slug',
  'projectSettings.slug.placeholder': 'my-project',
  'projectSettings.slug.normalized': 'Will be saved as',
  'projectSettings.slug.updated': 'URL slug updated. The previous URL will redirect here for 30 days.',
  'projectSettings.slug.update': 'Update slug',
  'projectSettings.danger.title': 'Danger zone',
  'projectSettings.danger.description':
    'Permanently delete this project and all its data. This action cannot be undone.',
  'projectSettings.danger.open': 'Delete this project',
  'projectSettings.danger.dialogTitle': 'Delete “{project}”?',
  'projectSettings.danger.dialogDescription':
    'This permanently deletes the project and every file, secret, and deployment it owns. This action cannot be undone.',
  'projectSettings.danger.confirmPrefix': 'Type',
  'projectSettings.danger.confirmSuffix': 'to confirm.',
  'projectSettings.danger.confirmLabel': 'Type the project name to confirm deletion',
  'projectSettings.danger.cancel': 'Cancel',
  'projectSettings.danger.deleting': 'Deleting…',
  'projectSettings.danger.delete': 'Delete project',
  'projectSettings.errors.save': 'Unable to save settings. Check the values and try again.',
  'projectSettings.errors.rename': 'Unable to rename the project URL. Try a different slug.',
  'projectSettings.errors.slugTaken': 'This project URL is already in use. Choose a different slug.',
} as const;

export type ProjectSettingsKey = keyof typeof projectSettingsEn;
export type ProjectSettingsCopy = Readonly<Record<ProjectSettingsKey, string>>;

export const projectSettingsFr: ProjectSettingsCopy = {
  'projectSettings.metaTitle': 'Paramètres du projet - E-Code',
  'projectSettings.title': 'Paramètres du projet',
  'projectSettings.description':
    'Mettez à jour les métadonnées persistantes, la visibilité et les préférences de l’environnement d’exécution du projet.',
  'projectSettings.fields.name': 'Nom du projet',
  'projectSettings.fields.description': 'Description',
  'projectSettings.fields.repositoryUrl': 'URL du dépôt Git',
  'projectSettings.fields.defaultBranch': 'Branche par défaut',
  'projectSettings.actions.saving': 'Enregistrement…',
  'projectSettings.actions.save': 'Enregistrer les modifications',
  'projectSettings.slug.title': 'Identifiant de l’URL du projet',
  'projectSettings.slug.description':
    'La modification de l’identifiant met à jour l’URL canonique du projet. L’ancienne URL redirigera ici pendant 30 jours afin de préserver les liens existants.',
  'projectSettings.slug.label': 'Identifiant',
  'projectSettings.slug.placeholder': 'my-project',
  'projectSettings.slug.normalized': 'Sera enregistré sous',
  'projectSettings.slug.updated': 'Identifiant de l’URL mis à jour. L’ancienne URL redirigera ici pendant 30 jours.',
  'projectSettings.slug.update': 'Mettre à jour l’identifiant',
  'projectSettings.danger.title': 'Zone sensible',
  'projectSettings.danger.description':
    'Supprimez définitivement ce projet et toutes ses données. Cette action est irréversible.',
  'projectSettings.danger.open': 'Supprimer ce projet',
  'projectSettings.danger.dialogTitle': 'Supprimer « {project} » ?',
  'projectSettings.danger.dialogDescription':
    'Cette action supprime définitivement le projet, ainsi que tous ses fichiers, secrets et déploiements. Elle est irréversible.',
  'projectSettings.danger.confirmPrefix': 'Saisissez',
  'projectSettings.danger.confirmSuffix': 'pour confirmer.',
  'projectSettings.danger.confirmLabel': 'Saisissez le nom du projet pour confirmer sa suppression',
  'projectSettings.danger.cancel': 'Annuler',
  'projectSettings.danger.deleting': 'Suppression…',
  'projectSettings.danger.delete': 'Supprimer le projet',
  'projectSettings.errors.save': 'Impossible d’enregistrer les paramètres. Vérifiez les valeurs, puis réessayez.',
  'projectSettings.errors.rename':
    'Impossible de renommer l’URL du projet. Choisissez un autre identifiant, puis réessayez.',
  'projectSettings.errors.slugTaken': 'Cette URL de projet est déjà utilisée. Choisissez un autre identifiant.',
};

export function getProjectSettingsCopy(language?: string | null): ProjectSettingsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? projectSettingsFr : projectSettingsEn;
}

export function formatProjectSettingsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
