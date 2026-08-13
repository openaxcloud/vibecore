/**
 * Pure helpers extracted from BaseChat.tsx so the IDE-panel logic that has no
 * visible surface (auth redirects, failed-restore messaging, auto-apply failure
 * copy, schema auto-load gating) is unit-testable without mounting the 16k-line
 * component.
 */

/**
 * A mid-session backend 401 surfaces as code 'PANEL_AUTH' on the panel envelope
 * (the API never redirects /api/* requests). Either the coded error or a raw 401
 * HTTP status means the session expired and the user must re-authenticate.
 */
export function isPanelAuthError(httpStatus: number | undefined, errorCode: string | undefined): boolean {
  if (errorCode === 'PANEL_AUTH') {
    return true;
  }

  return httpStatus === 401;
}

/**
 * Build the login URL to bounce an expired panel session to, preserving where the
 * user was so they land back in the same IDE view after signing in.
 */
export function panelAuthRedirectTarget(currentUrl: string): string {
  let returnTo = currentUrl;

  try {
    const parsed = new URL(currentUrl);
    returnTo = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    returnTo = currentUrl;
  }

  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

const SNAPSHOT_RESTORE_MESSAGES: Record<string, string> = {
  SNAPSHOT_STORAGE_MISSING: 'Rollback failed: the checkpoint snapshot is no longer available.',
  SNAPSHOT_STORAGE_CHECKSUM_MISMATCH: 'Rollback failed: the checkpoint snapshot is corrupted.',
  FORBIDDEN: "Rollback failed: you don't have permission to restore this checkpoint.",
  RBAC_FORBIDDEN: "Rollback failed: you don't have permission to restore this checkpoint.",
};

/**
 * Human-readable copy for a failed snapshot restore, keyed on the backend error
 * code when present and falling back to the HTTP status. Used to toast the real
 * reason instead of silently proceeding to wipe chat memory and reload.
 */
export function describeSnapshotRestoreFailure(
  httpStatus: number,
  payload: { error?: { code?: string; message?: string } | string } | undefined,
): string {
  const code = typeof payload?.error === 'object' ? payload?.error?.code : undefined;

  if (code && SNAPSHOT_RESTORE_MESSAGES[code]) {
    return SNAPSHOT_RESTORE_MESSAGES[code];
  }

  const message = typeof payload?.error === 'object' ? payload?.error?.message : payload?.error;

  if (typeof message === 'string' && message.trim().length > 0) {
    return `Rollback failed: ${message}`;
  }

  if (httpStatus === 403) {
    return "Rollback failed: you don't have permission to restore this checkpoint.";
  }

  if (httpStatus >= 500) {
    return 'Rollback failed: the server could not restore this checkpoint. No changes were made.';
  }

  return 'Rollback failed. No changes were made.';
}

/**
 * Copy for a silent auto-apply failure (patch rejected/threw) so the user learns
 * a file edit didn't land instead of the agent appearing to silently succeed.
 */
export function describeAutoApplyFailure(filePath: string, error?: unknown): string {
  const name = filePath && filePath.trim().length > 0 ? filePath : 'the file';

  if (error instanceof Error && error.message.trim().length > 0) {
    return `Couldn't apply ${name} — ${error.message}`;
  }

  return `Couldn't apply ${name} — review the change`;
}

export interface AutoApplyProposalSnapshot {
  id: string;
  relativePath: string;
  status: string;
  updatedAt: string;
  proposedContent: string;
}

export interface SupersededAutoApplyInput {
  /** The proposal id whose apply just failed. */
  proposalId: string;

  /** Relative path of the failed proposal. */
  filePath: string;

  /** `updatedAt` of the exact proposal version that was attempted. */
  attemptedUpdatedAt: string;

  /** Content length of the exact proposal version that was attempted. */
  attemptedContentLength: number;

  /** Live snapshot of all current proposals (read AFTER the apply resolved). */
  proposals: readonly AutoApplyProposalSnapshot[];
}

/**
 * Decide whether an auto-apply failure toast should be SUPPRESSED because the
 * failed attempt is a transient intermediate that a newer version supersedes.
 *
 * During streaming the same proposal id is rewritten with growing content, and a
 * separate boltAction can queue another proposal for the same file. Early chunks
 * often fail validation (truncated) before the final complete chunk applies —
 * without this guard each intermediate flashes a red "Couldn't apply …" error.
 *
 * Suppress when, for the SAME file:
 * - the same-id proposal now carries a newer version (newer `updatedAt` or a
 *   different content length) than the one we attempted — the auto-apply effect
 *   will re-fire on it, so only that later attempt should decide; or
 * - a DIFFERENT proposal is still `pending`/`applying` — its outcome supersedes.
 *
 * Only the FINAL attempt (no newer version, nothing else pending) toasts.
 */
export function shouldSuppressAutoApplyFailureToast(input: SupersededAutoApplyInput): boolean {
  for (const proposal of input.proposals) {
    if (proposal.relativePath !== input.filePath) {
      continue;
    }

    if (proposal.id === input.proposalId) {
      if (
        proposal.updatedAt > input.attemptedUpdatedAt ||
        proposal.proposedContent.length !== input.attemptedContentLength
      ) {
        return true;
      }

      continue;
    }

    if (proposal.status === 'pending' || proposal.status === 'applying') {
      return true;
    }
  }

  return false;
}

/**
 * The Database Explorer must auto-load the first connection's schema on open when
 * connections exist but no schema was hydrated by the initial panel fetch.
 */
export function shouldAutoLoadDatabaseSchema(input: {
  connectionKey: string | undefined;
  schema: unknown;
}): input is { connectionKey: string; schema: unknown } {
  if (typeof input.connectionKey !== 'string' || input.connectionKey.length === 0) {
    return false;
  }

  return input.schema === undefined || input.schema === null;
}
