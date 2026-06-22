/**
 * Pure decision helper for collaboration presence cleanup on socket close.
 *
 * The per-replica `collaborationPresenceOwners` map cannot see a socket that
 * reconnected to a DIFFERENT api replica under the same (stable) sessionId.
 * When the old socket finally closes, its replica still believes it owns the
 * presence row and would delete the row the new replica just upserted —
 * evicting a user who is in fact connected and broadcasting a false
 * `presence.leave`.
 *
 * Every presence write (the initial upsert and each `presence.update`) bumps
 * the row's `updatedAt`. A connection therefore records the `updatedAt` of the
 * last write IT made. On close we re-read the currently persisted row: if its
 * `updatedAt` has advanced past what this connection last wrote, some other
 * connection (possibly on another replica) has since upserted the same
 * sessionId — so this stale close must NOT delete the row.
 */

/**
 * Decide whether a closing socket may retire (delete + broadcast leave) the
 * persisted presence row for its sessionId.
 *
 * @param persistedUpdatedAt `updatedAt` of the currently persisted presence row
 *   for this (projectId, sessionId), or `undefined` if no row exists anymore.
 * @param ownUpdatedAt the `updatedAt` of the most recent presence write made by
 *   THIS connection, or `undefined` if this connection never observed one.
 */
export function shouldRetirePresenceRow(
  persistedUpdatedAt: string | undefined,
  ownUpdatedAt: string | undefined,
): boolean {
  // Row already gone — nothing to retire.
  if (persistedUpdatedAt === undefined) {
    return false;
  }

  /*
   * This connection never recorded a write of its own (defensive). Fall back to
   * retiring so a genuinely orphaned row can still be cleaned up.
   */
  if (ownUpdatedAt === undefined) {
    return true;
  }

  const persistedMs = Date.parse(persistedUpdatedAt);
  const ownMs = Date.parse(ownUpdatedAt);

  /*
   * Unparseable timestamps: be conservative and retire (matches the legacy
   * owner-map behaviour rather than leaking rows).
   */
  if (Number.isNaN(persistedMs) || Number.isNaN(ownMs)) {
    return true;
  }

  /*
   * Only retire when the persisted row is still the one THIS connection wrote.
   * A newer write (strictly greater updatedAt) means another connection owns it
   * now — leave it alone.
   */
  return persistedMs <= ownMs;
}
