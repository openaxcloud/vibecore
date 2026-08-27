import { fileTreeEn, formatFileTreeCopy, type FileTreeCopy } from '~/lib/i18n/catalogs/file-tree';
import type { FileMap } from '~/lib/stores/files';
import { path } from '~/utils/path';

export interface DroppedUploadName {
  /** The original file name as dropped (used for user-facing messages). */
  name: string;
}

export interface UploadCollision<TFile extends DroppedUploadName> {
  file: TFile;

  /** Absolute workspace path the upload would write to. */
  filePath: string;
}

/**
 * Compute which dropped uploads would clobber an already-existing entry in the
 * workspace. Drag-drop upload calls `workbenchStore.createFile` directly, which
 * only refuses LOCKED targets — it silently overwrites any other existing file.
 * Callers use this to mirror the collision guard the rest of the file tree
 * (New File / New Folder / Rename / Duplicate) already enforces.
 */
export function findUploadCollisions<TFile extends DroppedUploadName>(
  files: TFile[],
  targetFolder: string,
  fileMap: FileMap,
): UploadCollision<TFile>[] {
  const collisions: UploadCollision<TFile>[] = [];

  for (const file of files) {
    const filePath = path.join(targetFolder, file.name);

    if (fileMap[filePath]) {
      collisions.push({ file, filePath });
    }
  }

  return collisions;
}

/**
 * Human-readable confirm() prompt listing the files that would be overwritten.
 */
export function buildOverwritePrompt<TFile extends DroppedUploadName>(
  collisions: UploadCollision<TFile>[],
  copy: FileTreeCopy['overwrite'] = fileTreeEn.overwrite,
): string {
  const names = collisions.map((collision) => collision.file.name);

  if (names.length === 1) {
    return formatFileTreeCopy(copy.single, { name: names[0] ?? '' });
  }

  return formatFileTreeCopy(copy.multiple, { count: names.length, names: names.join('\n') });
}
