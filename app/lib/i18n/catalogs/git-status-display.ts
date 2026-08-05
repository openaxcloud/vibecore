import { resolveMarketingLanguage } from './marketing';

export const gitStatusDisplayEn = {
  'gitStatusDisplay.status.untracked.label': 'Untracked',
  'gitStatusDisplay.status.untracked.description': 'New file not added to Git yet.',
  'gitStatusDisplay.status.modified.label': 'Modified',
  'gitStatusDisplay.status.modified.description': 'Tracked file with uncommitted local changes.',
  'gitStatusDisplay.status.added.label': 'Added',
  'gitStatusDisplay.status.added.description': 'File staged or prepared to be added to the repository.',
  'gitStatusDisplay.status.deleted.label': 'Deleted',
  'gitStatusDisplay.status.deleted.description': 'Tracked file removed from the workspace.',
  'gitStatusDisplay.status.renamed.label': 'Renamed',
  'gitStatusDisplay.status.renamed.description': 'Tracked file moved or renamed.',
  'gitStatusDisplay.status.copied.label': 'Copied',
  'gitStatusDisplay.status.copied.description': 'File detected as a copy of an existing tracked file.',
  'gitStatusDisplay.status.conflict.label': 'Conflict',
  'gitStatusDisplay.status.conflict.description': 'Merge conflict that must be resolved before committing.',
  'gitStatusDisplay.status.changed.label': 'Changed',
  'gitStatusDisplay.status.changed.description': 'Git reported a changed file.',
  'gitStatusDisplay.legend.title': 'Status guide:',
  'gitStatusDisplay.badge.ariaLabel': 'Git status {{title}}',
} as const;

export type GitStatusDisplayCopyKey = keyof typeof gitStatusDisplayEn;
export type GitStatusDisplayCopy = Readonly<Record<GitStatusDisplayCopyKey, string>>;

export const gitStatusDisplayFr: GitStatusDisplayCopy = {
  'gitStatusDisplay.status.untracked.label': 'Non suivi',
  'gitStatusDisplay.status.untracked.description': 'Nouveau fichier pas encore ajouté à Git.',
  'gitStatusDisplay.status.modified.label': 'Modifié',
  'gitStatusDisplay.status.modified.description': 'Fichier suivi avec des modifications locales sans commit.',
  'gitStatusDisplay.status.added.label': 'Ajouté',
  'gitStatusDisplay.status.added.description': 'Fichier indexé ou préparé pour être ajouté au dépôt.',
  'gitStatusDisplay.status.deleted.label': 'Supprimé',
  'gitStatusDisplay.status.deleted.description': 'Fichier suivi supprimé de l’espace de travail.',
  'gitStatusDisplay.status.renamed.label': 'Renommé',
  'gitStatusDisplay.status.renamed.description': 'Fichier suivi déplacé ou renommé.',
  'gitStatusDisplay.status.copied.label': 'Copié',
  'gitStatusDisplay.status.copied.description': 'Fichier détecté comme copie d’un fichier suivi existant.',
  'gitStatusDisplay.status.conflict.label': 'Conflit',
  'gitStatusDisplay.status.conflict.description': 'Conflit de fusion à résoudre avant de créer un commit.',
  'gitStatusDisplay.status.changed.label': 'Modifié',
  'gitStatusDisplay.status.changed.description': 'Git a signalé une modification du fichier.',
  'gitStatusDisplay.legend.title': 'Guide des états :',
  'gitStatusDisplay.badge.ariaLabel': 'État Git {{title}}',
};

export function getGitStatusDisplayCopy(language?: string | null): GitStatusDisplayCopy {
  return resolveMarketingLanguage(language) === 'fr' ? gitStatusDisplayFr : gitStatusDisplayEn;
}

export function formatGitStatusDisplayCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, key: string) => values[key] ?? '');
}
