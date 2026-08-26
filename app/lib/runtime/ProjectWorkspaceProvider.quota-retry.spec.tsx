/** @vitest-environment jsdom */

import { cleanup, render, waitFor } from '@testing-library/react';
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  function writable<T>(initial: T) {
    let value = initial;

    const subscribers = new Set<(next: T) => void>();

    return {
      get: () => value,
      set(next: T) {
        value = next;

        for (const subscriber of subscribers) {
          subscriber(next);
        }
      },
      subscribe(subscriber: (next: T) => void) {
        subscribers.add(subscriber);
        subscriber(value);

        return () => subscribers.delete(subscriber);
      },
    };
  }

  const quotaWarning = writable<string | undefined>(undefined);
  const billingUpgradePrompt = writable<string | undefined>(undefined);
  const workspaceLoading = writable(false);
  const workspaceRetryRequest = writable(0);

  return {
    quotaWarning,
    billingUpgradePrompt,
    workspaceLoading,
    workspaceRetryRequest,
    workspaceError: writable<string | undefined>(undefined),
    workspaceLogs: writable<unknown[]>([]),
    workspaceStatus: writable<unknown>(undefined),
    currentView: writable('code'),
    previews: writable<unknown[]>([]),
    configureRuntime: vi.fn(),
    configureProject: vi.fn(),
    setSelectedFile: vi.fn(),
    loadProjectStorageFiles: vi.fn(async () => true),
    refreshRuntimePorts: vi.fn(async () => undefined),
    loadRuntimeFiles: vi.fn(async () => undefined),
    startPreviewServer: vi.fn(async () => undefined),
    stopPreviewServer: vi.fn(async () => undefined),
    appendWorkspaceLog: vi.fn(),
    requestWorkspaceRetry() {
      workspaceRetryRequest.set(workspaceRetryRequest.get() + 1);
    },
  };
});

vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: harness }));

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  RuntimeAdapterProvider: ({ children }: { children: ReactNode }) => children,
  createRuntimeAdapter: vi.fn(),
  getRuntimeMode: () => 'local',
}));

vi.mock('~/lib/runtime/serving-ports', () => ({
  fetchAnyPortServing: vi.fn(async () => true),
}));

vi.mock('~/lib/runtime/workspace-reattach', () => ({
  hasAdoptablePreviewPort: () => true,
  reseedWorkspacePreservingOnFailure: vi.fn(),
  shouldReattachWarmWorkspace: () => true,
}));

vi.mock('~/lib/runtime/workspace-seed-marker', () => ({
  readSeedMarker: () => ({ revision: 'revision-1' }),
  writeSeedMarker: vi.fn(),
}));

vi.mock('~/lib/runtime/workspace-quota', () => ({
  workspaceQuotaPrompt: (error: unknown) =>
    error instanceof Error && error.message === 'quota exceeded'
      ? { warning: 'Workspace quota reached.', upgrade: 'Stop a workspace or upgrade.' }
      : undefined,
}));

import { ProjectWorkspaceProvider } from './ProjectWorkspaceProvider';

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

describe('ProjectWorkspaceProvider — actionable quota retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.quotaWarning.set(undefined);
    harness.billingUpgradePrompt.set(undefined);
    harness.workspaceLoading.set(false);
    harness.workspaceRetryRequest.set(0);
    harness.workspaceError.set(undefined);
    harness.workspaceLogs.set([]);
  });

  afterEach(cleanup);

  it('keeps the quota notice available while retrying and clears it only after startup succeeds', async () => {
    const retryStart = deferred<{ id: string; reused: boolean }>();

    const runtime = {
      boot: vi.fn(async () => undefined),
      startWorkspace: vi
        .fn()
        .mockRejectedValueOnce(new Error('quota exceeded'))
        .mockImplementationOnce(() => retryStart.promise),
    } as unknown as RuntimeAdapter;

    render(
      <ProjectWorkspaceProvider projectId="project-quota" adapter={runtime}>
        <div>IDE</div>
      </ProjectWorkspaceProvider>,
    );

    await waitFor(() => expect(harness.quotaWarning.get()).toBe('Workspace quota reached.'));
    expect(runtime.startWorkspace).toHaveBeenCalledTimes(1);

    harness.requestWorkspaceRetry();

    await waitFor(() => expect(runtime.startWorkspace).toHaveBeenCalledTimes(2));
    expect(harness.workspaceLoading.get()).toBe(true);
    expect(harness.quotaWarning.get()).toBe('Workspace quota reached.');
    expect(harness.billingUpgradePrompt.get()).toBe('Stop a workspace or upgrade.');

    retryStart.resolve({ id: 'workspace-1', reused: true });

    await waitFor(() => expect(harness.workspaceLoading.get()).toBe(false));
    expect(harness.quotaWarning.get()).toBeUndefined();
    expect(harness.billingUpgradePrompt.get()).toBeUndefined();
  });
});
