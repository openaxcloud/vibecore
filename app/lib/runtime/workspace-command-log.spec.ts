import type { CommandEvent } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import { workspaceLogLines } from './workspace-command-log';

const timestamp = '2026-10-26T11:41:00.000Z';
describe('workspace command log evidence', () => {
  it('preserves exit code and timestamp', () => {
    expect(workspaceLogLines({ type: 'exit', exitCode: 1, timestamp })).toEqual([`[exit ${timestamp} exitCode=1]`]);
  });
  it('retains a signal without inventing a numerical exit code', () => {
    const event = { type: 'exit' as const, timestamp, signal: 'SIGKILL' };
    Object.assign(event, { exitCode: null });
    expect(workspaceLogLines(event)).toEqual([`[exit ${timestamp} exitCode=null signal=SIGKILL]`]);
  });
  it('keeps transport errors distinct from child exits without leaking extra payloads', () => {
    const event = {
      type: 'error' as const,
      timestamp,
      error: { code: 'COMMAND_TIMEOUT', message: 'Timed out', secret: 'DO_NOT_LOG' },
      env: { SECRET: 'DO_NOT_LOG' },
    };
    expect(workspaceLogLines(event)).toEqual([`[error ${timestamp} code=COMMAND_TIMEOUT] Timed out`]);
  });
  it('distinguishes streams while preserving multiline content and indentation', () => {
    for (const type of ['stdout', 'stderr'] as const) {
      expect(workspaceLogLines({ type, timestamp, data: 'npm run dev\n  at file.ts:2\n' })).toEqual([
        `[${type} ${timestamp}] npm run dev`,
        `[${type} ${timestamp}]   at file.ts:2`,
      ]);
    }
  });
  it('preserves plain messages and filters existing noise and blank output', () => {
    expect(workspaceLogLines('  legacy message\n')).toEqual(['  legacy message']);
    expect(
      workspaceLogLines({ type: 'stdout', timestamp, data: '\n\u001b[0m \nmalloc stack logging not enabled\n' }),
    ).toEqual([]);
  });
  it('retains non-output wire events from an extended adapter contract', () => {
    for (const type of ['start', 'port']) {
      const event = { type, timestamp } as unknown as CommandEvent;
      expect(workspaceLogLines(event)).toEqual([`[${type} ${timestamp}]`]);
    }
  });
  it('does not invent timestamps, signals or successful exit codes when absent', () => {
    expect(workspaceLogLines({ type: 'exit', timestamp: '' })).toEqual(['[exit]']);
  });
});
