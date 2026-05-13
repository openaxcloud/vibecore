import { useStore } from '@nanostores/react';
import * as Tabs from '@radix-ui/react-tabs';
import { EditorAdapter, TouchSymbolToolbar, useResponsiveLayout } from '@vibecore/editor';
import { memo, useEffect, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { LockManager } from './LockManager'; // <-- Import LockManager
import { Search } from './Search'; // <-- Ensure Search is imported
import { DEFAULT_TERMINAL_SIZE, TerminalTabs } from './terminal/TerminalTabs';
import {
  type EditorDocument,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { PanelBoundary } from '~/components/ui/PanelBoundary';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileHistory } from '~/types/actions';
import { classNames } from '~/utils/classNames'; // <-- Import classNames if not already present
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  fileHistory?: Record<string, FileHistory>;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
  mobilePanel?: 'files' | 'editor' | 'terminal';
}

const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;
const LARGE_FILE_BYTES = 1_000_000;

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    fileHistory,
    onFileSelect,
    onEditorChange,
    onFileSave,
    onFileReset,
    mobilePanel,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const layout = useResponsiveLayout();
    const useMobilePanelLayout = layout.isMobile || layout.isTabletPortrait;

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      if (!editorDocument || !unsavedFiles) {
        return false;
      }

      // Make sure unsavedFiles is a Set before calling has()
      return unsavedFiles instanceof Set && unsavedFiles.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);
    const isLargeFile = Boolean(
      editorDocument && !editorDocument.isBinary && editorDocument.value.length > LARGE_FILE_BYTES,
    );
    const editorProjectFiles = useMemo(() => {
      return Object.fromEntries(
        Object.entries(files ?? {})
          .filter((entry): entry is [string, NonNullable<FileMap[string]> & { type: 'file'; content: string }] => {
            const [, file] = entry;

            return file?.type === 'file' && !file.isBinary;
          })
          .map(([filePath, file]) => [filePath, file.content]),
      );
    }, [files]);

    useEffect(() => {
      const handleOpenEditorFile = (event: Event) => {
        const filePath = (event as CustomEvent<{ filePath?: string }>).detail?.filePath;

        if (!filePath) {
          return;
        }

        const exactPath = files?.[filePath]
          ? filePath
          : Object.keys(files ?? {}).find((path) => path.endsWith(filePath));

        if (exactPath) {
          onFileSelect?.(exactPath);
        }
      };

      window.addEventListener('vibecore:open-editor-file', handleOpenEditorFile);

      return () => window.removeEventListener('vibecore:open-editor-file', handleOpenEditorFile);
    }, [files, onFileSelect]);

    const runEditorCommand = (command: string) => {
      window.dispatchEvent(new CustomEvent('vibecore:editor-command', { detail: { command } }));
    };

    const fileTabs = (
      <Tabs.Root defaultValue="files" className="flex flex-col h-full">
        <PanelHeader className="w-full text-sm font-medium text-bolt-elements-textSecondary px-1">
          <div className="h-full flex-shrink-0 flex items-center justify-between w-full">
            <Tabs.List className="vc-editor-panel-tabs h-full flex-shrink-0 flex items-center">
              <Tabs.Trigger value="files" className={classNames('vc-editor-panel-tab')}>
                Files
              </Tabs.Trigger>
              <Tabs.Trigger value="search" className={classNames('vc-editor-panel-tab')}>
                Search
              </Tabs.Trigger>
              <Tabs.Trigger value="locks" className={classNames('vc-editor-panel-tab')}>
                Locks
              </Tabs.Trigger>
            </Tabs.List>
          </div>
        </PanelHeader>

        <Tabs.Content value="files" className="flex-grow overflow-auto focus-visible:outline-none">
          <FileTree
            className="h-full"
            files={files}
            hideRoot
            unsavedFiles={unsavedFiles}
            fileHistory={fileHistory}
            rootFolder={WORK_DIR}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        </Tabs.Content>

        <Tabs.Content value="search" className="flex-grow overflow-auto focus-visible:outline-none">
          <Search />
        </Tabs.Content>

        <Tabs.Content value="locks" className="flex-grow overflow-auto focus-visible:outline-none">
          <LockManager />
        </Tabs.Content>
      </Tabs.Root>
    );

    const editorPane = (
      <div className="flex h-full flex-col">
        <PanelHeader className="overflow-x-auto">
          {activeFileSegments?.length && (
            <div className="flex items-center flex-1 text-sm">
              <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
              <div className="flex gap-1 ml-auto -mr-1.5">
                {!useMobilePanelLayout && (
                  <>
                    <PanelHeaderButton onClick={() => runEditorCommand('goToDefinition')}>
                      <div className="i-ph:crosshair-simple-duotone" />
                      Definition
                    </PanelHeaderButton>
                    <PanelHeaderButton onClick={() => runEditorCommand('findReferences')}>
                      <div className="i-ph:list-magnifying-glass-duotone" />
                      References
                    </PanelHeaderButton>
                    <PanelHeaderButton onClick={() => runEditorCommand('renameSymbol')}>
                      <div className="i-ph:textbox-duotone" />
                      Rename
                    </PanelHeaderButton>
                    <PanelHeaderButton onClick={() => runEditorCommand('refactor')}>
                      <div className="i-ph:magic-wand-duotone" />
                      Refactor
                    </PanelHeaderButton>
                  </>
                )}
                {activeFileUnsaved && (
                  <>
                    <PanelHeaderButton onClick={onFileSave}>
                      <div className="i-ph:floppy-disk-duotone" />
                      Save
                    </PanelHeaderButton>
                    <PanelHeaderButton onClick={onFileReset}>
                      <div className="i-ph:clock-counter-clockwise-duotone" />
                      Reset
                    </PanelHeaderButton>
                  </>
                )}
              </div>
            </div>
          )}
        </PanelHeader>
        {useMobilePanelLayout && (
          <TouchSymbolToolbar
            onInsert={(text) => {
              window.dispatchEvent(new CustomEvent('bolt:insert-editor-text', { detail: { text } }));
            }}
          />
        )}
        <div className="h-full flex-1 overflow-hidden modern-scrollbar" data-testid="responsive-code-editor">
          {isLargeFile && (
            <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
              Large file mode: rich editor features are reduced to keep typing and scrolling responsive.
            </div>
          )}
          {editorDocument && !editorDocument.isBinary ? (
            <EditorAdapter
              className="h-full w-full"
              value={editorDocument.value}
              filePath={editorDocument.filePath}
              readOnly={isStreaming || editorDocument === undefined}
              theme={theme === 'dark' ? 'dark' : 'light'}
              autoFocus={!isMobile() && !useMobilePanelLayout}
              largeFile={isLargeFile}
              projectFiles={editorProjectFiles}
              onSave={onFileSave}
              onChange={(update) => {
                onEditorChange?.({ content: update.value, selection: undefined as any });
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-bolt-elements-textSecondary">
              {editorDocument?.isBinary
                ? 'Binary file preview is not available in the mobile editor.'
                : 'No file selected.'}
            </div>
          )}
        </div>
      </div>
    );

    if (useMobilePanelLayout) {
      if (mobilePanel === 'files') {
        return (
          <PanelBoundary title="Files">
            <div className="h-full" data-testid="mobile-files-panel">
              {fileTabs}
            </div>
          </PanelBoundary>
        );
      }

      if (mobilePanel === 'terminal') {
        return (
          <PanelBoundary title="Terminal">
            <PanelGroup direction="vertical">
              <TerminalTabs panelDefaultSize={100} />
            </PanelGroup>
          </PanelBoundary>
        );
      }

      return <PanelBoundary title="Editor">{editorPane}</PanelBoundary>;
    }

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} collapsible className="border-r border-bolt-elements-borderColor">
              <PanelBoundary title="Files">
                <div className="h-full">{fileTabs}</div>
              </PanelBoundary>
            </Panel>

            <PanelResizeHandle />
            <Panel className="flex flex-col" defaultSize={80} minSize={20}>
              <PanelBoundary title="Editor">{editorPane}</PanelBoundary>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <PanelBoundary title="Terminal">
          <TerminalTabs />
        </PanelBoundary>
      </PanelGroup>
    );
  },
);
