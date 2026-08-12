import { describe, expect, it } from 'vitest';
import { clearSeedMarker, readSeedMarker, writeSeedMarker, type SeedMarkerStore } from './seed-marker';
import { shouldReattachWarmWorkspace } from './workspace-reattach';

function memoryStore(seed: Record<string, string> = {}): SeedMarkerStore & { data: Record<string, string> } {
  const data: Record<string, string> = { ...seed };

  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

function throwingStore(): SeedMarkerStore {
  return {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
}

describe('seed marker', () => {
  it('round-trips the seeded revision for a workspace', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-7', store);
    expect(readSeedMarker('ws-1', store)).toEqual({ revision: 'rev-7' });
  });

  it('is absent for a workspace that was never seeded', () => {
    expect(readSeedMarker('ws-unknown', memoryStore())).toBeUndefined();
  });

  it('keys markers per workspace', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-1', store);
    writeSeedMarker('ws-2', 'rev-2', store);
    expect(readSeedMarker('ws-1', store)?.revision).toBe('rev-1');
    expect(readSeedMarker('ws-2', store)?.revision).toBe('rev-2');
  });

  it('records a seed whose revision was unknown as seeded-with-unknown-revision', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', undefined, store);

    // Present (so the workspace counts as seeded) but carries no revision.
    expect(readSeedMarker('ws-1', store)).toEqual({ revision: undefined });
  });

  it('treats a corrupt marker as NOT seeded rather than seeded-unknown', () => {
    // Never adopt a warm pod on unparseable state — a corrupt marker must reseed.
    const store = memoryStore({ 'vibecore.workspace-seed.ws-1': '{not json' });
    expect(readSeedMarker('ws-1', store)).toBeUndefined();
  });

  it('degrades to no-marker when storage is unavailable, and never throws', () => {
    const store = throwingStore();
    expect(readSeedMarker('ws-1', store)).toBeUndefined();
    expect(() => writeSeedMarker('ws-1', 'rev-1', store)).not.toThrow();
    expect(() => clearSeedMarker('ws-1', store)).not.toThrow();
  });

  it('clears a marker', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-1', store);
    clearSeedMarker('ws-1', store);
    expect(readSeedMarker('ws-1', store)).toBeUndefined();
  });
});

/*
 * The regression the user actually reported: reopening a project (a NEW page
 * load, so the in-memory `seededWorkspaceSessions` Map is empty) against a warm
 * pod that is serving the app and holds exactly the persisted revision.
 *
 * These reproduce the provider's decision inputs on both sides of the fix. The
 * "before" case is what the module-scope Map produced on every fresh load.
 */
describe('BUG-RUNTIME-DIVERGENCE — reopen of a warm, current workspace', () => {
  const warmAndCurrent = { reused: true, hasLivePort: true };

  it('AVANT le correctif: page-session memory is empty on reopen -> destructive reseed', () => {
    const seededThisSession = false; // module-scope Map, "naturally empty on a full reload"

    expect(
      shouldReattachWarmWorkspace({
        ...warmAndCurrent,
        seededThisSession,
        storageNewerThanSeed: undefined,
      }),
    ).toBe(false); // <- rebuilds the project on every open: the reported bug
  });

  it('APRES le correctif: the durable marker survives the reload -> reattach, no rebuild', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-7', store); // written by the previous session's cold seed

    // Simulate a brand-new page load: only the durable marker is available.
    const marker = readSeedMarker('ws-1', store);
    const currentRevision = 'rev-7'; // storage has not moved since the seed

    expect(
      shouldReattachWarmWorkspace({
        ...warmAndCurrent,
        seededThisSession: marker !== undefined,
        storageNewerThanSeed:
          marker?.revision !== undefined && currentRevision !== undefined ? currentRevision !== marker.revision : undefined,
      }),
    ).toBe(true);
  });

  it('still reseeds when the storage moved since the seed (staleness protection intact)', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-7', store);

    const marker = readSeedMarker('ws-1', store);
    const currentRevision = 'rev-8'; // another tab/device persisted files

    expect(
      shouldReattachWarmWorkspace({
        ...warmAndCurrent,
        seededThisSession: marker !== undefined,
        storageNewerThanSeed:
          marker?.revision !== undefined && currentRevision !== undefined ? currentRevision !== marker.revision : undefined,
      }),
    ).toBe(false);
  });

  it('still reseeds a cold pod even with a marker (pod was reaped and re-provisioned)', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-7', store);
    const marker = readSeedMarker('ws-1', store);

    expect(
      shouldReattachWarmWorkspace({
        reused: false, // freshly provisioned, empty tree
        hasLivePort: false,
        seededThisSession: marker !== undefined,
        storageNewerThanSeed: false,
      }),
    ).toBe(false);
  });

  it('still reseeds when no port is serving, even with a matching marker', () => {
    const store = memoryStore();
    writeSeedMarker('ws-1', 'rev-7', store);
    const marker = readSeedMarker('ws-1', store);

    expect(
      shouldReattachWarmWorkspace({
        reused: true,
        hasLivePort: false, // dev server died — must rebuild
        seededThisSession: marker !== undefined,
        storageNewerThanSeed: false,
      }),
    ).toBe(false);
  });
});
