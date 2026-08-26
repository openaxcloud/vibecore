import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const importRoutesEn = {
  'importRoutes.zip.meta.title': 'Import a zip archive - E-Code',
  'importRoutes.zip.meta.description':
    'Import a zip archive into a persistent E-Code project after a security scan for exposed secrets.',
  'importRoutes.zip.page.title': 'Import a zip archive',
  'importRoutes.zip.page.sourceTitle': 'Import a {source} export',
  'importRoutes.zip.page.description': 'Upload an archive and convert it into a persistent E-Code project.',
  'importRoutes.zip.page.sourceDescription':
    'Upload your {source} export (.zip). Files are staged and scanned for exposed secrets before they are added to a persistent E-Code project.',
  'importRoutes.zip.source.previousAgent': 'previous agent',
  'importRoutes.zip.form.archive': 'Project archive',
  'importRoutes.zip.form.chooseFile': 'Choose a file',
  'importRoutes.zip.form.noFile': 'No file selected',
  'importRoutes.zip.form.limit': '.zip up to {size}.',
  'importRoutes.zip.form.projectName': 'Project name',
  'importRoutes.zip.form.projectPlaceholder': 'Imported archive',
  'importRoutes.zip.form.importing': 'Importing…',
  'importRoutes.zip.form.submit': 'Import the zip archive',
  'importRoutes.zip.form.progress': 'Importing the archive',
  'importRoutes.zip.error.archiveRequired': 'Select a zip archive before continuing.',
  'importRoutes.zip.error.tooLarge':
    'This archive is {size}. Zip imports must be smaller than {limit} because they are uploaded in one request. Reduce the archive and try again.',
  'importRoutes.zip.error.importFailed': 'The zip archive could not be imported. Check the archive and try again.',
  'importRoutes.empty.meta.title': 'Create an empty project - E-Code',
  'importRoutes.empty.meta.description':
    'Create a blank E-Code project with only the files required to start the runtime.',
  'importRoutes.empty.page.title': 'Empty project',
  'importRoutes.empty.page.description':
    'Start with a blank workspace: no agent prompt, framework, or generated scaffolding. The project opens directly in the IDE, ready to edit.',
  'importRoutes.empty.form.projectName': 'Project name',
  'importRoutes.empty.form.projectPlaceholder': 'Empty project',
  'importRoutes.empty.form.help':
    'The workspace contains only the minimal files required to start the runtime. Nothing else is generated.',
  'importRoutes.empty.form.creating': 'Creating…',
  'importRoutes.empty.form.submit': 'Create the empty project',
  'importRoutes.empty.form.progress': 'Creating the empty project',
  'importRoutes.empty.generated.defaultName': 'Empty project',
  'importRoutes.empty.error.quota':
    'Your workspace has reached its project limit. Upgrade the plan or ask an administrator to increase the quota before creating another project.',
  'importRoutes.empty.error.createFailed': 'The empty project could not be created. Try again.',
  'importRoutes.git.meta.title': 'Import a Git repository - E-Code',
  'importRoutes.git.meta.description':
    'Import a GitHub, GitLab, or Bitbucket repository into a persistent project and open it in the E-Code IDE.',
  'importRoutes.git.page.title': 'Import a Git repository',
  'importRoutes.git.page.description':
    'Import a GitHub, GitLab, or Bitbucket repository into a persistent project, then open it in the E-Code IDE.',
  'importRoutes.git.form.repositoryUrl': 'Repository URL',
  'importRoutes.git.form.repositoryPlaceholder': 'https://github.com/organization/repository',
  'importRoutes.git.form.branch': 'Branch',
  'importRoutes.git.form.branchPlaceholder': 'main',
  'importRoutes.git.form.projectName': 'Project name',
  'importRoutes.git.form.projectPlaceholder': 'Imported application',
  'importRoutes.git.form.importing': 'Importing…',
  'importRoutes.git.form.submit': 'Import the repository',
  'importRoutes.git.form.progress': 'Importing the repository',
  'importRoutes.git.error.urlRequired': 'Enter the repository URL before continuing.',
  'importRoutes.git.error.inaccessible':
    'This repository could not be accessed. Check the URL and your permissions, then try again.',
  'importRoutes.git.error.quota':
    'Your workspace has reached its project limit. Upgrade the plan or ask an administrator to increase the quota before importing another repository.',
  'importRoutes.git.error.workspaceStarting':
    'The workspace is still starting. No second import was submitted; wait a moment, then retry.',
  'importRoutes.git.error.serviceUnavailable':
    'The import service is temporarily unavailable. Nothing was retried automatically; try again when service recovers.',
  'importRoutes.git.error.importFailed': 'The repository could not be imported. Try again.',
} as const;

export type ImportRoutesKey = keyof typeof importRoutesEn;
export type ImportRoutesCopy = Readonly<Record<ImportRoutesKey, string>>;

export const importRoutesFr: ImportRoutesCopy = {
  'importRoutes.zip.meta.title': 'Importer une archive zip - E-Code',
  'importRoutes.zip.meta.description':
    'Importez une archive zip dans un projet E-Code persistant après une analyse de sécurité des secrets exposés.',
  'importRoutes.zip.page.title': 'Importer une archive zip',
  'importRoutes.zip.page.sourceTitle': 'Importer un export {source}',
  'importRoutes.zip.page.description': 'Téléversez une archive et convertissez-la en projet E-Code persistant.',
  'importRoutes.zip.page.sourceDescription':
    'Téléversez votre export {source} (.zip). Les fichiers sont placés dans une zone temporaire et analysés afin de détecter les secrets exposés avant leur ajout à un projet E-Code persistant.',
  'importRoutes.zip.source.previousAgent': 'd’un agent précédent',
  'importRoutes.zip.form.archive': 'Archive du projet',
  'importRoutes.zip.form.chooseFile': 'Choisir un fichier',
  'importRoutes.zip.form.noFile': 'Aucun fichier sélectionné',
  'importRoutes.zip.form.limit': '.zip jusqu’à {size}.',
  'importRoutes.zip.form.projectName': 'Nom du projet',
  'importRoutes.zip.form.projectPlaceholder': 'Archive importée',
  'importRoutes.zip.form.importing': 'Importation…',
  'importRoutes.zip.form.submit': 'Importer l’archive zip',
  'importRoutes.zip.form.progress': 'Importation de l’archive',
  'importRoutes.zip.error.archiveRequired': 'Sélectionnez une archive zip avant de continuer.',
  'importRoutes.zip.error.tooLarge':
    'Cette archive pèse {size}. Les imports zip doivent être inférieurs à {limit}, car ils sont téléversés en une seule requête. Réduisez l’archive, puis réessayez.',
  'importRoutes.zip.error.importFailed': 'Impossible d’importer l’archive zip. Vérifiez l’archive, puis réessayez.',
  'importRoutes.empty.meta.title': 'Créer un projet vide - E-Code',
  'importRoutes.empty.meta.description':
    'Créez un projet E-Code vierge contenant uniquement les fichiers nécessaires au démarrage de l’environnement d’exécution.',
  'importRoutes.empty.page.title': 'Projet vide',
  'importRoutes.empty.page.description':
    'Partez d’un espace de travail vierge : aucun prompt d’agent, framework ou échafaudage généré. Le projet s’ouvre directement dans l’IDE, prêt à être modifié.',
  'importRoutes.empty.form.projectName': 'Nom du projet',
  'importRoutes.empty.form.projectPlaceholder': 'Projet vide',
  'importRoutes.empty.form.help':
    'L’espace de travail contient uniquement les fichiers indispensables au démarrage de l’environnement d’exécution. Rien d’autre n’est généré.',
  'importRoutes.empty.form.creating': 'Création…',
  'importRoutes.empty.form.submit': 'Créer le projet vide',
  'importRoutes.empty.form.progress': 'Création du projet vide',
  'importRoutes.empty.generated.defaultName': 'Projet vide',
  'importRoutes.empty.error.quota':
    'Votre espace de travail a atteint sa limite de projets. Changez d’offre ou demandez à un administrateur d’augmenter le quota avant de créer un autre projet.',
  'importRoutes.empty.error.createFailed': 'Impossible de créer le projet vide. Réessayez.',
  'importRoutes.git.meta.title': 'Importer un dépôt Git - E-Code',
  'importRoutes.git.meta.description':
    'Importez un dépôt GitHub, GitLab ou Bitbucket dans un projet persistant et ouvrez-le dans l’IDE E-Code.',
  'importRoutes.git.page.title': 'Importer un dépôt Git',
  'importRoutes.git.page.description':
    'Importez un dépôt GitHub, GitLab ou Bitbucket dans un projet persistant, puis ouvrez-le dans l’IDE E-Code.',
  'importRoutes.git.form.repositoryUrl': 'URL du dépôt',
  'importRoutes.git.form.repositoryPlaceholder': 'https://github.com/organisation/depot',
  'importRoutes.git.form.branch': 'Branche',
  'importRoutes.git.form.branchPlaceholder': 'main',
  'importRoutes.git.form.projectName': 'Nom du projet',
  'importRoutes.git.form.projectPlaceholder': 'Application importée',
  'importRoutes.git.form.importing': 'Importation…',
  'importRoutes.git.form.submit': 'Importer le dépôt',
  'importRoutes.git.form.progress': 'Importation du dépôt',
  'importRoutes.git.error.urlRequired': 'Saisissez l’URL du dépôt avant de continuer.',
  'importRoutes.git.error.inaccessible':
    'Impossible d’accéder à ce dépôt. Vérifiez l’URL et vos autorisations, puis réessayez.',
  'importRoutes.git.error.quota':
    'Votre espace de travail a atteint sa limite de projets. Changez d’offre ou demandez à un administrateur d’augmenter le quota avant d’importer un autre dépôt.',
  'importRoutes.git.error.workspaceStarting':
    'L’espace de travail démarre encore. Aucun second import n’a été envoyé ; patientez un instant, puis réessayez.',
  'importRoutes.git.error.serviceUnavailable':
    'Le service d’import est temporairement indisponible. Aucun nouvel essai automatique n’a été lancé ; réessayez après son rétablissement.',
  'importRoutes.git.error.importFailed': 'Impossible d’importer le dépôt. Réessayez.',
};

export function getImportRoutesCopy(language?: string | null): ImportRoutesCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? importRoutesFr : importRoutesEn;
}

export function formatImportRoutesCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatImportArchiveSize(bytes: number, language?: string | null): string {
  const french = normalizeSupportedLanguage(language) === 'fr';
  const locale = french ? 'fr-FR' : 'en-US';
  const size = bytes / (1024 * 1024);

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size)}\u00a0${french ? 'Mo' : 'MB'}`;
}
