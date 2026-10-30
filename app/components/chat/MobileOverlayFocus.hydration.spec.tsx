/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { useHydrated } from 'remix-utils/use-hydrated';
import { afterEach, expect, it } from 'vitest';
import { MobileOverlayFocusProvider, useMobileOverlayFocus } from './MobileOverlayFocus';

afterEach(cleanup);

type Commit = { ready: boolean; present: boolean; focused: boolean };

function Shell({ record }: { record: (commit: Commit) => void }) {
  const ready = useHydrated();
  const { rootRef } = useMobileOverlayFocus(ready, true);

  useLayoutEffect(() => {
    const trigger = rootRef.current?.querySelector('button');
    record({ ready, present: Boolean(trigger), focused: Boolean(trigger && document.activeElement === trigger) });
  });

  return (
    <div ref={rootRef}>
      {ready && (
        <nav data-testid="mobile-bottom-navigation">
          <button data-testid="button-more-tabs">Panels</button>
        </nav>
      )}
    </div>
  );
}

function tree(key: string, record: (commit: Commit) => void, projectId = 'synthetic', windowId = 'main') {
  return (
    <StrictMode>
      <MobileOverlayFocusProvider projectId={projectId} windowId={windowId}>
        <Shell key={key} record={record} />
      </MobileOverlayFocusProvider>
    </StrictMode>
  );
}

it('renders the trigger and restores focus in the first replacement commit', () => {
  const commits: Commit[] = [];

  const record = (commit: Commit) => {
    commits.push(commit);
  };

  const view = render(tree('before', record));
  const previous = view.getByRole('button');
  previous.focus();
  commits.length = 0;
  view.rerender(tree('after', record));

  expect(previous.isConnected).toBe(false);
  expect(commits[0]).toEqual({ ready: true, present: true, focused: true });
  expect(document.activeElement).toBe(view.getByRole('button'));
});

it.each(['project', 'window'])('does not restore a previous %s control', (scope) => {
  const commits: Commit[] = [];

  const record = (commit: Commit) => {
    commits.push(commit);
  };

  const view = render(tree('before', record));
  view.getByRole('button').focus();
  commits.length = 0;
  view.rerender(
    tree(
      'after',
      record,
      scope === 'project' ? 'other-project' : 'synthetic',
      scope === 'window' ? 'other-window' : 'main',
    ),
  );

  expect(commits[0]).toEqual({ ready: true, present: true, focused: false });
  expect(document.activeElement).toBe(document.body);
});

it('preserves server hydration parity before exposing the mobile trigger', async () => {
  const commits: Commit[] = [];

  const element = tree('initial', (commit) => {
    commits.push(commit);
  });

  const html = renderToString(element);
  expect(html).not.toContain('<button');

  const host = document.createElement('div');
  document.body.append(host);
  host.innerHTML = html;

  const errors: unknown[] = [];

  let root: Root | undefined;

  try {
    await act(async () => {
      root = hydrateRoot(host, element, { onRecoverableError: (error) => errors.push(error) });
    });
    expect(commits[0]).toEqual({ ready: false, present: false, focused: false });
    expect(errors).toEqual([]);
    expect(host.querySelector('button')?.textContent).toBe('Panels');
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});
