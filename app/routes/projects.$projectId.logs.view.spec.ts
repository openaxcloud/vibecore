import { describe, expect, it } from 'vitest';
import {
  buildLogsViewModel,
  formatRuntimeLogLine,
  shouldPollLogs,
  type LogsLoaderData,
} from './projects.$projectId.logs.view';

const withWorkspace = (overrides: Partial<LogsLoaderData> = {}): LogsLoaderData => ({
  workspace: { id: 'ws_1', status: 'RUNNING', runtimeMode: 'remote-kubernetes' },
  runtimeLogs: { logs: [] },
  ...overrides,
});

describe('buildLogsViewModel', () => {
  it('reports no-workspace when none has started', () => {
    expect(buildLogsViewModel({ workspace: null, runtimeLogs: null })).toEqual({ kind: 'no-workspace' });
  });

  it('surfaces a backend error from the snapshot instead of swallowing it', () => {
    const view = buildLogsViewModel(withWorkspace({ runtimeLogs: { logs: [], error: 'runtime unavailable' } }));
    expect(view).toEqual({ kind: 'error' });
  });

  it('uses the non-sensitive unavailable marker for loader failures', () => {
    expect(buildLogsViewModel(withWorkspace({ runtimeLogs: { logs: [], unavailable: true } }))).toEqual({
      kind: 'error',
    });
  });

  it('reports an empty state when the workspace exists but has no output yet', () => {
    /* Regression: the old route printed a static workspace status line and never an empty state. */
    expect(buildLogsViewModel(withWorkspace({ runtimeLogs: { logs: [] } }))).toEqual({ kind: 'empty' });
    expect(buildLogsViewModel(withWorkspace({ runtimeLogs: null }))).toEqual({ kind: 'empty' });
  });

  it('returns real runtime log entries when present', () => {
    const view = buildLogsViewModel(
      withWorkspace({
        runtimeLogs: {
          logs: [
            { level: 'info', message: 'server started', source: 'workflow' },
            { level: 'error', message: 'boom', source: 'console' },
          ],
        },
      }),
    );

    expect(view.kind).toBe('logs');
    expect(view.kind === 'logs' && view.entries).toHaveLength(2);
  });

  it('drops malformed entries that lack a string message', () => {
    const view = buildLogsViewModel(
      withWorkspace({
        runtimeLogs: {
          logs: [
            { level: 'info', message: 'ok' },

            /* malformed entry simulating a bad backend frame */
            { level: 'info' } as never,
          ],
        },
      }),
    );

    expect(view.kind === 'logs' && view.entries).toHaveLength(1);
  });
});

describe('shouldPollLogs', () => {
  it('polls while a workspace is live', () => {
    expect(shouldPollLogs('RUNNING')).toBe(true);
    expect(shouldPollLogs('starting')).toBe(true);
    expect(shouldPollLogs('PENDING')).toBe(true);
  });

  it('stops polling for terminal or missing statuses', () => {
    expect(shouldPollLogs('STOPPED')).toBe(false);
    expect(shouldPollLogs('FAILED')).toBe(false);
    expect(shouldPollLogs(null)).toBe(false);
    expect(shouldPollLogs(undefined)).toBe(false);
  });
});

describe('formatRuntimeLogLine', () => {
  it('includes timestamp and source when present', () => {
    expect(
      formatRuntimeLogLine({ level: 'info', message: 'hello', source: 'console', timestamp: '2026-01-01T00:00:00Z' }),
    ).toBe('2026-01-01T00:00:00Z [console] hello');
  });

  it('formats a bare message without decorations', () => {
    expect(formatRuntimeLogLine({ level: 'info', message: 'hello' })).toBe('hello');
  });
});
