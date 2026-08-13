import { describe, expect, it, vi } from 'vitest';
import {
  hasAdoptablePreviewPort,
  probeAdoptablePortWithRetry,
  reseedWorkspacePreservingOnFailure,
  shouldReattachWarmWorkspace,
} from './workspace-reattach';

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

describe('hasAdoptablePreviewPort — signal 2, second volet', () => {
  it('accepte un port dont `ready` n_est pas encore confirmé', () => {
    /*
     * `hasLivePreviewPort` exige `ready === true` : un port réellement en écoute
     * mais pas encore confirmé par le flux de surveillance comptait comme mort,
     * et la réouverture reseedait un pod sain. Le voisin qui répond à la même
     * question (`refreshRuntimePorts`) accepte `ready !== false`.
     */
    expect(hasAdoptablePreviewPort([{ ready: undefined }])).toBe(true);
    expect(hasAdoptablePreviewPort([{ ready: true }])).toBe(true);
  });

  it('refuse un port explicitement mort', () => {
    expect(hasAdoptablePreviewPort([{ ready: false }])).toBe(false);
  });

  it('refuse l_absence de port', () => {
    expect(hasAdoptablePreviewPort([])).toBe(false);
    expect(hasAdoptablePreviewPort(null)).toBe(false);
    expect(hasAdoptablePreviewPort(undefined)).toBe(false);
  });

  it('adopte dès qu_UN port est adoptable', () => {
    expect(hasAdoptablePreviewPort([{ ready: false }, { ready: undefined }])).toBe(true);
  });
});

describe('hasAdoptablePreviewPort — `serving` prime sur `ready`', () => {
  /*
   * Cause RACINE mesurée en réel : sur un pod sain servant `port 5173`, la route
   * runtime répondait `ready:false, notReadyReason:'manager'`. `ready` agrège
   * quatre signaux pour répondre à « cet aperçu est-il sûr à afficher » ; deux
   * d'entre eux — statut manager, beacon du rendu PRÉCÉDENT — n'ont rien à dire
   * sur « puis-je adopter ce pod ». La réouverture effaçait donc un espace de
   * travail qui tournait.
   */
  it('adopte un port qui SERT, même si `ready` est faux (veto manager)', () => {
    expect(hasAdoptablePreviewPort([{ ready: false, serving: true }])).toBe(true);
  });

  it('refuse un port qui NE sert pas, même si `ready` est vrai', () => {
    // L'inverse doit valoir aussi : `serving` est la réponse, pas un assouplissement.
    expect(hasAdoptablePreviewPort([{ ready: true, serving: false }])).toBe(false);
  });

  it('retombe sur `ready` quand le runtime ne calcule pas `serving`', () => {
    expect(hasAdoptablePreviewPort([{ ready: true }])).toBe(true);
    expect(hasAdoptablePreviewPort([{ ready: undefined }])).toBe(true);
    expect(hasAdoptablePreviewPort([{ ready: false }])).toBe(false);
  });

  it('adopte dès qu_UN port sert, parmi plusieurs', () => {
    expect(hasAdoptablePreviewPort([{ serving: false }, { serving: true }])).toBe(true);
  });

  it('l_absence de port reste un refus', () => {
    expect(hasAdoptablePreviewPort([])).toBe(false);
  });
});

describe('probeAdoptablePortWithRetry — laisser aux ports le temps d_apparaître', () => {
  function harness(sequence: Array<Array<{ ready?: boolean; serving?: boolean }>>) {
    let call = 0;

    const waits: number[] = [];
    const refreshes: number[] = [];

    return {
      waits,
      refreshes,
      steps: {
        readPorts: () => sequence[Math.min(call, sequence.length - 1)],
        refresh: async () => {
          call += 1;
          refreshes.push(call);
        },
        wait: async (ms: number) => {
          waits.push(ms);
        },
      },
    };
  }

  it('rend vrai immédiatement quand un port sert déjà (aucune attente)', async () => {
    const h = harness([[{ serving: true }]]);

    await expect(probeAdoptablePortWithRetry(h.steps)).resolves.toBe(true);
    expect(h.waits).toEqual([]);
    expect(h.refreshes).toEqual([]);
  });

  it('rend vrai quand le port apparaît à la DEUXIÈME lecture', async () => {
    // Le cas réel : la sonde a résolu avant que l'agent n'ait rapporté le port.
    const h = harness([[], [{ serving: true }]]);

    await expect(probeAdoptablePortWithRetry(h.steps)).resolves.toBe(true);
    expect(h.waits).toHaveLength(1);
  });

  it('abandonne après le nombre de tentatives, sans boucler', async () => {
    const h = harness([[]]);

    await expect(probeAdoptablePortWithRetry({ ...h.steps, attempts: 3 })).resolves.toBe(false);

    // 3 lectures ⇒ 2 attentes seulement : on ne re-sonde pas après la dernière.
    expect(h.waits).toHaveLength(2);
  });

  it('une ré-sonde qui LÈVE n_interrompt pas la boucle', async () => {
    let reads = 0;

    const ports: Array<{ serving?: boolean }> = [];

    const result = await probeAdoptablePortWithRetry({
      readPorts: () => {
        reads += 1;

        // Le port finit par apparaître malgré l'échec de la ré-sonde.
        return reads >= 3 ? [{ serving: true }] : ports;
      },
      refresh: async () => {
        throw new Error('agent 502');
      },
      wait: async () => undefined,
    });

    expect(result).toBe(true);
  });

  it('respecte le délai demandé', async () => {
    const h = harness([[]]);

    await probeAdoptablePortWithRetry({ ...h.steps, attempts: 2, delayMs: 250 });
    expect(h.waits).toEqual([250]);
  });
});
