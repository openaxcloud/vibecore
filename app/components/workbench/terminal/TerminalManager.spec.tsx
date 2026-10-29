/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TerminalManager } from './TerminalManager';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function terminalFixture() {
  const input = document.createElement('textarea');
  document.body.append(input);

  const focus = vi.fn(() => input.focus());

  return { terminal: { focus } as unknown as XTerm, input, focus };
}

it('autofocuses an active terminal when the user has not chosen another control', () => {
  const { terminal, input, focus } = terminalFixture();
  render(<TerminalManager terminal={terminal} isActive />);
  act(() => vi.advanceTimersByTime(100));
  expect(focus).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(input);
});

it('does not steal an already-focused menu trigger during terminal activation', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();

  const { terminal, focus } = terminalFixture();
  render(<TerminalManager terminal={terminal} isActive />);
  act(() => vi.advanceTimersByTime(100));
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});

it('does not steal a menu item focused while the delayed autofocus is pending', () => {
  const { terminal, focus } = terminalFixture();

  const { getByRole } = render(
    <>
      <TerminalManager terminal={terminal} isActive />
      <button role="menuitem">Menu action</button>
    </>,
  );
  getByRole('menuitem').focus();
  act(() => vi.advanceTimersByTime(100));
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(getByRole('menuitem'));
});

it('does not reclaim focus when the control chosen during the delay has since closed', () => {
  const { terminal, focus } = terminalFixture();
  render(<TerminalManager terminal={terminal} isActive />);

  const button = document.createElement('button');
  document.body.append(button);
  button.focus();
  button.remove();
  act(() => vi.advanceTimersByTime(100));
  expect(focus).not.toHaveBeenCalled();
});

it.each(['pointerdown', 'keydown'])('cancels pending autofocus on user %s before focus settles', (event) => {
  const { terminal, focus } = terminalFixture();
  render(<TerminalManager terminal={terminal} isActive />);

  if (event === 'pointerdown') {
    fireEvent.pointerDown(document.body);
  } else {
    fireEvent.keyDown(document.body, { key: 'Tab' });
  }

  act(() => vi.advanceTimersByTime(100));
  expect(focus).not.toHaveBeenCalled();
});

it('cancels on deactivation, permits a later idle activation, and cleans up on unmount', () => {
  const { terminal, focus } = terminalFixture();
  const { rerender, unmount } = render(<TerminalManager terminal={terminal} isActive />);
  rerender(<TerminalManager terminal={terminal} isActive={false} />);
  act(() => vi.advanceTimersByTime(100));
  expect(focus).not.toHaveBeenCalled();
  rerender(<TerminalManager terminal={terminal} isActive />);
  act(() => vi.advanceTimersByTime(100));
  expect(focus).toHaveBeenCalledOnce();
  unmount();
  act(() => vi.advanceTimersByTime(100));
  expect(focus).toHaveBeenCalledOnce();
});

it('cancels a pending autofocus on unmount', () => {
  const { terminal, focus } = terminalFixture();
  const { unmount } = render(<TerminalManager terminal={terminal} isActive />);
  unmount();
  act(() => vi.advanceTimersByTime(100));
  expect(focus).not.toHaveBeenCalled();
});
