/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IdePaletteProvider,
  useGlobalIdePalette,
  useCommandPaletteReturnFocus,
  useIdePalette,
  useRetainIdePalettes,
} from './IdePaletteState';

afterEach(cleanup);

function Palette({ paneId = 'pane-main' }: { paneId?: string }) {
  const { open, query, openPalette, closePalette, setQuery } = useIdePalette(paneId);

  return (
    <section>
      <button onClick={openPalette}>Open {paneId}</button>
      <button onClick={closePalette}>Close {paneId}</button>
      {open && (
        <input aria-label={`Query ${paneId}`} value={query} onChange={(event) => setQuery(event.target.value)} />
      )}
    </section>
  );
}

function Layout({ paneIds }: { paneIds: string[] }) {
  useRetainIdePalettes(paneIds);

  return paneIds.map((paneId) => <Palette key={paneId} paneId={paneId} />);
}

describe('IDE palette lifetime', () => {
  it.each(['pane-main', 'pane-split', 'pane-floating'])(
    'preserves opening and search on restored %s when the loading shell is replaced',
    (paneId) => {
      const tree = (instance: string) => (
        <IdePaletteProvider projectId="p1" windowId="main">
          <Layout key={instance} paneIds={[...new Set(['pane-main', paneId])]} />
        </IdePaletteProvider>
      );

      const view = render(tree('shell'));
      fireEvent.click(view.getByText(`Open ${paneId}`));
      fireEvent.change(view.getByLabelText(`Query ${paneId}`), { target: { value: 'Database' } });

      const original = view.getByLabelText(`Query ${paneId}`);
      view.rerender(tree('chat'));
      expect(original.isConnected).toBe(false);
      expect((view.getByLabelText(`Query ${paneId}`) as HTMLInputElement).value).toBe('Database');
    },
  );

  it('keeps an explicitly closed palette closed through subsequent replacements', () => {
    const tree = (instance: string) => (
      <IdePaletteProvider projectId="p1" windowId="main">
        <Palette key={instance} />
      </IdePaletteProvider>
    );

    const view = render(tree('shell'));
    fireEvent.click(view.getByText('Open pane-main'));
    fireEvent.click(view.getByText('Close pane-main'));
    view.rerender(tree('chat'));
    expect(view.queryByLabelText('Query pane-main')).toBeNull();
    fireEvent.click(view.getByText('Open pane-main'));
    expect((view.getByLabelText('Query pane-main') as HTMLInputElement).value).toBe('');
  });

  it.each(['project', 'window'] as const)('does not revive a palette after changing %s and returning', (dimension) => {
    const tree = (scope: string) => (
      <IdePaletteProvider
        projectId={dimension === 'project' ? scope : 'p1'}
        windowId={dimension === 'window' ? scope : 'main'}
      >
        <Palette />
      </IdePaletteProvider>
    );

    const view = render(tree('a'));
    fireEvent.click(view.getByText('Open pane-main'));
    view.rerender(tree('b'));
    expect(view.queryByLabelText('Query pane-main')).toBeNull();
    view.rerender(tree('a'));
    expect(view.queryByLabelText('Query pane-main')).toBeNull();
  });

  it('drops the state when leaving the IDE route, including a quick return', () => {
    const tree = (
      <IdePaletteProvider projectId="p1" windowId="main">
        <Palette />
      </IdePaletteProvider>
    );

    const view = render(tree);
    fireEvent.click(view.getByText('Open pane-main'));
    view.rerender(<div>Another route</div>);
    view.rerender(tree);
    expect(view.queryByLabelText('Query pane-main')).toBeNull();
  });

  it('drops a removed pane without reviving its palette if its id is reused', () => {
    const tree = (paneIds: string[]) => (
      <IdePaletteProvider projectId="p1" windowId="main">
        <Layout paneIds={paneIds} />
      </IdePaletteProvider>
    );

    const view = render(tree(['a', 'b']));
    fireEvent.click(view.getByText('Open a'));
    view.rerender(tree(['b']));
    view.rerender(tree(['a', 'b']));
    expect(view.queryByLabelText('Query a')).toBeNull();
  });

  it('keeps a surviving pane open when another pane is removed or closes', () => {
    const tree = (paneIds: string[]) => (
      <IdePaletteProvider projectId="p1" windowId="main">
        <Layout paneIds={paneIds} />
      </IdePaletteProvider>
    );

    const view = render(tree(['a', 'b']));
    fireEvent.click(view.getByText('Open a'));
    fireEvent.click(view.getByText('Open b'));
    fireEvent.click(view.getByText('Close a'));
    expect(view.queryByLabelText('Query a')).toBeNull();
    expect(view.queryByLabelText('Query b')).not.toBeNull();
    view.rerender(tree(['b']));
    expect(view.queryByLabelText('Query b')).not.toBeNull();
  });

  it('preserves independent local behavior without a provider', () => {
    const view = render(<Palette key="first" />);
    fireEvent.click(view.getByText('Open pane-main'));
    expect(view.queryByLabelText('Query pane-main')).not.toBeNull();
    fireEvent.click(view.getByText('Close pane-main'));
    expect(view.queryByLabelText('Query pane-main')).toBeNull();
    fireEvent.click(view.getByText('Open pane-main'));
    view.rerender(<Palette key="second" />);
    expect(view.queryByLabelText('Query pane-main')).toBeNull();
  });
});

function GlobalPalette() {
  const palette = useGlobalIdePalette();

  return (
    <section>
      <button
        onClick={(event) => {
          if (!palette.commandPaletteOpen) {
            palette.commandPaletteReturnFocusRef.current = event.currentTarget;
          }

          palette.setCommandPaletteOpen(true);
        }}
      >
        Open global
      </button>
      <button
        onClick={() => {
          palette.setCommandPaletteOpen(false);
          palette.commandPaletteReturnFocusRef.current?.focus();
        }}
      >
        Close global
      </button>
      {palette.commandPaletteOpen && (
        <>
          <input
            autoFocus
            aria-label="Global query"
            value={palette.commandPaletteQuery}
            onChange={(event) => palette.setCommandPaletteQuery(event.target.value)}
          />
          <button onClick={() => palette.setCommandPaletteIndex((index) => index + 1)}>Next result</button>
          <button
            onClick={() => {
              palette.setCommandPaletteMode('spotlight');
              palette.setSpotlightProjectName('Project Alpha');
            }}
          >
            Spotlight
          </button>
          <output aria-label="Global state">
            {palette.commandPaletteMode}:{palette.commandPaletteIndex}:{palette.spotlightProjectName}
          </output>
        </>
      )}
    </section>
  );
}

function globalTree(instance: string, projectId = 'project-a', windowId = 'window-a') {
  return (
    <IdePaletteProvider projectId={projectId} windowId={windowId}>
      <GlobalPalette key={instance} />
    </IdePaletteProvider>
  );
}

describe('global command palette lifetime', () => {
  it('retains open, query, selection and Spotlight through shell replacement', () => {
    const view = render(globalTree('shell'));
    fireEvent.click(view.getByText('Open global'));
    fireEvent.change(view.getByLabelText('Global query'), { target: { value: 'database' } });
    fireEvent.click(view.getByText('Next result'));
    fireEvent.click(view.getByText('Next result'));
    fireEvent.click(view.getByText('Spotlight'));

    const oldInput = view.getByLabelText('Global query');
    view.rerender(globalTree('chat'));
    expect(oldInput.isConnected).toBe(false);
    expect((view.getByLabelText('Global query') as HTMLInputElement).value).toBe('database');
    expect(view.getByLabelText('Global state').textContent).toBe('spotlight:2:Project Alpha');
    expect(document.activeElement).toBe(view.getByLabelText('Global query'));
    fireEvent.click(view.getByText('Close global'));
    view.rerender(globalTree('next-shell'));
    expect(view.queryByLabelText('Global query')).toBeNull();
  });

  it.each(['project', 'window'] as const)('resets global state when changing %s and returning', (scope) => {
    const tree = (id: string) => globalTree('chat', scope === 'project' ? id : 'p', scope === 'window' ? id : 'w');
    const view = render(tree('a'));
    fireEvent.click(view.getByText('Open global'));
    fireEvent.change(view.getByLabelText('Global query'), { target: { value: 'old query' } });
    fireEvent.click(view.getByText('Next result'));
    view.rerender(tree('b'));
    expect(view.queryByLabelText('Global query')).toBeNull();
    view.rerender(tree('a'));
    expect(view.queryByLabelText('Global query')).toBeNull();
    fireEvent.click(view.getByText('Open global'));
    expect((view.getByLabelText('Global query') as HTMLInputElement).value).toBe('');
    expect(view.getByLabelText('Global state').textContent).toBe('all:0:');
  });

  it('drops global state after leaving the route', () => {
    const view = render(globalTree('chat'));
    fireEvent.click(view.getByText('Open global'));
    view.rerender(<div>Another route</div>);
    view.rerender(globalTree('chat'));
    expect(view.queryByLabelText('Global query')).toBeNull();
  });

  it('keeps the return-focus reference across replacement without resetting it on repeated opening', () => {
    let state: ReturnType<typeof useGlobalIdePalette> | undefined;

    function Probe() {
      state = useGlobalIdePalette();
      return <GlobalPalette />;
    }

    const tree = (id: string) => (
      <IdePaletteProvider projectId="p" windowId="w">
        <button>Stable opener</button>
        <Probe key={id} />
      </IdePaletteProvider>
    );

    const view = render(tree('shell'));
    fireEvent.click(view.getByText('Open global'));

    const opener = view.getByText('Stable opener');
    state!.commandPaletteReturnFocusRef.current = opener;

    const reference = state!.commandPaletteReturnFocusRef;
    view.rerender(tree('chat'));
    expect(state!.commandPaletteReturnFocusRef).toBe(reference);
    fireEvent.click(view.getByText('Open global'));
    expect(state!.commandPaletteReturnFocusRef.current).toBe(opener);
    fireEvent.click(view.getByText('Close global'));
    expect(document.activeElement).toBe(opener);
  });

  it('does not prune the global palette with pane retention', () => {
    const tree = (paneIds: string[]) => (
      <IdePaletteProvider projectId="p" windowId="w">
        <GlobalPalette />
        <Layout paneIds={paneIds} />
      </IdePaletteProvider>
    );

    const view = render(tree(['a']));
    fireEvent.click(view.getByText('Open global'));
    fireEvent.click(view.getByText('Open a'));
    fireEvent.change(view.getByLabelText('Global query'), { target: { value: 'keep global' } });
    view.rerender(tree([]));
    expect((view.getByLabelText('Global query') as HTMLInputElement).value).toBe('keep global');
    expect(view.queryByLabelText('Query a')).toBeNull();
  });

  it('retains local fallback behavior without a route provider', () => {
    const view = render(<GlobalPalette key="first" />);
    fireEvent.click(view.getByText('Open global'));
    fireEvent.change(view.getByLabelText('Global query'), { target: { value: 'local' } });
    fireEvent.click(view.getByText('Close global'));
    fireEvent.click(view.getByText('Open global'));
    expect((view.getByLabelText('Global query') as HTMLInputElement).value).toBe('local');
    expect(document.activeElement).toBe(view.getByLabelText('Global query'));
    view.rerender(<GlobalPalette key="second" />);
    expect(view.queryByLabelText('Global query')).toBeNull();
  });
});

describe('command palette deferred return focus', () => {
  let pending: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  beforeEach(() => {
    pending = new Map();
    nextFrame = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        pending.set(++nextFrame, callback);
        return nextFrame;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => pending.delete(id)),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function makeTarget(testId = 'palette-opener') {
    const button = document.createElement('button');
    button.dataset.testid = testId;
    document.body.append(button);

    return button;
  }

  function flush() {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(0));
  }

  function Probe({
    open,
    previous,
    outside,
  }: {
    open: boolean;
    previous: { current: HTMLElement | null };
    outside: { current: boolean };
  }) {
    useCommandPaletteReturnFocus(open, previous, outside);
    return null;
  }

  function setup() {
    const opener = makeTarget();
    const previous = { current: opener as HTMLElement | null };
    const outside = { current: false };

    const tree = (open: boolean, key = 'project-a') => (
      <Probe key={key} open={open} previous={previous} outside={outside} />
    );

    const view = render(tree(true));

    return { opener, previous, outside, tree, view };
  }

  it('restores the connected opener after explicit close and clears the reference', () => {
    const { opener, previous, view, tree } = setup();
    view.rerender(tree(false));
    expect(previous.current).toBe(opener);
    expect(pending.size).toBe(1);
    flush();
    expect(previous.current).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('resolves a visible replacement opener when the shell removed the old DOM node', () => {
    const { opener, view, tree } = setup();
    opener.remove();

    const hidden = makeTarget();
    const visible = makeTarget();
    vi.spyOn(visible, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    view.rerender(tree(false));
    flush();
    expect(document.activeElement).toBe(visible);
    expect(document.activeElement).not.toBe(hidden);
  });

  it.each(['unmount', 'scope'] as const)('cancels pending focus on %s before the frame', (transition) => {
    const { opener, view, tree } = setup();
    view.rerender(tree(false));
    opener.remove();

    if (transition === 'unmount') {
      view.unmount();
    } else {
      view.rerender(tree(true, 'project-b'));
    }

    const nextProject = makeTarget();
    vi.spyOn(nextProject, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);

    const focused = makeTarget('new-project-input');
    focused.focus();
    flush();
    expect(document.activeElement).toBe(focused);
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  });

  it('cancels old restoration if the palette reopens before the frame', () => {
    const { view, tree } = setup();
    view.rerender(tree(false));
    view.rerender(tree(true));

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    flush();
    expect(document.activeElement).toBe(input);
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  });

  it('hands pending close focus to the replacement shell in the same route scope', () => {
    const { opener, previous, outside, view, tree } = setup();
    view.rerender(tree(false));
    opener.remove();

    const replacement = makeTarget();
    vi.spyOn(replacement, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    view.rerender(<Probe key="loaded-shell" open={false} previous={previous} outside={outside} />);
    expect(pending.size).toBe(1);
    flush();
    expect(document.activeElement).toBe(replacement);
    expect(previous.current).toBeNull();
  });

  it('does not restore a receipt into a different route scope', () => {
    const { opener, view, tree } = setup();
    view.rerender(tree(false));
    opener.remove();

    const next = { current: null as HTMLElement | null };
    view.rerender(<Probe key="project-b" open={false} previous={next} outside={{ current: false }} />);

    const other = makeTarget();
    vi.spyOn(other, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    flush();
    expect(document.activeElement).not.toBe(other);
  });

  it('does not overwrite a new return-focus intention before the frame', () => {
    const { previous, view, tree } = setup();
    view.rerender(tree(false));

    const other = makeTarget('other-opener');
    previous.current = other;
    flush();
    expect(previous.current).toBe(other);
    expect(document.activeElement).not.toBe(other);
  });

  it.each([false, true])('preserves a newly focused external target (shell replacement=%s)', (replace) => {
    const { previous, outside, view, tree } = setup();
    view.rerender(tree(false));

    const clicked = makeTarget('external-action');
    clicked.focus();

    if (replace) {
      view.rerender(<Probe key="loaded-shell" open={false} previous={previous} outside={outside} />);
    }

    flush();
    expect(document.activeElement).toBe(clicked);
    expect(previous.current).toBeNull();
  });

  it('declines an ambiguous replacement when two visible openers share the test id', () => {
    const { opener, view, tree } = setup();
    opener.remove();

    const first = makeTarget();
    const second = makeTarget();

    for (const target of [first, second]) {
      vi.spyOn(target, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    }
    view.rerender(tree(false));
    flush();
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).not.toBe(second);
  });

  it('preserves outside-click focus and resets the close reason without scheduling a frame', () => {
    const { previous, outside, view, tree } = setup();
    const clicked = makeTarget('outside-action');
    clicked.focus();
    outside.current = true;
    view.rerender(tree(false));
    expect(previous.current).toBeNull();
    expect(outside.current).toBe(false);
    expect(pending.size).toBe(0);
    flush();
    expect(document.activeElement).toBe(clicked);
  });
});
