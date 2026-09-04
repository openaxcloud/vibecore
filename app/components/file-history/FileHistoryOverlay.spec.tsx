/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const panelBehavior = vi.hoisted(() => ({ shouldCrash: false }));

vi.mock('~/lib/stores/logs', () => ({
  logStore: { logError: vi.fn() },
}));

vi.mock('./FileHistoryPanel', () => ({
  FileHistoryPanel: ({ showCloseButton, onClose }: { showCloseButton?: boolean; onClose: () => void }) => {
    if (panelBehavior.shouldCrash) {
      throw new Error('Panel render failed.');
    }

    return (
      <section data-testid="stub-history-panel">
        <button type="button">First history action</button>
        <button type="button">Last history action</button>
        {showCloseButton ? (
          <button type="button" onClick={onClose}>
            Panel close
          </button>
        ) : null}
      </section>
    );
  },
}));

// Imported after mocks so the modal mechanics can be tested independently of API state.
import { FileHistoryOverlay } from './FileHistoryOverlay';

beforeEach(() => {
  panelBehavior.shouldCrash = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('<FileHistoryOverlay /> accessibility', () => {
  it('isolates the background, traps focus, closes with Escape, and restores exact focus and ARIA state', async () => {
    renderOverlay();

    const trigger = screen.getByRole('button', { name: 'Open file history' });
    const editorBackground = screen.getByTestId('editor-background');
    const workspaceBackground = screen.getByTestId('workspace-background');

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'File History' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(editorBackground.getAttribute('aria-hidden')).toBe('true');
    expect(editorBackground.inert).toBe(true);
    expect(workspaceBackground.getAttribute('aria-hidden')).toBe('true');
    expect(workspaceBackground.inert).toBe(true);

    const close = within(dialog).getByRole('button', { name: 'Close file history' });
    const first = within(dialog).getByRole('button', { name: 'First history action' });
    const last = within(dialog).getByRole('button', { name: 'Last history action' });

    await waitFor(() => expect(document.activeElement).toBe(close));
    workspaceBackground.focus();
    expect(document.activeElement).toBe(close);
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    first.focus();
    fireEvent.keyDown(first, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'File History' })).toBeNull());

    const restoredTrigger = screen.getByRole('button', { name: 'Open file history' });
    await waitFor(() => expect(document.activeElement).toBe(restoredTrigger));
    expect(editorBackground.hasAttribute('aria-hidden')).toBe(false);
    expect(Boolean(editorBackground.inert)).toBe(false);
    expect(workspaceBackground.getAttribute('aria-hidden')).toBe('false');
    expect(Boolean(workspaceBackground.inert)).toBe(false);
  });

  it('keeps an accessible close action outside the panel boundary when the panel crashes', async () => {
    panelBehavior.shouldCrash = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'Open file history' }));

    const dialog = await screen.findByRole('dialog', { name: 'File History' });
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close file history' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'File History' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Open file history' })).toBeTruthy();
  });
});

function renderOverlay() {
  return render(
    <div>
      <button type="button" data-testid="workspace-background" aria-hidden="false">
        Workspace action
      </button>
      <div>
        <button type="button" data-testid="editor-background">
          Editor action
        </button>
        <FileHistoryOverlay
          projectId="project-1"
          workspaceId="workspace-1"
          filePath="/home/project/src/App.tsx"
          onRestoredContent={vi.fn()}
        />
      </div>
    </div>,
  );
}
