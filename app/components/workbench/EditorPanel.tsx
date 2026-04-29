import { useStore } from '@nanostores/react';
import { memo, useMemo } from 'react';
import { EditorAdapter, TouchSymbolToolbar, useResponsiveLayout } from '@vibecore/editor';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import * as Tabs from '@radix-ui/react-tabs';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import type { FileMap } from '~/lib/stores/files';
import type { FileHistory } from '~/types/actions';
import { themeStore } from '~/lib/stores/theme';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { DEFAULT_TERMINAL_SIZE, TerminalTabs } from './terminal/TerminalTabs';
import { workbenchStore } from '~/lib/stores/workbench';
import { Search } from './Search'; // <-- Ensure Search is imported
import { classNames } from '~/utils/classNames'; // <-- Import classNames if not already present
import { LockManager } from './LockManager'; // <-- Import LockManager

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
  mobilePanel?: 'files' | 'editor' | 'terminal' | 'deploy';
}

const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const editorSettings: EditorSettings = { tabSize: 2 };

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
    onEditorScroll,
    onFileSave,
    onFileReset,
    mobilePanel,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const layout = useResponsiveLayout();
    const useMobilePanelLayout = layout.isMobile || layout.isTabletPortrait;
    const useDesktopEditorAdapter = layout.isDesktop || layout.isTabletLandscape;

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

    const fileTabs = (
      <Tabs.Root defaultValue="files" className="flex flex-col h-full">
        <PanelHeader className="w-full text-sm font-medium text-bolt-elements-textSecondary px-1">
          <div className="h-full flex-shrink-0 flex items-center justify-between w-full">
            <Tabs.List className="h-full flex-shrink-0 flex items-center">
              <Tabs.Trigger
                value="files"
                className={classNames(
                  'h-full bg-transparent hover:bg-bolt-elements-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary data-[state=active]:text-bolt-elements-textPrimary',
                )}
              >
                Files
              </Tabs.Trigger>
              <Tabs.Trigger
                value="search"
                className={classNames(
                  'h-full bg-transparent hover:bg-bolt-elements-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary data-[state=active]:text-bolt-elements-textPrimary',
                )}
              >
                Search
              </Tabs.Trigger>
              <Tabs.Trigger
                value="locks"
                className={classNames(
                  'h-full bg-transparent hover:bg-bolt-elements-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary data-[state=active]:text-bolt-elements-textPrimary',
                )}
              >
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
              {activeFileUnsaved && (
                <div className="flex gap-1 ml-auto -mr-1.5">
                  <PanelHeaderButton onClick={onFileSave}>
                    <div className="i-ph:floppy-disk-duotone" />
                    Save
                  </PanelHeaderButton>
                  <PanelHeaderButton onClick={onFileReset}>
                    <div className="i-ph:clock-counter-clockwise-duotone" />
                    Reset
                  </PanelHeaderButton>
                </div>
              )}
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
          {useDesktopEditorAdapter && editorDocument && !editorDocument.isBinary ? (
            <EditorAdapter
              className="h-full w-full"
              value={editorDocument.value}
              filePath={editorDocument.filePath}
              readOnly={isStreaming || editorDocument === undefined}
              theme={theme === 'dark' ? 'dark' : 'light'}
              autoFocus={!isMobile() && !useMobilePanelLayout}
              onSave={onFileSave}
              onChange={(update) => {
                onEditorChange?.({ content: update.value, selection: undefined as any });
              }}
            />
          ) : (
            <CodeMirrorEditor
              theme={theme}
              editable={!isStreaming && editorDocument !== undefined}
              settings={editorSettings}
              doc={editorDocument}
              autoFocusOnDocumentChange={!isMobile() && !useMobilePanelLayout}
              onScroll={onEditorScroll}
              onChange={onEditorChange}
              onSave={onFileSave}
            />
          )}
        </div>
      </div>
    );

    if (useMobilePanelLayout) {
      if (mobilePanel === 'files') {
        return <div className="h-full">{fileTabs}</div>;
      }

      if (mobilePanel === 'terminal') {
        return (
          <PanelGroup direction="vertical">
            <TerminalTabs />
          </PanelGroup>
        );
      }

      if (mobilePanel === 'deploy') {
        return (
          <div className="flex h-full flex-col bg-bolt-elements-background-depth-1">
            <PanelHeader>Deploy</PanelHeader>
            <div className="flex flex-1 flex-col justify-center gap-3 p-5 text-sm text-bolt-elements-textSecondary">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-bolt-elements-borderColor">
                <div className="i-ph:rocket-launch text-2xl" />
              </div>
              <div className="mx-auto max-w-sm text-center">
                Deploy flows stay connected to the existing Bolt deployment panels and runtime commands.
              </div>
            </div>
          </div>
        );
      }

      return editorPane;
    }

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} collapsible className="border-r border-bolt-elements-borderColor">
              <div className="h-full">{fileTabs}</div>
            </Panel>

            <PanelResizeHandle />
            <Panel className="flex flex-col" defaultSize={80} minSize={20}>
              {editorPane}
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <TerminalTabs />
      </PanelGroup>
    );
  },
);
