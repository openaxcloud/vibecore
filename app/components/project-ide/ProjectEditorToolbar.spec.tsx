/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectEditorToolbar } from './ProjectEditorToolbar';

const handlers = () => ({
  onToggleMinimap: vi.fn(),
  onFormat: vi.fn(),
  onGoToDefinition: vi.fn(),
  onFindReferences: vi.fn(),
  onRenameSymbol: vi.fn(),
  onRefactor: vi.fn(),
  onSave: vi.fn(),
});

describe('<ProjectEditorToolbar />', () => {
  afterEach(() => {
    cleanup();
  });

  it('groups editor actions with visible dividers and a primary save action', () => {
    const props = handlers();

    const { container } = render(
      <ProjectEditorToolbar fileLabel="/src/App.tsx" hasDocument minimapEnabled={false} {...props} />,
    );

    expect(screen.getByText('/src/App.tsx').classList.contains('bolt-project-editor-toolbar-file')).toBe(true);
    expect(container.querySelectorAll('.bolt-project-editor-toolbar-divider')).toHaveLength(3);
    expect(container.querySelector('[data-toolbar-group="view"]')).not.toBeNull();
    expect(container.querySelector('[data-toolbar-group="navigation"]')).not.toBeNull();
    expect(container.querySelector('[data-toolbar-group="editing"]')).not.toBeNull();
    expect(container.querySelector('[data-toolbar-group="save"]')).not.toBeNull();

    const navigation = container.querySelector('[data-toolbar-group="navigation"]');
    expect(navigation).not.toBeNull();
    expect(
      within(navigation as HTMLElement)
        .getByRole('button', { name: 'Definition' })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(
      within(navigation as HTMLElement)
        .getByRole('button', { name: 'References' })
        .hasAttribute('disabled'),
    ).toBe(false);

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.classList.contains('bolt-project-editor-save-button')).toBe(true);
    fireEvent.click(save);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps toolbar actions disabled when no document is selected', () => {
    render(<ProjectEditorToolbar fileLabel="No file selected" hasDocument={false} minimapEnabled {...handlers()} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
  });
});
