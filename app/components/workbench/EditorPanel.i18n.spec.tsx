/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const layoutState = vi.hoisted(() => ({ isMobile: false, isTablet: false }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn() }));

const workbenchMocks = vi.hoisted(() => ({
  saveAllFiles: vi.fn(),
  unlockFile: vi.fn(),
  unlockFolder: vi.fn(),
}));

vi.mock('@nanostores/react', () => ({ useStore: () => false }));
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
vi.mock('./Search', () => ({ Search: () => <div data-testid="search-panel" /> }));
vi.mock('./terminal/TerminalTabs', () => ({
  DEFAULT_TERMINAL_SIZE: 30,
  TerminalTabs: () => <div data-testid="terminal-tabs" />,
}));
vi.mock('~/components/ui/PanelBoundary', () => ({
  PanelBoundary: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}));
vi.mock('~/components/ui/PanelHeader', () => ({
  PanelHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/components/ui/PanelHeaderButton', () => ({
  PanelHeaderButton: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock('~/components/ui/use-toast', () => ({ toast: toastMocks }));
vi.mock('~/lib/stores/theme', () => ({ themeStore: {} }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showTerminal: {},
    saveAllFiles: workbenchMocks.saveAllFiles,
    unlockFile: workbenchMocks.unlockFile,
    unlockFolder: workbenchMocks.unlockFolder,
  },
}));
vi.mock('~/utils/mobile', () => ({ isMobile: () => false }));

import { EditorPanel } from './EditorPanel';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderFrench(node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance('fr')}>{node}</I18nextProvider>);
}

afterEach(() => {
  cleanup();
  layoutState.isMobile = false;
  layoutState.isTablet = false;
  toastMocks.success.mockReset();
  workbenchMocks.saveAllFiles.mockReset();
  workbenchMocks.unlockFile.mockReset();
  workbenchMocks.unlockFolder.mockReset();
});

describe('EditorPanel i18n', () => {
  it('renders the desktop editor chrome in French', () => {
    renderFrench(<EditorPanel />);

    expect(screen.getByRole('button', { name: 'Bibliothèque' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rechercher' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verrous' })).toBeTruthy();
    expect(screen.getByLabelText('Fichiers')).toBeTruthy();
    expect(screen.getByLabelText('Éditeur')).toBeTruthy();
    expect(screen.getByLabelText('Shell (terminal)')).toBeTruthy();
    expect(screen.getByText('Aucun fichier sélectionné.')).toBeTruthy();
    expect(screen.queryByText('No file selected.')).toBeNull();
  });

  it('localizes editor actions, plurals and lock recovery while preserving file paths', () => {
    const filePath = '/workspace/src/Feature.tsx';
    const lockedFolder = '/workspace/src';

    renderFrench(
      <EditorPanel
        files={{
          [filePath]: {
            type: 'file',
            content: 'x'.repeat(1_000_001),
            isBinary: false,
            isLocked: true,
            lockedByFolder: lockedFolder,
          },
        }}
        unsavedFiles={new Set([filePath])}
        editorDocument={{ filePath, value: 'x'.repeat(1_000_001), isBinary: false }}
        selectedFile={filePath}
      />,
    );

    expect(screen.getByRole('button', { name: '1 fichier non enregistré. Tout enregistrer.' })).toBeTruthy();
    expect(screen.getByText('1 non enregistré')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Définition' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Références' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renommer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refactoriser' })).toBeTruthy();
    expect(screen.getByText(/Mode fichier volumineux/u)).toBeTruthy();
    expect(
      screen.getByText(`Verrouillé par le dossier ${lockedFolder} — protégé contre les modifications de l’IA.`),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Demander le déverrouillage' }));
    expect(workbenchMocks.unlockFolder).toHaveBeenCalledWith(lockedFolder);
    expect(toastMocks.success).toHaveBeenCalledWith(
      'Dossier déverrouillé — ses fichiers peuvent de nouveau être modifiés.',
    );
    expect(screen.getByTestId('editor-adapter').textContent).toBe(filePath);
  });

  it('localizes the tablet/mobile wrapper without changing TerminalTabs', () => {
    layoutState.isMobile = true;

    renderFrench(<EditorPanel mobilePanel="terminal" />);

    expect(screen.getByLabelText('Shell (terminal)')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Terminal interactif' })).toBeTruthy();
    expect(screen.getByTestId('terminal-tabs')).toBeTruthy();
  });
});
