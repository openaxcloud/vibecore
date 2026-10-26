/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { MobileOverlayFocusProvider, useMobileOverlayFocus } from './MobileOverlayFocus';

afterEach(cleanup);

function Shell({ openInitially = false, mobile = true, more = false }) {
  const [open, setOpen] = useState(openInitially);
  const { rootRef, rememberOpener, restoreOpener } = useMobileOverlayFocus(mobile, mobile);

  return (
    <div ref={rootRef}>
      <button onClick={() => rememberOpener(document.body)}>Capture body</button>
      <button onClick={restoreOpener}>Restore</button>
      {mobile && (
        <>
          <nav data-testid="mobile-bottom-navigation">
            <button
              data-testid={more ? 'button-more-tabs' : 'button-tab-switcher'}
              onClick={(event) => {
                rememberOpener(event.currentTarget);
                event.currentTarget.blur();
                setOpen(true);
              }}
            >
              Tabs
            </button>
          </nav>
          {open && (
            <section
              data-testid="mobile-tab-switcher"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false);
                  restoreOpener();
                }
              }}
            >
              <input data-testid="input-search-tabs" aria-label="Search" />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function tree(
  instance: string,
  open = false,
  project = 'p',
  workspace = 'w',
  windowId = 'main',
  mobile = true,
  more = false,
) {
  return (
    <StrictMode>
      <MobileOverlayFocusProvider projectId={project} workspaceId={workspace} windowId={windowId}>
        <button>Outside</button>
        <Shell key={instance} openInitially={open} mobile={mobile} more={more} />
      </MobileOverlayFocusProvider>
    </StrictMode>
  );
}

it.each([false, true])('restores a live search and its actual opener after replacement (more=%s)', (more) => {
  const view = render(tree('shell', false, 'p', 'w', 'main', true, more));
  fireEvent.click(view.getByText('Tabs'));
  view.getByLabelText('Search').focus();

  const old = view.getByLabelText('Search');
  view.rerender(tree('chat', true, 'p', 'w', 'main', true, more));
  expect(old.isConnected).toBe(false);
  expect(document.activeElement).toBe(view.getByLabelText('Search'));
  fireEvent.keyDown(view.getByLabelText('Search'), { key: 'Escape' });
  expect(view.queryByLabelText('Search')).toBeNull();
  expect(document.activeElement).toBe(view.getByText('Tabs'));
});

it('keeps focus on the new trigger when Escape precedes replacement, only once', () => {
  const view = render(tree('shell'));
  fireEvent.click(view.getByText('Tabs'));
  view.getByLabelText('Search').focus();
  fireEvent.keyDown(view.getByLabelText('Search'), { key: 'Escape' });

  const old = view.getByText('Tabs');
  view.rerender(tree('chat'));
  expect(old.isConnected).toBe(false);
  expect(document.activeElement).toBe(view.getByText('Tabs'));
  view.getByText('Outside').focus();
  view.rerender(tree('chat'));
  expect(document.activeElement).toBe(view.getByText('Outside'));
});

it('preserves focus outside the replaced shell', () => {
  const view = render(tree('shell'));
  fireEvent.click(view.getByText('Tabs'));
  view.getByLabelText('Search').focus();
  view.getByText('Outside').focus();
  view.rerender(tree('chat', true));
  expect(document.activeElement).toBe(view.getByText('Outside'));
});

it('forgets the previous opener when a later opening has no eligible focused control', () => {
  const view = render(tree('shell'));
  fireEvent.click(view.getByText('Tabs'));
  view.getByLabelText('Search').focus();
  fireEvent.keyDown(view.getByLabelText('Search'), { key: 'Escape' });
  expect(document.activeElement).toBe(view.getByText('Tabs'));
  view.getByText('Tabs').blur();
  fireEvent.click(view.getByText('Capture body'));
  fireEvent.click(view.getByText('Restore'));
  expect(document.activeElement).toBe(document.body);
});

it.each(['project', 'workspace', 'window'])('does not revive focus across %s scope', (scope) => {
  const view = render(tree('shell'));
  view.getByText('Tabs').focus();
  view.rerender(
    tree(
      'chat',
      false,
      scope === 'project' ? 'p2' : 'p',
      scope === 'workspace' ? 'w2' : 'w',
      scope === 'window' ? 'two' : 'main',
    ),
  );
  expect(document.activeElement).toBe(document.body);
  view.rerender(tree('returned'));
  expect(document.activeElement).toBe(document.body);
});

it('drops pending focus on desktop and does not steal it on return to mobile', () => {
  const width = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

  try {
    const view = render(tree('shell'));
    view.getByText('Tabs').focus();
    view.rerender(tree('chat', false, 'p', 'w', 'main', false));
    view.rerender(tree('chat'));
    expect(document.activeElement).toBe(document.body);
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  }
});
