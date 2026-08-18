import { resolveMarketingLanguage } from './marketing';

export const workbenchRuntimeEn = {
  'workbenchRuntime.command.npmDev': 'npm run dev',
  'workbenchRuntime.command.npmStart': 'npm run start',
  'workbenchRuntime.command.npxVite': 'npx vite',
  'workbenchRuntime.command.npmInstall': 'npm install',
  'workbenchRuntime.command.pnpmInstall': 'pnpm install',
  'workbenchRuntime.command.yarnInstall': 'yarn install',
  'workbenchRuntime.preview.starting': 'Preview is starting',
  'workbenchRuntime.preview.detecting': 'Detecting preview command',
  'workbenchRuntime.preview.staticCommand': 'Static HTML preview',
  'workbenchRuntime.preview.staticReady': 'Using a static HTML preview; this project does not need a dev server.',
  'workbenchRuntime.preview.reloadFailed': 'Preview files could not be reloaded.',
  'workbenchRuntime.preview.reattached': 'Reconnected to the running dev server.',
  'workbenchRuntime.preview.reattachedResult': 'Reconnected preview server',
  'workbenchRuntime.preview.existingResult': 'Existing preview server',
  'workbenchRuntime.preview.dependencySyncSkipped': 'Dependency sync was skipped before starting the preview.',
  'workbenchRuntime.preview.dependenciesMissing':
    'Dependencies are not installed; running {installCommand} before {previewCommand}.',
  'workbenchRuntime.preview.preparing': 'Preparing the preview with {command}{directory}.',
  'workbenchRuntime.preview.directory': ' in {directory}',
  'workbenchRuntime.preview.setupFailed': '{command} failed (exit code {exitCode}).',
  'workbenchRuntime.preview.startCommand': 'Starting the preview with {command}{directory}.',
  'workbenchRuntime.preview.commandExited': 'Preview command exited with code',
  'workbenchRuntime.preview.setupExited': 'Preview setup command exited with code',
  'workbenchRuntime.preview.streamInterrupted': 'command stream interrupted',
  'workbenchRuntime.preview.workspaceReprovisioning':
    'The workspace is stopped; reprovisioning it before starting the preview…',
  'workbenchRuntime.preview.workspaceReprovisionFailed': 'The workspace could not be reprovisioned.',
  'workbenchRuntime.preview.reinstalling': 'Reinstalling dependencies…',
  'workbenchRuntime.preview.startFailed': 'The preview could not start.',
  'workbenchRuntime.preview.devMissingDependencies':
    '{command} failed (exit 127: command not found — dependencies are not installed). Try Reinstall.',
  'workbenchRuntime.preview.devExited': '{command} exited with code {exitCode} — the dev server is not running.',
  'workbenchRuntime.preview.transientRetry':
    '{command} failed transiently (exit {exitCode}); retrying in {seconds}s (attempt {attempt}/{maxAttempts})',
  'workbenchRuntime.preview.corruptLockRemoved':
    'Removed the damaged {file} file so the dependency install can regenerate it.',
  'workbenchRuntime.preview.corruptLockRemoveFailed': 'The damaged {file} file could not be removed.',
  'workbenchRuntime.files.autosaveFailed': 'Autosave failed for {file}. Your changes have not been saved.',
  'workbenchRuntime.files.noOpenFile': 'No file is open to format.',
  'workbenchRuntime.files.lockedTitle': 'File locked',
  'workbenchRuntime.files.formatLocked': '{file} is locked and cannot be formatted. Unlock it first.',
  'workbenchRuntime.patch.rejected': 'AI patch rejected: {file}',
  'workbenchRuntime.patch.locked': '{file} is locked; the AI patch was not applied. Unlock it first.',
  'workbenchRuntime.patch.lockedLog': 'AI patch blocked because the file is locked: {file}',
  'workbenchRuntime.patch.reconciled': 'AI patch for {file} reconciled with a concurrent change.',
  'workbenchRuntime.patch.refreshSkipped': 'File refresh was skipped after accepting the AI patch.',
  'workbenchRuntime.patch.accepted': 'AI patch accepted: {file}',
  'workbenchRuntime.patch.checkpointSkipped': 'AI checkpoint was skipped after accepting the patch.',
  'workbenchRuntime.patch.applyFailed': 'The AI patch could not be applied.',
  'workbenchRuntime.patch.failedLog': 'AI patch failed for {file}.',
  'workbenchRuntime.patch.importCycle':
    'An import cycle was detected while applying AI patches ({files}); falling back to source order.',
  'workbenchRuntime.patch.revertMissing': 'AI patch revert skipped because its artifact is unavailable: {file}',
  'workbenchRuntime.patch.reverted': 'AI patch reverted: {file}',
  'workbenchRuntime.patch.revertFailed': 'The AI patch for {file} could not be reverted.',
  'workbenchRuntime.patch.checkpointLabel': 'AI accepted {file}',
  'workbenchRuntime.diff.title': 'Diff could not be applied',
  'workbenchRuntime.diff.description':
    'The change could not be applied safely. Ask the agent to emit the complete file.',
  'workbenchRuntime.diff.log': 'AI diff not applied.',
  'workbenchRuntime.write.conflictTitle': 'AI write conflict',
  'workbenchRuntime.write.conflictDescription':
    'The assistant is editing {file} while you have unsaved changes. Your edits are preserved; save or discard them before applying the assistant version.',
  'workbenchRuntime.write.blockedTitle': 'AI file write blocked',
  'workbenchRuntime.write.locked': '{file} is locked; the assistant change was not written.',
  'workbenchRuntime.write.failed': 'The assistant could not write {file}.',
  'workbenchRuntime.write.notConfirmed':
    'The assistant wrote {file} but the workspace did not confirm it within {seconds}s. Nothing is lost — ask the agent to write it again.',
  'workbenchRuntime.write.blockedLog': 'AI file write blocked: {file}',
  'workbenchRuntime.write.refreshSkipped': 'File refresh was skipped after the AI write.',
  'workbenchRuntime.write.commandReviewPending':
    'AI command skipped until reviewed file changes are accepted or rejected.',
  'workbenchRuntime.validation.failed': 'Generated file validation failed.',
  'workbenchRuntime.validation.patchBlocked': 'AI patch blocked for {file}.',
  'workbenchRuntime.validation.waitingForReview': 'AI patch waiting for review: {file}',
  'workbenchRuntime.validation.previewRefreshSkipped': 'Preview file refresh was skipped.',
  'workbenchRuntime.validation.dependencySyncSkipped': 'Dependency sync was skipped after {artifact}.',
  'workbenchRuntime.validation.previewRestartSkipped': 'Preview restart was skipped after {artifact}.',
  'workbenchRuntime.validation.invalidImportTitle': 'AI generated an invalid file import',
  'workbenchRuntime.validation.invalidImportDescription':
    'The generated import could not be resolved. Review the affected file before restarting the preview.',
  'workbenchRuntime.validation.previewRestartBlocked': 'Preview restart was blocked after {artifact}.',
  'workbenchRuntime.dependencies.retry': 'Dependency sync attempt {attempt} failed; retrying in {seconds} s…',
  'workbenchRuntime.doctor.fixedExports': 'Project doctor added missing default exports to {files}.',
  'workbenchRuntime.doctor.unresolvedImport':
    'Project doctor: {specifier}, imported by {importer}, does not resolve to a file. The app may not start until it exists.',
  'workbenchRuntime.doctor.createdManifest': 'Created the preview package manifest at {file}.',
  'workbenchRuntime.doctor.addedDependencies': 'Added missing runtime dependencies: {dependencies}.',
  'workbenchRuntime.doctor.addedScripts': 'Added preview package scripts: {scripts}.',
  'workbenchRuntime.doctor.upgradedReact':
    'Upgraded {dependencies} to React 18 because the app uses createRoot / react-dom/client.',
  'workbenchRuntime.doctor.createdRuntimeFile': 'Created preview runtime file {file}.',
  'workbenchRuntime.storage.skippedLargeFile': 'Project storage sync skipped the large file {file}.',
  'workbenchRuntime.storage.sizeLimit': 'Project storage sync stopped at the size limit.',
  'workbenchRuntime.storage.synced': 'Project storage synced {count} files after {artifact}.',
  'workbenchRuntime.storage.skipped': 'Project storage sync was skipped after {artifact}.',
  'workbenchRuntime.snapshot.beforeAi': 'Before AI changes {artifact}',
  'workbenchRuntime.repository.credentialsMissing': '{provider} credentials are unavailable.',
  'workbenchRuntime.repository.noFiles': 'No files are available to push.',
  'workbenchRuntime.repository.noValidFiles': 'No valid files are available to push.',
  'workbenchRuntime.repository.initialCommit': 'Initial commit from your app',
  'workbenchRuntime.repository.multipleFilesCommit': 'Commit multiple files',
  'workbenchRuntime.repository.unsupportedProvider': 'The {provider} repository provider is not supported.',
} as const;

export type WorkbenchRuntimeKey = keyof typeof workbenchRuntimeEn;
export type WorkbenchRuntimeCopy = Readonly<Record<WorkbenchRuntimeKey, string>>;

export const workbenchRuntimeFr: WorkbenchRuntimeCopy = {
  'workbenchRuntime.command.npmDev': 'npm run dev',
  'workbenchRuntime.command.npmStart': 'npm run start',
  'workbenchRuntime.command.npxVite': 'npx vite',
  'workbenchRuntime.command.npmInstall': 'npm install',
  'workbenchRuntime.command.pnpmInstall': 'pnpm install',
  'workbenchRuntime.command.yarnInstall': 'yarn install',
  'workbenchRuntime.preview.starting': 'Démarrage de l’aperçu',
  'workbenchRuntime.preview.detecting': 'Détection de la commande d’aperçu',
  'workbenchRuntime.preview.staticCommand': 'Aperçu HTML statique',
  'workbenchRuntime.preview.staticReady':
    'Utilisation d’un aperçu HTML statique ; ce projet ne nécessite aucun serveur de développement.',
  'workbenchRuntime.preview.reloadFailed': 'Impossible de recharger les fichiers de l’aperçu.',
  'workbenchRuntime.preview.reattached': 'Reconnexion au serveur de développement en cours d’exécution.',
  'workbenchRuntime.preview.reattachedResult': 'Serveur d’aperçu reconnecté',
  'workbenchRuntime.preview.existingResult': 'Serveur d’aperçu existant',
  'workbenchRuntime.preview.dependencySyncSkipped':
    'La synchronisation des dépendances a été ignorée avant le démarrage de l’aperçu.',
  'workbenchRuntime.preview.dependenciesMissing':
    'Les dépendances ne sont pas installées ; exécution de {installCommand} avant {previewCommand}.',
  'workbenchRuntime.preview.preparing': 'Préparation de l’aperçu avec {command}{directory}.',
  'workbenchRuntime.preview.directory': ' dans {directory}',
  'workbenchRuntime.preview.setupFailed': 'Échec de {command} (code de sortie {exitCode}).',
  'workbenchRuntime.preview.startCommand': 'Démarrage de l’aperçu avec {command}{directory}.',
  'workbenchRuntime.preview.commandExited': 'La commande d’aperçu s’est arrêtée avec le code',
  'workbenchRuntime.preview.setupExited': 'La commande de préparation s’est arrêtée avec le code',
  'workbenchRuntime.preview.streamInterrupted': 'flux de commande interrompu',
  'workbenchRuntime.preview.workspaceReprovisioning':
    'L’espace de travail est arrêté ; reprovisionnement avant le démarrage de l’aperçu…',
  'workbenchRuntime.preview.workspaceReprovisionFailed': 'Impossible de reprovisionner l’espace de travail.',
  'workbenchRuntime.preview.reinstalling': 'Réinstallation des dépendances…',
  'workbenchRuntime.preview.startFailed': 'Impossible de démarrer l’aperçu.',
  'workbenchRuntime.preview.devMissingDependencies':
    'Échec de {command} (code 127 : commande introuvable — les dépendances ne sont pas installées). Essayez Réinstaller.',
  'workbenchRuntime.preview.devExited':
    '{command} s’est arrêté avec le code {exitCode} — le serveur de développement ne tourne pas.',
  'workbenchRuntime.preview.transientRetry':
    'Échec temporaire de {command} (code de sortie {exitCode}) ; nouvelle tentative dans {seconds} s (tentative {attempt}/{maxAttempts}).',
  'workbenchRuntime.preview.corruptLockRemoved':
    'Le fichier endommagé {file} a été supprimé afin que l’installation des dépendances puisse le recréer.',
  'workbenchRuntime.preview.corruptLockRemoveFailed': 'Impossible de supprimer le fichier endommagé {file}.',
  'workbenchRuntime.files.autosaveFailed':
    'Échec de l’enregistrement automatique de {file}. Vos modifications n’ont pas été enregistrées.',
  'workbenchRuntime.files.noOpenFile': 'Aucun fichier ouvert à mettre en forme.',
  'workbenchRuntime.files.lockedTitle': 'Fichier verrouillé',
  'workbenchRuntime.files.formatLocked':
    'Le fichier {file} est verrouillé et ne peut pas être mis en forme. Déverrouillez-le d’abord.',
  'workbenchRuntime.patch.rejected': 'Patch de l’IA refusé : {file}',
  'workbenchRuntime.patch.locked':
    'Le fichier {file} est verrouillé ; le patch de l’IA n’a pas été appliqué. Déverrouillez-le d’abord.',
  'workbenchRuntime.patch.lockedLog': 'Patch de l’IA bloqué, car le fichier est verrouillé : {file}',
  'workbenchRuntime.patch.reconciled': 'Le patch de l’IA pour {file} a été concilié avec une modification simultanée.',
  'workbenchRuntime.patch.refreshSkipped':
    'L’actualisation des fichiers a été ignorée après l’acceptation du patch de l’IA.',
  'workbenchRuntime.patch.accepted': 'Patch de l’IA accepté : {file}',
  'workbenchRuntime.patch.checkpointSkipped': 'Le point de contrôle de l’IA a été ignoré après l’acceptation du patch.',
  'workbenchRuntime.patch.applyFailed': 'Impossible d’appliquer le patch de l’IA.',
  'workbenchRuntime.patch.failedLog': 'Échec du patch de l’IA pour {file}.',
  'workbenchRuntime.patch.importCycle':
    'Un cycle d’importation a été détecté lors de l’application des patchs de l’IA ({files}) ; retour à l’ordre source.',
  'workbenchRuntime.patch.revertMissing':
    'Annulation du patch de l’IA ignorée, car son artefact est indisponible : {file}',
  'workbenchRuntime.patch.reverted': 'Patch de l’IA annulé : {file}',
  'workbenchRuntime.patch.revertFailed': 'Impossible d’annuler le patch de l’IA pour {file}.',
  'workbenchRuntime.patch.checkpointLabel': 'Patch de l’IA accepté pour {file}',
  'workbenchRuntime.diff.title': 'Impossible d’appliquer le diff',
  'workbenchRuntime.diff.description':
    'La modification n’a pas pu être appliquée en toute sécurité. Demandez à l’agent de renvoyer le fichier complet.',
  'workbenchRuntime.diff.log': 'Le diff de l’IA n’a pas été appliqué.',
  'workbenchRuntime.write.conflictTitle': 'Conflit d’écriture avec l’IA',
  'workbenchRuntime.write.conflictDescription':
    'L’assistant modifie {file} alors que vous avez des changements non enregistrés. Vos modifications sont conservées ; enregistrez-les ou annulez-les avant d’appliquer la version de l’assistant.',
  'workbenchRuntime.write.blockedTitle': 'Écriture du fichier par l’IA bloquée',
  'workbenchRuntime.write.locked':
    'Le fichier {file} est verrouillé ; la modification de l’assistant n’a pas été écrite.',
  'workbenchRuntime.write.failed': 'L’assistant n’a pas pu écrire le fichier {file}.',
  'workbenchRuntime.write.notConfirmed':
    'L’assistant a écrit {file}, mais l’espace de travail ne l’a pas confirmé en {seconds}s. Rien n’est perdu — redemandez l’écriture à l’agent.',
  'workbenchRuntime.write.blockedLog': 'Écriture du fichier par l’IA bloquée : {file}',
  'workbenchRuntime.write.refreshSkipped': 'L’actualisation des fichiers a été ignorée après l’écriture de l’IA.',
  'workbenchRuntime.write.commandReviewPending':
    'Commande de l’IA ignorée jusqu’à l’acceptation ou au refus des modifications de fichiers examinées.',
  'workbenchRuntime.validation.failed': 'Échec de la validation du fichier généré.',
  'workbenchRuntime.validation.patchBlocked': 'Patch de l’IA bloqué pour {file}.',
  'workbenchRuntime.validation.waitingForReview': 'Patch de l’IA en attente d’examen : {file}',
  'workbenchRuntime.validation.previewRefreshSkipped': 'L’actualisation des fichiers de l’aperçu a été ignorée.',
  'workbenchRuntime.validation.dependencySyncSkipped':
    'La synchronisation des dépendances a été ignorée après {artifact}.',
  'workbenchRuntime.validation.previewRestartSkipped': 'Le redémarrage de l’aperçu a été ignoré après {artifact}.',
  'workbenchRuntime.validation.invalidImportTitle': 'L’IA a généré une importation de fichier non valide',
  'workbenchRuntime.validation.invalidImportDescription':
    'Impossible de résoudre l’importation générée. Examinez le fichier concerné avant de redémarrer l’aperçu.',
  'workbenchRuntime.validation.previewRestartBlocked': 'Le redémarrage de l’aperçu a été bloqué après {artifact}.',
  'workbenchRuntime.dependencies.retry':
    'Échec de la tentative {attempt} de synchronisation des dépendances ; nouvel essai dans {seconds} s…',
  'workbenchRuntime.doctor.fixedExports':
    'Le diagnostic du projet a ajouté les exports par défaut manquants dans {files}.',
  'workbenchRuntime.doctor.unresolvedImport':
    'Diagnostic du projet : {specifier}, importé par {importer}, ne correspond à aucun fichier. L’application risque de ne pas démarrer tant qu’il n’existe pas.',
  'workbenchRuntime.doctor.createdManifest': 'Manifeste du paquet d’aperçu créé dans {file}.',
  'workbenchRuntime.doctor.addedDependencies':
    'Dépendances manquantes de l’environnement d’exécution ajoutées : {dependencies}.',
  'workbenchRuntime.doctor.addedScripts': 'Scripts du paquet d’aperçu ajoutés : {scripts}.',
  'workbenchRuntime.doctor.upgradedReact':
    'Mise à niveau de {dependencies} vers React 18, car l’application utilise createRoot / react-dom/client.',
  'workbenchRuntime.doctor.createdRuntimeFile': 'Fichier de l’environnement d’exécution de l’aperçu créé : {file}.',
  'workbenchRuntime.storage.skippedLargeFile':
    'Synchronisation du stockage du projet : fichier volumineux {file} ignoré.',
  'workbenchRuntime.storage.sizeLimit': 'Synchronisation du stockage du projet arrêtée à la limite de taille.',
  'workbenchRuntime.storage.synced': 'Le stockage du projet a synchronisé {count} fichiers après {artifact}.',
  'workbenchRuntime.storage.skipped': 'La synchronisation du stockage du projet a été ignorée après {artifact}.',
  'workbenchRuntime.snapshot.beforeAi': 'Avant les modifications de l’IA : {artifact}',
  'workbenchRuntime.repository.credentialsMissing': 'Les identifiants {provider} sont indisponibles.',
  'workbenchRuntime.repository.noFiles': 'Aucun fichier à pousser.',
  'workbenchRuntime.repository.noValidFiles': 'Aucun fichier valide à pousser.',
  'workbenchRuntime.repository.initialCommit': 'Commit initial de votre application',
  'workbenchRuntime.repository.multipleFilesCommit': 'Commit de plusieurs fichiers',
  'workbenchRuntime.repository.unsupportedProvider': 'Le fournisseur de dépôt {provider} n’est pas pris en charge.',
};

export function getWorkbenchRuntimeCopy(language?: string | null): WorkbenchRuntimeCopy {
  return resolveMarketingLanguage(language) === 'fr' ? workbenchRuntimeFr : workbenchRuntimeEn;
}

export function formatWorkbenchRuntimeCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
