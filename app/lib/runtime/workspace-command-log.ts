import type { CommandEvent } from '@vibecore/runtime-contract';

const ANSI_ESCAPE_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const WORKSPACE_LOG_NOISE_PATTERNS = [/malloc.*stack logging.*not enabled/i];

/** Preserve command evidence without serializing unrelated request or environment fields. */
export function workspaceLogLines(event: CommandEvent | string): string[] {
  const rawLine = typeof event === 'string' ? event : event.data || event.error?.message || '';

  const lines = rawLine
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const normalizedLine = line.replace(ANSI_ESCAPE_SEQUENCE, '').trim();

      return normalizedLine.length > 0 && !WORKSPACE_LOG_NOISE_PATTERNS.some((pattern) => pattern.test(normalizedLine));
    });

  if (typeof event === 'string') {
    return lines;
  }

  const metadata: string[] = [event.type];

  if (event.timestamp) {
    metadata.push(event.timestamp.replace(/[\r\n]/g, ' '));
  }

  if (event.type === 'exit') {
    if (typeof event.exitCode === 'number' || event.exitCode === null) {
      metadata.push(`exitCode=${event.exitCode}`);
    }

    // The agent sends signal on the wire even though older contracts omit it.
    if ('signal' in event && typeof event.signal === 'string' && event.signal) {
      metadata.push(`signal=${event.signal.replace(/[\r\n]/g, ' ')}`);
    }
  }

  if (event.type === 'error' && event.error?.code) {
    metadata.push(`code=${event.error.code.replace(/[\r\n]/g, ' ')}`);
  }

  const prefix = `[${metadata.join(' ')}]`;

  if (lines.length === 0 && event.type !== 'stdout' && event.type !== 'stderr') {
    return [prefix];
  }

  return lines.map((line) => `${prefix} ${line}`);
}
