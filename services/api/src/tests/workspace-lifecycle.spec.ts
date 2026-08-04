import { describe, expect, it } from 'vitest';
import {
  assertWorkspaceLifecycleTransition,
  lifecycleStateFromStatus,
  LifecycleError,
} from '../lifecycle-state-machines.js';

describe('assertWorkspaceLifecycleTransition (Blocker #6 — no impossible edges)', () => {
  it('accepts the nominal path PENDING->STARTING->RUNNING->STOPPING->STOPPED', () => {
    const path = ['PENDING', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED'] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(() => assertWorkspaceLifecycleTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('allows FAILED from any live state (a crash can happen anywhere)', () => {
    for (const from of ['PENDING', 'STARTING', 'RUNNING', 'STOPPING'] as const) {
      expect(() => assertWorkspaceLifecycleTransition(from, 'FAILED')).not.toThrow();
    }
  });

  it('allows a stop mid-startup: STARTING -> STOPPED (no intermediate STOPPING here)', () => {
    expect(() => assertWorkspaceLifecycleTransition('STARTING', 'STOPPED')).not.toThrow();
  });

  it('allows reopen: STOPPED/FAILED -> STARTING', () => {
    expect(() => assertWorkspaceLifecycleTransition('STOPPED', 'STARTING')).not.toThrow();
    expect(() => assertWorkspaceLifecycleTransition('FAILED', 'STARTING')).not.toThrow();
  });

  it('rejects impossible edges (STOPPED->RUNNING without a restart)', () => {
    expect(() => assertWorkspaceLifecycleTransition('STOPPED', 'RUNNING')).toThrow(LifecycleError);
    expect(() => assertWorkspaceLifecycleTransition('PENDING', 'RUNNING')).toThrow(/Illegal workspace lifecycle/);
  });

  it('treats a same-state re-assertion as a no-op (replica double-observe)', () => {
    expect(() => assertWorkspaceLifecycleTransition('RUNNING', 'RUNNING')).not.toThrow();
  });

  it('maps persisted WorkspaceStatus onto the machine', () => {
    expect(lifecycleStateFromStatus('RUNNING')).toBe('RUNNING');
    expect(lifecycleStateFromStatus('DELETED')).toBe('STOPPED');
    expect(lifecycleStateFromStatus('weird')).toBe('PENDING');
  });
});
