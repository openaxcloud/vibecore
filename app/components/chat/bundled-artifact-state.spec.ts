import { describe, expect, it } from 'vitest';
import { deriveBundledArtifactState, firstBundledFailureReason } from './bundled-artifact-state';
import type { ActionState } from '~/lib/runtime/action-runner';

function baseAction(overrides: Partial<ActionState> & Pick<ActionState, 'type' | 'status'>): ActionState {
  return {
    abort: () => undefined,
    abortSignal: new AbortController().signal,
    executed: false,
    content: '',
    ...overrides,
  } as ActionState;
}

describe('deriveBundledArtifactState', () => {
  it('reports running while a file write is still pending', () => {
    const actions = [baseAction({ type: 'file', status: 'complete' }), baseAction({ type: 'file', status: 'pending' })];

    expect(deriveBundledArtifactState(actions)).toBe('running');
  });

  it('reports complete when every action is complete', () => {
    const actions = [
      baseAction({ type: 'file', status: 'complete' }),
      baseAction({ type: 'shell', status: 'complete' }),
    ];

    expect(deriveBundledArtifactState(actions)).toBe('complete');
  });

  it('treats a still-running start action as finished (does not block completion)', () => {
    const actions = [
      baseAction({ type: 'file', status: 'complete' }),
      baseAction({ type: 'start', status: 'running' }),
    ];

    expect(deriveBundledArtifactState(actions)).toBe('complete');
  });

  /*
   * Core regression: a failed action used to keep the completion predicate truthy
   * forever, leaving the bundled card spinning on "Creating Project…" with no
   * failure indication.
   */
  it('reports failed when any action failed', () => {
    const actions = [
      baseAction({ type: 'file', status: 'complete' }),
      baseAction({ type: 'shell', status: 'failed', error: 'npm install exited 1' }),
    ];

    expect(deriveBundledArtifactState(actions)).toBe('failed');
  });

  it('reports failed when an action was aborted (Ctrl+C between actions)', () => {
    const actions = [
      baseAction({ type: 'file', status: 'complete' }),
      baseAction({ type: 'shell', status: 'aborted' }),
    ];

    expect(deriveBundledArtifactState(actions)).toBe('failed');
  });

  it('does not get stuck running when a failed action is also still-pending siblings', () => {
    const actions = [
      baseAction({ type: 'file', status: 'failed', error: 'write denied' }),
      baseAction({ type: 'file', status: 'pending' }),
    ];

    expect(deriveBundledArtifactState(actions)).toBe('failed');
  });
});

describe('firstBundledFailureReason', () => {
  it('returns the first failed action error string', () => {
    const actions = [
      baseAction({ type: 'file', status: 'complete' }),
      baseAction({ type: 'shell', status: 'failed', error: 'EACCES: permission denied' }),
      baseAction({ type: 'shell', status: 'failed', error: 'second error' }),
    ];

    expect(firstBundledFailureReason(actions)).toBe('EACCES: permission denied');
  });

  it('falls back to a generic message for an aborted action with no error field', () => {
    const actions = [baseAction({ type: 'shell', status: 'aborted' })];

    expect(firstBundledFailureReason(actions)).toBe('Setup was stopped before it finished.');
  });

  it('returns undefined when there is no failure', () => {
    const actions = [baseAction({ type: 'file', status: 'complete' })];

    expect(firstBundledFailureReason(actions)).toBeUndefined();
  });
});
