/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileHistoryPanel } from './FileHistoryPanel';
import { fileHistoryStore } from '~/lib/stores/fileHistory';

const restoreFileVersion = vi.fn(() => Promise.resolve(undefined));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    restoreFileVersion: (...args: unknown[]) => restoreFileVersion(...args),
  },
}));

const noop = () => undefined;
const FILE = '/home/project/greeting.ts';

async function seed(projectId: string, contents: string[]) {
  fileHistoryStore.configure(projectId);

  for (const [index, content] of contents.entries()) {
    await fileHistoryStore.capture(FILE, content, index === 0 ? 'initial' : 'save');
  }
}

describe('FileHistoryPanel', () => {
  beforeEach(() => {
    restoreFileVersion.mockClear();
  });

  afterEach(() => {
    cleanup();
    fileHistoryStore.configure(undefined);
  });

  it('renders the newest version with the navigation controls', async () => {
    await seed('p-render', ['a', 'b', 'c']);
    render(<FileHistoryPanel filePath={FILE} currentContent="c" onClose={noop} />);

    expect(await screen.findByText('Version 3 / 3')).toBeTruthy();
    expect(screen.getByTestId('file-history-slider')).toBeTruthy();
    expect(screen.getByTestId('file-history-play')).toBeTruthy();
    expect(screen.getByTestId('file-history-restore')).toBeTruthy();
  });

  it('navigates with the previous arrow and the ←/→ keyboard keys', async () => {
    await seed('p-nav', ['a', 'b', 'c']);
    render(<FileHistoryPanel filePath={FILE} currentContent="c" onClose={noop} />);
    await screen.findByText('Version 3 / 3');

    fireEvent.click(screen.getByLabelText('Previous version'));
    expect(await screen.findByText('Version 2 / 3')).toBeTruthy();

    const panel = screen.getByTestId('file-history-panel');
    fireEvent.keyDown(panel, { key: 'ArrowLeft' });
    expect(await screen.findByText('Version 1 / 3')).toBeTruthy();

    fireEvent.keyDown(panel, { key: 'ArrowRight' });
    expect(await screen.findByText('Version 2 / 3')).toBeTruthy();
  });

  it('navigates with the slider', async () => {
    await seed('p-slider', ['a', 'b', 'c']);
    render(<FileHistoryPanel filePath={FILE} currentContent="c" onClose={noop} />);
    await screen.findByText('Version 3 / 3');

    fireEvent.change(screen.getByTestId('file-history-slider'), { target: { value: '0' } });
    expect(await screen.findByText('Version 1 / 3')).toBeTruthy();
  });

  it('shows a real inline diff when comparing to latest', async () => {
    await seed('p-diff', ['first\nsecond', 'first\nSECOND\nthird']);
    render(<FileHistoryPanel filePath={FILE} currentContent={'first\nSECOND\nthird'} onClose={noop} />);
    await screen.findByText('Version 2 / 2');

    // Select the first version, then compare to the latest.
    fireEvent.click(screen.getByLabelText('Previous version'));
    await screen.findByText('Version 1 / 2');
    fireEvent.click(screen.getByTestId('file-history-compare'));

    expect(await screen.findByTestId('file-history-diff')).toBeTruthy();

    // +N/−M stat is present (real additions/removals).
    expect(screen.getByTestId('file-history-diffstat')).toBeTruthy();
  });

  it('restores an older version through the workbench (append-only)', async () => {
    await seed('p-restore', ['a', 'b', 'c']);
    render(<FileHistoryPanel filePath={FILE} currentContent="c" onClose={noop} />);
    await screen.findByText('Version 3 / 3');

    // Go to version 1 and restore it.
    fireEvent.change(screen.getByTestId('file-history-slider'), { target: { value: '0' } });
    await screen.findByText('Version 1 / 3');
    fireEvent.click(screen.getByTestId('file-history-restore'));

    await waitFor(() => expect(restoreFileVersion).toHaveBeenCalledTimes(1));
    expect(restoreFileVersion).toHaveBeenCalledWith(FILE, 'a', 1);
  });

  it('restore is disabled while the latest version is selected', async () => {
    await seed('p-restore-latest', ['a', 'b']);
    render(<FileHistoryPanel filePath={FILE} currentContent="b" onClose={noop} />);
    await screen.findByText('Version 2 / 2');

    expect((screen.getByTestId('file-history-restore') as HTMLButtonElement).disabled).toBe(true);
  });

  it('toggles playback pressed state', async () => {
    await seed('p-play', ['a', 'b', 'c']);
    render(<FileHistoryPanel filePath={FILE} currentContent="c" onClose={noop} />);
    await screen.findByText('Version 3 / 3');

    const play = screen.getByTestId('file-history-play');
    expect(play.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(play);
    expect(play.getAttribute('aria-pressed')).toBe('true');
  });

  it('closes on Escape even when focus is outside the modal panel', async () => {
    await seed('p-esc', ['a', 'b']);

    const onClose = vi.fn();
    render(
      <>
        <button type="button" data-testid="outside-history-panel">
          Editor focus sentinel
        </button>
        <FileHistoryPanel filePath={FILE} currentContent="b" onClose={onClose} />
      </>,
    );
    await screen.findByText('Version 2 / 2');

    const outside = screen.getByTestId('outside-history-panel');
    outside.focus();
    expect(document.activeElement).toBe(outside);

    fireEvent.keyDown(outside, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the error state with a retry when no project is configured', async () => {
    fileHistoryStore.configure(undefined);
    render(<FileHistoryPanel filePath={FILE} currentContent="x" onClose={noop} />);

    expect(await screen.findByTestId('file-history-error')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
