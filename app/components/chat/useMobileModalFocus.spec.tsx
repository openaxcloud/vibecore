/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobileOverlayFocusProvider, useMobileOverlayFocus, useMobileTabSearchQuery } from './MobileOverlayFocus';
import { useMobileModalFocus } from './useMobileModalFocus';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 10 }] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Modal({ active = true, handoff = false, child = false }) {
  const ref = useMobileModalFocus(active);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (handoff) {
      input.current?.focus();
      input.current?.setSelectionRange(1, 3);
    }
  }, [handoff]);

  return (
    <>
      <button>Outside</button>
      {active && (
        <section ref={ref} role="dialog" aria-label="Mobile" tabIndex={-1}>
          <button>First</button>
          <button disabled>Disabled</button>
          <button hidden>Hidden</button>
          <input ref={input} aria-label="Search" defaultValue="query" />
          <button onKeyDown={(event) => event.key === 'Tab' && event.preventDefault()}>Child owns Tab</button>
          <button>Last</button>
          {child && (
            <section role="dialog" aria-label="Child">
              <button>Nested</button>
            </section>
          )}
        </section>
      )}
    </>
  );
}

it('enters the modal and cycles both directions without visiting hidden or disabled controls', () => {
  const view = render(<Modal />);
  expect(document.activeElement).toBe(view.getByRole('dialog', { name: 'Mobile' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(view.getByText('Last'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(view.getByText('First'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(view.getByLabelText('Search'));
});

it('preserves handoff query, selection and focus rather than autofocusing the first control', () => {
  const view = render(<Modal handoff />);
  const input = view.getByLabelText('Search') as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('query');
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
});

it('leaves child dialogs and already handled Tab events to their owner', () => {
  const view = render(<Modal child />);
  const nested = view.getByText('Nested');
  nested.focus();
  expect(fireEvent.keyDown(nested, { key: 'Tab' })).toBe(true);
  expect(document.activeElement).toBe(nested);

  const owner = view.getByText('Child owns Tab');
  owner.focus();
  fireEvent.keyDown(owner, { key: 'Tab' });
  expect(document.activeElement).toBe(owner);
});

it('does not consume Escape or restore stale focus after resize/close', () => {
  const view = render(<Modal />);
  expect(fireEvent.keyDown(document.activeElement!, { key: 'Escape' })).toBe(true);

  const outside = view.getByText('Outside');
  outside.focus();
  view.rerender(<Modal active={false} />);
  expect(document.activeElement).toBe(outside);
  expect(fireEvent.keyDown(outside, { key: 'Tab' })).toBe(true);
});

function HandoffShell({ restored = false }) {
  const [open, setOpen] = useState(restored);
  const [query, setQuery] = useMobileTabSearchQuery();
  const { rootRef, rememberOpener, restoreOpener } = useMobileOverlayFocus(true, true);
  const dialogRef = useMobileModalFocus(open);

  return (
    <div ref={rootRef}>
      <nav data-testid="mobile-bottom-navigation">
        <button
          data-testid="button-tab-switcher"
          onClick={(event) => {
            rememberOpener(event.currentTarget);
            event.currentTarget.blur();
            setOpen(true);
          }}
        >
          Open tabs
        </button>
      </nav>
      {open && (
        <section
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
          data-testid="mobile-tab-switcher"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              restoreOpener();
            }
          }}
        >
          <button>First tab</button>
          <input
            aria-label="Tab query"
            data-testid="input-search-tabs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </section>
      )}
    </div>
  );
}

it('composes with the real shell handoff and leaves Escape restoration to its owner', () => {
  const tree = (key: string, restored = false) => (
    <MobileOverlayFocusProvider projectId="synthetic" windowId="main">
      <HandoffShell key={key} restored={restored} />
    </MobileOverlayFocusProvider>
  );

  const view = render(tree('before'));
  fireEvent.click(view.getByText('Open tabs'));
  expect(document.activeElement).toBe(view.getByRole('dialog'));

  const old = view.getByLabelText('Tab query');
  fireEvent.change(old, { target: { value: 'Webview' } });
  old.focus();
  view.rerender(tree('after', true));
  expect(old.isConnected).toBe(false);
  expect(document.activeElement).toBe(view.getByLabelText('Tab query'));
  expect((document.activeElement as HTMLInputElement).value).toBe('Webview');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(view.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(view.getByText('Open tabs'));
});

function SearchFirstModal() {
  const [open, setOpen] = useState(false);
  const ref = useMobileModalFocus(open);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open tools</button>
      {open && (
        <section role="dialog" aria-label="Tools" tabIndex={-1} ref={ref}>
          <input aria-label="Tools search" />
          <button>Close tools</button>
        </section>
      )}
    </>
  );
}

it('pointer opening focuses the dialog, leaving the first search field for explicit Tab navigation', () => {
  const view = render(<SearchFirstModal />);
  const opener = view.getByText('Open tools');
  opener.focus();
  fireEvent.click(opener, { detail: 1 });
  expect(document.activeElement).toBe(view.getByRole('dialog', { name: 'Tools' }));
  expect(document.activeElement).not.toBe(view.getByLabelText('Tools search'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(view.getByLabelText('Tools search'));
});
