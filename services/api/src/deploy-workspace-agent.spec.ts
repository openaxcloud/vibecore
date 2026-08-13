import { describe, expect, it } from 'vitest';

import { createWorkspaceBuildAgent, flattenAgentTree, streamAgentCommand, type WsLike } from './deploy-workspace-agent.js';

/** A scripted fake WebSocket that replays a sequence of agent frames on open. */
function fakeSocket(frames: Array<Record<string, unknown>>, opts: { closeWithoutExit?: boolean } = {}): (url: string) => WsLike {
  return (_url: string) => {
    const listeners: Record<string, Array<(e: any) => void>> = {};
    const on = (t: string, fn: (e: any) => void) => {
      (listeners[t] ??= []).push(fn);
    };
    const fire = (t: string, e?: any) => (listeners[t] ?? []).forEach((fn) => fn(e));

    const socket: WsLike = {
      send: () => {
        // once the client sends `hello`, replay the scripted frames
        queueMicrotask(() => {
          for (const frame of frames) {
            fire('message', { data: JSON.stringify(frame) });
          }

          if (opts.closeWithoutExit) {
            fire('close');
          }
        });
      },
      close: () => {},
      addEventListener: on,
    };

    // open on next tick so the client attaches listeners first
    queueMicrotask(() => fire('open'));

    return socket;
  };
}

describe('flattenAgentTree', () => {
  it('flattens nested dirs to files with sizes and skips directories', () => {
    const files = flattenAgentTree([
      { path: 'dist/index.html', type: 'file', size: 10 },
      {
        path: 'dist/assets',
        type: 'directory',
        children: [{ path: 'dist/assets/app.js', type: 'file', size: 20 }],
      },
    ]);

    expect(files).toEqual([
      { path: 'dist/index.html', size: 10 },
      { path: 'dist/assets/app.js', size: 20 },
    ]);
  });

  it('tolerates undefined/empty', () => {
    expect(flattenAgentTree(undefined)).toEqual([]);
  });
});

describe('streamAgentCommand', () => {
  it('collects stdout/stderr lines and resolves on exit', async () => {
    const lines: Array<[string, string]> = [];
    const result = await streamAgentCommand(
      'ws://agent/commands/stream',
      'tok',
      {
        command: 'npm',
        args: ['run', 'build'],
        cwd: '.',
        onLine: (level, line) => lines.push([level, line]),
      },
      5000,
      fakeSocket([
        { type: 'stdout', data: 'building...\n' },
        { type: 'stderr', data: 'warn: x\n' },
        { type: 'exit', exitCode: 0 },
      ]),
    );

    expect(result).toEqual({ exitCode: 0, timedOut: false });
    expect(lines).toEqual([
      ['info', 'building...'],
      ['error', 'warn: x'],
    ]);
  });

  it('reports a dropped connection before exit as an error', async () => {
    const result = await streamAgentCommand(
      'ws://agent/commands/stream',
      'tok',
      { command: 'npm', args: [], cwd: '.', onLine: () => {} },
      5000,
      fakeSocket([{ type: 'stdout', data: 'partial' }], { closeWithoutExit: true }),
    );

    expect(result.exitCode).toBeNull();
    expect(result.error).toMatch(/closed before/);
  });

  it('passes the token as a query param', async () => {
    let seenUrl = '';
    await streamAgentCommand(
      'ws://agent/commands/stream',
      'secret-tok',
      { command: 'npm', args: [], cwd: '.', onLine: () => {} },
      5000,
      (url: string) => {
        seenUrl = url;
        return fakeSocket([{ type: 'exit', exitCode: 0 }])(url);
      },
    );

    expect(seenUrl).toBe('ws://agent/commands/stream?token=secret-tok');
  });
});

describe('createWorkspaceBuildAgent', () => {
  it('lists files via /files/tree and reads via /files/read', async () => {
    const calls: string[] = [];
    const agent = createWorkspaceBuildAgent({
      agentWsBaseUrl: 'ws://agent',
      token: 'tok',
      deadlineMs: 5000,
      wsFactory: fakeSocket([{ type: 'exit', exitCode: 0 }]),
      agentGet: async <T>(path: string): Promise<T> => {
        calls.push(path);

        if (path.startsWith('/files/tree')) {
          return [{ path: 'dist/index.html', type: 'file', size: 5 }] as unknown as T;
        }

        return { content: 'aGk=', encoding: 'base64' } as unknown as T;
      },
    });

    const listed = await agent.listFiles('dist');
    expect(listed.files).toEqual([{ path: 'dist/index.html', size: 5 }]);

    const read = await agent.readFile('dist/index.html');
    expect(read).toEqual({ content: 'aGk=', encoding: 'base64' });
    expect(calls).toEqual(['/files/tree?path=dist', '/files/read?path=dist%2Findex.html']);
  });
});
