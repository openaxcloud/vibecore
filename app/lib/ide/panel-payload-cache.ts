/*
 * In-memory cache of the last successful payload per `${projectId}:${panel}`.
 * Panels are keyed by panel name in the workbench, so switching tabs unmounts
 * and remounts ProjectIdeServicePanel — without this, returning to a tab would
 * re-flash the loading skeleton every time. Seeding from this cache lets a
 * revisited tab render its previous content immediately while it refreshes
 * silently in the background. Bounded so it can't grow without limit.
 *
 * Extracted from BaseChat.tsx (behaviour unchanged) so the contract stated in
 * the paragraph above can actually be tested — it had ZERO test coverage, which
 * is how BUG-PANEL-CACHE-003 survived: `loadPanel` detects `status === 'error'`
 * and then caches that envelope two lines later, so the cache can hold a
 * payload whose `data` is null. See panel-payload-cache.spec.ts.
 */
export const PROJECT_PANEL_CACHE_MAX = 60;

export interface ProjectPanelCacheEntry {
  payload: any;
  lastLoadedAt: string;
}

const projectPanelPayloadCache = new Map<string, ProjectPanelCacheEntry>();

export function readProjectPanelCache(key: string | undefined): ProjectPanelCacheEntry | undefined {
  return key ? projectPanelPayloadCache.get(key) : undefined;
}

/**
 * The cache exists to seed a revisited tab with the last content that WORKED.
 * An error envelope is the opposite of that: `panelEnvelopeError` returns
 * `status: 'error'` with `data: null`, and the panel renders `payload?.data ?? {}`,
 * so seeding from one paints an empty panel.
 *
 * Both conditions are checked independently on purpose — a future error path
 * that sets only one of them is still refused.
 *
 * `status: 'empty'` IS cacheable: `panelEnvelope` emits it for a legitimately
 * empty-but-loaded panel, which is real content and should survive a revisit.
 */
export function isSuccessfulPanelPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const envelope = payload as { status?: string; data?: unknown };

  return envelope.status !== 'error' && envelope.data !== null && envelope.data !== undefined;
}

export function writeProjectPanelCache(key: string | undefined, entry: ProjectPanelCacheEntry) {
  if (!key) {
    return;
  }

  /*
   * BUG-PANEL-CACHE-003 — refuse the write instead of overwriting. Keeping the
   * previous entry is the point: after a transient upstream failure the tab
   * should still show slightly stale content rather than nothing at all.
   */
  if (!isSuccessfulPanelPayload(entry.payload)) {
    return;
  }

  // Refresh insertion order (Map preserves it) so the oldest key evicts first.
  projectPanelPayloadCache.delete(key);
  projectPanelPayloadCache.set(key, entry);

  while (projectPanelPayloadCache.size > PROJECT_PANEL_CACHE_MAX) {
    const oldest = projectPanelPayloadCache.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    projectPanelPayloadCache.delete(oldest);
  }
}

/** Test seam only: the cache is module state, so specs must be able to reset it. */
export function __resetProjectPanelCacheForTests() {
  projectPanelPayloadCache.clear();
}
