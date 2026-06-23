import type { FileMap } from '~/lib/stores/files';

/*
 * Pure helpers for the GitTab live working-tree auto-refresh.
 *
 * GitTab used to load git state only on mount + after its own POST actions, so
 * while the agent generated/edited the app the "Working tree" list and the
 * "N changed" count stayed frozen until a manual refresh. These helpers let the
 * component listen to the workbench FilesStore and re-fetch only when the file
 * set actually changed (avoiding a refetch storm on every keystroke).
 */

/*
 * A stable signature of the working-tree-relevant file state. We key on each
 * file path plus a cheap fingerprint of its content length, so that adding,
 * removing, renaming, or editing a file changes the signature while a no-op
 * map re-emission (same paths, same content) does not.
 */
export function computeWorkspaceFilesSignature(files: FileMap): string {
  const parts: string[] = [];

  for (const path of Object.keys(files).sort()) {
    const dirent = files[path];

    if (!dirent) {
      continue;
    }

    if (dirent.type === 'file') {
      parts.push(`${path}:${dirent.content.length}`);
    } else {
      parts.push(`${path}/`);
    }
  }

  return parts.join('\n');
}

/*
 * Whether a files-store emission should trigger a silent git reload: only when
 * the computed signature differs from the last one we acted on.
 */
export function shouldRefreshOnFilesChange(previousSignature: string, nextSignature: string): boolean {
  return previousSignature !== nextSignature;
}

/*
 * Whether a document visibility change should trigger a refresh. We reconcile
 * the panel when the tab becomes visible again (the user may have been away
 * while the agent kept editing), and skip work while it is hidden.
 */
export function shouldRefreshOnVisibility(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === 'visible';
}

/*
 * Whether a load failure should be surfaced to the user (red error banner /
 * setError). Foreground loads always surface; silent background refreshes
 * (FilesStore listener, focus/visibility reconcile, post-action reload) must
 * not, because the workspace git endpoint can transiently 5xx/lock during an
 * active agent generation and we already have a usable view on screen. A
 * contradictory "success toast + error banner" after a committed action is
 * also avoided this way.
 */
export function shouldSurfaceLoadError(silent: boolean | undefined): boolean {
  return !silent;
}

/*
 * Whether a load response's envelope should replace the visible state.
 *
 * - A successful (non-error) envelope always replaces the view.
 * - An error envelope replaces the view only for a foreground load (so the
 *   user sees the failure). During a silent refresh an error envelope carries
 *   no `data`, so applying it would blank the live working-tree list; we keep
 *   the previously loaded data instead.
 */
export function shouldApplyEnvelopeForLoad(silent: boolean | undefined, isErrorEnvelope: boolean): boolean {
  if (!isErrorEnvelope) {
    return true;
  }

  return !silent;
}
