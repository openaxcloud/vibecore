/**
 * @vitest-environment jsdom
 *
 * BUG-UX-PREVIEW-OVERLAY-LAG — `serving` only rides on the /ports POLL; the
 * ports/watch stream never carries it. Every ~5s watch push used to overwrite
 * `previewInfo.serving` with `undefined`, erasing the poll's "this port
 * answers HTTP with a live process" signal right after it arrived — re-arming
 * the boot overlay against a serving app.
 */

import type { RuntimeAdapter, WorkspacePort } from '@vibecore/runtime-contract';
import { describe, expect, it, vi } from 'vitest';
import { PreviewsStore } from './previews';

function makeStore(initialPorts: WorkspacePort[]) {
  let pushPortEvent: ((port: WorkspacePort) => void) | undefined;

  const runtime = {
    hasWorkspaceId: () => true,
    listPorts: vi.fn(async () => initialPorts),
    watchPorts: vi.fn(async (onPort: (port: WorkspacePort) => void) => {
      pushPortEvent = onPort;
      return () => undefined;
    }),
  } as unknown as RuntimeAdapter;

  const store = new PreviewsStore(runtime);

  return { store, pushEvent: (port: WorkspacePort) => pushPortEvent?.(port) };
}

const URL_5173 = 'https://ws-5173.preview.e-code.ai';

describe('PreviewsStore — serving survives watch pushes that do not carry it', () => {
  it('keeps serving=true from the poll when a later watch event omits it', async () => {
    const { store } = makeStore([{ port: 5173, type: 'open', ready: false, serving: true, url: URL_5173 }]);

    await store.refreshPorts();
    expect(store.previews.get()[0]?.serving).toBe(true);

    // Simulate the watch stream re-reporting the same port WITHOUT `serving`.
    const watchStyleEvent: WorkspacePort = { port: 5173, type: 'open', ready: true, url: URL_5173 };

    const { store: store2, pushEvent } = makeStore([
      { port: 5173, type: 'open', ready: false, serving: true, url: URL_5173 },
    ]);
    await store2.refreshPorts();
    pushEvent(watchStyleEvent);

    const preview = store2.previews.get()[0];
    expect(preview?.serving).toBe(true); // was wiped to undefined before the fix
    expect(preview?.ready).toBe(true);

    store.dispose();
    store2.dispose();
  });

  it('an explicit serving=false still applies (a stopped server is not hidden)', async () => {
    const { store, pushEvent } = makeStore([{ port: 5173, type: 'open', ready: true, serving: true, url: URL_5173 }]);

    await store.refreshPorts();
    pushEvent({ port: 5173, type: 'open', ready: false, serving: false, url: URL_5173 });

    expect(store.previews.get()[0]?.serving).toBe(false);
    store.dispose();
  });
});
