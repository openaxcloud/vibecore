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

/**
 * Whether a file targeted by Replace All currently holds unsaved editor edits.
 *
 * Replace All computes its substitution against the files-store (on-disk) copy
 * and writes the result back through `writeFileContent`, which clears the dirty
 * flag and resets the editor document. If the user has the file open with
 * unsaved edits, that on-disk copy is stale and the write would silently
 * destroy their in-progress changes. We therefore detect the dirty state up
 * front and skip such files (mirroring how locked files are skipped) so no
 * unsaved work is ever clobbered without the user's knowledge.
 *
 * Pure so it can be unit-tested without a store: pass the dirty set and the
 * resolved absolute path.
 */
export function hasUnsavedEdits(unsavedFiles: Set<string>, filePath: string): boolean {
  return unsavedFiles.has(filePath);
}

/**
 * Whether a given search invocation is still the most recent one and is therefore
 * allowed to hide the "Searching…" spinner.
 *
 * The search handler is debounced (300ms) and also re-run by Replace All, and it
 * keeps the spinner visible for a minimum duration via a trailing setTimeout. If a
 * fast search finishes and schedules that timeout, a newer search can start (and set
 * the spinner back on) before the stale timeout fires. Letting the stale timeout call
 * setIsSearching(false) would flicker the newer search's spinner off prematurely (and,
 * if the component has since unmounted, trigger a setState-on-unmounted warning).
 *
 * Each search stamps itself with a monotonically increasing token; only the
 * invocation whose token still matches the latest token may stop the spinner. Pure so
 * the arbitration rule can be unit-tested without rendering the component.
 */
export function isLatestSearch(invocationToken: number, latestToken: number): boolean {
  return invocationToken === latestToken;
}
