/**
 * Pure pairing logic for the IDE "Rollback here" feature.
 *
 * THE BUG THIS FIXES: the IDE used to pair assistant message N to
 * `snapshots[N - 1]` by ordinal index. That assumed exactly one snapshot per
 * assistant turn. But the backend takes a "before-ai-change" snapshot per
 * *mutating tool call* (delete_file/rename_file/apply_patch/restore_snapshot),
 * so one agent turn (one assistant message) can produce MANY snapshots. The
 * ordinal index therefore pointed at an arbitrary unrelated snapshot, so
 * clicking "Rollback here" silently restored the wrong project state.
 *
 * THE PAIRING INVARIANT: a checkpoint for an assistant turn should restore the
 * state that existed *before that turn ran*. That state is captured by the FIRST
 * (earliest) "before-ai-change" snapshot taken during the turn. The backend now
 * stamps every such snapshot with its `conversationId` and `turnIndex` (the
 * assistant-turn ordinal within that conversation at snapshot time). We pair by
 * that association — never by global array position.
 *
 * BACKWARD COMPATIBILITY: snapshots created before this association existed have
 * no `conversationId`/`turnIndex`. They cannot be matched precisely, so we never
 * silently bind them to a checkpoint. Callers degrade to a clearly-labelled
 * best-effort (or leave the checkpoint snapshot-less) rather than restore the
 * wrong files.
 */

export interface CheckpointSnapshotLike {
  id: string;
  conversationId?: string | null;
  turnIndex?: number | null;
  createdAt?: string;
}

export interface CheckpointTurn {
  /**
   * Stable key for the checkpoint (used only to correlate the input turn with its
   * paired snapshot in the returned map).
   */
  key: string;

  /**
   * The backend AI conversation id this assistant turn belongs to, when known.
   * This is the `backendConversationId` the IDE already tracks per conversation —
   * NOT the synthetic `project:<id>` client id.
   */
  backendConversationId?: string;

  /**
   * Zero-based ordinal of this assistant turn within its conversation, in the
   * order the turns appear in the transcript. Used to line up the client's turns
   * with the server's distinct `turnIndex` groups positionally, so the two only
   * need to agree on *order*, not on the exact integer value.
   */
  turnOrdinal: number;
}

export interface CheckpointSnapshotPairing<S extends CheckpointSnapshotLike> {
  /** The snapshot that represents the state before this turn ran, if found. */
  snapshot?: S;

  /**
   * How the snapshot was matched. `association` is the precise, id-anchored match.
   * `none` means no trustworthy snapshot exists for this turn (degraded — callers
   * should not offer a silent restore).
   */
  match: 'association' | 'none';
}

function compareByCreatedAt(a: CheckpointSnapshotLike, b: CheckpointSnapshotLike): number {
  const left = a.createdAt ?? '';
  const right = b.createdAt ?? '';

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

/**
 * Pair each assistant turn to the snapshot representing the project state BEFORE
 * that turn ran, using the persisted `(conversationId, turnIndex)` association.
 *
 * The matching only relies on ORDER agreement between client and server:
 *   1. Snapshots are grouped by `conversationId`.
 *   2. Within a conversation, the distinct `turnIndex` values are sorted ascending
 *      — each distinct value is one "turn group".
 *   3. Within a turn group, the EARLIEST snapshot (smallest createdAt) is the
 *      before-turn state.
 *   4. The conversation's turns (sorted by `turnOrdinal`) are mapped positionally
 *      onto those turn groups.
 *
 * Snapshots lacking the association (legacy/manual) are ignored for pairing, so a
 * checkpoint never silently binds to an unrelated snapshot.
 *
 * @returns a Map keyed by `CheckpointTurn.key`.
 */
export function pairCheckpointsToSnapshots<S extends CheckpointSnapshotLike>(
  turns: CheckpointTurn[],
  snapshots: S[],
): Map<string, CheckpointSnapshotPairing<S>> {
  const result = new Map<string, CheckpointSnapshotPairing<S>>();

  /*
   * Build, per conversation, the ordered list of "first snapshot of each turn".
   * Only associated snapshots participate — a snapshot without a conversationId
   * or turnIndex cannot be trusted to belong to a specific turn.
   */
  const firstSnapshotByConversationTurn = new Map<string, Map<number, S>>();

  for (const snapshot of snapshots) {
    const conversationId = snapshot.conversationId ?? undefined;
    const turnIndex = snapshot.turnIndex ?? undefined;

    if (!conversationId || turnIndex === undefined || turnIndex === null) {
      continue;
    }

    let byTurn = firstSnapshotByConversationTurn.get(conversationId);

    if (!byTurn) {
      byTurn = new Map<number, S>();
      firstSnapshotByConversationTurn.set(conversationId, byTurn);
    }

    const existing = byTurn.get(turnIndex);

    /*
     * Keep the EARLIEST snapshot of the turn — that is the state before the turn's
     * first mutating tool call, i.e. the state the user means to roll back to.
     */
    if (!existing || compareByCreatedAt(snapshot, existing) < 0) {
      byTurn.set(turnIndex, snapshot);
    }
  }

  /* Flatten each conversation's turn groups into an order-sorted array. */
  const orderedTurnSnapshotsByConversation = new Map<string, S[]>();

  for (const [conversationId, byTurn] of firstSnapshotByConversationTurn) {
    const ordered = [...byTurn.entries()].sort((a, b) => a[0] - b[0]).map(([, snapshot]) => snapshot);
    orderedTurnSnapshotsByConversation.set(conversationId, ordered);
  }

  /*
   * Walk the turns conversation-by-conversation and assign the ordered snapshots
   * positionally. Turns are taken in transcript order (turnOrdinal) so the Nth
   * assistant turn of a conversation maps to the Nth turn group's first snapshot.
   */
  const turnsByConversation = new Map<string, CheckpointTurn[]>();

  for (const turn of turns) {
    const conversationId = turn.backendConversationId ?? '';
    const bucket = turnsByConversation.get(conversationId);

    if (bucket) {
      bucket.push(turn);
    } else {
      turnsByConversation.set(conversationId, [turn]);
    }
  }

  for (const [conversationId, conversationTurns] of turnsByConversation) {
    const orderedSnapshots = orderedTurnSnapshotsByConversation.get(conversationId) ?? [];
    const sortedTurns = [...conversationTurns].sort((a, b) => a.turnOrdinal - b.turnOrdinal);

    sortedTurns.forEach((turn, position) => {
      const snapshot = orderedSnapshots[position];

      result.set(turn.key, snapshot ? { snapshot, match: 'association' } : { match: 'none' });
    });
  }

  return result;
}
