/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useKeybindings } from './useKeybindings';

afterEach(cleanup);

it.each(['terminal-menu', 'file-breadcrumb'])('defers Escape only while the %s owner is open', (owner) => {
  const runAction = vi.fn();
  const localEscape = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    useKeybindings({
      bindings: [
        { combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' },
        { combo: 'cmd+s', action: 'file.save', label: '', description: '', category: 'File' },
      ],
      getContext: () => ({}),
      runAction,
    });

    return (
      <div
        data-ide-escape-owner={open ? owner : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            localEscape(event.defaultPrevented);
            setOpen(false);
          }
        }}
      >
        <button>Menu control</button>
      </div>
    );
  }

  render(<Harness />);

  const control = screen.getByRole('button', { name: 'Menu control' });
  fireEvent.keyDown(control, { key: 's', ctrlKey: true });
  expect(runAction.mock.calls[0][0]).toBe('file.save');
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(localEscape).toHaveBeenCalledWith(false);
  expect(runAction).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(runAction.mock.calls[1][0]).toBe('overlay.close');
});

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

it('lets the composer menu own Escape while preserving nested dialogs and global shortcuts', () => {
  const runAction = vi.fn();
  const menuEscape = vi.fn();
  const dialogEscape = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(true);
    const opener = useRef<HTMLButtonElement>(null);
    useKeybindings({
      bindings: [
        {
          combo: 'escape',
          action: 'overlay.close',
          label: '',
          description: '',
          category: 'Help',
        },
        {
          combo: 'cmd+s',
          action: 'file.save',
          label: '',
          description: '',
          category: 'File',
        },
      ],
      getContext: () => ({}),
      runAction,
    });

    return (
      <>
        <button ref={opener}>Tools opener</button>
        <div role="menu">
          <button>Other menu action</button>
        </div>
        {open && (
          <div
            role="menu"
            data-testid="composer-tools-menu"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') {
                return;
              }

              menuEscape(event.defaultPrevented);
              setOpen(false);
              opener.current?.focus();
            }}
          >
            <button>Composer action</button>
            {dialogOpen && (
              <div
                role="dialog"
                data-state="open"
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') {
                    return;
                  }

                  dialogEscape(event.defaultPrevented);
                  event.stopPropagation();
                  setDialogOpen(false);
                }}
              >
                <button>Nested dialog action</button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }
  render(<Harness />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Nested dialog action' }), { key: 'Escape' });
  expect(dialogEscape).toHaveBeenCalledWith(false);
  expect(menuEscape).not.toHaveBeenCalled();
  expect(runAction).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByTestId('composer-tools-menu')).toBeTruthy();

  const action = screen.getByRole('button', { name: 'Composer action' });
  action.focus();
  fireEvent.keyDown(action, { key: 's', ctrlKey: true });
  expect(runAction).toHaveBeenCalledTimes(1);
  expect(runAction.mock.calls[0][0]).toBe('file.save');
  expect(menuEscape).not.toHaveBeenCalled();
  fireEvent.keyDown(action, { key: 'Escape' });
  expect(menuEscape).toHaveBeenCalledWith(false);
  expect(runAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('composer-tools-menu')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tools opener' }));

  fireEvent.keyDown(screen.getByRole('button', { name: 'Tools opener' }), {
    key: 'Escape',
  });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Other menu action' }), {
    key: 'Escape',
  });
  expect(runAction.mock.calls.map(([action]) => action)).toEqual(['file.save', 'overlay.close', 'overlay.close']);
});
