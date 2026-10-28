/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileBreadcrumb } from './FileBreadcrumb';
import { useKeybindings } from '~/lib/hooks/useKeybindings';

const runGlobalAction = vi.fn();

vi.mock('./FileTree', () => ({
  default: ({ onFileSelect }: { onFileSelect: (path: string) => void }) => (
    <button onClick={() => onFileSelect('/home/project/src/other.ts')}>other.ts</button>
  ),
}));

beforeEach(() => {
  runGlobalAction.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  const onFileSelect = vi.fn();

  function Harness() {
    useKeybindings({
      bindings: [{ combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' }],
      getContext: () => ({}),
      runAction: runGlobalAction,
    });
    return (
      <FileBreadcrumb
        files={{}}
        pathSegments={['', 'home', 'project', 'src', 'index.ts']}
        onFileSelect={onFileSelect}
      />
    );
  }
  render(<Harness />);

  return onFileSelect;
}

describe('editor breadcrumb keyboard access', () => {
  it('exposes path segments as native, focusable buttons', () => {
    mount();

    const trigger = screen.getByRole('button', { name: 'src' });
    trigger.focus();
    expect(trigger.tagName).toBe('BUTTON');
    expect(document.activeElement).toBe(trigger);
  });

  it('opens from ArrowDown and restores the trigger on Escape', async () => {
    mount();

    const trigger = screen.getByText('src');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(runGlobalAction).not.toHaveBeenCalled();
  });

  it('selects a file from a keyboard-opened breadcrumb and closes it', async () => {
    const onFileSelect = mount();
    fireEvent.keyDown(screen.getByText('src'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('button', { name: 'other.ts' }));
    expect(onFileSelect).toHaveBeenCalledWith('/home/project/src/other.ts');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
