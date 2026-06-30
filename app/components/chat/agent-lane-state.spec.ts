import { describe, expect, it } from 'vitest';
import { extractLaneStreamSummary, resolveLaneState } from './agent-lane-state';

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

describe('extractLaneStreamSummary', () => {
  it('returns undefined for empty / whitespace input', () => {
    expect(extractLaneStreamSummary(undefined)).toBeUndefined();
    expect(extractLaneStreamSummary('')).toBeUndefined();
    expect(extractLaneStreamSummary('   ')).toBeUndefined();
  });

  it('parses a complete JSON object and returns its summary', () => {
    expect(extractLaneStreamSummary('{"summary":"Designed the data model","files":["a.ts"]}')).toBe(
      'Designed the data model',
    );
  });

  it('extracts the in-progress summary from partial JSON mid-stream', () => {
    // The gateway streams the structured result token-by-token.
    expect(extractLaneStreamSummary('{"summary":"Designed the system arch')).toBe('Designed the system arch');
  });

  it('unescapes escaped quotes and newlines inside a partial summary', () => {
    expect(extractLaneStreamSummary('{"summary":"Wired the \\"submit\\" button\\nand the form')).toBe(
      'Wired the "submit" button\nand the form',
    );
  });

  it('suppresses raw JSON before any summary content has arrived', () => {
    // Without this the lane tile would flash `{`, `{"`, `{"sum…` as raw text.
    expect(extractLaneStreamSummary('{')).toBeUndefined();
    expect(extractLaneStreamSummary('{"sum')).toBeUndefined();
    expect(extractLaneStreamSummary('{"files":[')).toBeUndefined();
  });

  it('passes through plain prose that is not JSON at all', () => {
    expect(extractLaneStreamSummary('Building the responsive layout')).toBe('Building the responsive layout');
  });

  it('falls back to text/message fields when summary is absent', () => {
    expect(extractLaneStreamSummary('{"message":"Ran the tests","ok":true}')).toBe('Ran the tests');
  });
});
