import { WORK_DIR } from '~/utils/constants';

export interface ReplacementResult {
  nextContent: string;
  count: number;
}

/**
 * Apply `matcher` to `content`, substituting every match with `replacement`.
 *
 * Pure and side-effect-free so it can be unit-tested without a runtime: the
 * count it returns is the number of substitutions actually performed against
 * the supplied content. The component must therefore feed it the file's REAL
 * on-disk content — never the lazily-unloaded empty string the files store
 * holds for unopened files — or the count will be a lie (zero) while the toast
 * claims success.
 */
export function computeReplacement(content: string, matcher: RegExp, replacement: string): ReplacementResult {
  let count = 0;

  const nextContent = content.replace(matcher, () => {
    count += 1;
    return replacement;
  });

  return { nextContent, count };
}

/**
 * Convert an absolute workbench path (`/home/project/src/a.ts`) to the
 * runtime-relative path (`src/a.ts`) that `RuntimeAdapter.readFile` expects.
 * Mirrors FilesStore#toRuntimePath so a Replace All can hydrate content the
 * same way the rest of the store does.
 */
export function toRuntimeRelativePath(filePath: string, workdir: string = WORK_DIR): string {
  if (workdir && filePath.startsWith(`${workdir}/`)) {
    return filePath.slice(workdir.length + 1);
  }

  if (filePath.startsWith(`${WORK_DIR}/`)) {
    return filePath.slice(WORK_DIR.length + 1);
  }

  return filePath.replace(/^\/+/, '');
}

/**
 * Whether the files-store content for an entry can be trusted for an in-place
 * replacement. In remote-kubernetes mode the tree is loaded with content
 * stripped, so unopened files sit in the store with content === '' even though
 * they have real bytes on disk. An empty string is indistinguishable from a
 * genuinely empty file, so we treat empty content as "needs hydration" and let
 * the caller read the true content from the runtime before replacing.
 */
export function needsContentHydration(content: string): boolean {
  return content.length === 0;
}
