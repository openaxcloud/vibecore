/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ComposerToolsPortal } from './ComposerToolsPortal';

let resized: () => void;
let disconnect: ReturnType<typeof vi.fn>;
let width: number;
let queued: FrameRequestCallback | undefined;

const flush = () =>
  act(() => {
    const callback = queued;
    queued = undefined;
    callback?.(0);
  });
beforeEach(() => {
  width = 320;
  queued = undefined;
  disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queued = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return {
      x: 0,
      y: 500,
      left: 0,
      top: 500,
      right: 300,
      bottom: 544,
      width: this.dataset.panel ? width : 44,
      height: 44,
    } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Draft() {
  const [value, setValue] = useState('');
  return <input aria-label="Draft" value={value} onChange={(e) => setValue(e.target.value)} />;
}

function Harness({ mobile = false, focusOnMount = false }: { mobile?: boolean; focusOnMount?: boolean }) {
  const anchor = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null);
  return (
    <div className="bolt-project-ide-shell">
      <div className={mobile ? 'bolt-responsive-ide-mobile' : 'desktop'}>
        <section className="bolt-project-agent-panel" data-panel="true">
          <div ref={anchor}>
            <button>Tools</button>
            <ComposerToolsPortal anchorRef={anchor} menuRef={menu} focusOnMount={focusOnMount}>
              <div ref={menu} role="menu">
                <button>Action</button>
                <Draft />
              </div>
            </ComposerToolsPortal>
          </div>
        </section>
      </div>
    </div>
  );
}
it('escapes a narrow desktop panel even when the menu is already open at mount', () => {
  const { container, unmount } = render(<Harness />);
  const menu = screen.getByRole('menu');
  expect(menu.parentElement?.parentElement).toBe(container.querySelector('.bolt-project-ide-shell'));
  expect(menu.style.width).toBe('260px');
  screen.getByText('Action').focus();
  width = 200;
  act(() => resized());
  flush();
  expect(menu.style.width).toBe('184px');
  expect(document.activeElement).toBe(screen.getByText('Action'));
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
it('preserves the mobile sheet root and its CSS positioning', () => {
  const { container } = render(<Harness mobile />);
  const menu = screen.getByRole('menu');
  expect(menu.parentElement?.parentElement).toBe(container.querySelector('.bolt-responsive-ide-mobile'));
  expect(menu.style.position).toBe('');
});

it('focuses only an explicit keyboard opening and preserves the same child draft across host changes', () => {
  const view = render(<Harness focusOnMount />);
  expect(document.activeElement).toBe(screen.getByText('Action'));

  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'unsent draft' } });
  input.focus();

  for (const mobile of [true, false, true]) {
    view.rerender(<Harness mobile={mobile} focusOnMount />);
    act(() => window.dispatchEvent(new Event('resize')));
    flush();
    expect(screen.getByRole('textbox')).toBe(input);
    expect((input as HTMLInputElement).value).toBe('unsent draft');
    expect(document.activeElement).toBe(input);
  }
});
