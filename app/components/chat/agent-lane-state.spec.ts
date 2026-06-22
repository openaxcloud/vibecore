import { describe, expect, it } from 'vitest';
import { resolveLaneState } from './agent-lane-state';

describe('resolveLaneState', () => {
  it('uses the authoritative agentExecution result when present', () => {
    expect(
      resolveLaneState({ resultStatus: 'complete', streamStatus: 'running', hasExecution: true, isStreaming: false }),
    ).toBe('complete');
  });

  it('treats a missing result as failed once execution finished', () => {
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: 'running', hasExecution: true, isStreaming: false }),
    ).toBe('failed');
  });

  it('keeps a running lane spinning while a chat is still streaming', () => {
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: 'running', hasExecution: false, isStreaming: true }),
    ).toBe('running');
  });

  it('defaults to running when no stream status yet and still streaming', () => {
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: undefined, hasExecution: false, isStreaming: true }),
    ).toBe('running');
  });

  /*
   * Core bug: a stopped/aborted parallel run leaves lanes at 'running' with no
   * agentExecution annotation. On every later render of the persisted message
   * (isStreaming === false) the lane must NOT spin forever — it reconciles to a
   * terminal 'failed' state.
   */
  it('reconciles a stranded running lane to failed when nothing is streaming', () => {
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: 'running', hasExecution: false, isStreaming: false }),
    ).toBe('failed');
  });

  it('reconciles a never-started lane (no stream status) to failed when not streaming', () => {
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: undefined, hasExecution: false, isStreaming: false }),
    ).toBe('failed');
  });

  it('preserves a terminal stream status even when not streaming', () => {
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: 'complete', hasExecution: false, isStreaming: false }),
    ).toBe('complete');
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: 'partial', hasExecution: false, isStreaming: false }),
    ).toBe('partial');
    expect(
      resolveLaneState({ resultStatus: undefined, streamStatus: 'failed', hasExecution: false, isStreaming: false }),
    ).toBe('failed');
  });
});
