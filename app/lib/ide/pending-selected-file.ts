/*
 * Résolution du fichier sélectionné DIFFÉRÉ.
 *
 * Quand l'IDE restaure son état, le fichier précédemment sélectionné n'est
 * souvent pas encore dans la carte des fichiers — elle se remplit par vagues.
 * Dans ce cas la restauration ne renonce pas : elle DIFFÈRE le chemin, et cette
 * résolution est rejouée à chaque changement de la carte jusqu'à ce que le
 * fichier apparaisse.
 *
 * BUG-PANEL-PERF-004 — ce filet est désormais PORTEUR. L'effet de restauration
 * ne dépend plus de `projectFiles` (il rejouait à chaque vague de fichiers et
 * relançait une requête réseau à chaque fois) ; c'est donc uniquement ce
 * mécanisme-ci qui garantit qu'un fichier arrivé tard finit sélectionné.
 * Extrait ici pour être testable — il ne l'était pas.
 */
export interface ProjectFileEntry {
  type?: string;
}

export function resolvePendingSelectedFile(
  projectFiles: Record<string, ProjectFileEntry | undefined>,
  pendingSelectedFile: string | undefined,
): string | undefined {
  if (!pendingSelectedFile) {
    return undefined;
  }

  if (projectFiles[pendingSelectedFile]?.type === 'file') {
    return pendingSelectedFile;
  }

  /*
   * Repli par suffixe : l'état persisté peut porter un chemin relatif alors que
   * la carte est indexée en absolu (ou l'inverse selon le montage du workspace).
   */
  return Object.keys(projectFiles).find(
    (filePath) => projectFiles[filePath]?.type === 'file' && filePath.endsWith(pendingSelectedFile),
  );
}
