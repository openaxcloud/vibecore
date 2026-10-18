/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IdePaletteProvider, useIdePalette, useRetainIdePalettes } from './IdePaletteState';

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
