/**
 * Garde anti-sur-revendication (P0-V3-09). Le refus expert était « barrière 2
 * phases prouvée mais pas le niveau transaction-consistent revendiqué » : ces
 * tests font de la sur-revendication une erreur de CI plutôt qu'un point de
 * revue à re-négocier à chaque PR.
 */
import { describe, expect, it } from 'vitest';

import {
  CAPTURE_SCOPE,
  NEVER_CLAIMED,
  declareCheckpointConsistency,
  declareDatabaseConsistency,
  declareFilesConsistency,
  type BarrierScope,
} from './checkpoint-consistency.js';

const scope = (patch: Partial<BarrierScope> = {}): BarrierScope => ({
  apiWritesFrozenAllReplicas: true,
  inPodWritersReachable: true,
  dbClientWritesReachable: true,
  ...patch,
});

describe('niveau de cohérence — jamais au-dessus du prouvé', () => {
  it('les FICHIERS ne dépassent JAMAIS crash-consistent, même sans écrivain in-pod', () => {
    // Même dans le cas le plus favorable (aucun runtime joignable), on ne demande
    // aucun flush applicatif : revendiquer application-consistent serait faux.
    const quiet = declareFilesConsistency(scope({ inPodWritersReachable: false }));
    expect(quiet.level).toBe('crash-consistent');
    expect(quiet.unfrozenWriters).toEqual([]);

    const busy = declareFilesConsistency(scope());
    expect(busy.level).toBe('crash-consistent');
    expect(busy.unfrozenWriters.length).toBeGreaterThan(0);
  });

  it('sans barrière garantie sur tous les replicas, AUCUN niveau n est revendiqué', () => {
    const d = declareFilesConsistency(scope({ apiWritesFrozenAllReplicas: false }));
    expect(d.level).toBe('UNKNOWN');
    expect(d.basis).toMatch(/replicas/);
  });

  it('la BASE est crash-consistent et déclare l absence d instant commun', () => {
    const d = declareDatabaseConsistency(scope());
    expect(d.level).toBe('crash-consistent');
    expect(d.basis).toMatch(/aucun instant commun/);
  });

  it('agrège au composant le PLUS FAIBLE, jamais au plus fort', () => {
    const agg = declareCheckpointConsistency([
      { componentKind: 'FILES', consistency: declareFilesConsistency(scope()) },
      {
        componentKind: 'DATABASE',
        consistency: { level: 'UNKNOWN', basis: 'backup non confirmé', unfrozenWriters: [] },
      },
    ]);
    expect(agg.level).toBe('UNKNOWN');
    expect(agg.basis).toMatch(/DATABASE/);
  });

  it('déclare l atomicité inter-composants FAUSSE (snapshots séquentiels)', () => {
    const agg = declareCheckpointConsistency([
      { componentKind: 'FILES', consistency: declareFilesConsistency(scope()) },
    ]);
    expect(agg.crossComponentAtomic).toBe(false);
    expect(agg.notClaimed).toEqual(NEVER_CLAIMED);
  });

  it('aucun chemin ne peut rendre un niveau de la liste interdite', () => {
    const combos: BarrierScope[] = [
      scope(),
      scope({ inPodWritersReachable: false }),
      scope({ dbClientWritesReachable: false }),
      scope({ apiWritesFrozenAllReplicas: false }),
      scope({ inPodWritersReachable: false, dbClientWritesReachable: false }),
    ];

    for (const s of combos) {
      const files = declareFilesConsistency(s);
      const db = declareDatabaseConsistency(s);
      expect(NEVER_CLAIMED).not.toContain(files.level);
      expect(NEVER_CLAIMED).not.toContain(db.level);
      expect(
        declareCheckpointConsistency([
          { componentKind: 'FILES', consistency: files },
          { componentKind: 'DATABASE', consistency: db },
        ]).level,
      ).not.toBe('transaction-consistent');
    }
  });

  it('sans composant, le niveau est UNKNOWN — pas un succès par défaut', () => {
    const agg = declareCheckpointConsistency([]);
    expect(agg.level).toBe('UNKNOWN');
  });
});

describe('portée de capture — les limites structurelles sont écrites', () => {
  it('dit que la source est la copie API, pas le volume vif du pod', () => {
    expect(CAPTURE_SCOPE.source).toBe('api-filestore-project-tree');
    expect(CAPTURE_SCOPE.convergesOnlyOnBrowserAutosave).toBe(true);
  });

  it('énumère les écrivains hors de portée au lieu de les taire', () => {
    expect(CAPTURE_SCOPE.writersOutsideBarrier.length).toBeGreaterThanOrEqual(3);
    expect(CAPTURE_SCOPE.writersOutsideBarrier.join(' ')).toMatch(/dev server|terminal/);
  });
});
