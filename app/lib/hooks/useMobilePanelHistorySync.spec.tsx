/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, useEffect, useState, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMobilePanelHistorySync } from './useMobilePanelHistorySync';

const pathname = '/projects/synthetic-first/ide';
const search = '?panel=search';

function setNativeLocation(query: string, path = pathname) {
  window.history.replaceState(null, '', `${path}${query}`);
}

function pop(query: string, path = pathname) {
  setNativeLocation(query, path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

interface Route {
  pathname: string;
  search: string;
  navigation: string;
  compact: boolean;
}

/*
 * Deliberately keep the committed route unchanged while an optimistic panel
 * changes. This is the React batching condition observed in the browser trace.
 */
function usePanel(route: Route) {
  const { ready, popRevision } = useMobilePanelHistorySync(route.compact, route, route.navigation);
  const [panel, setPanel] = useState(route.search ? 'search' : 'agent');

  useEffect(() => {
    if (ready) {
      setPanel(route.search ? 'search' : 'agent');
    }
  }, [ready, popRevision, route.search]);

  return { panel, setPanel, ready, popRevision };
}

const initial = (query = search): Route => ({ pathname, search: query, navigation: 'idle', compact: true });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('compact panel synchronization after browser history', () => {
  it.each([
    [search, '', 'agent', 'search'],
    ['', search, 'search', 'agent'],
  ])('restores the unchanged committed route %s after a coalesced round trip', (start, away, optimistic, expected) => {
    setNativeLocation(start);

    const { result } = renderHook(usePanel, { initialProps: initial(start) });

    act(() => {
      result.current.setPanel(optimistic);
      setNativeLocation(away);
    });
    expect(result.current.panel).toBe(optimistic);

    act(() => pop(start));
    expect(result.current.panel).toBe(expected);
    expect(result.current.popRevision).toBe(1);
  });

  it('waits for the POP loader, then follows a newer Agent intent instead of restoring Search', () => {
    setNativeLocation(search);

    const { result, rerender } = renderHook(usePanel, { initialProps: initial() });

    act(() => {
      result.current.setPanel('agent');
      setNativeLocation('');
    });
    rerender({ ...initial(), navigation: 'loading' });
    act(() => pop(search));
    expect(result.current.ready).toBe(false);
    expect(result.current.panel).toBe('agent');

    /*
     * A newer navigation supersedes the pending POP. Its committed destination
     * is Agent, never the Search URL captured by the cancelled POP.
     */
    act(() => setNativeLocation(''));
    rerender({ ...initial(''), navigation: 'loading' });
    expect(result.current.panel).toBe('agent');
    rerender(initial(''));
    expect(result.current.panel).toBe('agent');
    expect(result.current.ready).toBe(true);
  });

  it('does not apply a POP while the committed pathname still belongs to another project', () => {
    setNativeLocation(search);

    const { result, rerender } = renderHook(usePanel, { initialProps: initial() });
    act(() => result.current.setPanel('agent'));
    act(() => pop(search, '/projects/synthetic-second/ide'));
    expect(result.current.ready).toBe(false);
    expect(result.current.panel).toBe('agent');

    rerender({ ...initial(), pathname: '/projects/synthetic-second/ide' });
    expect(result.current.ready).toBe(true);
    expect(result.current.panel).toBe('search');
  });

  it('waits for the exact committed query and idle navigation before restoring a panel', () => {
    setNativeLocation(search);

    const { result, rerender } = renderHook(usePanel, { initialProps: initial() });
    act(() => result.current.setPanel('agent'));
    rerender({ ...initial(), navigation: 'loading' });
    act(() => pop(''));
    rerender(initial());
    expect(result.current.ready).toBe(false);
    expect(result.current.panel).toBe('agent');
    rerender(initial(''));
    expect(result.current.ready).toBe(true);
    expect(result.current.panel).toBe('agent');
  });

  it('leaves desktop navigation unsubscribed and unaffected by native location mismatch', () => {
    setNativeLocation(search);

    const add = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(usePanel, { initialProps: { ...initial(), compact: false } });
    act(() => result.current.setPanel('agent'));
    act(() => pop(''));
    expect(add.mock.calls.filter(([event]) => event === 'popstate')).toHaveLength(0);
    expect(result.current.ready).toBe(true);
    expect(result.current.popRevision).toBe(0);
    expect(result.current.panel).toBe('agent');
  });

  it('removes every listener across StrictMode replay, disabling and unmount', () => {
    setNativeLocation(search);

    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result, rerender, unmount } = renderHook(usePanel, { initialProps: initial(), wrapper });
    act(() => pop(search));
    expect(result.current.popRevision).toBe(1);
    rerender({ ...initial(), compact: false });
    act(() => pop(search));
    expect(result.current.popRevision).toBe(1);
    unmount();

    const installed = add.mock.calls.filter(([event]) => event === 'popstate').map(([, listener]) => listener);
    const removed = remove.mock.calls.filter(([event]) => event === 'popstate').map(([, listener]) => listener);
    expect(installed.length).toBeGreaterThan(0);
    expect(removed).toEqual(installed);
  });
});
