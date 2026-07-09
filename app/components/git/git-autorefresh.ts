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
 * - A successful (non-error) envelope replaces the view...
 * - ...UNLESS it is a soft-DEGRADED envelope on a SILENT refresh. When the git
 *   status call transiently 5xx/locks mid-generation the loader degrades it into
 *   an OK envelope carrying an empty `status` (changedFiles: []) plus a
 *   `gitLoadError` marker. That envelope has `status:'ok'`, so without this guard
 *   the silent refresh would apply it and collapse the live "N changed files"
 *   list to zero. On a silent refresh we retain the last known good list instead;
 *   a foreground (user-initiated) refresh still applies + surfaces the degraded
 *   state so the user sees the current condition.
 * - An error envelope replaces the view only for a foreground load (so the user
 *   sees the failure). During a silent refresh an error envelope carries no
 *   `data`, so applying it would blank the live working-tree list; we keep the
 *   previously loaded data instead.
 */
export function shouldApplyEnvelopeForLoad(
  silent: boolean | undefined,
  isErrorEnvelope: boolean,
  degraded: boolean = false,
): boolean {
  if (isErrorEnvelope) {
    return !silent;
  }

  if (degraded && silent) {
    return false;
  }

  return true;
}

/*
 * Whether the "last fetched X ago" timestamp should be advanced for a load.
 *
 * Only a successful (non-error) envelope actually replaces the visible
 * working-tree data, so only then is the data genuinely "fresh". An error
 * envelope from a silent background refresh is intentionally swallowed (see
 * shouldApplyEnvelopeForLoad) and leaves the previous data on screen; advancing
 * the timestamp in that case would falsely report the stale list as just
 * fetched, which is especially misleading during an active agent generation
 * when the git endpoint transiently 5xx/locks.
 *
 * A soft-DEGRADED envelope (empty status + gitLoadError marker) carries no real
 * git status either — whether it was retained (silent) or applied-as-empty
 * (foreground), it is not "fresh good data", so the timestamp is not advanced.
 */
export function shouldAdvanceLastFetched(isErrorEnvelope: boolean, degraded: boolean = false): boolean {
  return !isErrorEnvelope && !degraded;
}
