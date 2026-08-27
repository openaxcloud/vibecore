import { useStore } from '@nanostores/react';
import * as Tabs from '@radix-ui/react-tabs';
import { EditorAdapter, TouchSymbolToolbar, useResponsiveLayout } from '@vibecore/editor';
import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { EditorHistoryOverlay } from './EditorHistoryOverlay';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { LockManager } from './LockManager'; // <-- Import LockManager
import { Search } from './Search'; // <-- Ensure Search is imported
import { shouldEditorBeReadOnly } from './editor-read-only';
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
import { toast } from '~/components/ui/use-toast';
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
  mobilePanel?: 'files' | 'editor' | 'search' | 'locks' | 'terminal';
}

const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;
const LARGE_FILE_BYTES = 1_000_000;

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    fileHistory,
    onFileSelect,
    onEditorChange,
    onFileSave,
    onFileReset,
    mobilePanel,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const { t } = useTranslation();
    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const layout = useResponsiveLayout();
    const useMobilePanelLayout = layout.isMobile || layout.isTablet;

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

    /*
     * Edit-blocking is scoped to the file the agent currently holds a lock on, not the
     * global stream. A locked dirent (direct lock or inherited from a locked folder) is
     * marked isLocked in the files map, so the open file is read-only only when it is the
     * one being touched — unrelated files stay editable while an agent streams.
     */
    const isCurrentFileLocked = useMemo(() => {
      if (!editorDocument) {
        return false;
      }

      const dirent = files?.[editorDocument.filePath];

      return dirent?.type === 'file' && Boolean(dirent.isLocked);
    }, [editorDocument, files]);

    const editorReadOnly = shouldEditorBeReadOnly({
      hasDocument: editorDocument !== undefined,
      isCurrentFileLocked,
    });
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
              <Tabs.Trigger
                value="files"
                className={classNames('vc-editor-panel-tab')}
                aria-label={t('idePanels.editor.library')}
              >
                {t('idePanels.editor.library')}
              </Tabs.Trigger>
              <Tabs.Trigger value="search" className={classNames('vc-editor-panel-tab')}>
                {t('idePanels.editor.search')}
              </Tabs.Trigger>
              <Tabs.Trigger value="locks" className={classNames('vc-editor-panel-tab')}>
                {t('idePanels.editor.locks')}
              </Tabs.Trigger>
            </Tabs.List>
            {unsavedFiles instanceof Set && unsavedFiles.size > 0 && (
              <button
                type="button"
                onClick={() => void workbenchStore.saveAllFiles()}
                title={t('idePanels.editor.saveAllTitle')}
                aria-label={t('idePanels.editor.unsavedAria', { count: unsavedFiles.size })}
                className="flex items-center shrink-0 gap-1 px-1.5 py-0.5 mr-1 rounded-md text-xs font-medium cursor-pointer text-[var(--vc-ide-accent-action)] hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                style={{ background: 'color-mix(in srgb, var(--vc-ide-accent-action) 12%, transparent)' }}
              >
                <div className="i-ph:floppy-disk" aria-hidden="true" />
                {t('idePanels.editor.unsaved', { count: unsavedFiles.size })}
              </button>
            )}
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
              <div className="vc-editor-header-actions ml-auto -mr-1.5">
                {!useMobilePanelLayout && (
                  <>
                    <div className="vc-editor-header-action-group" data-toolbar-group="navigation">
                      <PanelHeaderButton onClick={() => runEditorCommand('goToDefinition')}>
                        <div className="i-ph:crosshair-simple-duotone" />
                        {t('idePanels.editor.definition')}
                      </PanelHeaderButton>
                      <PanelHeaderButton onClick={() => runEditorCommand('findReferences')}>
                        <div className="i-ph:list-magnifying-glass-duotone" />
                        {t('idePanels.editor.references')}
                      </PanelHeaderButton>
                    </div>
                    <span className="vc-editor-header-action-divider" aria-hidden="true" />
                    <div className="vc-editor-header-action-group" data-toolbar-group="editing">
                      <PanelHeaderButton onClick={() => runEditorCommand('renameSymbol')}>
                        <div className="i-ph:textbox-duotone" />
                        {t('idePanels.editor.rename')}
                      </PanelHeaderButton>
                      <PanelHeaderButton onClick={() => runEditorCommand('refactor')}>
                        <div className="i-ph:magic-wand-duotone" />
                        {t('idePanels.editor.refactor')}
                      </PanelHeaderButton>
                    </div>
                  </>
                )}
                {activeFileUnsaved && (
                  <>
                    {!useMobilePanelLayout && <span className="vc-editor-header-action-divider" aria-hidden="true" />}
                    <div className="vc-editor-header-action-group" data-toolbar-group="save">
                      <PanelHeaderButton className="vc-editor-header-save-button" onClick={onFileSave}>
                        <div className="i-ph:floppy-disk-duotone" />
                        {t('idePanels.editor.save')}
                      </PanelHeaderButton>
                      <PanelHeaderButton onClick={onFileReset}>
                        <div className="i-ph:clock-counter-clockwise-duotone" />
                        {t('idePanels.editor.reset')}
                      </PanelHeaderButton>
                    </div>
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
        <div className="relative h-full flex-1 overflow-hidden modern-scrollbar" data-testid="responsive-code-editor">
          {isLargeFile && (
            <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
              {t('idePanels.editor.largeFile')}
            </div>
          )}
          {isCurrentFileLocked && editorDocument ? (
            <div className="flex items-center justify-between gap-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-bolt-elements-textSecondary">
                <span className="i-ph:lock-simple shrink-0 text-[var(--status-warning-text)]" aria-hidden />
                <span className="truncate">
                  {(() => {
                    const dirent = files?.[editorDocument.filePath];
                    const inheritedFrom = dirent?.type === 'file' ? dirent.lockedByFolder : undefined;

                    return inheritedFrom
                      ? t('idePanels.editor.lockedByFolder', { folder: inheritedFrom })
                      : t('idePanels.editor.fileLocked');
                  })()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  const dirent = files?.[editorDocument.filePath];
                  const inheritedFrom = dirent?.type === 'file' ? dirent.lockedByFolder : undefined;

                  if (inheritedFrom) {
                    workbenchStore.unlockFolder(inheritedFrom);
                    toast.success(t('idePanels.editor.folderUnlocked'));
                  } else {
                    workbenchStore.unlockFile(editorDocument.filePath);
                    toast.success(t('idePanels.editor.fileUnlocked'));
                  }
                }}
                className="shrink-0 rounded-md border border-bolt-elements-borderColor px-2 py-1 font-medium text-[var(--vc-ide-accent-action)] hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
              >
                {t('idePanels.editor.requestUnlock')}
              </button>
            </div>
          ) : null}
          {editorDocument && !editorDocument.isBinary ? (
            <EditorAdapter
              className="h-full w-full"
              value={editorDocument.value}
              filePath={editorDocument.filePath}
              readOnly={editorReadOnly}
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
              {editorDocument?.isBinary ? t('idePanels.editor.binaryUnavailable') : t('idePanels.editor.noFile')}
            </div>
          )}

          {/* File History — bottom-right toggle + standalone panel (independent of Git) */}
          {editorDocument && !editorDocument.isBinary && (
            <EditorHistoryOverlay filePath={editorDocument.filePath} content={editorDocument.value} />
          )}
        </div>
      </div>
    );

    if (useMobilePanelLayout) {
      if (mobilePanel === 'files') {
        return (
          <PanelBoundary title={t('idePanels.editor.files')}>
            <div className="h-full" data-testid="mobile-files-panel">
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
            </div>
          </PanelBoundary>
        );
      }

      if (mobilePanel === 'search') {
        return (
          <PanelBoundary title={t('idePanels.editor.search')}>
            <div className="h-full overflow-auto" data-testid="mobile-search-panel">
              <Search />
            </div>
          </PanelBoundary>
        );
      }

      if (mobilePanel === 'locks') {
        return (
          <PanelBoundary title={t('idePanels.editor.locks')}>
            <div className="h-full overflow-auto" data-testid="mobile-locks-panel">
              <LockManager />
            </div>
          </PanelBoundary>
        );
      }

      if (mobilePanel === 'terminal') {
        return (
          <PanelBoundary title={t('idePanels.editor.shellTerminal')}>
            <div
              className="h-full min-h-0"
              data-testid="mobile-terminal-panel"
              role="region"
              aria-label={t('idePanels.editor.interactiveTerminal')}
            >
              <PanelGroup direction="vertical">
                <TerminalTabs panelDefaultSize={100} />
              </PanelGroup>
            </div>
          </PanelBoundary>
        );
      }

      return <PanelBoundary title={t('idePanels.editor.editor')}>{editorPane}</PanelBoundary>;
    }

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal" autoSaveId="ecode:panels:editor-files">
            <Panel defaultSize={20} minSize={15} collapsible className="border-r border-bolt-elements-borderColor">
              <PanelBoundary title={t('idePanels.editor.files')}>
                <div className="h-full">{fileTabs}</div>
              </PanelBoundary>
            </Panel>

            <PanelResizeHandle />
            <Panel className="flex flex-col" defaultSize={80} minSize={20}>
              <PanelBoundary title={t('idePanels.editor.editor')}>{editorPane}</PanelBoundary>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <PanelBoundary title={t('idePanels.editor.shellTerminal')}>
          <TerminalTabs />
        </PanelBoundary>
      </PanelGroup>
    );
  },
);
