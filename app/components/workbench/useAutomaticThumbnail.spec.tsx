/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAutomaticThumbnail } from './useAutomaticThumbnail';

const input = { projectId: 'one', baseUrl: 'https://preview.test', ready: true, frameRendered: true };
const response = (status: string, reason?: string) => new Response(JSON.stringify({ status, reason, enabled: true }));

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits for the actual matching frame, not only workspace readiness', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response('stored'));
  vi.stubGlobal('fetch', fetchMock);

  const { rerender } = renderHook((props) => useAutomaticThumbnail(props), {
    initialProps: { ...input, frameRendered: false },
  });
  await flush();
  expect(fetchMock).not.toHaveBeenCalled();
  rerender(input);
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retries a failed capture after cooldown and stops only on a storage receipt', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response('failed', 'capture-error'))
    .mockResolvedValueOnce(response('stored'));
  vi.stubGlobal('fetch', fetchMock);

  const { result } = renderHook(() => useAutomaticThumbnail(input));
  await flush();
  expect(result.current.status).toBe('failed');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4_999);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('stored');
});

it('scopes the request to both project and URL', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => response('stored'));
  vi.stubGlobal('fetch', fetchMock);

  const { rerender } = renderHook((props) => useAutomaticThumbnail(props), { initialProps: input });
  await flush();
  rerender({ ...input, projectId: 'two' });
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('bounds attempts including readiness toggles and reports pending as unknown', async () => {
  const unconfirmed = vi.fn();
  const failure = vi.fn();
  const fetchMock = vi.fn().mockImplementation(async () => response('pending', 'in-flight'));
  vi.stubGlobal('fetch', fetchMock);

  const { result, rerender } = renderHook(
    (props) => useAutomaticThumbnail({ ...props, onFailure: failure, onUnconfirmed: unconfirmed }),
    { initialProps: input },
  );
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(result.current.status).toBe('unknown');
  expect(unconfirmed).toHaveBeenCalledTimes(1);
  expect(failure).not.toHaveBeenCalled();
  rerender({ ...input, ready: false });
  rerender(input);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(unconfirmed).toHaveBeenCalledTimes(1);
});

it('aborts timed out fetches and never announces a late response as stored', async () => {
  let resolve!: (value: Response) => void;

  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const { result, unmount } = renderHook(() => useAutomaticThumbnail(input));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    resolve(response('stored'));
  });
  expect(result.current.status).not.toBe('stored');
  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('aborts on identity change and ignores an old response', async () => {
  let finishOld!: (value: Response) => void;

  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          finishOld = done;
        }),
    )
    .mockResolvedValueOnce(response('skipped', 'disabled'));
  vi.stubGlobal('fetch', fetchMock);

  const { result, rerender } = renderHook((props) => useAutomaticThumbnail(props), { initialProps: input });
  rerender({ ...input, projectId: 'two' });
  await flush();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    finishOld(response('stored'));
  });
  expect(result.current.status).toBe('skipped');
});

it.each(['disabled', 'recent-success'])('does not turn skipped %s into a new stored receipt', async (reason) => {
  const fetchMock = vi.fn().mockResolvedValue(response('skipped', reason));
  vi.stubGlobal('fetch', fetchMock);

  const { result } = renderHook(() => useAutomaticThumbnail(input));
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('skipped');
});

it('retries an HTTP 503 without treating it as a storage receipt', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(response('stored')),
  );

  const { result } = renderHook(() => useAutomaticThumbnail(input));
  await flush();
  expect(result.current.status).toBe('unknown');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(result.current.status).toBe('stored');
});

it('reports a known failure only once after the final attempt', async () => {
  const failed = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => response('failed', 'capture-error')),
  );

  const { result } = renderHook(() => useAutomaticThumbnail({ ...input, onFailure: failed }));
  await flush();
  expect(failed).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(failed).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('failed');
});

it('does not bypass the cooldown when readiness changes', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => response('skipped', 'failure-cooldown'));
  vi.stubGlobal('fetch', fetchMock);

  const { rerender } = renderHook((props) => useAutomaticThumbnail(props), { initialProps: input });
  await flush();
  rerender({ ...input, ready: false });
  rerender(input);
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('cleans up unmounted requests and suppresses late notices', async () => {
  let resolve!: (value: Response) => void;

  const failure = vi.fn();
  const unknown = vi.fn();

  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const { unmount } = renderHook(() => useAutomaticThumbnail({ ...input, onFailure: failure, onUnconfirmed: unknown }));
  unmount();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    resolve(response('failed'));
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(failure).not.toHaveBeenCalled();
  expect(unknown).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not claim legacy scheduled responses as persisted thumbnails', async () => {
  const unknown = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, scheduled: true }))),
  );

  const { result } = renderHook(() => useAutomaticThumbnail({ ...input, onUnconfirmed: unknown }));
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(result.current.status).toBe('unknown');
  expect(unknown).toHaveBeenCalledTimes(1);
});

it('does not retry an access denial', async () => {
  const failed = vi.fn();
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal('fetch', fetchMock);
  renderHook(() => useAutomaticThumbnail({ ...input, onFailure: failed }));
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledTimes(1);
});

it('does not silently reset a budget consumed by readiness interruptions', async () => {
  const unknown = vi.fn();

  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise(() => {
        /* Transport ignores abort and never settles. */
      }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const { result, rerender } = renderHook((props) => useAutomaticThumbnail({ ...props, onUnconfirmed: unknown }), {
    initialProps: input,
  });

  for (let index = 0; index < 3; index += 1) {
    rerender({ ...input, ready: false });
    rerender(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(result.current.status).toBe('unknown');
  expect(unknown).toHaveBeenCalledTimes(1);
});

it('keeps A → B → A captures and late receipts scoped to their original project and URL', async () => {
  const replies: Array<(value: Response) => void> = [];
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => replies.push(resolve)));
  const failure = vi.fn();
  const unknown = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const a = { ...input, baseUrl: 'https://preview-a.test' };
  const b = { ...input, projectId: 'two', baseUrl: 'https://preview-b.test' };

  const { result, rerender, unmount } = renderHook(
    (props) => useAutomaticThumbnail({ ...props, onFailure: failure, onUnconfirmed: unknown }),
    { initialProps: a },
  );
  rerender(b);
  rerender(a);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/projects/one/thumbnail/refresh',
    '/api/projects/two/thumbnail/refresh',
  ]);
  expect(fetchMock.mock.calls.map(([, options]) => options.body.get('url'))).toEqual([a.baseUrl, b.baseUrl]);
  expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  await act(async () => {
    replies[1](response('failed'));
    replies[0](response('stored'));
  });
  expect(result.current.status).toBe('unknown');
  expect(failure).not.toHaveBeenCalled();
  expect(unknown).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][0]).toBe('/api/projects/one/thumbnail/refresh');
  expect(fetchMock.mock.calls[2][1].body.get('url')).toBe(a.baseUrl);
  await act(async () => replies[2](response('stored')));
  expect(result.current.status).toBe('stored');
  unmount();
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
