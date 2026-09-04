/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileHistoryClient } from '~/lib/file-history/client';
import type { FileHistoryVersion } from '~/lib/file-history/types';

vi.mock('@vibecore/editor', () => ({
  EditorAdapter: ({ value }: { value: string }) => <pre data-testid="history-editor-value">{value}</pre>,
}));

vi.mock('~/lib/stores/theme', () => ({
  themeStore: atom('dark'),
}));

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <div data-testid="restore-confirmation">
        <h2>{title}</h2>
        <div>{description}</div>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

// Imported after mocks so the read-only editor and confirmation surface stay deterministic in jsdom.
// eslint-disable-next-line import/order
import { FileHistoryPanel } from './FileHistoryPanel';

const completeContinuity = { complete: true, reasons: [], droppedEvents: 0 } as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<FileHistoryPanel />', () => {
  it('navigates with buttons, slider, and arrow keys, then compares the selected revision inline', async () => {
    const { client } = createClient();

    renderPanel(client);

    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 3;\n'));
    expect(screen.getByText('Version 3 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 2;\n'));

    fireEvent.change(screen.getByRole('slider', { name: 'File history version' }), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 1;\n'));

    fireEvent.keyDown(screen.getByTestId('file-history-panel'), { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 2;\n'));

    fireEvent.change(screen.getByRole('slider', { name: 'File history version' }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Compare selected version with latest' }));

    await waitFor(() => expect(screen.getByTestId('file-history-inline-diff')).toBeTruthy());
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.getByText('−1')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Selected version compared with latest' })).toBeTruthy();
  });

  it('falls back to the newest returned revision when a raced latest id is stale', async () => {
    const { client, versions } = createClient();
    vi.mocked(client.listVersions).mockResolvedValueOnce({
      versions: [...versions].reverse(),
      latestVersionId: 'version-2',
      total: 4,
      continuity: completeContinuity,
    });

    renderPanel(client);

    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());
    expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 3;\n');
    expect((screen.getByRole('slider', { name: 'File history version' }) as HTMLInputElement).value).toBe('2');
    expect(
      (screen.getByRole('switch', { name: 'Compare selected version with latest' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('restores non-destructively, adopts the returned content once, and keeps old revisions navigable', async () => {
    const { client, restoreVersion } = createClient();
    const onRestored = vi.fn();

    renderPanel(client, onRestored);
    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());

    fireEvent.change(screen.getByRole('slider', { name: 'File history version' }), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 1;\n'));

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByTestId('restore-confirmation').textContent).toMatch(/appends a new version/i);
    expect(screen.getByTestId('restore-confirmation').textContent).toMatch(/never deletes or rewrites/i);

    fireEvent.click(screen.getByRole('button', { name: 'Restore as new version' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ content: 'const value = 1;\n' }));
    expect(restoreVersion).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', workspaceId: 'workspace-1' }),
      'version-1',
      expect.objectContaining({
        workspaceId: 'workspace-1',
        expectedLatestVersionId: 'version-3',
        operationId: expect.any(String),
      }),
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(screen.getByText('Version 4 of 4')).toBeTruthy());
    expect(screen.getByText(/Every earlier version remains in the timeline/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 3;\n'));
  });

  it('plays revisions in chronological order and pauses immediately when the document becomes hidden', async () => {
    const { client } = createClient();

    renderPanel(client);
    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Restart playback from first version' }));
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 1;\n'));
    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play file history' }));

    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy(), { timeout: 2_500 });
    expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 3;\n');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play file history' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Restart playback from first version' }));
    await waitFor(() => expect(screen.getByText('Version 1 of 3')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Play file history' }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));

    expect(screen.getByRole('button', { name: 'Play file history' })).toBeTruthy();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('loads every older page before playback starts so the film begins at the true first revision', async () => {
    const { client, versions } = createClient();
    const listVersions = vi.mocked(client.listVersions);
    listVersions
      .mockReset()
      .mockResolvedValueOnce({
        versions: [...versions].reverse(),
        latestVersionId: 'version-3',
        nextCursor: 'oldest-page',
        total: 4,
        continuity: completeContinuity,
      })
      .mockResolvedValueOnce({
        versions: [makeVersion('version-0', '2026-07-15T09:59:00.000Z')],
        latestVersionId: 'version-3',
        total: 4,
        continuity: completeContinuity,
      });

    renderPanel(client);
    await screen.findByText('Version 3 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Play file history' }));

    await waitFor(() => expect(listVersions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Version 1 of 4')).toBeTruthy());
    expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 1;\n');
    expect(screen.getByRole('button', { name: 'Pause file history playback' })).toBeTruthy();
  });

  it('warns explicitly when watcher continuity proves that intermediate history may be missing', async () => {
    const { client, versions } = createClient();
    vi.mocked(client.listVersions).mockResolvedValueOnce({
      versions: [...versions].reverse(),
      latestVersionId: 'version-3',
      total: 3,
      continuity: {
        complete: false,
        reasons: ['watcher_restart', 'journal_truncated'],
        droppedEvents: 7,
        reconciledAt: '2026-07-15T10:03:00.000Z',
      },
    });

    renderPanel(client);

    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toMatch(/timeline may be incomplete/i);
    expect(warning.textContent).toMatch(/intermediate edits.*may be missing/i);
  });

  it('keeps the compact Older versions action accessible and loads the next page', async () => {
    const { client } = createClient();
    const listVersions = vi.mocked(client.listVersions);
    listVersions
      .mockResolvedValueOnce({
        versions: [
          makeVersion('version-3', '2026-07-15T10:02:00.000Z'),
          makeVersion('version-2', '2026-07-15T10:01:00.000Z'),
          makeVersion('version-1', '2026-07-15T10:00:00.000Z'),
        ],
        latestVersionId: 'version-3',
        nextCursor: 'older-cursor',
        total: 4,
        continuity: completeContinuity,
      })
      .mockResolvedValueOnce({
        versions: [makeVersion('version-0', '2026-07-15T09:59:00.000Z')],
        latestVersionId: 'version-2',
        total: 4,
        continuity: completeContinuity,
      });

    renderPanel(client);

    const older = await screen.findByRole('button', { name: 'Load older file versions' });
    expect(older.textContent).toMatch(/Older versions/);
    fireEvent.click(older);

    await waitFor(() => expect(listVersions).toHaveBeenCalledTimes(2));
    expect(listVersions).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'older-cursor', limit: 100 }),
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(screen.getByText('Version 4 of 4')).toBeTruthy());
    expect(
      (screen.getByRole('switch', { name: 'Compare selected version with latest' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps loaded revisions visible when older-version pagination fails and retries only that page', async () => {
    const { client, versions } = createClient();
    const listVersions = vi.mocked(client.listVersions);

    listVersions
      .mockReset()
      .mockResolvedValueOnce({
        versions: [...versions].reverse(),
        latestVersionId: 'version-3',
        nextCursor: 'older-page',
        total: 4,
        continuity: completeContinuity,
      })
      .mockRejectedValueOnce(new Error('The archive is temporarily unavailable.'))
      .mockResolvedValueOnce({
        versions: [makeVersion('version-0', '2026-07-15T09:59:00.000Z')],
        latestVersionId: 'version-3',
        total: 4,
        continuity: completeContinuity,
      });

    renderPanel(client);
    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Load older file versions' }));

    const paginationAlert = await screen.findByRole('alert');
    expect(paginationAlert.textContent).toMatch(/older versions could not be loaded/i);
    expect(paginationAlert.textContent).toMatch(/archive is temporarily unavailable/i);
    expect(screen.getByText('Version 3 of 3')).toBeTruthy();
    expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 3;\n');

    fireEvent.click(within(paginationAlert).getByRole('button', { name: 'Retry older versions' }));

    await waitFor(() => expect(screen.getByText('Version 4 of 4')).toBeTruthy());
    expect(screen.queryByText(/older versions could not be loaded/i)).toBeNull();
    expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 3;\n');
    expect(listVersions).toHaveBeenCalledTimes(3);
  });

  it('keeps Restore disabled until the selected UTF-8 detail is ready and retry succeeds', async () => {
    const { client, versions, contents } = createClient();

    let rejectFirstDetail: (reason: Error) => void = () => undefined;

    const firstDetail = new Promise<never>((_resolve, reject) => {
      rejectFirstDetail = reject;
    });

    let olderAttempts = 0;

    client.getVersion = vi.fn(async (_target, versionId) => {
      const version = versions.find((candidate) => candidate.id === versionId) ?? versions[0];

      if (versionId === 'version-1' && olderAttempts++ === 0) {
        return firstDetail;
      }

      return { version, content: contents[versionId] ?? '' };
    });

    renderPanel(client);
    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());

    fireEvent.change(screen.getByRole('slider', { name: 'File history version' }), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByText('Loading selected version')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Restore' }).getAttribute('title')).toMatch(/finish loading/i);

    rejectFirstDetail(new Error('Revision detail unavailable.'));
    await waitFor(() => expect(screen.getByText('This version could not be opened')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Restore' }).getAttribute('title')).toMatch(/retry opening/i);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('history-editor-value').textContent).toBe('const value = 1;\n'));
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the confirmation open after a restore error and safely retries the same operation', async () => {
    const { client, restoreVersion } = createClient();
    const onRestored = vi.fn();

    restoreVersion.mockRejectedValueOnce(new Error('Restore service offline.'));
    renderPanel(client, onRestored);
    await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());

    fireEvent.change(screen.getByRole('slider', { name: 'File history version' }), { target: { value: '0' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore as new version' }));

    const confirmation = await screen.findByTestId('restore-confirmation');
    await waitFor(() =>
      expect(within(confirmation).getByRole('alert').textContent).toMatch(/restore service offline/i),
    );
    expect(within(confirmation).getByRole('button', { name: 'Retry restore' })).toBeTruthy();

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Retry restore' }));

    await waitFor(() => expect(screen.queryByTestId('restore-confirmation')).toBeNull());
    expect(onRestored).toHaveBeenCalledOnce();
    expect(restoreVersion).toHaveBeenCalledTimes(2);
    expect(restoreVersion.mock.calls[0]?.[2].operationId).toBe(restoreVersion.mock.calls[1]?.[2].operationId);
  });

  it.each([['an errored detail', 'error'] as const, ['a binary detail', 'binary'] as const])(
    'stops playback and returns the control to Play when it reaches %s',
    async (_label, failureMode) => {
      const { client, versions, contents } = createClient();

      client.getVersion = vi.fn(async (_target, versionId) => {
        const version = versions.find((candidate) => candidate.id === versionId) ?? versions[0];

        if (versionId === 'version-2') {
          if (failureMode === 'error') {
            throw new Error('Revision playback unavailable.');
          }

          return { version: { ...version, encoding: 'base64' }, content: 'AAEC' };
        }

        return { version, content: contents[versionId] ?? '' };
      });

      renderPanel(client);
      await waitFor(() => expect(screen.getByText('Version 3 of 3')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Restart playback from first version' }));
      await waitFor(() => expect(screen.getByText('Version 1 of 3')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: '2×' }));
      fireEvent.click(screen.getByRole('button', { name: 'Play file history' }));

      await waitFor(() => expect(screen.getByText('Version 2 of 3')).toBeTruthy(), { timeout: 1_500 });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Play file history' })).toBeTruthy());

      if (failureMode === 'error') {
        expect(screen.getByText('This version could not be opened')).toBeTruthy();
      } else {
        expect(screen.getByText('Binary revision')).toBeTruthy();
      }
    },
  );
});

function renderPanel(client: FileHistoryClient, onRestored = vi.fn()) {
  return render(
    <FileHistoryPanel
      projectId="project-1"
      workspaceId="workspace-1"
      filePath="/home/project/src/App.tsx"
      client={client}
      onClose={vi.fn()}
      onRestored={onRestored}
    />,
  );
}

function createClient() {
  const versions = [
    makeVersion('version-1', '2026-07-15T10:00:00.000Z'),
    makeVersion('version-2', '2026-07-15T10:01:00.000Z'),
    makeVersion('version-3', '2026-07-15T10:02:00.000Z'),
  ];
  const contents: Record<string, string> = {
    'version-1': 'const value = 1;\n',
    'version-2': 'const value = 2;\n',
    'version-3': 'const value = 3;\n',
  };
  const restoreVersion = vi.fn<FileHistoryClient['restoreVersion']>(async (_target, versionId) => ({
    restored: true,
    version: {
      ...makeVersion('version-4', '2026-07-15T10:03:00.000Z'),
      operation: 'restore',
      restoredFromVersionId: versionId,
    },
  }));
  const client: FileHistoryClient = {
    listVersions: vi.fn(async () => ({
      versions: [...versions].reverse(),
      latestVersionId: 'version-3',
      total: 3,
      continuity: completeContinuity,
    })),
    getVersion: vi.fn(async (_target, versionId) => ({
      version:
        versions.find((candidate) => candidate.id === versionId) ?? makeVersion(versionId, new Date().toISOString()),
      content: contents[versionId] ?? contents['version-1'],
    })),
    restoreVersion,
  };

  return { client, restoreVersion, versions, contents };
}

function makeVersion(id: string, createdAt: string): FileHistoryVersion {
  return {
    id,
    workspaceId: 'workspace-1',
    path: 'src/App.tsx',
    sequence: String((Number(id.split('-').at(-1)) || 0) + 1),
    operation: 'write',
    source: 'editor',
    encoding: 'utf8',
    sizeBytes: 16,
    contentHash: `hash-${id}`,
    tombstone: false,
    createdAt,
  };
}
