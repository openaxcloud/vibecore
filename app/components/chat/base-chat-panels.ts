/**
 * Pure helpers extracted from BaseChat.tsx so the IDE-panel logic that has no
 * visible surface (auth redirects, failed-restore messaging, auto-apply failure
 * copy, schema auto-load gating) is unit-testable without mounting the 16k-line
 * component.
 */

import {
  formatAutoApplyFailure,
  formatSnapshotRestoreFailure,
  type AutoApplyFailureReason,
  type SnapshotRestoreFailure,
} from '~/lib/i18n/catalogs/client-visible-errors';

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

const SNAPSHOT_RESTORE_FAILURES: Readonly<Record<string, SnapshotRestoreFailure>> = {
  SNAPSHOT_STORAGE_MISSING: 'snapshotMissing',
  SNAPSHOT_STORAGE_CHECKSUM_MISMATCH: 'snapshotCorrupted',
  FORBIDDEN: 'forbidden',
  RBAC_FORBIDDEN: 'forbidden',
};

/**
 * Human-readable copy for a failed snapshot restore, keyed on the backend error
 * code when present and falling back to the HTTP status. Used to toast the real
 * reason instead of silently proceeding to wipe chat memory and reload.
 *
 * `payload` est typé `unknown` et non par une forme précise : l'appelant passe
 * le résultat de `response.json()`, qui EST `unknown` — c'est un corps réseau,
 * il peut contenir n'importe quoi. Annoncer une forme obligeait l'appelant à
 * mentir sur ce qu'il tient (TS2345, jusqu'ici masqué par `@ts-nocheck` dans
 * `BaseChat.tsx`). Le narrowing se fait donc ici, où l'on sait quoi chercher ;
 * le comportement ne change pas, la fonction était déjà défensive.
 */
export function describeSnapshotRestoreFailure(httpStatus: number, payload: unknown, language?: string | null): string {
  const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : undefined;
  const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;

  if (code && SNAPSHOT_RESTORE_FAILURES[code]) {
    return formatSnapshotRestoreFailure(SNAPSHOT_RESTORE_FAILURES[code], language);
  }

  if (httpStatus === 403) {
    return formatSnapshotRestoreFailure('forbidden', language);
  }

  if (httpStatus >= 500) {
    return formatSnapshotRestoreFailure('server', language);
  }

  return formatSnapshotRestoreFailure('generic', language);
}

/**
 * Copy for a silent auto-apply failure (patch rejected/threw) so the user learns
 * a file edit didn't land instead of the agent appearing to silently succeed.
 */
export function describeAutoApplyFailure(filePath: string, error?: unknown, language?: string | null): string {
  let reason: AutoApplyFailureReason = 'review';

  if (error instanceof Error && error.message.trim().length > 0) {
    const diagnostic = error.message.toLowerCase();

    if (/(?:permission|denied|forbidden|eacces|eperm)/u.test(diagnostic)) {
      reason = 'permission';
    } else if (/(?:not found|no such file|enoent)/u.test(diagnostic)) {
      reason = 'missing';
    } else if (/(?:locked|busy|ebusy)/u.test(diagnostic)) {
      reason = 'locked';
    } else if (/(?:conflict|changed|stale|outdated)/u.test(diagnostic)) {
      reason = 'conflict';
    }
  }

  return formatAutoApplyFailure(filePath, reason, language);
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
