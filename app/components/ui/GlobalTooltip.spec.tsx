// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalTooltip } from './GlobalTooltip';
import { useKeybindings } from '~/lib/hooks/useKeybindings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-vc-tooltip-renderer');
});

describe('GlobalTooltip ownership', () => {
  it('dismisses visible help on a mouse activation, including focus before click', () => {
    vi.useFakeTimers();
    render(
      <>
        <button title="Tools" data-vc-tooltip="Tools">
          Tools
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Tools' });
    fireEvent.pointerOver(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focusIn(button);
    fireEvent.click(button);
    button.setAttribute('data-vc-tooltip-hidden', 'true');
    button.removeAttribute('data-vc-tooltip');
    button.removeAttribute('title');
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focusIn(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each(['hidden', 'removed'] as const)('does not publish delayed help when its attribute becomes %s', (mode) => {
    vi.useFakeTimers();

    const view = render(
      <>
        <button title="Tools" data-vc-tooltip="Tools">
          Tools
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Tools' });
    fireEvent.pointerOver(button, { pointerType: 'mouse' });

    if (mode === 'hidden') {
      button.setAttribute('data-vc-tooltip-hidden', 'true');
    } else {
      button.removeAttribute('data-vc-tooltip');
    }

    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();

    if (mode === 'hidden') {
      expect(button.hasAttribute('title')).toBe(false);
      view.unmount();
      expect(button.hasAttribute('title')).toBe(false);
    }
  });

  it('restores a temporarily suppressed title when the renderer unmounts', () => {
    const button = document.createElement('button');
    button.setAttribute('title', 'Files');
    button.setAttribute('data-vc-tooltip', 'Files');
    button.setAttribute('data-vc-radix-tooltip', 'true');
    document.body.append(button);

    const view = render(<GlobalTooltip />);
    fireEvent.focusIn(button);
    expect(button.hasAttribute('title')).toBe(false);
    view.unmount();
    expect(button.getAttribute('title')).toBe('Files');
    button.remove();
  });

  it('leaves Radix controls and their accessible labels to their existing tooltip', () => {
    vi.useFakeTimers();
    render(
      <>
        <button aria-label="Files" title="Files" data-vc-tooltip="Files" data-vc-radix-tooltip="true">
          <span>File icon</span>
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Files' });
    fireEvent.pointerOver(screen.getByText('File icon'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focusIn(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Files');
    fireEvent.focusOut(button);
    expect(button.getAttribute('title')).toBe('Files');
  });

  it('still shows ordinary help and restores its native title after leaving', () => {
    vi.useFakeTimers();
    render(
      <>
        <button title="Full file path" data-vc-tooltip="Open full file path">
          File
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'File' });
    fireEvent.pointerOver(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip').textContent).toBe('Open full file path');
    expect(button.hasAttribute('title')).toBe(false);
    fireEvent.pointerOut(button, { relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('title')).toBe('Full file path');
  });
});

describe('GlobalTooltip renderer lifetime', () => {
  const marker = 'data-vc-tooltip-renderer';

  it('owns CSS fallback only while a renderer is mounted', () => {
    expect(document.documentElement.hasAttribute(marker)).toBe(false);

    const view = render(<GlobalTooltip />);
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    view.unmount();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it('retains ownership until the last renderer unmounts', () => {
    const first = render(<GlobalTooltip />);
    const second = render(<GlobalTooltip />);
    first.unmount();
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    second.unmount();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it('restores a preexisting marker across StrictMode effect replay', () => {
    document.documentElement.setAttribute(marker, 'external');

    const view = render(
      <StrictMode>
        <GlobalTooltip />
      </StrictMode>,
    );
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    view.unmount();
    expect(document.documentElement.getAttribute(marker)).toBe('external');
    document.documentElement.removeAttribute(marker);
  });

  it.each(['Escape', 'scroll'] as const)('keeps the CSS fallback suppressed after %s dismisses help', (event) => {
    render(
      <>
        <button data-vc-tooltip="Full key">Key</button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Key' });
    fireEvent.focusIn(button);
    expect(screen.getByRole('tooltip').textContent).toBe('Full key');

    if (event === 'Escape') {
      fireEvent.keyDown(button, { key: 'Escape' });
    } else {
      fireEvent.scroll(window);
    }

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    expect(button.getAttribute('data-vc-tooltip')).toBe('Full key');
  });
});

describe('GlobalTooltip with the IDE keyboard handler', () => {
  it.each([true, false])(
    'dismisses help without blocking the IDE action (keyboard listener first: %s)',
    (keyboardFirst) => {
      const runAction = vi.fn();

      function KeyboardBindings() {
        useKeybindings({
          bindings: [{ combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' }],
          getContext: () => ({}),
          runAction,
        });
        return null;
      }

      render(
        <>
          {keyboardFirst && <KeyboardBindings />}
          <button data-vc-tooltip="Full key">Key</button>
          <GlobalTooltip />
          {!keyboardFirst && <KeyboardBindings />}
        </>,
      );

      const button = screen.getByRole('button', { name: 'Key' });
      fireEvent.focusIn(button);
      expect(screen.getByRole('tooltip').textContent).toBe('Full key');
      fireEvent.keyDown(button, { key: 'Escape' });
      expect(runAction).toHaveBeenCalledOnce();
      expect(runAction.mock.calls[0][0]).toBe('overlay.close');
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(document.documentElement.getAttribute('data-vc-tooltip-renderer')).toBe('true');
    },
  );

  it('leaves Escape to the local menu and preserves the global save shortcut', () => {
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
        <>
          <div
            data-ide-escape-owner={open ? 'composer-tools' : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                localEscape(event.defaultPrevented);
                setOpen(false);
              }
            }}
          >
            <button data-vc-tooltip="Full key">Key</button>
          </div>
          <GlobalTooltip />
        </>
      );
    }

    render(<Harness />);

    const button = screen.getByRole('button', { name: 'Key' });
    fireEvent.focusIn(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(localEscape).toHaveBeenCalledWith(false);
    expect(runAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.keyDown(button, { key: 's', ctrlKey: true });
    expect(runAction.mock.calls[0][0]).toBe('file.save');
  });
});
