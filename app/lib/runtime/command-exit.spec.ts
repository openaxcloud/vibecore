import type { CommandEvent } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import { foldCommandExitCode } from './command-exit';

const ev = (e: Partial<CommandEvent> & { type: CommandEvent['type'] }): CommandEvent =>
  ({ timestamp: '2026-01-01T00:00:00Z', ...e }) as CommandEvent;

describe('foldCommandExitCode', () => {
  it('uses the exit code from a clean exit event', () => {
    expect(foldCommandExitCode(0, ev({ type: 'exit', exitCode: 0 }))).toBe(0);
    expect(foldCommandExitCode(0, ev({ type: 'exit', exitCode: 2 }))).toBe(2);
  });

  it('treats an error event (interrupted stream) as a non-zero exit', () => {
    // The core fix: an interrupted npm install must NOT read as success.
    expect(foldCommandExitCode(0, ev({ type: 'error' }))).toBe(1);
  });

  it('keeps an existing non-zero code when an error follows', () => {
    expect(foldCommandExitCode(127, ev({ type: 'error' }))).toBe(127);
  });

  it('leaves the code unchanged for stdout/stderr output', () => {
    expect(foldCommandExitCode(0, ev({ type: 'stdout', data: 'installing…' }))).toBe(0);
    expect(foldCommandExitCode(3, ev({ type: 'stderr', data: 'warn' }))).toBe(3);
  });

  it('a stream that ends with an error and never exits yields a failure code (folded)', () => {
    const events: CommandEvent[] = [ev({ type: 'stdout', data: 'npm install' }), ev({ type: 'error' })];
    const exit = events.reduce(foldCommandExitCode, 0);
    expect(exit).toBe(1);
  });
});
