/*
 * Pure helpers for the snapshot-restore "Database" option on the rollback modal.
 *
 * The rollback modal offers a "Database — your development database will be
 * restored to the time of this checkpoint" checkbox and posts `restoreDatabase`
 * alongside the snapshot `restore` intent. The panel action used to drop that
 * field on the floor: the file tree was rewound but the database silently was
 * not, so the user was told the DB would roll back when it never did.
 *
 * These helpers decide whether a database restore was requested and fold the
 * backend outcome into an honest response, so the checkbox either performs a
 * real coordinated restore or surfaces a clear "not restored" error — never a
 * false success.
 */

import { getApiRuntimeRoutesCopy } from '~/lib/i18n/catalogs/api-runtime-routes';

export type DatabaseRestoreOutcome =
  | { kind: 'skipped' }
  | { kind: 'restored'; restore: unknown }
  | { kind: 'unavailable'; message: string }
  | { kind: 'failed'; status: number; message: string };

/**
 * Parse the `restoreDatabase` form field into a boolean. The client posts the
 * literal string `'true'` / `'false'`; treat anything else (missing, empty,
 * `'on'` from a bare checkbox) conservatively — only an explicit truthy value
 * triggers the destructive database restore.
 */
export function shouldRestoreDatabase(field: string | undefined | null): boolean {
  if (typeof field !== 'string') {
    return false;
  }

  const normalized = field.trim().toLowerCase();

  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
}

interface DatabaseRestoreError {
  status: number;
  code?: string;
  message: string;
}

/**
 * Translate a thrown database-restore error (from the backend
 * `/projects/:id/database/restores` call) into an outcome. A
 * `FEATURE_NOT_ENABLED` 404 means the DB-rollback feature is not shipped on
 * this deployment, so we report it as "unavailable" (the files were restored,
 * but the database was intentionally not) rather than a hard failure.
 */
export function classifyDatabaseRestoreError(
  error: DatabaseRestoreError,
  language?: string | null,
): DatabaseRestoreOutcome {
  const copy = getApiRuntimeRoutesCopy(language);

  if (error.status === 404 && error.code === 'FEATURE_NOT_ENABLED') {
    return {
      kind: 'unavailable',
      message: copy['apiRuntime.snapshot.featureUnavailable'],
    };
  }

  if (error.status === 409 && error.code === 'NO_DATABASE') {
    return {
      kind: 'unavailable',
      message: copy['apiRuntime.snapshot.noDatabase'],
    };
  }

  return {
    kind: 'failed',
    status: error.status,
    message: copy['apiRuntime.snapshot.failed'],
  };
}

/**
 * Fold the database-restore outcome into the panel action's JSON response. The
 * files were already restored before this runs, so we never report a total
 * failure: a `failed`/`unavailable` database outcome is surfaced as a warning
 * the modal can show, while the overall action still succeeds.
 */
export function foldRestoreResponse(outcome: DatabaseRestoreOutcome): {
  ok: true;
  databaseRestore: 'skipped' | 'restored' | 'unavailable' | 'failed';
  databaseRestoreWarning?: string;
} {
  switch (outcome.kind) {
    case 'restored':
      return { ok: true, databaseRestore: 'restored' };
    case 'unavailable':
      return { ok: true, databaseRestore: 'unavailable', databaseRestoreWarning: outcome.message };
    case 'failed':
      return { ok: true, databaseRestore: 'failed', databaseRestoreWarning: outcome.message };
    case 'skipped':
    default:
      return { ok: true, databaseRestore: 'skipped' };
  }
}
