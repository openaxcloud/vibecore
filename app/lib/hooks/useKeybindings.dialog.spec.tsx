/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useKeybindings } from './useKeybindings';

afterEach(cleanup);

it('leaves dialog Escape to its owner without suppressing other shortcuts or IDE Escape', () => {
  const runAction = vi.fn();
  const dialogEscape = vi.fn();

  function Harness() {
    useKeybindings({
      bindings: [
        { combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' },
        { combo: 'cmd+s', action: 'file.save', label: '', description: '', category: 'File' },
      ],
      getContext: () => ({}),
      runAction,
    });
    return (
      <>
        <button>Editor</button>
        <div role="dialog">
          <button>Keyboard shortcuts</button>
        </div>
        <div role="dialog" data-state="open" onKeyDown={dialogEscape}>
          <button>Dialog action</button>
        </div>
      </>
    );
  }
  render(<Harness />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Dialog action' }), { key: 'Escape' });
  expect(dialogEscape).toHaveBeenCalledOnce();
  expect(dialogEscape.mock.calls[0][0].defaultPrevented).toBe(false);
  expect(runAction).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Dialog action' }), { key: 's', ctrlKey: true });
  expect(runAction.mock.calls[0][0]).toBe('file.save');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Editor' }), { key: 'Escape' });
  expect(runAction.mock.calls[1][0]).toBe('overlay.close');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keyboard shortcuts' }), { key: 'Escape' });
  expect(runAction.mock.calls[2][0]).toBe('overlay.close');
});
