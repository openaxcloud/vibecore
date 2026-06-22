import { describe, expect, it } from 'vitest';

import { pairCheckpointsToSnapshots, type CheckpointSnapshotLike, type CheckpointTurn } from './checkpoint-snapshots';

interface Snap extends CheckpointSnapshotLike {
  id: string;
}

function snap(id: string, conversationId: string | undefined, turnIndex: number | undefined, createdAt: string): Snap {
  return { id, conversationId, turnIndex, createdAt };
}

function turn(key: string, backendConversationId: string | undefined, turnOrdinal: number): CheckpointTurn {
  return { key, backendConversationId, turnOrdinal };
}

describe('pairCheckpointsToSnapshots', () => {
  it('returns an empty map for empty inputs', () => {
    expect(pairCheckpointsToSnapshots([], []).size).toBe(0);
  });

  it('leaves a turn unmatched when there are no snapshots', () => {
    const result = pairCheckpointsToSnapshots([turn('t0', 'conv1', 0)], []);

    expect(result.get('t0')).toEqual({ match: 'none' });
  });

  it('pairs 1 snapshot per turn (the 1:1 case)', () => {
    const turns = [turn('t0', 'conv1', 0), turn('t1', 'conv1', 1)];
    const snapshots = [snap('s0', 'conv1', 0, '2026-06-22T10:00:00Z'), snap('s1', 'conv1', 1, '2026-06-22T10:05:00Z')];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('t0')).toEqual({ snapshot: snapshots[0], match: 'association' });
    expect(result.get('t1')).toEqual({ snapshot: snapshots[1], match: 'association' });
  });

  it('THE BUG: pairs to the FIRST snapshot of a multi-snapshot turn, not by array position', () => {
    /*
     * Turn 0 made three mutating tool calls → three before-ai-change snapshots.
     * Turn 1 made one. The ordinal-index bug would have mapped turn 1 to the
     * second snapshot of turn 0 (s0b). We must instead map:
     *   turn 0 → s0a (earliest of turn 0)
     *   turn 1 → s1  (earliest/only of turn 1)
     */
    const turns = [turn('t0', 'conv1', 0), turn('t1', 'conv1', 1)];

    const snapshots = [
      snap('s0a', 'conv1', 0, '2026-06-22T10:00:00Z'),
      snap('s0b', 'conv1', 0, '2026-06-22T10:00:05Z'),
      snap('s0c', 'conv1', 0, '2026-06-22T10:00:09Z'),
      snap('s1', 'conv1', 1, '2026-06-22T10:05:00Z'),
    ];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('t0')?.snapshot?.id).toBe('s0a');
    expect(result.get('t1')?.snapshot?.id).toBe('s1');
  });

  it('uses creation order (not input order) to pick the earliest snapshot of a turn', () => {
    const turns = [turn('t0', 'conv1', 0)];

    /* Deliberately list the later snapshot first. */
    const snapshots = [
      snap('late', 'conv1', 0, '2026-06-22T10:00:09Z'),
      snap('early', 'conv1', 0, '2026-06-22T10:00:01Z'),
    ];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('t0')?.snapshot?.id).toBe('early');
  });

  it('only requires ORDER agreement: server turnIndex values need not equal client ordinals', () => {
    /*
     * Server turnIndex values are 2 and 5 (e.g. earlier turns had no mutations),
     * but they are still monotonic. The client turns are ordinals 0 and 1. The
     * Nth turn group maps to the Nth client turn.
     */
    const turns = [turn('t0', 'conv1', 0), turn('t1', 'conv1', 1)];
    const snapshots = [snap('sA', 'conv1', 2, '2026-06-22T10:00:00Z'), snap('sB', 'conv1', 5, '2026-06-22T10:05:00Z')];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('t0')?.snapshot?.id).toBe('sA');
    expect(result.get('t1')?.snapshot?.id).toBe('sB');
  });

  it('keeps conversations isolated — a snapshot never crosses into another conversation', () => {
    const turns = [turn('a0', 'convA', 0), turn('b0', 'convB', 0)];
    const snapshots = [snap('sa', 'convA', 0, '2026-06-22T10:00:00Z'), snap('sb', 'convB', 0, '2026-06-22T11:00:00Z')];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('a0')?.snapshot?.id).toBe('sa');
    expect(result.get('b0')?.snapshot?.id).toBe('sb');
  });

  it('degrades to no-match for snapshots missing the association (legacy rows)', () => {
    const turns = [turn('t0', 'conv1', 0)];

    const snapshots = [
      snap('legacy1', undefined, undefined, '2026-06-22T10:00:00Z'),
      snap('legacy2', undefined, undefined, '2026-06-22T10:05:00Z'),
    ];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    /* No silently-wrong restore: the legacy snapshots are not bound to the turn. */
    expect(result.get('t0')).toEqual({ match: 'none' });
  });

  it('treats null conversationId/turnIndex (Prisma nulls) as missing association', () => {
    const turns = [turn('t0', 'conv1', 0)];
    const snapshots = [snap('s', null as unknown as undefined, null as unknown as undefined, '2026-06-22T10:00:00Z')];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('t0')).toEqual({ match: 'none' });
  });

  it('leaves extra turns (more turns than snapshot groups) unmatched rather than mispaired', () => {
    const turns = [turn('t0', 'conv1', 0), turn('t1', 'conv1', 1), turn('t2', 'conv1', 2)];

    /*
     * Only turn 0 and turn 2 produced snapshots — but turn 1 has none. We have two
     * groups (turnIndex 0 and 2) and three turns. Positional mapping binds the
     * first two turns; the third is unmatched.
     */
    const snapshots = [snap('s0', 'conv1', 0, '2026-06-22T10:00:00Z'), snap('s2', 'conv1', 2, '2026-06-22T10:10:00Z')];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    expect(result.get('t0')?.snapshot?.id).toBe('s0');
    expect(result.get('t1')?.snapshot?.id).toBe('s2');
    expect(result.get('t2')).toEqual({ match: 'none' });
  });

  it('handles turns with no backendConversationId without crashing', () => {
    const turns = [turn('t0', undefined, 0)];
    const snapshots = [snap('s0', 'conv1', 0, '2026-06-22T10:00:00Z')];

    const result = pairCheckpointsToSnapshots(turns, snapshots);

    /* A turn with no backend conversation can't be associated → no-match. */
    expect(result.get('t0')).toEqual({ match: 'none' });
  });
});
