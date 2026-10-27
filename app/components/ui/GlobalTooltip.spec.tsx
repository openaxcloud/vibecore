// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalTooltip } from './GlobalTooltip';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
