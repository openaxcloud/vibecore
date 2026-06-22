import { describe, expect, it } from 'vitest';
import {
  describeAutoApplyFailure,
  describeSnapshotRestoreFailure,
  isPanelAuthError,
  panelAuthRedirectTarget,
  shouldAutoLoadDatabaseSchema,
} from './base-chat-panels';

describe('isPanelAuthError', () => {
  it('flags the PANEL_AUTH error code regardless of status', () => {
    expect(isPanelAuthError(200, 'PANEL_AUTH')).toBe(true);
    expect(isPanelAuthError(undefined, 'PANEL_AUTH')).toBe(true);
  });

  it('flags a raw 401 status', () => {
    expect(isPanelAuthError(401, undefined)).toBe(true);
  });

  it('does not flag other errors or success', () => {
    expect(isPanelAuthError(200, undefined)).toBe(false);
    expect(isPanelAuthError(403, 'FORBIDDEN')).toBe(false);
    expect(isPanelAuthError(500, 'PANEL_ERROR')).toBe(false);
  });
});

describe('panelAuthRedirectTarget', () => {
  it('preserves the IDE path, query and hash as returnTo', () => {
    const target = panelAuthRedirectTarget('https://app.e-code.ai/ide/project-1?tab=git#chat-message-7');
    expect(target).toBe('/login?returnTo=%2Fide%2Fproject-1%3Ftab%3Dgit%23chat-message-7');
  });

  it('falls back to the raw string for an unparseable url', () => {
    const target = panelAuthRedirectTarget('not a url');
    expect(target).toBe(`/login?returnTo=${encodeURIComponent('not a url')}`);
  });
});

describe('describeSnapshotRestoreFailure', () => {
  it('maps known backend codes to specific copy', () => {
    expect(describeSnapshotRestoreFailure(409, { error: { code: 'SNAPSHOT_STORAGE_MISSING' } })).toContain(
      'no longer available',
    );
    expect(describeSnapshotRestoreFailure(409, { error: { code: 'SNAPSHOT_STORAGE_CHECKSUM_MISMATCH' } })).toContain(
      'corrupted',
    );
  });

  it('uses the backend message when no code mapping exists', () => {
    expect(describeSnapshotRestoreFailure(400, { error: { message: 'bad request' } })).toBe(
      'Rollback failed: bad request',
    );
  });

  it('falls back on status when no payload detail is present', () => {
    expect(describeSnapshotRestoreFailure(403, undefined)).toContain('permission');
    expect(describeSnapshotRestoreFailure(500, undefined)).toContain('No changes were made');
    expect(describeSnapshotRestoreFailure(0, undefined)).toBe('Rollback failed. No changes were made.');
  });
});

describe('describeAutoApplyFailure', () => {
  it('names the file and prompts a review when no error is given', () => {
    expect(describeAutoApplyFailure('src/App.tsx')).toBe("Couldn't apply src/App.tsx — review the change");
  });

  it('includes the thrown error message', () => {
    expect(describeAutoApplyFailure('src/App.tsx', new Error('write denied'))).toBe(
      "Couldn't apply src/App.tsx — write denied",
    );
  });

  it('degrades gracefully with an empty path', () => {
    expect(describeAutoApplyFailure('')).toBe("Couldn't apply the file — review the change");
  });
});

describe('shouldAutoLoadDatabaseSchema', () => {
  it('auto-loads when a connection exists and no schema is hydrated', () => {
    expect(shouldAutoLoadDatabaseSchema({ connectionKey: 'pg-1', schema: undefined })).toBe(true);
    expect(shouldAutoLoadDatabaseSchema({ connectionKey: 'pg-1', schema: null })).toBe(true);
  });

  it('does not re-load when schema is already present', () => {
    expect(shouldAutoLoadDatabaseSchema({ connectionKey: 'pg-1', schema: { tables: [] } })).toBe(false);
  });

  it('does not load with no connections', () => {
    expect(shouldAutoLoadDatabaseSchema({ connectionKey: undefined, schema: undefined })).toBe(false);
    expect(shouldAutoLoadDatabaseSchema({ connectionKey: '', schema: undefined })).toBe(false);
  });
});
