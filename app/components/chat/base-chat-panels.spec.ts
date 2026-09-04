import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeAutoApplyFailure,
  describeSnapshotRestoreFailure,
  isPanelAuthError,
  isProjectPanelRequestTimeout,
  panelAuthRedirectTarget,
  ProjectPanelRequestGate,
  shouldAutoLoadDatabaseSchema,
  shouldSuppressAutoApplyFailureToast,
  type AutoApplyProposalSnapshot,
  waitForProjectPanelRetry,
} from './base-chat-panels';

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectPanelRequestGate', () => {
  it('aborts an in-flight request when Retry starts a replacement and keeps the replacement current', () => {
    const gate = new ProjectPanelRequestGate();
    const first = gate.begin(15_000);
    const second = gate.begin(15_000);

    expect(first.signal.aborted).toBe(true);
    expect(first.signal.reason).toMatchObject({ name: 'AbortError' });
    expect(second.signal.aborted).toBe(false);
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.complete(first)).toBe(false);
    expect(gate.active).toBe(true);
    expect(gate.complete(second)).toBe(true);
    expect(gate.active).toBe(false);
  });

  it('times out the active request and identifies the timeout reason', async () => {
    vi.useFakeTimers();

    const gate = new ProjectPanelRequestGate();
    const request = gate.begin(15_000);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(request.signal.aborted).toBe(true);
    expect(isProjectPanelRequestTimeout(request.signal)).toBe(true);
  });

  it('cancels retry backoff immediately when the request is replaced', async () => {
    vi.useFakeTimers();

    const gate = new ProjectPanelRequestGate();
    const request = gate.begin(15_000);
    const waiting = waitForProjectPanelRetry(5_000, request.signal);

    gate.begin(15_000);

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });
});

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

describe('shouldSuppressAutoApplyFailureToast', () => {
  const filePath = 'src/components/TodoInput.tsx';

  function proposal(overrides: Partial<AutoApplyProposalSnapshot>): AutoApplyProposalSnapshot {
    return {
      id: 'artifact:action-1',
      relativePath: filePath,
      status: 'failed',
      updatedAt: '2026-07-09T00:00:00.000Z',
      proposedContent: 'export function TodoInput() { return <in',
      ...overrides,
    };
  }

  const attempted = {
    proposalId: 'artifact:action-1',
    filePath,
    attemptedUpdatedAt: '2026-07-09T00:00:00.000Z',
    attemptedContentLength: 'export function TodoInput() { return <in'.length,
  };

  it('toasts the FINAL failed attempt (same version, nothing else pending)', () => {
    expect(
      shouldSuppressAutoApplyFailureToast({
        ...attempted,
        proposals: [proposal({})],
      }),
    ).toBe(false);
  });

  it('suppresses when a newer version of the same proposal is now present (longer content)', () => {
    expect(
      shouldSuppressAutoApplyFailureToast({
        ...attempted,
        proposals: [
          proposal({
            proposedContent: 'export function TodoInput() { return <input placeholder="Add" />; }\n',
            status: 'pending',
          }),
        ],
      }),
    ).toBe(true);
  });

  it('suppresses when the same proposal now carries a newer updatedAt', () => {
    expect(
      shouldSuppressAutoApplyFailureToast({
        ...attempted,
        proposals: [proposal({ updatedAt: '2026-07-09T00:00:05.000Z' })],
      }),
    ).toBe(true);
  });

  it('suppresses when a DIFFERENT proposal for the same file is still streaming', () => {
    expect(
      shouldSuppressAutoApplyFailureToast({
        ...attempted,
        proposals: [proposal({}), proposal({ id: 'artifact:action-2', status: 'pending' })],
      }),
    ).toBe(true);
  });

  it('does not suppress because of a pending proposal for a DIFFERENT file', () => {
    expect(
      shouldSuppressAutoApplyFailureToast({
        ...attempted,
        proposals: [proposal({}), proposal({ id: 'artifact:other', relativePath: 'src/App.tsx', status: 'pending' })],
      }),
    ).toBe(false);
  });

  it('does not suppress when the superseding same-file proposal has already failed too', () => {
    expect(
      shouldSuppressAutoApplyFailureToast({
        ...attempted,
        proposals: [proposal({}), proposal({ id: 'artifact:action-2', status: 'failed' })],
      }),
    ).toBe(false);
  });
});
