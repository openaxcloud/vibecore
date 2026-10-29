/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorCompositionHandoff } from './useEditorCompositionHandoff';

vi.mock('@vibecore/editor', () => ({ useDesktopEditorComposing: () => false }));

const path = '/home/project/README.md';
const clicks = vi.fn();
interface Candidate {
  path?: string;
  name?: string;
  hidden?: boolean;
  stash?: boolean;
  disabled?: boolean;
  visibility?: 'hidden' | 'collapse';
}
interface Options {
  candidates?: Candidate[];
  focusNewField?: boolean;
  changeRouteOnMount?: string;
}

/*
 * Real native focusable elements with FileTree's public DOM contract. No mocked
 * focus implementation or direct event-handler invocation: React replaces trees.
 */
function Row({
  path: title = path,
  name = 'README.md',
  hidden = false,
  stash = false,
  disabled,
  visibility,
}: Candidate) {
  return (
    <button
      type="button"
      className="bolt-file-tree-node"
      title={stash ? undefined : title}
      data-vc-title-stash={stash ? title : undefined}
      hidden={hidden}
      disabled={disabled}
      style={{ visibility }}
      onClick={clicks}
    >
      <span className="bolt-file-tree-name">{name}</span>
      <span aria-label="Git status">M Modified</span>
    </button>
  );
}

function Pending() {
  return (
    <section data-testid="pending">
      <Row />
    </section>
  );
}

function Active({ candidates = [{}], focusNewField, changeRouteOnMount }: Options) {
  useLayoutEffect(() => {
    if (changeRouteOnMount) {
      window.history.replaceState({}, '', changeRouteOnMount);
    }

    if (focusNewField) {
      document.querySelector<HTMLInputElement>('[data-testid="new-field"]')?.focus();
    }
  }, [changeRouteOnMount, focusNewField]);
  return (
    <section data-testid="active">
      {candidates.map((candidate, index) => (
        <Row key={index} {...candidate} />
      ))}
      <input data-testid="new-field" />
    </section>
  );
}

function Harness({ ready, ...options }: Options & { ready: boolean }) {
  const active = useEditorCompositionHandoff(ready);
  return (
    <>
      <button data-testid="outside">Outside</button>
      {active ? <Active {...options} /> : <Pending />}
    </>
  );
}

function tick() {
  act(() => vi.runOnlyPendingTimers());
}

function prepare(options: Options = {}) {
  const view = render(<Harness ready={false} {...options} />);
  const oldRow = screen.getByTestId('pending').querySelector<HTMLButtonElement>('button')!;
  oldRow.focus();
  expect(document.activeElement).toBe(oldRow);

  return {
    oldRow,
    view,
    activate() {
      view.rerender(<Harness ready {...options} />);
      tick();
    },
  };
}

function activeRows() {
  return [...screen.getByTestId('active').querySelectorAll<HTMLButtonElement>('.bolt-file-tree-node')];
}

beforeEach(() => {
  vi.useFakeTimers();
  clicks.mockClear();
  window.history.replaceState({}, '', '/projects/fixture/ide?panel=files');

  // JSDOM has no layout; preserve actual DOM focus while supplying visibility.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 24, width: 200, height: 24, toJSON: () => ({}) };
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.closest('[hidden]') ? [] : [rect]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.closest('[hidden]') ? { ...rect, width: 0, height: 0 } : rect) as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Files keyboard focus across startup shell replacement', () => {
  it.each([false, true])('restores a tooltip-stashed old path to a replacement with stash=%s', (stash) => {
    const { oldRow, activate } = prepare({ candidates: [{ stash }] });
    oldRow.dataset.vcTitleStash = oldRow.title;
    oldRow.removeAttribute('title');
    activate();
    expect(document.activeElement).toBe(activeRows()[0]);
    expect(clicks).not.toHaveBeenCalled();
  });
  it('restores a native old title to a tooltip-stashed replacement', () => {
    const { activate } = prepare({ candidates: [{ stash: true }] });
    activate();
    expect(document.activeElement).toBe(activeRows()[0]);
  });
  it('rejects a mismatching tooltip-stashed path', () => {
    const { activate } = prepare({ candidates: [{ stash: true, path: '/home/other/README.md' }] });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it.each<Candidate>([{ disabled: true }, { visibility: 'hidden' }, { visibility: 'collapse' }])(
    'does not focus an unavailable row (%j)',
    (candidate) => {
      const { activate } = prepare({ candidates: [candidate] });
      activate();
      expect(document.activeElement).toBe(document.body);
    },
  );
  it('restores the unique visible same-path same-name row, without replaying activation', () => {
    const { oldRow, activate } = prepare();
    activate();
    expect(oldRow.isConnected).toBe(false);
    expect(document.activeElement).toBe(activeRows()[0]);
    expect(clicks).not.toHaveBeenCalled();
  });
  it('preserves focus deliberately moved outside before activation', () => {
    const { activate } = prepare();
    const outside = screen.getByTestId('outside');
    outside.focus();
    activate();
    expect(document.activeElement).toBe(outside);
    expect(clicks).not.toHaveBeenCalled();
  });
  it('does not steal autofocus from a newly mounted field', () => {
    const { activate } = prepare({ focusNewField: true });
    activate();
    expect(document.activeElement).toBe(screen.getByTestId('new-field'));
  });
  it('does not restore across a route change during the replacement commit', () => {
    const { activate } = prepare({ changeRouteOnMount: '/projects/other/ide?panel=files' });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it('does not restore across a panel URL change', () => {
    const { activate } = prepare({ changeRouteOnMount: '/projects/fixture/ide?panel=search' });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it('does not substitute a same-name file at a different path', () => {
    const { activate } = prepare({ candidates: [{ path: '/home/project/other/README.md' }] });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it('does not substitute a different name at the old path', () => {
    const { activate } = prepare({ candidates: [{ name: 'README.md.bak' }] });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it('does not guess between duplicate visible candidates', () => {
    const { activate } = prepare({ candidates: [{}, {}] });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it('never restores focus to a hidden candidate', () => {
    const { activate } = prepare({ candidates: [{ hidden: true }] });
    activate();
    expect(document.activeElement).toBe(document.body);
  });
  it('selects the unique visible candidate rather than its hidden duplicate', () => {
    const { activate } = prepare({ candidates: [{ hidden: true }, {}] });
    activate();
    expect(document.activeElement).toBe(activeRows()[1]);
  });
  it('does not defer or replay restoration when a candidate appears later', () => {
    const { activate, view } = prepare({ candidates: [] });
    activate();
    expect(document.activeElement).toBe(document.body);
    view.rerender(<Harness ready candidates={[{}]} />);
    tick();
    expect(document.activeElement).toBe(document.body);
    expect(clicks).not.toHaveBeenCalled();
  });
});
