/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 1) — un marqueur de seed DURABLE.
 *
 * Le marqueur d'origine était une `Map` de portée module : elle survit à un
 * remontage de composant dans la même page, mais elle est VIDE à chaque
 * chargement de page. Or « rouvrir un projet » est précisément un nouveau
 * chargement de page. `seededThisSession` était donc systématiquement faux à la
 * réouverture, et la réouverture reseedait toujours — quel que soit l'état réel
 * du pod. Mesuré en réel : `seededThisSession: false` sur un pod chaud dont
 * `npm run dev` tournait, port 5173 ouvert.
 *
 * Le marqueur est donc persisté par workspace, avec la révision des fichiers au
 * moment du seed. Il ne dit pas « le pod est bon » — il dit « CE navigateur a
 * semé CE workspace à CETTE révision ». La décision de reattach reste entière :
 * elle croise ce marqueur avec le port vivant et la révision courante.
 *
 * Trois propriétés délibérées :
 *   - le stockage indisponible (SSR, navigation privée, quota) ne casse rien :
 *     on retombe sur la mémoire, c'est-à-dire le comportement d'avant ;
 *   - une entrée illisible ou corrompue est traitée comme absente, jamais comme
 *     une autorisation de reattach ;
 *   - les entrées ont une durée de vie bornée : un marqueur vieux de plusieurs
 *     jours ne doit pas autoriser l'adoption d'un pod qui a forcément été
 *     recyclé entre-temps.
 */

const STORAGE_PREFIX = 'vc:ws-seed:';

/** Au-delà, le pod a de toute façon été recyclé par le GC d'inactivité. */
export const SEED_MARKER_TTL_MS = 24 * 60 * 60 * 1000;

export interface SeedMarker {
  /** Révision des fichiers persistés au moment où ce workspace a été semé. */
  revision: string | undefined;

  /** Date du seed, en millisecondes epoch. */
  seededAt: number;
}

/** Le sous-ensemble de `Storage` réellement utilisé — facilite l'injection en test. */
export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Repli mémoire : conserve exactement le comportement historique. */
const memory = new Map<string, SeedMarker>();

function defaultStorage(): MarkerStorage | undefined {
  try {
    const candidate = (globalThis as { localStorage?: MarkerStorage }).localStorage;

    if (!candidate) {
      return undefined;
    }

    /*
     * Safari en navigation privée expose `localStorage` mais lève à l'écriture :
     * la seule façon fiable de savoir s'il est utilisable est d'essayer.
     */
    const probe = `${STORAGE_PREFIX}probe`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);

    return candidate;
  } catch {
    return undefined;
  }
}

export function readSeedMarker(
  workspaceId: string,
  now: number,
  storage: MarkerStorage | undefined = defaultStorage(),
): SeedMarker | undefined {
  const fromMemory = memory.get(workspaceId);

  const parsed = (() => {
    if (!storage) {
      return fromMemory;
    }

    try {
      const raw = storage.getItem(STORAGE_PREFIX + workspaceId);

      if (!raw) {
        return fromMemory;
      }

      const value = JSON.parse(raw) as Partial<SeedMarker>;

      // Une entrée sans date est inexploitable : on ne peut pas la périmer.
      if (typeof value?.seededAt !== 'number' || !Number.isFinite(value.seededAt)) {
        return undefined;
      }

      return {
        revision: typeof value.revision === 'string' ? value.revision : undefined,
        seededAt: value.seededAt,
      };
    } catch {
      // Illisible ou corrompue : traitée comme absente, jamais comme une autorisation.
      return undefined;
    }
  })();

  if (!parsed) {
    return undefined;
  }

  if (now - parsed.seededAt > SEED_MARKER_TTL_MS || parsed.seededAt > now) {
    return undefined;
  }

  return parsed;
}

export function writeSeedMarker(
  workspaceId: string,
  revision: string | undefined,
  now: number,
  storage: MarkerStorage | undefined = defaultStorage(),
): void {
  const marker: SeedMarker = { revision, seededAt: now };

  // Toujours en mémoire : le repli doit rester vrai même quand le stockage marche.
  memory.set(workspaceId, marker);

  try {
    storage?.setItem(STORAGE_PREFIX + workspaceId, JSON.stringify(marker));
  } catch {
    // Quota plein ou stockage refusé : le marqueur mémoire suffit pour cette page.
  }
}

/** Utilisé par les tests pour repartir d'un état propre. */
export function resetSeedMarkersForTest() {
  memory.clear();
}
