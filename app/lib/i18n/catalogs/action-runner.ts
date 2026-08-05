import { resolveMarketingLanguage } from './marketing';

export const actionRunnerEn = {
  'actionRunner.error.selfRepairEmpty': 'self-repair endpoint returned empty content',
  'actionRunner.error.selfRepairStatus': 'self-repair endpoint returned status {status}',
  'actionRunner.error.shellExecutionFailed': 'Failed To Execute Shell Command: {message}\n\nOutput:\n{output}',
  'actionRunner.error.timeout': '{actionType} action timed out after {seconds} seconds',
  'actionRunner.error.actionFailed': 'Action failed',
  'actionRunner.error.noShellResponse': 'No response from shell',
  'actionRunner.error.startFailed': 'Failed To Start Application',
  'actionRunner.error.noOutputAvailable': 'No Output Available',
  'actionRunner.error.unsupportedAction': 'Unsupported action type: {actionType}',
  'actionRunner.alert.devServerFailed': 'Dev Server Failed',
  'actionRunner.diff.targetMissing': 'diff target {filePath} does not exist — full file required',
  'actionRunner.diff.noBlocks': 'no SEARCH/REPLACE blocks found',
  'actionRunner.diff.invalidStructure': 'invalid SEARCH/REPLACE block structure',
  'actionRunner.diff.block': 'block #{index}',
  'actionRunner.diff.malformed': 'diff for {filePath} could not be parsed ({detail}) — re-emit the full file',
  'actionRunner.diff.anchors': ' ({anchors})',
  'actionRunner.diff.notApplied':
    'diff for {filePath} did not apply against the current file{anchors} — the file drifted from the anchor; re-emit the full file',
  'actionRunner.diff.alertTitle': 'Diff could not be applied',
  'actionRunner.build.runningTitle': 'Building Application',
  'actionRunner.build.runningDescription': 'Building your application...',
  'actionRunner.build.failedTitle': 'Build Failed',
  'actionRunner.build.failedDescription': 'Your application build failed',
  'actionRunner.build.noOutput': 'No build output available',
  'actionRunner.build.completedTitle': 'Build Completed',
  'actionRunner.build.completedDescription': 'Your application was built successfully',
  'actionRunner.supabase.migrationPathMissing': 'Migration requires a filePath',
  'actionRunner.supabase.migrationTitle': 'Supabase Migration',
  'actionRunner.supabase.migrationDescription': 'Create migration file: {filePath}',
  'actionRunner.supabase.queryTitle': 'Supabase Query',
  'actionRunner.supabase.queryDescription': 'Execute database query',
  'actionRunner.supabase.unknownOperation': 'Unknown operation: {operation}',
  'actionRunner.deploy.buildingTitle': 'Building Application',
  'actionRunner.deploy.deployingTitle': 'Deploying Application',
  'actionRunner.deploy.completedTitle': 'Deployment Complete',
  'actionRunner.deploy.buildFailed': 'Build failed',
  'actionRunner.deploy.deploymentFailed': 'Deployment failed',
  'actionRunner.deploy.building': 'Building your application...',
  'actionRunner.deploy.deploying': 'Deploying your application...',
  'actionRunner.deploy.buildCompleted': 'Build completed successfully',
  'actionRunner.deploy.deploymentCompleted': 'Deployment completed successfully',
  'actionRunner.deploy.preparingBuild': 'Preparing to build your application',
  'actionRunner.deploy.preparingDeployment': 'Preparing to deploy your application',
  'actionRunner.validation.addedForceMissing': 'Added -f flag to rm command as target files do not exist',
  'actionRunner.validation.addedForcePartial': 'Added -f flag to rm command as some target files do not exist',
  'actionRunner.validation.createdDirectory': 'Directory does not exist, created it first',
  'actionRunner.validation.sourceMissing': "Source file '{sourceFile}' does not exist",
  'actionRunner.shell.defaultFile': 'file',
  'actionRunner.shell.defaultDirectory': 'directory',
  'actionRunner.shell.fileNotFoundTitle': 'File Not Found',
  'actionRunner.shell.fileNotFoundDetails':
    "The file '{fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.",
  'actionRunner.shell.pathNotFoundTitle': 'File or Directory Not Found',
  'actionRunner.shell.directoryNotFoundDetails':
    "The directory '{directory}' does not exist.\n\nSuggestion: Use 'mkdir -p {directory}' to create it first, or check available directories with 'ls'.",
  'actionRunner.shell.pathNotFoundDetails':
    "The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.",
  'actionRunner.shell.permissionDeniedTitle': 'Permission Denied',
  'actionRunner.shell.permissionDeniedDetails':
    "Permission denied for '{command}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.",
  'actionRunner.shell.commandNotFoundTitle': 'Command Not Found',
  'actionRunner.shell.commandNotFoundDetails':
    "The command '{command}' is not available in the active runtime.\n\nSuggestion: Check available commands or use a package manager to install it.",
  'actionRunner.shell.targetDirectoryTitle': 'Target is a Directory',
  'actionRunner.shell.targetDirectoryDetails':
    "Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.",
  'actionRunner.shell.fileExistsTitle': 'File Already Exists',
  'actionRunner.shell.fileExistsDetails':
    "File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.",
  'actionRunner.shell.npmSuggestion': '\n\nSuggestion: Try running "npm install" first or check package.json.',
  'actionRunner.shell.gitSuggestion': "\n\nSuggestion: Check if you're in a git repository or if remote is configured.",
  'actionRunner.shell.pathSuggestion': '\n\nSuggestion: Check file paths and use "ls" to see available files.',
  'actionRunner.shell.commandFailedTitle': 'Command Failed (exit code: {exitCode})',
  'actionRunner.shell.commandFailedDetails': 'Command: {command}\n\nOutput: {output}{suggestion}',
} as const;

export type ActionRunnerKey = keyof typeof actionRunnerEn;
export type ActionRunnerCopy = Readonly<Record<ActionRunnerKey, string>>;

export const actionRunnerFr: ActionRunnerCopy = {
  'actionRunner.error.selfRepairEmpty': 'Le service d’auto-réparation a renvoyé un contenu vide',
  'actionRunner.error.selfRepairStatus': 'Le service d’auto-réparation a renvoyé le statut {status}',
  'actionRunner.error.shellExecutionFailed':
    'Échec de l’exécution de la commande shell : {message}\n\nSortie :\n{output}',
  'actionRunner.error.timeout': 'L’action {actionType} a dépassé le délai maximal de {seconds} secondes',
  'actionRunner.error.actionFailed': 'Échec de l’action',
  'actionRunner.error.noShellResponse': 'Aucune réponse du shell',
  'actionRunner.error.startFailed': 'Impossible de démarrer l’application',
  'actionRunner.error.noOutputAvailable': 'Aucune sortie disponible',
  'actionRunner.error.unsupportedAction': 'Type d’action non pris en charge : {actionType}',
  'actionRunner.alert.devServerFailed': 'Échec du serveur de développement',
  'actionRunner.diff.targetMissing': 'La cible du diff {filePath} n’existe pas — le fichier complet est requis',
  'actionRunner.diff.noBlocks': 'aucun bloc SEARCH/REPLACE trouvé',
  'actionRunner.diff.invalidStructure': 'structure de blocs SEARCH/REPLACE non valide',
  'actionRunner.diff.block': 'bloc n° {index}',
  'actionRunner.diff.malformed':
    'Impossible d’analyser le diff pour {filePath} ({detail}) — renvoyez le fichier complet',
  'actionRunner.diff.anchors': ' ({anchors})',
  'actionRunner.diff.notApplied':
    'Impossible d’appliquer le diff pour {filePath} au fichier actuel{anchors} — le fichier a divergé des ancres ; renvoyez le fichier complet',
  'actionRunner.diff.alertTitle': 'Impossible d’appliquer le diff',
  'actionRunner.build.runningTitle': 'Compilation de l’application',
  'actionRunner.build.runningDescription': 'Compilation de votre application…',
  'actionRunner.build.failedTitle': 'Échec de la compilation',
  'actionRunner.build.failedDescription': 'La compilation de votre application a échoué',
  'actionRunner.build.noOutput': 'Aucune sortie de compilation disponible',
  'actionRunner.build.completedTitle': 'Compilation terminée',
  'actionRunner.build.completedDescription': 'Votre application a été compilée avec succès',
  'actionRunner.supabase.migrationPathMissing': 'La migration nécessite un filePath',
  'actionRunner.supabase.migrationTitle': 'Migration Supabase',
  'actionRunner.supabase.migrationDescription': 'Créer le fichier de migration : {filePath}',
  'actionRunner.supabase.queryTitle': 'Requête Supabase',
  'actionRunner.supabase.queryDescription': 'Exécuter la requête de base de données',
  'actionRunner.supabase.unknownOperation': 'Opération inconnue : {operation}',
  'actionRunner.deploy.buildingTitle': 'Compilation de l’application',
  'actionRunner.deploy.deployingTitle': 'Déploiement de l’application',
  'actionRunner.deploy.completedTitle': 'Déploiement terminé',
  'actionRunner.deploy.buildFailed': 'Échec de la compilation',
  'actionRunner.deploy.deploymentFailed': 'Échec du déploiement',
  'actionRunner.deploy.building': 'Compilation de votre application…',
  'actionRunner.deploy.deploying': 'Déploiement de votre application…',
  'actionRunner.deploy.buildCompleted': 'Compilation terminée avec succès',
  'actionRunner.deploy.deploymentCompleted': 'Déploiement terminé avec succès',
  'actionRunner.deploy.preparingBuild': 'Préparation de la compilation de votre application',
  'actionRunner.deploy.preparingDeployment': 'Préparation du déploiement de votre application',
  'actionRunner.validation.addedForceMissing':
    'Option -f ajoutée à la commande rm, car les fichiers cibles n’existent pas',
  'actionRunner.validation.addedForcePartial':
    'Option -f ajoutée à la commande rm, car certains fichiers cibles n’existent pas',
  'actionRunner.validation.createdDirectory': 'Dossier inexistant : il a d’abord été créé',
  'actionRunner.validation.sourceMissing': "Le fichier source '{sourceFile}' n’existe pas",
  'actionRunner.shell.defaultFile': 'fichier',
  'actionRunner.shell.defaultDirectory': 'dossier',
  'actionRunner.shell.fileNotFoundTitle': 'Fichier introuvable',
  'actionRunner.shell.fileNotFoundDetails':
    "Le fichier '{fileName}' n’existe pas et ne peut pas être supprimé.\n\nSuggestion : utilisez 'ls' pour afficher les fichiers existants, ou 'rm -f' pour ignorer les fichiers manquants.",
  'actionRunner.shell.pathNotFoundTitle': 'Fichier ou dossier introuvable',
  'actionRunner.shell.directoryNotFoundDetails':
    "Le dossier '{directory}' n’existe pas.\n\nSuggestion : utilisez 'mkdir -p {directory}' pour le créer, ou vérifiez les dossiers disponibles avec 'ls'.",
  'actionRunner.shell.pathNotFoundDetails':
    "Le fichier ou le dossier indiqué n’existe pas.\n\nSuggestion : vérifiez le chemin et utilisez 'ls' pour afficher les fichiers disponibles.",
  'actionRunner.shell.permissionDeniedTitle': 'Autorisation refusée',
  'actionRunner.shell.permissionDeniedDetails':
    "Autorisation refusée pour '{command}'.\n\nSuggestion : le fichier n’est peut-être pas exécutable. Essayez d’abord 'chmod +x filename'.",
  'actionRunner.shell.commandNotFoundTitle': 'Commande introuvable',
  'actionRunner.shell.commandNotFoundDetails':
    "La commande '{command}' n’est pas disponible dans l’environnement d’exécution actif.\n\nSuggestion : vérifiez les commandes disponibles ou installez-la avec un gestionnaire de paquets.",
  'actionRunner.shell.targetDirectoryTitle': 'La cible est un dossier',
  'actionRunner.shell.targetDirectoryDetails':
    "Cette opération est impossible, car la cible est un dossier.\n\nSuggestion : utilisez 'ls' pour afficher son contenu ou ajoutez les options appropriées.",
  'actionRunner.shell.fileExistsTitle': 'Le fichier existe déjà',
  'actionRunner.shell.fileExistsDetails':
    "Le fichier existe déjà.\n\nSuggestion : choisissez un autre nom ou ajoutez l’option '-f' pour l’écraser.",
  'actionRunner.shell.npmSuggestion': '\n\nSuggestion : exécutez d’abord « npm install » ou vérifiez package.json.',
  'actionRunner.shell.gitSuggestion':
    '\n\nSuggestion : vérifiez que vous êtes dans un dépôt git et que le dépôt distant est configuré.',
  'actionRunner.shell.pathSuggestion':
    '\n\nSuggestion : vérifiez les chemins et utilisez « ls » pour afficher les fichiers disponibles.',
  'actionRunner.shell.commandFailedTitle': 'Échec de la commande (code de sortie : {exitCode})',
  'actionRunner.shell.commandFailedDetails': 'Commande : {command}\n\nSortie : {output}{suggestion}',
};

export function getActionRunnerCopy(language?: string | null): ActionRunnerCopy {
  return resolveMarketingLanguage(language) === 'fr' ? actionRunnerFr : actionRunnerEn;
}

export function formatActionRunnerCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
