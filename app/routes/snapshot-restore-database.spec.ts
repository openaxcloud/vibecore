import { describe, expect, it } from 'vitest';
import { classifyDatabaseRestoreError, foldRestoreResponse, shouldRestoreDatabase } from './snapshot-restore-database';

describe('shouldRestoreDatabase', () => {
  it('triggers a restore only for explicit truthy values', () => {
    expect(shouldRestoreDatabase('true')).toBe(true);
    expect(shouldRestoreDatabase('TRUE')).toBe(true);
    expect(shouldRestoreDatabase('1')).toBe(true);
    expect(shouldRestoreDatabase('on')).toBe(true);
    expect(shouldRestoreDatabase('yes')).toBe(true);
  });

  it('does not trigger a restore for falsy, missing, or unrelated values', () => {
    expect(shouldRestoreDatabase('false')).toBe(false);
    expect(shouldRestoreDatabase('')).toBe(false);
    expect(shouldRestoreDatabase('0')).toBe(false);
    expect(shouldRestoreDatabase(undefined)).toBe(false);
    expect(shouldRestoreDatabase(null)).toBe(false);

    /* The literal string the rollback modal posts when the box is unchecked. */
    expect(shouldRestoreDatabase('false')).toBe(false);
  });
});

describe('classifyDatabaseRestoreError', () => {
  it('treats a disabled feature as unavailable, not a hard failure', () => {
    const outcome = classifyDatabaseRestoreError({
      status: 404,
      code: 'FEATURE_NOT_ENABLED',
      message: 'Database rollback is not enabled',
    });

    expect(outcome.kind).toBe('unavailable');
  });

  it('treats a project without a database as unavailable', () => {
    const outcome = classifyDatabaseRestoreError({
      status: 409,
      code: 'NO_DATABASE',
      message: 'No database for this project',
    });

    expect(outcome.kind).toBe('unavailable');
  });

  it('treats other errors as a real failure carrying the status', () => {
    const outcome = classifyDatabaseRestoreError({ status: 403, code: 'FORBIDDEN', message: 'nope' });
    expect(outcome).toEqual({ kind: 'failed', status: 403, message: 'nope' });
  });
});

describe('foldRestoreResponse', () => {
  it('reports a clean success when no database restore was requested', () => {
    expect(foldRestoreResponse({ kind: 'skipped' })).toEqual({ ok: true, databaseRestore: 'skipped' });
  });

  it('reports a successful database restore', () => {
    expect(foldRestoreResponse({ kind: 'restored', restore: { id: 'r1' } })).toEqual({
      ok: true,
      databaseRestore: 'restored',
    });
  });

  it('surfaces a warning (never a silent success) when the database was NOT restored', () => {
    const unavailable = foldRestoreResponse({ kind: 'unavailable', message: 'db not available' });
    expect(unavailable.databaseRestore).toBe('unavailable');
    expect(unavailable.databaseRestoreWarning).toBe('db not available');

    const failed = foldRestoreResponse({ kind: 'failed', status: 500, message: 'boom' });
    expect(failed.databaseRestore).toBe('failed');
    expect(failed.databaseRestoreWarning).toBe('boom');
  });

  it('regression: a requested-but-dropped database restore can no longer masquerade as plain ok:true', () => {
    /*
     * The original bug: the panel action returned a bare `{ ok: true }` even
     * though the database was silently never restored. Folding the real outcome
     * means an unavailable/failed database restore always carries a warning, so
     * the modal can tell the user the DB was not rolled back.
     */
    const unavailable = foldRestoreResponse({ kind: 'unavailable', message: 'feature off' });
    expect(unavailable).not.toEqual({ ok: true });
    expect('databaseRestoreWarning' in unavailable).toBe(true);
  });
});
