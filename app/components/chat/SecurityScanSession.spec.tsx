/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SecurityScanSessionProvider, useSecurityScanSession } from './SecurityScanSession';
import type { SecurityScanSession } from './security-scan-session';

let current!: SecurityScanSession;

const messages = {
  preparing: 'preparing',
  timeout: 'timeout',
  cancelled: 'cancelled locally',
  failed: 'failed',
  completed: 'completed',
  missingProject: 'missing project',
};

function Panel({ projectId, reload }: { projectId: string; reload: () => void }) {
  const { session, snapshot } = useSecurityScanSession(projectId, reload);
  current = session;

  return <output>{snapshot.status}</output>;
}

function tree(panelKey: string, reload: () => void, projectId = 'project-a', scope = 'scope-a', visible = true) {
  return (
    <SecurityScanSessionProvider key={scope} projectId={projectId}>
      {visible ? <Panel key={panelKey} projectId={projectId} reload={reload} /> : null}
    </SecurityScanSessionProvider>
  );
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['completed', 'failed'])(
  'keeps the request over shell replacement and refreshes only its current owner (%s)',
  async (status) => {
    let resolve!: (response: Response) => void;

    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetcher);

    const discardedReload = vi.fn();
    const activeReload = vi.fn();
    const mounted = render(tree('pending', discardedReload));

    let run!: Promise<void>;
    act(() => {
      run = current.run(new FormData(), messages);
    });
    mounted.rerender(tree('ready', activeReload));
    expect(mounted.getByText('running')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(Response.json({ ok: true, scan: { status } }));
      await run;
    });
    expect(mounted.getByText(status)).toBeTruthy();
    expect(discardedReload).not.toHaveBeenCalled();
    expect(activeReload).toHaveBeenCalledTimes(1);
    mounted.rerender(tree('another', activeReload));
    expect(activeReload).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('keeps the running deadline while another panel is visible and cancels on scope exit', async () => {
  let resolve!: (response: Response) => void;

  const fetcher = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetcher);

  const reload = vi.fn();
  const mounted = render(tree('pending', reload));

  let run!: Promise<void>;
  act(() => {
    run = current.run(new FormData(), messages);
  });

  const previous = current;
  mounted.rerender(tree('ready', reload, 'project-a', 'scope-a', false));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  mounted.rerender(tree('ready', reload));
  expect(current).toBe(previous);
  expect(mounted.getByText('running')).toBeTruthy();
  mounted.rerender(tree('new-scope', reload, 'project-a', 'scope-b'));
  expect(mounted.getByText('idle')).toBeTruthy();
  expect(previous.getSnapshot().status).toBe('cancelled');
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => {
    resolve(Response.json({ ok: true, scan: { status: 'completed' } }));
    await run;
  });
  expect(mounted.getByText('idle')).toBeTruthy();
  expect(reload).not.toHaveBeenCalled();
});

it.each(['sync', 'async'])('keeps the scan outcome if its current refresh fails (%s)', async (mode) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok: true, scan: { status: 'completed' } })),
  );

  const error = new Error('synthetic refresh failure');
  const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const reload = vi.fn(() => {
    if (mode === 'sync') {
      throw error;
    }

    return Promise.reject(error);
  });

  try {
    const mounted = render(tree('pending', reload));
    await act(async () => {
      await current.run(new FormData(), messages);
    });
    expect(mounted.getByText('completed')).toBeTruthy();
    expect(current.getSnapshot().message).toBe('completed');
    expect(report).toHaveBeenCalledWith('Security scan results refresh failed', error);
    mounted.rerender(tree('replacement', reload));
    expect(reload).toHaveBeenCalledTimes(1);
  } finally {
    report.mockRestore();
  }
});
