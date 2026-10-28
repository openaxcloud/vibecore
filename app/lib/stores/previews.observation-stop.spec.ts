/** @vitest-environment jsdom */
import type { RuntimeAdapter, WorkspacePort } from '@vibecore/runtime-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewsStore } from './previews';

const port: WorkspacePort = {
  port: 5173,
  type: 'open',
  ready: true,
  serving: true,
  url: 'https://ws-5173.preview.e-code.ai',
};

const stores: PreviewsStore[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function fixture() {
  const events: Array<(port: WorkspacePort) => void> = [];
  const stop = vi.fn();

  const runtime = {
    hasWorkspaceId: () => true,
    listPorts: vi.fn(async (): Promise<WorkspacePort[]> => [port]),
    watchPorts: vi.fn(async (event: (port: WorkspacePort) => void): Promise<() => void> => {
      events.push(event);
      return stop;
    }),
  };

  return { runtime, events, stop };
}

function create(runtime: ReturnType<typeof fixture>['runtime']) {
  const store = new PreviewsStore(runtime as unknown as RuntimeAdapter);
  stores.push(store);

  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.dispose();
  }
  vi.useRealTimers();
});

describe('PreviewsStore observation suspension (no runtime process mutation)', () => {
  it('closes the watch, clears previews and blocks polls and late pushes until resumed', async () => {
    const { runtime, events, stop } = fixture();
    const store = create(runtime);
    await store.refreshPorts();
    expect(store.previews.get()).toHaveLength(1);
    store.setObservationEnabled(false);
    expect(stop).toHaveBeenCalledOnce();
    expect(store.previews.get()).toEqual([]);
    events[0](port);
    await store.refreshPorts();
    expect(runtime.listPorts).toHaveBeenCalledOnce();
    expect(store.previews.get()).toEqual([]);
    store.setObservationEnabled(true);
    await Promise.resolve();
    events[0](port);
    expect(store.previews.get()).toEqual([]);
    events[1](port);
    expect(store.previews.get()).toHaveLength(1);
    expect(runtime.watchPorts).toHaveBeenCalledTimes(2);
  });

  it('closes a watch that finishes connecting after Stop without accepting its events', async () => {
    const { runtime, stop } = fixture();
    const connecting = deferred<() => void>();
    runtime.watchPorts.mockReturnValueOnce(connecting.promise);

    const store = create(runtime);
    const push = runtime.watchPorts.mock.calls[0][0];
    store.setObservationEnabled(false);
    push(port);
    connecting.resolve(stop);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
    expect(store.previews.get()).toEqual([]);
  });

  it('ignores a poll resolved after Stop, even if Run already resumed observations', async () => {
    const { runtime } = fixture();
    const reading = deferred<WorkspacePort[]>();
    runtime.listPorts.mockReturnValueOnce(reading.promise);

    const store = create(runtime);
    const poll = store.refreshPorts();
    store.setObservationEnabled(false);
    store.setObservationEnabled(true);
    reading.resolve([port]);
    await poll;
    expect(store.previews.get()).toEqual([]);
    await store.refreshPorts();
    expect(store.previews.get()).toHaveLength(1);
  });

  it('cancels reconnect backoff and keeps a new runtime paused until explicit resume', async () => {
    vi.useFakeTimers();

    const first = fixture();
    first.runtime.watchPorts.mockRejectedValueOnce(new Error('fixture offline'));

    const store = create(first.runtime);
    await Promise.resolve();
    store.setObservationEnabled(false);

    const second = fixture();
    store.setRuntime(second.runtime as unknown as RuntimeAdapter);
    await vi.advanceTimersByTimeAsync(35_000);
    await store.refreshPorts();
    expect(first.runtime.watchPorts).toHaveBeenCalledOnce();
    expect(second.runtime.watchPorts).not.toHaveBeenCalled();
    expect(second.runtime.listPorts).not.toHaveBeenCalled();
    store.setObservationEnabled(true);
    await Promise.resolve();
    expect(second.runtime.watchPorts).toHaveBeenCalledOnce();
    await store.refreshPorts();
    expect(store.previews.get()).toHaveLength(1);
  });

  it('invalidates old-runtime polls and queued refreshes when paused', async () => {
    vi.useFakeTimers();

    const first = fixture();
    const store = create(first.runtime);
    await store.refreshPorts();
    store.refreshPreview('ws-5173');

    const reading = deferred<WorkspacePort[]>();
    first.runtime.listPorts.mockReturnValueOnce(reading.promise);

    const poll = store.refreshPorts();
    store.setObservationEnabled(false);
    store.setRuntime(fixture().runtime as unknown as RuntimeAdapter);
    store.setObservationEnabled(true);
    reading.resolve([port]);
    await poll;
    await vi.advanceTimersByTimeAsync(500);
    expect(store.previews.get()).toEqual([]);
  });
});
