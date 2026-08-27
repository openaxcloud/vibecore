/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  readSeedMarker,
  resetSeedMarkersForTest,
  SEED_MARKER_TTL_MS,
  writeSeedMarker,
  type MarkerStorage,
} from './workspace-seed-marker';

/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 1) — la cause DOMINANTE.
 *
 * Le marqueur d'origine était une `Map` de portée module. Elle survit à un
 * remontage de composant, mais elle est vide à chaque chargement de page — or
 * « rouvrir un projet » EST un nouveau chargement de page. `seededThisSession`
 * était donc toujours faux à la réouverture, et la réouverture reseedait
 * systématiquement, quel que soit l'état réel du pod. C'est ce qui rendait
 * `fix/runtime-divergence-seed-marker` insuffisant : corriger ce seul signal ne
 * pouvait rien changer tant que les deux autres mentaient aussi.
 */

const NOW = 1_760_000_000_000;
const WS = 'ws-1db6975b749c4df6';

/** `localStorage` en mémoire, injectable — le module ne dépend pas du DOM. */
function fakeStorage(seed: Record<string, string> = {}): MarkerStorage & { data: Record<string, string> } {
  const data = { ...seed };

  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe('le marqueur survit à un rechargement de page — LE DÉFAUT', () => {
  beforeEach(() => resetSeedMarkersForTest());

  it('AVANT : une Map de portée module est vide au rechargement', () => {
    // Reproduction de l'ancien marqueur : une nouvelle Map par chargement de page.
    const apresSeed = new Map<string, string>([[WS, 'rev-1']]);
    const apresRechargement = new Map<string, string>();

    expect(apresSeed.has(WS)).toBe(true);
    expect(apresRechargement.has(WS)).toBe(false);
  });

  it('APRÈS : le marqueur écrit avant le rechargement est relu après', () => {
    const storage = fakeStorage();
    writeSeedMarker(WS, 'rev-1', NOW, storage);

    // Un nouveau chargement de page : la mémoire du module est repartie à zéro.
    resetSeedMarkersForTest();

    expect(readSeedMarker(WS, NOW + 60_000, storage)).toEqual({ revision: 'rev-1', seededAt: NOW });
  });

  it('ne confond pas deux workspaces', () => {
    const storage = fakeStorage();
    writeSeedMarker(WS, 'rev-1', NOW, storage);
    resetSeedMarkersForTest();

    expect(readSeedMarker('ws-0000000000000000', NOW, storage)).toBeUndefined();
  });
});

describe('le marqueur ne ment jamais en faveur du reattach', () => {
  beforeEach(() => resetSeedMarkersForTest());

  it('périme au-delà du TTL : le pod a forcément été recyclé entre-temps', () => {
    const storage = fakeStorage();
    writeSeedMarker(WS, 'rev-1', NOW, storage);
    resetSeedMarkersForTest();

    expect(readSeedMarker(WS, NOW + SEED_MARKER_TTL_MS - 1, storage)).toBeDefined();
    expect(readSeedMarker(WS, NOW + SEED_MARKER_TTL_MS + 1, storage)).toBeUndefined();
  });

  it('rejette un marqueur venu du FUTUR (horloge remise à l_heure)', () => {
    const storage = fakeStorage();
    writeSeedMarker(WS, 'rev-1', NOW + 60_000, storage);
    resetSeedMarkersForTest();

    expect(readSeedMarker(WS, NOW, storage)).toBeUndefined();
  });

  it('traite une entrée corrompue comme ABSENTE, jamais comme une autorisation', () => {
    const storage = fakeStorage({ [`vc:ws-seed:${WS}`]: '{ pas du json' });

    expect(readSeedMarker(WS, NOW, storage)).toBeUndefined();
  });

  it('traite une entrée sans date comme absente (impossible à périmer)', () => {
    const storage = fakeStorage({ [`vc:ws-seed:${WS}`]: JSON.stringify({ revision: 'rev-1' }) });

    expect(readSeedMarker(WS, NOW, storage)).toBeUndefined();
  });
});

describe('dégradation quand le stockage est indisponible', () => {
  beforeEach(() => resetSeedMarkersForTest());

  it('sans stockage, retombe sur la mémoire : exactement le comportement d_avant', () => {
    writeSeedMarker(WS, 'rev-1', NOW, undefined);

    // Même page : le marqueur mémoire répond.
    expect(readSeedMarker(WS, NOW, undefined)).toEqual({ revision: 'rev-1', seededAt: NOW });

    // Nouveau chargement : plus rien, comme avant le correctif. Sûr, pas faux.
    resetSeedMarkersForTest();
    expect(readSeedMarker(WS, NOW, undefined)).toBeUndefined();
  });

  it('un stockage qui lève à l_écriture ne casse pas le seed', () => {
    const hostile: MarkerStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };

    expect(() => writeSeedMarker(WS, 'rev-1', NOW, hostile)).not.toThrow();

    // Le repli mémoire a bien pris le relais pour cette page.
    expect(readSeedMarker(WS, NOW, hostile)).toEqual({ revision: 'rev-1', seededAt: NOW });
  });

  it('un stockage qui lève à la lecture est traité comme absent', () => {
    const hostile: MarkerStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(readSeedMarker(WS, NOW, hostile)).toBeUndefined();
  });
});

describe('la révision transportée', () => {
  beforeEach(() => resetSeedMarkersForTest());

  it('conserve la révision du seed, pour que la comparaison de fraîcheur soit possible', () => {
    const storage = fakeStorage();
    writeSeedMarker(WS, 'sha-des-fichiers', NOW, storage);
    resetSeedMarkersForTest();

    expect(readSeedMarker(WS, NOW, storage)?.revision).toBe('sha-des-fichiers');
  });

  it('accepte une révision inconnue au moment du seed', () => {
    const storage = fakeStorage();
    writeSeedMarker(WS, undefined, NOW, storage);
    resetSeedMarkersForTest();

    const marker = readSeedMarker(WS, NOW, storage);

    expect(marker).toBeDefined();
    expect(marker?.revision).toBeUndefined();
  });
});
