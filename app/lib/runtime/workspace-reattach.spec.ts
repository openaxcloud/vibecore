import { describe, expect, it, vi } from 'vitest';
import { reseedWorkspacePreservingOnFailure, shouldReattachWarmWorkspace } from './workspace-reattach';

/*
 * `portProbeSucceeded` rejoint le cas nominal (option A, signal 2) : la sonde de
 * ports doit avoir ABOUTI pour qu'un port vivant veuille dire quelque chose.
 * Auparavant `refreshRuntimePorts()` était appelée en `.catch(() => undefined)`,
 * si bien qu'une sonde en échec et un pod qui n'écoute rien donnaient tous deux
 * `hasLivePort: false` — indiscernables.
 */
const warm = {
  reused: true,
  seededThisSession: true,
  hasLivePort: true,
  portProbeSucceeded: true,
  storageNewerThanSeed: false,
};

describe('shouldReattachWarmWorkspace', () => {
  it('refuse de reattacher quand la sonde de ports a ÉCHOUÉ, même avec tous les autres signaux au vert', () => {
    // Une sonde en échec ne prouve rien sur le pod : elle ne peut pas valoir autorisation.
    expect(shouldReattachWarmWorkspace({ ...warm, portProbeSucceeded: false })).toBe(false);
  });

  it('traite une sonde NON instrumentée comme un échec (défaut sûr)', () => {
    const { portProbeSucceeded: _omit, ...withoutProbe } = warm;
    expect(shouldReattachWarmWorkspace(withoutProbe)).toBe(false);
  });

  it('reattaches when the pod is warm, seeded this page-session, and serving a live port', () => {
    expect(shouldReattachWarmWorkspace(warm)).toBe(true);
  });

  it('reseeds a cold (freshly provisioned) pod', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, reused: false })).toBe(false);
  });

  it('reseeds when this page-session never seeded the workspace (fresh load / cross-device)', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, seededThisSession: false })).toBe(false);
  });

  it('reseeds when there is no live preview port to adopt', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, hasLivePort: false })).toBe(false);
  });

  it('reseeds when project storage is known to be newer than the last seed', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, storageNewerThanSeed: true })).toBe(false);
  });

  it('treats an unknown storage-freshness as safe (relies on the same-session marker)', () => {
    const { storageNewerThanSeed: _omit, ...withoutFreshness } = warm;
    expect(shouldReattachWarmWorkspace(withoutFreshness)).toBe(true);
  });
});

describe('reseedWorkspacePreservingOnFailure', () => {
  it('fetches the archive BEFORE clearing, then applies it (happy path)', async () => {
    const calls: string[] = [];

    const fetchArchive = vi.fn(async () => {
      calls.push('fetch');
      return 'ARCHIVE';
    });
    const clearTree = vi.fn(async () => {
      calls.push('clear');
    });
    const applyArchive = vi.fn(async (archive: string) => {
      calls.push(`apply:${archive}`);
    });

    await reseedWorkspacePreservingOnFailure({ fetchArchive, clearTree, applyArchive });

    // Order matters: fetch must happen before the destructive clear.
    expect(calls).toEqual(['fetch', 'clear', 'apply:ARCHIVE']);
  });

  it('NEVER clears the pod when the archive fetch fails (no wiped-but-unseeded window)', async () => {
    const clearTree = vi.fn(async () => undefined);
    const applyArchive = vi.fn(async () => undefined);

    const fetchArchive = vi.fn(async () => {
      throw new Error('export 502');
    });

    await expect(reseedWorkspacePreservingOnFailure({ fetchArchive, clearTree, applyArchive })).rejects.toThrow(
      'export 502',
    );

    // The pod keeps its files: the destructive steps never ran.
    expect(clearTree).not.toHaveBeenCalled();
    expect(applyArchive).not.toHaveBeenCalled();
  });

  it('propagates an apply failure (the caller keeps the pod RUNNING to retry)', async () => {
    const fetchArchive = vi.fn(async () => 'ARCHIVE');
    const clearTree = vi.fn(async () => undefined);

    const applyArchive = vi.fn(async () => {
      throw new Error('agent 502');
    });

    await expect(reseedWorkspacePreservingOnFailure({ fetchArchive, clearTree, applyArchive })).rejects.toThrow(
      'agent 502',
    );
    expect(clearTree).toHaveBeenCalledOnce();
  });
});
