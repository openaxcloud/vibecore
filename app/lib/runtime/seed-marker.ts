/**
 * Durable "this workspace was already seeded, at revision R" marker.
 *
 * BUG-RUNTIME-DIVERGENCE. The reattach fast-path in `ProjectWorkspaceProvider`
 * gated on `seededWorkspaceSessions`, a module-scope Map whose own docstring
 * says it is "naturally empty on a full reload". That is precisely the user's
 * case: opening a project from the dashboard, or reloading the IDE tab, is a
 * NEW page-session, so `seededThisSession` was always false and every open took
 * the destructive branch — stop preview, delete the whole tree, re-import from
 * storage, cold-start the dev server — even when the pod was warm, serving, and
 * already holding exactly the persisted revision. Hence "ça recharge et
 * reconstruit le projet au lieu de voir l'app dans le preview comme on l'a
 * laissée".
 *
 * The marker is therefore promoted from page-session memory to device-durable
 * storage, keyed by workspace, and carries the revision it was seeded from so
 * the freshness comparison in `shouldReattachWarmWorkspace` still applies:
 *
 *   - marker absent            -> unknown -> cold reseed (unchanged, safe default)
 *   - marker present, same rev -> may reattach (with `reused` + `hasLivePort`)
 *   - marker present, diff rev -> storage moved since the seed -> reseed
 *
 * This only ever REMOVES unnecessary reseeds; it never makes the code adopt a
 * pod it would previously have rebuilt for a *known* staleness reason, because
 * the revision check is preserved verbatim.
 *
 * Storage is best-effort: every access is guarded, and any failure degrades to
 * "no marker", i.e. today's behaviour.
 */

const STORAGE_KEY_PREFIX = 'vibecore.workspace-seed.';

/**
 * Injectable for tests and for SSR, where no Storage exists. Returns undefined
 * when storage is unavailable or access throws (Safari private mode, disabled
 * cookies, quota) — callers then behave exactly as if no marker existed.
 */
export type SeedMarkerStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): SeedMarkerStore | undefined {
  try {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }

    return localStorage;
  } catch {
    return undefined;
  }
}

function storageKey(sessionId: string) {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

export interface SeedMarker {
  /**
   * The persisted files revision this workspace was seeded from. `undefined`
   * when the revision could not be read at seed time — the workspace is still
   * known to be seeded, but its freshness cannot be asserted, so the caller
   * keeps `storageNewerThanSeed` undefined rather than claiming currency.
   */
  revision?: string;
}

/**
 * Read the marker for a workspace. `undefined` means "never seeded, as far as
 * this device knows" and must lead to a cold reseed.
 */
export function readSeedMarker(sessionId: string, store: SeedMarkerStore | undefined = defaultStore()): SeedMarker | undefined {
  if (!store) {
    return undefined;
  }

  try {
    const raw = store.getItem(storageKey(sessionId));

    if (raw === null) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as { revision?: unknown };

    /*
     * Tolerate a marker written by an older/newer build: presence is what makes
     * the workspace "seeded"; a non-string revision is simply unknown.
     */
    return { revision: typeof parsed?.revision === 'string' ? parsed.revision : undefined };
  } catch {
    /*
     * Corrupt JSON is treated as no marker (cold reseed), NOT as a seeded
     * workspace with an unknown revision — never adopt a pod on unparseable state.
     */
    return undefined;
  }
}

/** Record a successful cold seed. Best-effort; a failure just means the next open reseeds. */
export function writeSeedMarker(
  sessionId: string,
  revision: string | undefined,
  store: SeedMarkerStore | undefined = defaultStore(),
): void {
  if (!store) {
    return;
  }

  try {
    store.setItem(storageKey(sessionId), JSON.stringify({ revision }));
  } catch {
    // Quota/private-mode: fall back to "no marker" — correct, just slower.
  }
}

/** Drop the marker (workspace stopped/deleted, or a seed failed part-way). */
export function clearSeedMarker(sessionId: string, store: SeedMarkerStore | undefined = defaultStore()): void {
  if (!store) {
    return;
  }

  try {
    store.removeItem(storageKey(sessionId));
  } catch {
    // Best-effort.
  }
}
