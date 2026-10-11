import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetProjectPanelCacheForTests,
  PROJECT_PANEL_CACHE_MAX,
  readProjectPanelCache,
  writeProjectPanelCache,
} from './panel-payload-cache';

/*
 * BUG-PANEL-CACHE-003.
 *
 * The cache is documented as holding "the last SUCCESSFUL payload". `loadPanel`
 * in BaseChat.tsx breaks that contract: it detects the failure
 *
 *     if (result.status === 'error' && ...) { setError(...) }
 *
 * and then, two lines later, caches the very envelope it just recognised as an
 * error:
 *
 *     setPayload(result);
 *     writeProjectPanelCache(`${projectId}:${panel}`, { payload: result, ... });
 *
 * A panel envelope carrying `status: 'error'` always has `data: null` (see
 * panelEnvelopeError in api.projects.$projectId.ide-panel.$panel.ts), and the
 * panel renders `payload?.data ?? {}` — so a cached error envelope seeds a
 * revisited tab with nothing at all, instead of the last content that worked.
 *
 * This had no test of any kind, which is how it survived. The live
 * reproduction did NOT show user-visible harm — the periodic silent refresh
 * overwrites the poisoned entry before a user notices — so the defect is
 * latent, not observed. That is exactly the kind of defect a test has to hold,
 * because nothing else does.
 */

const errorEnvelope = {
  panel: 'overview',
  project: {},
  status: 'error' as const,
  data: null,
  error: { code: 'PANEL_BACKEND_UNAVAILABLE', message: 'The panel backend is unavailable.', retryable: true },
};

const okEnvelope = {
  panel: 'overview',
  project: { id: 'p1' },
  status: 'ok' as const,
  data: { commits: [{ id: 'c1' }], collaborators: [] },
};

describe('project panel payload cache', () => {
  beforeEach(() => {
    __resetProjectPanelCacheForTests();
  });

  // ---- witnesses: if these fail, every assertion below is meaningless ----
  it('stores and returns a successful payload', () => {
    writeProjectPanelCache('p1:overview', { payload: okEnvelope, lastLoadedAt: '2026-09-04T00:00:00.000Z' });
    expect(readProjectPanelCache('p1:overview')?.payload).toEqual(okEnvelope);
  });

  it('ignores an undefined key in both directions', () => {
    writeProjectPanelCache(undefined, { payload: okEnvelope, lastLoadedAt: 'x' });
    expect(readProjectPanelCache(undefined)).toBeUndefined();
  });

  it('evicts the oldest key past the bound', () => {
    for (let i = 0; i < PROJECT_PANEL_CACHE_MAX + 5; i++) {
      writeProjectPanelCache(`p1:panel-${i}`, { payload: okEnvelope, lastLoadedAt: 'x' });
    }
    expect(readProjectPanelCache('p1:panel-0')).toBeUndefined();
    expect(readProjectPanelCache(`p1:panel-${PROJECT_PANEL_CACHE_MAX + 4}`)?.payload).toEqual(okEnvelope);
  });

  // ---- the defect ------------------------------------------------------
  it('RED (BUG-PANEL-CACHE-003): never serves an error envelope as a cached payload', () => {
    writeProjectPanelCache('p1:overview', { payload: errorEnvelope, lastLoadedAt: '2026-09-04T00:00:00.000Z' });

    // A revisited tab seeds from this. Seeding on `data: null` paints an empty
    // panel, so the cache must not hand this back as if it were content.
    expect(readProjectPanelCache('p1:overview')).toBeUndefined();
  });

  it('RED (BUG-PANEL-CACHE-003): a failure must not destroy the last content that worked', () => {
    writeProjectPanelCache('p1:overview', { payload: okEnvelope, lastLoadedAt: '2026-09-04T00:00:00.000Z' });
    writeProjectPanelCache('p1:overview', { payload: errorEnvelope, lastLoadedAt: '2026-09-04T00:00:05.000Z' });

    /*
     * This is the half that matters for the user, and the half a guard placed
     * only at the call site could still get wrong: after a transient failure
     * the cache should still hold the payload that worked, so the revisited
     * tab shows slightly stale content rather than nothing.
     */
    expect(readProjectPanelCache('p1:overview')?.payload).toEqual(okEnvelope);
  });

  /*
   * Counter-proof in the other direction (règle 6). A guard that simply refused
   * everything would make tests above pass while quietly disabling the cache —
   * the panels would re-flash their skeleton on every tab switch and nothing
   * would fail. `status: 'empty'` is a LOADED panel that happens to have no
   * rows; it is real content and must survive a revisit.
   */
  it('still caches a loaded-but-empty panel (guard must not be over-broad)', () => {
    const emptyEnvelope = { panel: 'packages', project: { id: 'p1' }, status: 'empty' as const, data: {} };
    writeProjectPanelCache('p1:packages', { payload: emptyEnvelope, lastLoadedAt: 'x' });
    expect(readProjectPanelCache('p1:packages')?.payload).toEqual(emptyEnvelope);
  });

  it('refuses a payload with no data at all', () => {
    writeProjectPanelCache('p1:logs', { payload: { panel: 'logs', status: 'ok' }, lastLoadedAt: 'x' });
    expect(readProjectPanelCache('p1:logs')).toBeUndefined();
  });
});
