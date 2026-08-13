/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSaveConflictDialog } from './FileSaveConflictDialog';
import { fileSaveConflictStore, openFileSaveConflict } from '~/lib/stores/file-save-conflict';

const resolveWithLocal = vi.fn(async () => undefined);
const resolveWithRemote = vi.fn(async () => undefined);

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    resolveFileConflictWithLocal: (...args: unknown[]) => resolveWithLocal(...(args as [])),
    resolveFileConflictWithRemote: (...args: unknown[]) => resolveWithRemote(...(args as [])),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const CONFLICT = {
  filePath: '/home/project/README.md',
  remoteContent: 'line one\nwritten by the agent\n',
  localContent: 'line one\nmy unsaved edit\nplus a new line\n',
  baselineContent: 'line one\n',
  detectedAt: 0,
};

describe('FileSaveConflictDialog', () => {
  beforeEach(() => {
    fileSaveConflictStore.set(null);
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders nothing until a conflict is pending', () => {
    const { container } = render(<FileSaveConflictDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('offers the three ways out instead of a dead-end toast', async () => {
    render(<FileSaveConflictDialog />);
    openFileSaveConflict(CONFLICT);

    // Named by the file so the user knows WHICH file is contested.
    expect(await screen.findByText('README.md')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'View diff' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload from disk' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep my version' })).toBeTruthy();

    // And an explicit way to walk away WITHOUT losing the buffer.
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
  });

  it('shows the real diff between the version on disk and the unsaved edit', async () => {
    render(<FileSaveConflictDialog />);
    openFileSaveConflict(CONFLICT);

    (await screen.findByRole('button', { name: 'View diff' })).click();

    const diff = await screen.findByLabelText(/Diff between the version on disk and your edit/);
    expect(diff.textContent).toContain('my unsaved edit');
    expect(diff.textContent).toContain('written by the agent');
  });

  it('"Keep my version" writes the buffer over the remote version', async () => {
    render(<FileSaveConflictDialog />);
    openFileSaveConflict(CONFLICT);

    (await screen.findByRole('button', { name: 'Keep my version' })).click();

    await waitFor(() => expect(resolveWithLocal).toHaveBeenCalledWith(CONFLICT.filePath));
    expect(resolveWithRemote).not.toHaveBeenCalled();
  });

  it('"Reload from disk" adopts the on-disk version', async () => {
    render(<FileSaveConflictDialog />);
    openFileSaveConflict(CONFLICT);

    (await screen.findByRole('button', { name: 'Reload from disk' })).click();

    await waitFor(() => expect(resolveWithRemote).toHaveBeenCalledWith(CONFLICT.filePath, CONFLICT.remoteContent));
    expect(resolveWithLocal).not.toHaveBeenCalled();
  });

  it('"Keep editing" closes without resolving, so the edit stays in the buffer', async () => {
    render(<FileSaveConflictDialog />);
    openFileSaveConflict(CONFLICT);

    (await screen.findByRole('button', { name: 'Keep editing' })).click();

    await waitFor(() => expect(fileSaveConflictStore.get()).toBeNull());

    // Critically: neither resolution ran, so nothing was written and nothing discarded.
    expect(resolveWithLocal).not.toHaveBeenCalled();
    expect(resolveWithRemote).not.toHaveBeenCalled();
  });

  it('states the consequence of each destructive choice', async () => {
    render(<FileSaveConflictDialog />);
    openFileSaveConflict(CONFLICT);

    const warning = await screen.findByText(/discards your unsaved edit/);
    expect(warning.textContent).toContain('overwrites the file on disk');
  });
});
