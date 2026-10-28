/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const layoutState = vi.hoisted(() => ({ isMobile: true, isTablet: false }));
vi.mock('@vibecore/editor', () => ({
  EditorAdapter: ({ filePath }: { filePath: string }) => <div data-testid="editor-adapter">{filePath}</div>,
  TouchSymbolToolbar: () => <div data-testid="touch-symbol-toolbar" />,
  useResponsiveLayout: () => layoutState,
}));
vi.mock('@radix-ui/react-tabs', () => ({
  Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  List: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children, ...props }: { children: ReactNode; value?: string; className?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div />,
}));
vi.mock('./EditorHistoryOverlay', () => ({ EditorHistoryOverlay: () => <div /> }));
vi.mock('./FileBreadcrumb', () => ({ FileBreadcrumb: () => <div data-testid="breadcrumb" /> }));
vi.mock('./FileTree', () => ({ FileTree: () => <div data-testid="file-tree" /> }));
vi.mock('./LockManager', () => ({ LockManager: () => <div data-testid="lock-manager" /> }));

vi.mock('~/lib/stores/theme', () => ({ themeStore: {} }));
vi.mock('./terminal/TerminalTabs', () => ({ DEFAULT_TERMINAL_SIZE: 30, TerminalTabs: () => null }));
vi.mock('~/utils/mobile', () => ({ isMobile: () => false }));

const runtimeMocks = vi.hoisted(() => ({
  searchFiles: vi.fn(),
  readFile: vi.fn(),
  workdir: '/workspace',
}));
const workbenchMocks = vi.hoisted(() => ({
  files: {
    '/workspace/src/App.tsx': {
      type: 'file',
      content: 'const greeting = "Hello";',
      isBinary: false,
    },
  } as Record<string, unknown>,
  setSelectedFile: vi.fn(),
  setCurrentDocumentScrollPosition: vi.fn(),
  saveAllFiles: vi.fn(),
  writeFileContent: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@nanostores/react', () => ({ useStore: () => new Set<string>() }));
vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  useRuntimeAdapter: () => runtimeMocks,
}));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    unsavedFiles: { get: () => new Set<string>() },
    files: { get: () => workbenchMocks.files },
    setSelectedFile: workbenchMocks.setSelectedFile,
    setCurrentDocumentScrollPosition: workbenchMocks.setCurrentDocumentScrollPosition,
    saveAllFiles: workbenchMocks.saveAllFiles,
    writeFileContent: workbenchMocks.writeFileContent,
    isFileLocked: () => ({ locked: false }),
  },
}));
vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <section role="dialog" aria-label={title}>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}));
vi.mock('react-toastify', () => ({ toast: toastMocks }));
vi.mock('~/utils/constants', () => ({ WORK_DIR: '/workspace' }));

import { EditorPanel } from './EditorPanel';
import { Search } from './Search';
import { SearchDraftProvider } from './SearchDraftState';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  runtimeMocks.searchFiles.mockReset();
  runtimeMocks.readFile.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  workbenchMocks.setSelectedFile.mockReset();
  workbenchMocks.setCurrentDocumentScrollPosition.mockReset();
  workbenchMocks.saveAllFiles.mockReset();
  workbenchMocks.writeFileContent.mockReset();
});

const i18n = createI18nInstance('en');

function fixture({
  project = 'p1',
  workspace = 'w1',
  window = 'main',
  pane = 'pane-main',
  instance = 'shell',
  mobile = false,
  visible = true,
} = {}) {
  return (
    <I18nextProvider i18n={i18n}>
      <SearchDraftProvider projectId={project} workspaceId={workspace} windowId={window}>
        {!visible ? null : mobile ? (
          <EditorPanel key={`${instance}:${pane}`} mobilePanel="search" searchPaneId={pane || undefined} />
        ) : (
          <Search key={`${instance}:${pane}`} paneId={pane || undefined} />
        )}
      </SearchDraftProvider>
    </I18nextProvider>
  );
}

const query = () => screen.getByRole('textbox', { name: i18n.t('workbenchSearch.search.aria') }) as HTMLInputElement;

const replacement = () =>
  screen.getByRole('textbox', { name: i18n.t('workbenchSearch.replace.aria') }) as HTMLInputElement;

const matchCase = () => screen.getByRole('button', { name: i18n.t('workbenchSearch.search.toggleCase') });
const regex = () => screen.getByRole('button', { name: i18n.t('workbenchSearch.search.toggleRegex') });

function enterDraft() {
  fireEvent.change(query(), { target: { value: 'alpha' } });
  fireEvent.change(replacement(), { target: { value: 'beta' } });
  fireEvent.click(matchCase());
  fireEvent.click(regex());
}

describe('route-owned Search drafts', () => {
  it('keeps fields and options across shell remounts, without replaying replacement', async () => {
    vi.useFakeTimers();
    runtimeMocks.searchFiles.mockResolvedValue([]);

    const view = render(fixture());
    enterDraft();

    const previous = query();
    view.rerender(fixture({ instance: 'real-chat' }));
    expect(query()).not.toBe(previous);
    expect(query().value).toBe('alpha');
    expect(replacement().value).toBe('beta');
    expect(matchCase().getAttribute('aria-pressed')).toBe('true');
    expect(regex().getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(runtimeMocks.searchFiles).toHaveBeenCalledTimes(1);
    expect(workbenchMocks.writeFileContent).not.toHaveBeenCalled();
    expect(workbenchMocks.saveAllFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(query(), { target: { value: '' } });
    fireEvent.change(replacement(), { target: { value: '' } });
    fireEvent.click(matchCase());
    fireEvent.click(regex());
    view.rerender(fixture({ instance: 'next-shell' }));
    expect(query().value).toBe('');
    expect(replacement().value).toBe('');
    expect(matchCase().getAttribute('aria-pressed')).toBe('false');
    expect(regex().getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['project', 'workspace', 'window'] as const)(
    'discards drafts when %s changes, including on return',
    (scope) => {
      vi.useFakeTimers();

      const view = render(fixture());
      enterDraft();
      view.rerender(fixture({ [scope]: 'other' }));
      expect(query().value).toBe('');
      expect(replacement().value).toBe('');
      expect(matchCase().getAttribute('aria-pressed')).toBe('false');
      view.rerender(fixture());
      expect(query().value).toBe('');
    },
  );

  it('isolates pane drafts within the same route', () => {
    vi.useFakeTimers();

    const view = render(fixture());
    enterDraft();
    view.rerender(fixture({ pane: 'pane-other' }));
    expect(query().value).toBe('');
    fireEvent.change(query(), { target: { value: 'gamma' } });
    view.rerender(fixture());
    expect(query().value).toBe('alpha');
    expect(replacement().value).toBe('beta');
    view.rerender(fixture({ pane: 'pane-other' }));
    expect(query().value).toBe('gamma');
    expect(replacement().value).toBe('');
  });

  it('keeps legacy callers without a pane identity local', () => {
    vi.useFakeTimers();

    const view = render(fixture({ pane: '' }));
    enterDraft();
    view.rerender(fixture({ pane: '', instance: 'real-chat' }));
    expect(query().value).toBe('');
    expect(replacement().value).toBe('');
  });
});

it('preserves the active pane draft through desktop/mobile Search surfaces', () => {
  vi.useFakeTimers();

  const view = render(fixture());
  enterDraft();
  view.rerender(fixture({ mobile: true, instance: 'compact-shell' }));
  expect(screen.getByTestId('mobile-search-panel')).toBeTruthy();
  expect(query().value).toBe('alpha');
  expect(replacement().value).toBe('beta');
  fireEvent.change(query(), { target: { value: 'mobile edit' } });
  view.rerender(fixture({ instance: 'desktop-shell' }));
  expect(query().value).toBe('mobile edit');
  view.rerender(fixture({ mobile: true, workspace: 'w2' }));
  expect(query().value).toBe('');
  expect(replacement().value).toBe('');
});

describe('Search focus during immediate shell replacement', () => {
  it.each(['query', 'replacement'] as const)(
    'transfers %s focus and backward selection only to the replacement field',
    (field) => {
      vi.useFakeTimers();

      const view = render(fixture());
      enterDraft();

      const old = field === 'query' ? query() : replacement();
      old.focus();
      old.setSelectionRange(1, 3, 'backward');
      view.rerender(fixture({ instance: 'real-chat', mobile: true }));

      const current = field === 'query' ? query() : replacement();
      expect(current).not.toBe(old);
      expect(document.activeElement).toBe(current);
      expect([current.selectionStart, current.selectionEnd, current.selectionDirection]).toEqual([1, 3, 'backward']);
    },
  );

  it('does not steal focus from an outside control', () => {
    vi.useFakeTimers();

    const outside = document.createElement('button');
    document.body.append(outside);

    try {
      const view = render(fixture());
      query().focus();
      outside.focus();
      view.rerender(fixture({ instance: 'real-chat' }));
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('expires focus intent when the panel closes before a later return', async () => {
    vi.useFakeTimers();

    const view = render(fixture());
    query().focus();
    view.rerender(fixture({ visible: false }));
    await act(async () => {
      await Promise.resolve();
    });
    view.rerender(fixture({ instance: 'later' }));
    expect(document.activeElement).not.toBe(query());
  });

  it.each(['project', 'workspace', 'window', 'pane'] as const)(
    'never transfers focus across %s navigation',
    (scope) => {
      vi.useFakeTimers();

      const view = render(fixture());
      query().focus();
      view.rerender(fixture({ [scope]: 'other', instance: 'new-scope' }));
      expect(document.activeElement).not.toBe(query());
    },
  );

  it('drops focus when the route provider unmounts', () => {
    vi.useFakeTimers();

    const view = render(fixture());
    query().focus();
    view.unmount();
    render(fixture());
    expect(document.activeElement).not.toBe(query());
  });
});
