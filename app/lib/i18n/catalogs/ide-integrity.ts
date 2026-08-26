export const ideIntegrityEn = {
  'ideIntegrity.quota.label': 'Workspace quota action required',
  'ideIntegrity.quota.title': 'This workspace cannot start yet',
  'ideIntegrity.quota.retry': 'Retry workspace start',
  'ideIntegrity.quota.retrying': 'Retrying…',
  'ideIntegrity.quota.billing': 'Review plans and usage',
  'ideIntegrity.save.label': 'File save action required',
  'ideIntegrity.save.conflictTitle': 'Choose which version to keep — {file}',
  'ideIntegrity.save.conflictDescription':
    'The workspace copy changed after this file was opened. Your editor buffer has not been overwritten.',
  'ideIntegrity.save.errorTitle': 'This file is not saved yet — {file}',
  'ideIntegrity.save.errorDescription':
    'The workspace write failed. Your editor buffer remains open; retry the save or review File History.',
  'ideIntegrity.save.recovery':
    'Your buffer stays unchanged. A durable recovery copy is required before the workspace version can replace it.',
  'ideIntegrity.save.moreIssues': '{count} other file(s) still need save attention.',
  'ideIntegrity.save.review': 'Review recovery copy',
  'ideIntegrity.save.retry': 'Retry save',
  'ideIntegrity.save.keepLocal': 'Keep my version',
  'ideIntegrity.save.useRemote': 'Use workspace version',
  'ideIntegrity.save.resolving': 'Applying…',
  'ideIntegrity.save.actionFailed':
    'The file changed again or the workspace is unavailable. Review the updated notice and retry.',
} as const;

export type IdeIntegrityKey = keyof typeof ideIntegrityEn;
export type IdeIntegrityCopy = Readonly<Record<IdeIntegrityKey, string>>;

export const ideIntegrityFr: IdeIntegrityCopy = {
  'ideIntegrity.quota.label': 'Action requise pour le quota de l’espace de travail',
  'ideIntegrity.quota.title': 'Cet espace de travail ne peut pas encore démarrer',
  'ideIntegrity.quota.retry': 'Réessayer le démarrage',
  'ideIntegrity.quota.retrying': 'Nouvelle tentative…',
  'ideIntegrity.quota.billing': 'Consulter les offres et l’utilisation',
  'ideIntegrity.save.label': 'Action requise pour enregistrer le fichier',
  'ideIntegrity.save.conflictTitle': 'Choisissez la version à conserver — {file}',
  'ideIntegrity.save.conflictDescription':
    'La version de l’espace de travail a changé après l’ouverture du fichier. Le contenu de votre éditeur n’a pas été remplacé.',
  'ideIntegrity.save.errorTitle': 'Ce fichier n’est pas encore enregistré — {file}',
  'ideIntegrity.save.errorDescription':
    'L’écriture dans l’espace de travail a échoué. Le contenu reste ouvert dans l’éditeur ; réessayez ou consultez l’historique du fichier.',
  'ideIntegrity.save.recovery':
    'Votre contenu reste inchangé. Une copie durable est exigée avant que la version de l’espace de travail puisse le remplacer.',
  'ideIntegrity.save.moreIssues': '{count} autre(s) fichier(s) nécessitent encore votre attention.',
  'ideIntegrity.save.review': 'Examiner la copie de récupération',
  'ideIntegrity.save.retry': 'Réessayer l’enregistrement',
  'ideIntegrity.save.keepLocal': 'Conserver ma version',
  'ideIntegrity.save.useRemote': 'Utiliser la version de l’espace de travail',
  'ideIntegrity.save.resolving': 'Application…',
  'ideIntegrity.save.actionFailed':
    'Le fichier a encore changé ou l’espace de travail est indisponible. Consultez le message actualisé, puis réessayez.',
};

export function getIdeIntegrityCopy(language?: string | null): IdeIntegrityCopy {
  return language?.toLowerCase().startsWith('fr') ? ideIntegrityFr : ideIntegrityEn;
}

export function formatIdeIntegrityCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? `{${key}}`);
}
