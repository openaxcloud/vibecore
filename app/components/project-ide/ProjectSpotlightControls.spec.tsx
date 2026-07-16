/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import {
  OPEN_PROJECT_IDE_PANEL_EVENT,
  ProjectSpotlightButton,
  type ProjectIdePanelEventDetail,
} from './ProjectSpotlightButton';

vi.mock('./ProjectActionsMenu.module.scss', () => ({
  default: { trigger: 'trigger', chevron: 'chevron', content: 'content', arrow: 'arrow' },
}));
vi.mock('./ProjectSpotlightButton.module.scss', () => ({ default: { trigger: 'spotlight-trigger' } }));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('project name and actions controls', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('dispatches the real overview panel contract when the project name is clicked', () => {
    const listener = vi.fn<(event: Event) => void>();

    window.addEventListener(OPEN_PROJECT_IDE_PANEL_EVENT, listener);

    render(<ProjectSpotlightButton projectName="Analytics App" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Project Spotlight for Analytics App' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent<ProjectIdePanelEventDetail>).detail).toEqual({
      panel: 'overview',
    });

    window.removeEventListener(OPEN_PROJECT_IDE_PANEL_EVENT, listener);
  });

  it('keeps project actions behind their own keyboard-dismissible chevron', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <ProjectSpotlightButton projectName="Analytics App" />
          <ProjectActionsMenu projectName="Analytics App" open={open} onOpenChange={setOpen}>
            <button type="button">Settings</button>
          </ProjectActionsMenu>
        </>
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Project Spotlight for Analytics App' }));
    expect(screen.queryByTestId('project-actions-menu')).toBeNull();

    const trigger = screen.getByRole('button', { name: 'Project actions for Analytics App' });
    fireEvent.click(trigger);

    expect(await screen.findByTestId('project-actions-menu')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('project-actions-menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
