import { describe, expect, it } from 'vitest';
import {
  deriveBundledArtifactState,
  firstBundledFailureReason,
  isAgentRunDegraded,
  isAgentRunFailed,
} from './bundled-artifact-state';
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

describe('BUG-AGENT-003 — un échec d_orchestration ne doit pas s_afficher « Terminé »', () => {
  const execution = (over: Record<string, unknown>) => [
    { type: 'progress', label: 'files', status: 'complete', order: 1, message: '' },
    { type: 'agentExecution', runId: 'r1', results: [], ...over },
  ];

  it('vrai quand les cinq voies ont échoué (status failed)', () => {
    expect(isAgentRunFailed(execution({ status: 'failed' }))).toBe(true);
  });

  it('vrai quand le consensus est REJETÉ', () => {
    expect(
      isAgentRunFailed(execution({ status: 'complete', consensus: { outcome: 'REJECTED', agreementScore: 0 } })),
    ).toBe(true);
  });

  it('faux sur un run sain — ne pas crier au loup', () => {
    expect(
      isAgentRunFailed(execution({ status: 'complete', consensus: { outcome: 'ACCEPTED', agreementScore: 1 } })),
    ).toBe(false);
  });

  it('faux sur un run PARTIEL — le dégrader serait mensonger dans l_autre sens', () => {
    expect(isAgentRunFailed(execution({ status: 'partial', consensus: { outcome: 'PARTIAL' } }))).toBe(false);
  });

  it('faux quand il n_y a aucune annotation d_orchestration', () => {
    expect(isAgentRunFailed([{ type: 'progress', label: 'files', status: 'complete' }])).toBe(false);
    expect(isAgentRunFailed(undefined)).toBe(false);
    expect(isAgentRunFailed('pas un tableau')).toBe(false);
  });
});

describe('BUG-UX-AGENT-DONE-FALSE — un run partiel/à faible accord ne peut plus s_afficher « Terminé » tout court', () => {
  const execution = (over: Record<string, unknown>) => [
    { type: 'progress', label: 'files', status: 'complete', order: 1, message: '' },
    { type: 'agentExecution', runId: 'r1', results: [], ...over },
  ];

  it('vrai sur le cas observé en live : Partial · 20% agreement', () => {
    expect(
      isAgentRunDegraded(
        execution({
          status: 'partial',
          consensus: { outcome: 'PARTIAL', agreementScore: 0.2, threshold: 0.66 },
        }),
      ),
    ).toBe(true);
  });

  it('vrai quand un rôle du plan n_est pas complété (le « Plan 0/N » du panneau)', () => {
    expect(
      isAgentRunDegraded(
        execution({
          status: 'complete',
          results: [
            { roleId: 'frontend', status: 'complete', summary: '' },
            { roleId: 'backend', status: 'failed', summary: '' },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('vrai quand l_accord mesuré est sous le seuil, même avec un outcome ACCEPTED', () => {
    expect(
      isAgentRunDegraded(
        execution({
          status: 'complete',
          consensus: { outcome: 'ACCEPTED', agreementScore: 0.4, threshold: 0.66 },
        }),
      ),
    ).toBe(true);
  });

  it('faux sur un run réellement sain — ne pas crier au loup', () => {
    expect(
      isAgentRunDegraded(
        execution({
          status: 'complete',
          results: [{ roleId: 'frontend', status: 'complete', summary: '' }],
          consensus: { outcome: 'ACCEPTED', agreementScore: 1, threshold: 0.66 },
        }),
      ),
    ).toBe(false);
  });

  it('faux sans annotation d_orchestration ou sur une entrée non-tableau', () => {
    expect(isAgentRunDegraded([{ type: 'progress', label: 'files', status: 'complete' }])).toBe(false);
    expect(isAgentRunDegraded(undefined)).toBe(false);
    expect(isAgentRunDegraded('pas un tableau')).toBe(false);
  });
});
