/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IdePaletteProvider, useGlobalIdePalette, useIdePalette, useRetainIdePalettes } from './IdePaletteState';

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
        onClick={() => {
          palette.setCommandPaletteOpen(true);
          palette.setCommandPaletteMode('spotlight');
          palette.setCommandPaletteQuery('Database');
          palette.setCommandPaletteIndex(2);
          palette.setSpotlightProjectName('Synthetic project');
        }}
      >
        Open global
      </button>
      <button onClick={() => palette.setCommandPaletteOpen(false)}>Close global</button>
      <output aria-label="Global state">
        {JSON.stringify({
          open: palette.commandPaletteOpen,
          mode: palette.commandPaletteMode,
          query: palette.commandPaletteQuery,
          index: palette.commandPaletteIndex,
          spotlight: palette.spotlightProjectName,
        })}
      </output>
    </section>
  );
}

const defaultGlobalState = { open: false, mode: 'all', query: '', index: 0, spotlight: '' };

const readGlobal = (view: ReturnType<typeof render>) =>
  JSON.parse(view.getByLabelText('Global state').textContent ?? '{}');

describe('global IDE palette lifetime', () => {
  it('preserves opening, mode, search, selected index and spotlight across shell replacement', () => {
    const tree = (instance: string) => (
      <IdePaletteProvider projectId="p1" windowId="main">
        <GlobalPalette key={instance} />
      </IdePaletteProvider>
    );

    const view = render(tree('shell'));
    fireEvent.click(view.getByText('Open global'));

    const original = view.getByLabelText('Global state');
    view.rerender(tree('chat'));
    expect(original.isConnected).toBe(false);
    expect(readGlobal(view)).toEqual({
      open: true,
      mode: 'spotlight',
      query: 'Database',
      index: 2,
      spotlight: 'Synthetic project',
    });
  });

  it('does not reopen after explicit closure and a subsequent shell replacement', () => {
    const tree = (instance: string) => (
      <IdePaletteProvider projectId="p1" windowId="main">
        <GlobalPalette key={instance} />
      </IdePaletteProvider>
    );

    const view = render(tree('shell'));
    fireEvent.click(view.getByText('Open global'));
    fireEvent.click(view.getByText('Close global'));
    view.rerender(tree('chat'));
    expect(readGlobal(view).open).toBe(false);
    fireEvent.click(view.getByText('Open global'));
    expect(readGlobal(view).open).toBe(true);
  });

  it.each(['project', 'window'] as const)('clears all state across a %s change, including return', (dimension) => {
    const tree = (scope: string) => (
      <IdePaletteProvider
        projectId={dimension === 'project' ? scope : 'p1'}
        windowId={dimension === 'window' ? scope : 'main'}
      >
        <GlobalPalette />
      </IdePaletteProvider>
    );

    const view = render(tree('a'));
    fireEvent.click(view.getByText('Open global'));
    view.rerender(tree('b'));
    expect(readGlobal(view)).toEqual(defaultGlobalState);
    view.rerender(tree('a'));
    expect(readGlobal(view)).toEqual(defaultGlobalState);
  });

  it('drops global state when leaving the route and returning', () => {
    const tree = (
      <IdePaletteProvider projectId="p1" windowId="main">
        <GlobalPalette />
      </IdePaletteProvider>
    );

    const view = render(tree);
    fireEvent.click(view.getByText('Open global'));
    view.rerender(<div>Another route</div>);
    view.rerender(tree);
    expect(readGlobal(view)).toEqual(defaultGlobalState);
  });

  it('supports local fallback without leaking state across unmounts', () => {
    const view = render(<GlobalPalette key="first" />);
    fireEvent.click(view.getByText('Open global'));
    expect(readGlobal(view).query).toBe('Database');
    fireEvent.click(view.getByText('Close global'));
    expect(readGlobal(view).open).toBe(false);
    view.rerender(<GlobalPalette key="second" />);
    expect(readGlobal(view)).toEqual(defaultGlobalState);
  });
});
