import { useStore } from '@nanostores/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { WorkspaceStatus } from '@vibecore/runtime-contract';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { resolveCopyContent } from './file-tree-copy';
import { computeFileDiffStats } from './file-tree-diff-stats';
import { resolveEmptyExplorerState } from './file-tree-empty-state';
import { buildOverwritePrompt, findUploadCollisions } from './file-tree-upload-collision';
import { toRuntimeRelativePath } from './search-replace';
import { GitStatusBadge } from '~/components/git/GitStatusBadge';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  isFileLocked as readFileLockedFromStorage,
  isFolderLocked as readFolderLockedFromStorage,
} from '~/lib/persistence/lockedFiles';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileHistory } from '~/types/actions';
import { classNames } from '~/utils/classNames';
import {
  buildFileOutline,
  buildFileTimeline,
  gitStatusForPath,
  materialFileIcon,
  normalizeWorkspacePath,
  type GitFileStatus,
  type OutlineSymbol,
} from '~/utils/fileExplorerMetadata';
import { getCurrentChatId } from '~/utils/fileLocks';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { path } from '~/utils/path';

const logger = createScopedLogger('FileTree');

const NODE_BASE_PADDING_LEFT = 0;
const NODE_PADDING_LEFT = 6;

function FileTreeName({ name, className }: { name: string; className?: string }) {
  return (
    <span className={classNames('bolt-file-tree-name', className)} title={name}>
      {name}
    </span>
  );
}

const DEFAULT_HIDDEN_FILES = [
  /\/node_modules(?:\/|$)/,
  /\/\.next(?:\/|$)/,
  /\/\.astro(?:\/|$)/,
  /\/\.vite(?:\/|$)/,
  /\/deps_temp_[^/]+(?:\/|$)/,

  // ext4 filesystem artifact at the volume root of a fresh workspace — not a user file.
  /\/lost\+found(?:\/|$)/,
];

interface Props {
  files?: FileMap;
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: boolean;
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  fileHistory?: Record<string, FileHistory>;
  className?: string;
  onFilePreview?: (filePath: string) => void;
  onFileOpen?: (filePath: string) => void;
  enableWorkspaceViews?: boolean;
  openEditors?: OpenEditorEntry[];
  gitStatusByPath?: Record<string, GitFileStatus | string | undefined>;
  showHiddenFiles?: boolean;

  /*
   * Workspace lifecycle, used to give the empty file list an honest reason:
   * loading vs crashed vs genuinely empty. When omitted these are read from the
   * workbench store so callers (e.g. EditorPanel) need not thread them through.
   */
  workspaceLoading?: boolean;
  workspaceStatus?: WorkspaceStatus;
  workspaceError?: string;
  onReconnectWorkspace?: () => void;
}

interface OpenEditorEntry {
  id: string;
  filePath: string;
  label?: string;
  dirty?: boolean;
  pinned?: boolean;
}

interface InlineInputProps {
  depth: number;
  placeholder: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const FileTree = memo(
  ({
    files = {},
    onFileSelect,
    selectedFile,
    rootFolder,
    hideRoot = false,
    collapsed = false,
    allowFolderSelection = false,
    hiddenFiles,
    className,
    unsavedFiles,
    fileHistory = {},
    onFilePreview,
    onFileOpen,
    enableWorkspaceViews = false,
    openEditors = [],
    gitStatusByPath,
    showHiddenFiles = false,
    workspaceLoading: workspaceLoadingProp,
    workspaceStatus: workspaceStatusProp,
    workspaceError: workspaceErrorProp,
    onReconnectWorkspace,
  }: Props) => {
    renderLogger.trace('FileTree');

    /*
     * Read workspace lifecycle from the store unless the caller overrode it.
     * Hooks must run unconditionally, so subscribe regardless and prefer the
     * explicit props when supplied.
     */
    const storeWorkspaceLoading = useStore(workbenchStore.workspaceLoading);
    const storeWorkspaceSession = useStore(workbenchStore.workspaceStatus);
    const storeWorkspaceError = useStore(workbenchStore.workspaceError);

    const workspaceLoading = workspaceLoadingProp ?? storeWorkspaceLoading;
    const workspaceStatus = workspaceStatusProp ?? storeWorkspaceSession?.status;
    const workspaceError = workspaceErrorProp ?? storeWorkspaceError;
    const hasWorkspace = Boolean(storeWorkspaceSession) || workspaceStatusProp !== undefined;

    const reconnectWorkspace = useCallback(() => {
      if (onReconnectWorkspace) {
        onReconnectWorkspace();
        return;
      }

      workbenchStore.loadRuntimeFiles('.').catch((error) => {
        logger.error('Failed to reconnect workspace files', error);
      });
    }, [onReconnectWorkspace]);

    const computedHiddenFiles = useMemo(
      () => (showHiddenFiles ? [] : [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])]),
      [hiddenFiles, showHiddenFiles],
    );

    const fileList = useMemo(() => {
      return buildFileList(files, rootFolder, hideRoot, computedHiddenFiles);
    }, [files, rootFolder, hideRoot, computedHiddenFiles]);

    const [collapsedFolders, setCollapsedFolders] = useState(() => {
      return collapsed
        ? new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath))
        : new Set<string>();
    });

    const [activeView, setActiveView] = useState<'files' | 'open' | 'outline' | 'timeline' | 'bookmarks'>('files');
    const [dropActive, setDropActive] = useState(false);

    // G5: dropped-upload overwrite collisions confirm via dialog, not window.confirm.
    const [pendingOverwriteUpload, setPendingOverwriteUpload] = useState<{
      files: File[];
      targetFolder: string;
      message: string;
    } | null>(null);

    const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
      if (typeof localStorage === 'undefined') {
        return new Set();
      }

      try {
        return new Set(JSON.parse(localStorage.getItem('vibecore:file-bookmarks') ?? '[]'));
      } catch {
        return new Set();
      }
    });

    useEffect(() => {
      if (collapsed) {
        setCollapsedFolders(new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath)));
        return;
      }

      setCollapsedFolders((prevCollapsed) => {
        const newCollapsed = new Set<string>();

        for (const folder of fileList) {
          if (folder.kind === 'folder' && prevCollapsed.has(folder.fullPath)) {
            newCollapsed.add(folder.fullPath);
          }
        }

        return newCollapsed;
      });
    }, [fileList, collapsed]);

    const filteredFileList = useMemo(() => {
      const list = [];

      let lastDepth = Number.MAX_SAFE_INTEGER;

      for (const fileOrFolder of fileList) {
        const depth = fileOrFolder.depth;

        // if the depth is equal we reached the end of the collaped group
        if (lastDepth === depth) {
          lastDepth = Number.MAX_SAFE_INTEGER;
        }

        // ignore collapsed folders
        if (collapsedFolders.has(fileOrFolder.fullPath)) {
          lastDepth = Math.min(lastDepth, depth);
        }

        // ignore files and folders below the last collapsed folder
        if (lastDepth < depth) {
          continue;
        }

        list.push(fileOrFolder);
      }

      return list;
    }, [fileList, collapsedFolders]);

    const outline = useMemo(() => buildFileOutline(selectedFile, files), [files, selectedFile]);

    const timeline = useMemo(
      () => buildFileTimeline(files, fileHistory, gitStatusByPath),
      [files, fileHistory, gitStatusByPath],
    );

    const visibleBookmarks = useMemo(
      () => [...bookmarks].filter((filePath) => files[filePath]?.type === 'file'),
      [bookmarks, files],
    );

    const persistBookmarks = useCallback((next: Set<string>) => {
      setBookmarks(next);

      try {
        localStorage.setItem('vibecore:file-bookmarks', JSON.stringify([...next]));
      } catch (error) {
        logger.warn('Failed to persist file bookmarks', error);
      }
    }, []);

    const toggleBookmark = useCallback(
      (filePath: string) => {
        const next = new Set(bookmarks);

        if (next.has(filePath)) {
          next.delete(filePath);
          toast.info('Bookmark removed');
        } else {
          next.add(filePath);
          toast.success('Bookmark added');
        }

        persistBookmarks(next);
      },
      [bookmarks, persistBookmarks],
    );

    const toggleCollapseState = (fullPath: string) => {
      setCollapsedFolders((prevSet) => {
        const newSet = new Set(prevSet);

        if (newSet.has(fullPath)) {
          newSet.delete(fullPath);
        } else {
          newSet.add(fullPath);
        }

        return newSet;
      });
    };

    const onCopyPath = (fileOrFolder: FileNode | FolderNode) => {
      try {
        navigator.clipboard.writeText(fileOrFolder.fullPath);
      } catch (error) {
        logger.error(error);
      }
    };

    const onCopyRelativePath = (fileOrFolder: FileNode | FolderNode) => {
      try {
        navigator.clipboard.writeText(fileOrFolder.fullPath.substring((rootFolder || '').length));
      } catch (error) {
        logger.error(error);
      }
    };

    const performDroppedUpload = useCallback(async (droppedFiles: File[], targetFolder: string) => {
      for (const file of droppedFiles) {
        try {
          const filePath = path.join(targetFolder, file.name);
          const binaryContent = new Uint8Array(await file.arrayBuffer());
          const success = await workbenchStore.createFile(filePath, binaryContent);

          if (success) {
            toast.success(`Uploaded ${file.name}`);
          } else {
            toast.error(`Failed to upload ${file.name}`);
          }
        } catch (error) {
          toast.error(`Error uploading ${file.name}`);
          logger.error(error);
        }
      }
    }, []);

    const uploadDroppedFiles = useCallback(
      async (event: React.DragEvent, targetFolder = rootFolder ?? '/') => {
        event.preventDefault();
        event.stopPropagation();
        setDropActive(false);

        const droppedFiles = Array.from(event.dataTransfer.files ?? []);

        if (droppedFiles.length === 0) {
          return;
        }

        /*
         * createFile overwrites any existing (unlocked) entry with no confirm, so a
         * drag-drop of e.g. logo.png into a folder that already has one would silently
         * clobber the original bytes. Mirror the collision guard the menu actions use.
         */
        const collisions = findUploadCollisions(droppedFiles, targetFolder, workbenchStore.files.get());

        if (collisions.length > 0) {
          setPendingOverwriteUpload({
            files: droppedFiles,
            targetFolder,
            message: buildOverwritePrompt(collisions),
          });
          return;
        }

        await performDroppedUpload(droppedFiles, targetFolder);
      },
      [rootFolder, performDroppedUpload],
    );

    const openFileAtLine = useCallback(
      (filePath: string, line?: number) => {
        onFilePreview?.(filePath);
        onFileSelect?.(filePath);

        if (typeof line === 'number') {
          workbenchStore.setCurrentDocumentScrollPosition({ line: Math.max(0, line - 1), column: 0 });
        }
      },
      [onFilePreview, onFileSelect],
    );

    const renderFileRow = (
      filePath: string,
      meta?: { detail?: string; status?: GitFileStatus; line?: number; key?: string },
    ) => {
      const icon = materialFileIcon(filePath);
      const label = filePath.split('/').pop() ?? filePath;
      const relativePath = normalizeWorkspacePath(filePath);

      return (
        <button
          key={meta?.key ?? `${filePath}:${meta?.detail ?? ''}:${meta?.line ?? ''}`}
          type="button"
          className={classNames(
            'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-item-contentActive',
            {
              'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': selectedFile === filePath,
            },
          )}
          title={relativePath}
          onClick={() => openFileAtLine(filePath, meta?.line)}
          onDoubleClick={() => onFileOpen?.(filePath)}
        >
          <span className={classNames('size-4 shrink-0', icon.icon)} style={{ color: icon.color }} aria-hidden />
          <span className="min-w-0 flex-1">
            <FileTreeName name={label} className="block text-xs font-medium" />
            <span className="block truncate text-[11px] text-bolt-elements-textTertiary">
              {meta?.detail ?? relativePath}
            </span>
          </span>
          {meta?.status && <GitStatusPill status={meta.status} />}
        </button>
      );
    };

    return (
      <div
        className={classNames('bolt-project-file-tree text-sm', className, 'overflow-y-auto modern-scrollbar relative')}
        onDragOver={(event) => {
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => void uploadDroppedFiles(event)}
      >
        <ConfirmationDialog
          isOpen={pendingOverwriteUpload !== null}
          onClose={() => setPendingOverwriteUpload(null)}
          onConfirm={() => {
            const pending = pendingOverwriteUpload;
            setPendingOverwriteUpload(null);

            if (pending) {
              void performDroppedUpload(pending.files, pending.targetFolder);
            }
          }}
          title="Overwrite existing files?"
          description={<span className="whitespace-pre-line">{pendingOverwriteUpload?.message}</span>}
          confirmLabel="Overwrite"
          variant="destructive"
        />
        {enableWorkspaceViews && (
          <div className="bolt-file-tree-view-switcher-shell sticky top-0 z-10 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/95 px-1.5 py-2 pr-3 backdrop-blur">
            <div
              className="bolt-file-tree-view-switcher grid grid-cols-5 gap-0.5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-0.5"
              role="toolbar"
              aria-label="File explorer views"
            >
              {[
                ['files', 'Files', 'i-ph:file-text'],
                ['open', 'Open editors', 'i-ph:tabs'],
                ['outline', 'Outline', 'i-ph:list-bullets'],
                ['timeline', 'Timeline', 'i-ph:clock-counter-clockwise'],
                ['bookmarks', 'Bookmarks', 'i-ph:bookmark-simple'],
              ].map(([view, label, icon]) => (
                <Tooltip.Root key={view} delayDuration={0}>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={activeView === view}
                      title={label}
                      data-vc-radix-tooltip="true"
                      className={classNames(
                        'flex h-7 min-w-0 items-center justify-center rounded-md text-bolt-elements-textTertiary',
                        {
                          'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm':
                            activeView === view,
                          'hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary':
                            activeView !== view,
                        },
                      )}
                      onClick={() => setActiveView(view as typeof activeView)}
                    >
                      <span className={classNames('size-4', icon)} aria-hidden />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="top"
                      sideOffset={8}
                      collisionPadding={12}
                      className="bolt-project-tooltip-content"
                    >
                      {label}
                      <Tooltip.Arrow className="bolt-project-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ))}
            </div>
          </div>
        )}

        {dropActive && (
          <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border border-dashed border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-2/90 text-bolt-elements-item-contentAccent">
            <div className="flex items-center gap-2 rounded-lg bg-bolt-elements-background-depth-1 px-3 py-2 shadow-lg">
              <span className="i-ph:upload-simple size-4" aria-hidden />
              Drop files to upload
            </div>
          </div>
        )}

        {activeView === 'open' &&
          (openEditors.length ? (
            <div className="space-y-1 p-2">
              {openEditors.map((editor) =>
                renderFileRow(editor.filePath, {
                  key: editor.id,
                  detail: editor.dirty
                    ? 'Unsaved changes'
                    : editor.pinned
                      ? 'Pinned editor'
                      : normalizeWorkspacePath(editor.filePath),
                  status: gitStatusForPath(gitStatusByPath, editor.filePath),
                }),
              )}
            </div>
          ) : (
            <EmptyExplorerState
              icon="i-ph:tabs"
              title="No open editors"
              description="Open a file to pin it in this view."
            />
          ))}

        {activeView === 'outline' &&
          (outline.length ? (
            <OutlineView
              symbols={outline}
              onSelect={(symbol) => selectedFile && openFileAtLine(selectedFile, symbol.line)}
            />
          ) : (
            <EmptyExplorerState
              icon="i-ph:list-bullets"
              title="No outline available"
              description="Open a source file to inspect symbols and headings."
            />
          ))}

        {activeView === 'timeline' &&
          (timeline.length ? (
            <div className="space-y-1 p-2">
              {timeline.map((entry) =>
                renderFileRow(entry.filePath, {
                  detail: entry.detail,
                  status: entry.status,
                }),
              )}
            </div>
          ) : (
            <EmptyExplorerState
              icon="i-ph:clock-counter-clockwise"
              title="No timeline yet"
              description="Edits and Git changes will appear here."
            />
          ))}

        {activeView === 'bookmarks' &&
          (visibleBookmarks.length ? (
            <div className="space-y-1 p-2">
              {visibleBookmarks.map((filePath) =>
                renderFileRow(filePath, {
                  detail: 'Bookmarked file',
                  status: gitStatusForPath(gitStatusByPath, filePath),
                }),
              )}
            </div>
          ) : (
            <EmptyExplorerState
              icon="i-ph:bookmark-simple"
              title="No bookmarks"
              description="Use the file context menu to bookmark important files."
            />
          ))}

        {activeView === 'files' &&
          (filteredFileList.length ? (
            filteredFileList.map((fileOrFolder) => {
              switch (fileOrFolder.kind) {
                case 'file': {
                  return (
                    <File
                      key={fileOrFolder.id}
                      selected={selectedFile === fileOrFolder.fullPath}
                      file={fileOrFolder}
                      unsavedChanges={unsavedFiles instanceof Set && unsavedFiles.has(fileOrFolder.fullPath)}
                      gitStatus={gitStatusForPath(gitStatusByPath, fileOrFolder.fullPath)}
                      bookmarked={bookmarks.has(fileOrFolder.fullPath)}
                      fileHistory={fileHistory}
                      onToggleBookmark={() => toggleBookmark(fileOrFolder.fullPath)}
                      onCopyPath={() => {
                        onCopyPath(fileOrFolder);
                      }}
                      onCopyRelativePath={() => {
                        onCopyRelativePath(fileOrFolder);
                      }}
                      onClick={() => {
                        onFilePreview?.(fileOrFolder.fullPath);
                        onFileSelect?.(fileOrFolder.fullPath);
                      }}
                      onDoubleClick={() => {
                        onFileOpen?.(fileOrFolder.fullPath);
                      }}
                    />
                  );
                }
                case 'folder': {
                  return (
                    <Folder
                      key={fileOrFolder.id}
                      folder={fileOrFolder}
                      selected={allowFolderSelection && selectedFile === fileOrFolder.fullPath}
                      collapsed={collapsedFolders.has(fileOrFolder.fullPath)}
                      onCopyPath={() => {
                        onCopyPath(fileOrFolder);
                      }}
                      onCopyRelativePath={() => {
                        onCopyRelativePath(fileOrFolder);
                      }}
                      onClick={() => {
                        toggleCollapseState(fileOrFolder.fullPath);
                      }}
                    />
                  );
                }
                default: {
                  return undefined;
                }
              }
            })
          ) : (
            <EmptyExplorerState
              {...resolveEmptyExplorerState({
                filesEmpty: filteredFileList.length === 0,
                workspaceLoading,
                workspaceStatus,
                workspaceError,
                hasWorkspace,
              })}
              onReconnect={reconnectWorkspace}
            />
          ))}
      </div>
    );
  },
);

export default FileTree;

interface FolderProps {
  folder: FolderNode;
  collapsed: boolean;
  selected?: boolean;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onClick: () => void;
  onDoubleClick?: () => void;
}

interface FolderContextMenuProps {
  onCopyPath?: () => void;
  onCopyRelativePath?: () => void;
  children: ReactNode;
}

function ContextMenuItem({ onSelect, children }: { onSelect?: () => void; children: ReactNode }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className="flex items-center gap-2 px-2 py-1.5 outline-0 text-sm text-bolt-elements-textPrimary cursor-pointer ws-nowrap text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive hover:bg-bolt-elements-item-backgroundActive rounded-md"
    >
      <span className="size-4 shrink-0"></span>
      <span>{children}</span>
    </ContextMenu.Item>
  );
}

function InlineInput({ depth, placeholder, initialValue = '', onSubmit, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();

        if (initialValue) {
          inputRef.current.value = initialValue;
          inputRef.current.select();
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [initialValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = inputRef.current?.value?.trim();

      if (value) {
        onSubmit(value);
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center w-full px-2 bg-bolt-elements-background-depth-4 border border-bolt-elements-item-contentAccent py-0.5 text-bolt-elements-textPrimary"
      style={{ paddingLeft: `${NODE_BASE_PADDING_LEFT + depth * NODE_PADDING_LEFT}px` }}
    >
      <div className="scale-120 shrink-0 i-ph:file-plus text-bolt-elements-textTertiary" />
      <input
        ref={inputRef}
        type="text"
        className="ml-2 flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary min-w-0"
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setTimeout(() => {
            if (document.activeElement !== inputRef.current) {
              onCancel();
            }
          }, 100);
        }}
      />
    </div>
  );
}

function FileContextMenu({
  onCopyPath,
  onCopyRelativePath,
  fullPath,
  children,
  bookmarked,
  onToggleBookmark,
}: FolderContextMenuProps & { fullPath: string; bookmarked?: boolean; onToggleBookmark?: () => void }) {
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // G5: dropped-upload overwrite collisions confirm via dialog, not window.confirm.
  const [pendingOverwriteDrop, setPendingOverwriteDrop] = useState<{ files: File[]; message: string } | null>(null);
  const depth = useMemo(() => fullPath.split('/').length, [fullPath]);
  const fileName = useMemo(() => path.basename(fullPath), [fullPath]);
  const runtimeAdapter = useRuntimeAdapter();

  /*
   * Resolve the bytes to copy for a rename/duplicate. In remote-kubernetes mode
   * the tree is loaded with content stripped, so an unopened file's store entry
   * has content === '' (a placeholder, not a real empty file). Copying that
   * placeholder writes an EMPTY file — and rename then deletes the original,
   * destroying the only real copy. Hydrate the true on-disk content from the
   * runtime first (same as Search's Replace All) so the copy is faithful.
   */
  const resolveContentForCopy = useCallback(
    (entryPath: string, entry: { content: string; isBinary?: boolean }) =>
      resolveCopyContent(entry, async () =>
        runtimeAdapter.readFile(toRuntimeRelativePath(entryPath, runtimeAdapter.workdir)),
      ),
    [runtimeAdapter],
  );

  const isFolder = useMemo(() => {
    const files = workbenchStore.files.get();
    const fileEntry = files[fullPath];

    return !fileEntry || fileEntry.type === 'folder';
  }, [fullPath]);

  const targetPath = useMemo(() => {
    return isFolder ? fullPath : path.dirname(fullPath);
  }, [fullPath, isFolder]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const performDrop = useCallback(
    async (droppedFiles: File[]) => {
      for (const file of droppedFiles) {
        try {
          const filePath = path.join(targetPath, file.name);

          // Convert file to binary data (Uint8Array)
          const arrayBuffer = await file.arrayBuffer();
          const binaryContent = new Uint8Array(arrayBuffer);

          const success = await workbenchStore.createFile(filePath, binaryContent);

          if (success) {
            toast.success(`File ${file.name} uploaded successfully`);
          } else {
            toast.error(`Failed to upload file ${file.name}`);
          }
        } catch (error) {
          toast.error(`Error uploading ${file.name}`);
          logger.error(error);
        }
      }
    },
    [targetPath],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items = Array.from(e.dataTransfer.items);

      const droppedFiles = items
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => file != null);

      /*
       * createFile overwrites any existing (unlocked) entry with no confirm, so dropping
       * a file onto a folder that already contains one of that name would silently clobber
       * it. Mirror the collision guard used by New File / Rename / Duplicate.
       */
      const collisions = findUploadCollisions(droppedFiles, targetPath, workbenchStore.files.get());

      if (collisions.length > 0) {
        setPendingOverwriteDrop({ files: droppedFiles, message: buildOverwritePrompt(collisions) });
        setIsDragging(false);

        return;
      }

      await performDrop(droppedFiles);

      setIsDragging(false);
    },
    [fullPath, performDrop],
  );

  const handleCreateFile = async (fileName: string) => {
    const newFilePath = path.join(targetPath, fileName);

    /*
     * Don't let "New File" clobber an existing file. createFile only refuses
     * LOCKED targets, so without this an existing unlocked file at the typed name
     * is silently truncated to empty — data loss with no confirm.
     */
    if (workbenchStore.files.get()[newFilePath]) {
      toast.error(`A file or folder named "${fileName}" already exists`);
      setIsCreatingFile(false);

      return;
    }

    const success = await workbenchStore.createFile(newFilePath, '');

    if (success) {
      toast.success('File created successfully');
    } else {
      toast.error('Failed to create file');
    }

    setIsCreatingFile(false);
  };

  const handleCreateFolder = async (folderName: string) => {
    const newFolderPath = path.join(targetPath, folderName);

    // Same collision guard as New File — don't clobber an existing entry.
    if (workbenchStore.files.get()[newFolderPath]) {
      toast.error(`A file or folder named "${folderName}" already exists`);
      setIsCreatingFolder(false);

      return;
    }

    const success = await workbenchStore.createFolder(newFolderPath);

    if (success) {
      toast.success('Folder created successfully');
    } else {
      toast.error('Failed to create folder');
    }

    setIsCreatingFolder(false);
  };

  const handleDelete = () => {
    /*
     * Respect file/folder locks, same as the editor / AI writes / Search.
     * Without this a right-click → Delete permanently wipes a file the user
     * explicitly locked to protect — defeating the lock feature.
     */
    const deleteLock = isFolder ? workbenchStore.isFolderLocked(fullPath) : workbenchStore.isFileLocked(fullPath);

    if ('locked' in deleteLock ? deleteLock.locked : deleteLock.isLocked) {
      toast.error(`This ${isFolder ? 'folder' : 'file'} is locked and cannot be deleted. Unlock it first.`);
      return;
    }

    /*
     * Defer past the Radix context-menu close: the menu restores focus to its
     * trigger on unmount, which would otherwise race the dialog's focus trap.
     */
    setTimeout(() => setIsConfirmingDelete(true), 0);
  };

  const handleConfirmedDelete = async () => {
    setIsConfirmingDelete(false);

    try {
      let success;

      if (isFolder) {
        success = await workbenchStore.deleteFolder(fullPath);
      } else {
        success = await workbenchStore.deleteFile(fullPath);
      }

      if (success) {
        toast.success(`${isFolder ? 'Folder' : 'File'} deleted successfully`);
      } else {
        toast.error(`Failed to delete ${isFolder ? 'folder' : 'file'}`);
      }
    } catch (error) {
      toast.error(`Error deleting ${isFolder ? 'folder' : 'file'}`);
      logger.error(error);
    }
  };

  const handleRename = async (nextName: string) => {
    const nextPath = path.join(path.dirname(fullPath), nextName);
    const files = workbenchStore.files.get();

    /*
     * No-op rename: the create-then-delete sequence below would otherwise
     * create the target (overwriting the source, since the paths are equal)
     * and then delete it — destroying the file/folder. Bail out early.
     */
    if (nextPath === fullPath) {
      setIsRenaming(false);
      return;
    }

    /*
     * Rename is a create-then-DELETE of the source, so a locked file/folder must
     * be blocked here too (same lock enforcement as delete / editor / AI writes).
     */
    const renameLock = isFolder ? workbenchStore.isFolderLocked(fullPath) : workbenchStore.isFileLocked(fullPath);

    if ('locked' in renameLock ? renameLock.locked : renameLock.isLocked) {
      toast.error(`This ${isFolder ? 'folder' : 'file'} is locked and cannot be renamed. Unlock it first.`);
      setIsRenaming(false);

      return;
    }

    /*
     * Block silent overwrite of an existing target. Rename is a create-then-delete
     * and createFile only refuses LOCKED targets, so renaming onto an existing
     * UNLOCKED file/folder would clobber its content with no confirm — permanent
     * data loss. Refuse the collision instead.
     */
    if (files[nextPath]) {
      toast.error(`A file or folder named "${nextName}" already exists`);
      setIsRenaming(false);

      return;
    }

    /*
     * Reject renaming a folder into a path nested UNDER itself (e.g. foo -> foo/bar):
     * the create-then-delete would create the copy under foo, then deleteFolder(foo)
     * removes everything under foo/ — destroying the freshly-renamed copy too.
     */
    if (isFolder && nextPath.startsWith(`${fullPath}/`)) {
      toast.error('Cannot rename a folder into a path inside itself');
      setIsRenaming(false);

      return;
    }

    try {
      if (isFolder) {
        const folderEntries = Object.entries(files).filter(
          ([entryPath]) => entryPath === fullPath || entryPath.startsWith(`${fullPath}/`),
        );

        await workbenchStore.createFolder(nextPath);

        for (const [entryPath, entry] of folderEntries) {
          const renamedPath = `${nextPath}${entryPath.slice(fullPath.length)}`;

          if (entry?.type === 'folder') {
            await workbenchStore.createFolder(renamedPath);
          } else if (entry?.type === 'file') {
            await workbenchStore.createFile(renamedPath, await resolveContentForCopy(entryPath, entry));
          }
        }

        await workbenchStore.deleteFolder(fullPath);
      } else {
        const entry = files[fullPath];

        if (entry?.type !== 'file') {
          throw new Error('File content not available');
        }

        /*
         * Hydrate BEFORE the delete: if the runtime read throws, resolveContentForCopy
         * rejects and we land in catch without ever creating an empty copy or deleting
         * the original — so a transient runtime error can never lose the file.
         */
        const copyContent = await resolveContentForCopy(fullPath, entry);
        await workbenchStore.createFile(nextPath, copyContent);
        await workbenchStore.deleteFile(fullPath);
      }

      toast.success(`${isFolder ? 'Folder' : 'File'} renamed`);
    } catch (error) {
      toast.error(`Failed to rename ${isFolder ? 'folder' : 'file'}`);
      logger.error(error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDuplicate = async () => {
    const files = workbenchStore.files.get();
    const extensionIndex = fileName.lastIndexOf('.');

    const baseName = !isFolder && extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
    const ext = !isFolder && extensionIndex > 0 ? fileName.slice(extensionIndex) : '';
    const dir = path.dirname(fullPath);

    /*
     * Auto-increment ("… copy", "… copy 2", …) so a repeat duplicate never
     * silently overwrites a pre-existing derived file (createFile only refuses
     * LOCKED targets, so an unlocked "foo copy.ts" would otherwise be clobbered).
     */
    let duplicatePath = path.join(dir, `${baseName} copy${ext}`);

    for (let counter = 2; files[duplicatePath]; counter += 1) {
      duplicatePath = path.join(dir, `${baseName} copy ${counter}${ext}`);
    }

    try {
      if (isFolder) {
        await workbenchStore.createFolder(duplicatePath);

        for (const [entryPath, entry] of Object.entries(files)) {
          if (!entryPath.startsWith(`${fullPath}/`)) {
            continue;
          }

          const copiedPath = `${duplicatePath}${entryPath.slice(fullPath.length)}`;

          if (entry?.type === 'folder') {
            await workbenchStore.createFolder(copiedPath);
          } else if (entry?.type === 'file') {
            await workbenchStore.createFile(copiedPath, await resolveContentForCopy(entryPath, entry));
          }
        }
      } else {
        const entry = files[fullPath];

        if (entry?.type !== 'file') {
          throw new Error('File content not available');
        }

        await workbenchStore.createFile(duplicatePath, await resolveContentForCopy(fullPath, entry));
      }

      toast.success(`${isFolder ? 'Folder' : 'File'} duplicated`);
    } catch (error) {
      toast.error(`Failed to duplicate ${isFolder ? 'folder' : 'file'}`);
      logger.error(error);
    }
  };

  const handleReveal = () => {
    workbenchStore.setSelectedFile(fullPath);
    toast.info(`${fileName} revealed in project files`);
  };

  // Handler for locking a file with full lock
  const handleLockFile = () => {
    try {
      if (isFolder) {
        return;
      }

      const success = workbenchStore.lockFile(fullPath);

      if (success) {
        toast.success(`File locked successfully`);
      } else {
        toast.error(`Failed to lock file`);
      }
    } catch (error) {
      toast.error(`Error locking file`);
      logger.error(error);
    }
  };

  // Handler for unlocking a file
  const handleUnlockFile = () => {
    try {
      if (isFolder) {
        return;
      }

      const success = workbenchStore.unlockFile(fullPath);

      if (success) {
        toast.success(`File unlocked successfully`);
      } else {
        toast.error(`Failed to unlock file`);
      }
    } catch (error) {
      toast.error(`Error unlocking file`);
      logger.error(error);
    }
  };

  // Handler for locking a folder with full lock
  const handleLockFolder = () => {
    try {
      if (!isFolder) {
        return;
      }

      const success = workbenchStore.lockFolder(fullPath);

      if (success) {
        toast.success(`Folder locked successfully`);
      } else {
        toast.error(`Failed to lock folder`);
      }
    } catch (error) {
      toast.error(`Error locking folder`);
      logger.error(error);
    }
  };

  // Handler for unlocking a folder
  const handleUnlockFolder = () => {
    try {
      if (!isFolder) {
        return;
      }

      const success = workbenchStore.unlockFolder(fullPath);

      if (success) {
        toast.success(`Folder unlocked successfully`);
      } else {
        toast.error(`Failed to unlock folder`);
      }
    } catch (error) {
      toast.error(`Error unlocking folder`);
      logger.error(error);
    }
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {/*
           * Radix ContextMenu already opens on a ~700ms touch long-press, but iOS
           * Safari's native touch-callout / text selection races and preempts it,
           * making file-row actions (rename/duplicate/delete) unreliable on touch.
           * Suppressing the callout lets the long-press menu open dependably.
           */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
            className={classNames('relative', {
              'bg-bolt-elements-background-depth-2 border border-dashed border-bolt-elements-item-contentAccent rounded-md':
                isDragging,
            })}
          >
            {children}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            style={{ zIndex: 998 }}
            className="border border-bolt-elements-borderColor rounded-md z-context-menu bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-2 data-[state=open]:animate-in animate-duration-100 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 w-56"
          >
            <ContextMenu.Group className="p-1 border-b-px border-solid border-bolt-elements-borderColor">
              <ContextMenuItem onSelect={() => setIsCreatingFile(true)}>
                <div className="flex items-center gap-2">
                  <div className="i-ph:file-plus" />
                  New File
                </div>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setIsCreatingFolder(true)}>
                <div className="flex items-center gap-2">
                  <div className="i-ph:folder-plus" />
                  New Folder
                </div>
              </ContextMenuItem>
            </ContextMenu.Group>
            <ContextMenu.Group className="p-1">
              <ContextMenuItem onSelect={() => setIsRenaming(true)}>Rename</ContextMenuItem>
              <ContextMenuItem onSelect={handleDuplicate}>Duplicate</ContextMenuItem>
              <ContextMenuItem onSelect={onCopyPath}>Copy path</ContextMenuItem>
              <ContextMenuItem onSelect={onCopyRelativePath}>Copy relative path</ContextMenuItem>
              <ContextMenuItem onSelect={handleReveal}>Reveal in finder</ContextMenuItem>
              {!isFolder && (
                <ContextMenuItem onSelect={onToggleBookmark}>
                  {bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                </ContextMenuItem>
              )}
            </ContextMenu.Group>
            {/* Add lock/unlock options for files and folders */}
            <ContextMenu.Group className="p-1 border-t-px border-solid border-bolt-elements-borderColor">
              {!isFolder ? (
                <>
                  <ContextMenuItem onSelect={handleLockFile}>
                    <div className="flex items-center gap-2">
                      <div className="i-ph:lock-simple" />
                      Lock File
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={handleUnlockFile}>
                    <div className="flex items-center gap-2">
                      <div className="i-ph:lock-key-open" />
                      Unlock File
                    </div>
                  </ContextMenuItem>
                </>
              ) : (
                <>
                  <ContextMenuItem onSelect={handleLockFolder}>
                    <div className="flex items-center gap-2">
                      <div className="i-ph:lock-simple" />
                      Lock Folder
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={handleUnlockFolder}>
                    <div className="flex items-center gap-2">
                      <div className="i-ph:lock-key-open" />
                      Unlock Folder
                    </div>
                  </ContextMenuItem>
                </>
              )}
            </ContextMenu.Group>
            {/* Add delete option in a new group */}
            <ContextMenu.Group className="p-1 border-t-px border-solid border-bolt-elements-borderColor">
              <ContextMenuItem onSelect={handleDelete}>
                <div className="flex items-center gap-2 text-[var(--status-error-text)]">
                  <div className="i-ph:trash" />
                  Delete {isFolder ? 'Folder' : 'File'}
                </div>
              </ContextMenuItem>
            </ContextMenu.Group>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {isCreatingFile && (
        <InlineInput
          depth={depth}
          placeholder="Enter file name..."
          onSubmit={handleCreateFile}
          onCancel={() => setIsCreatingFile(false)}
        />
      )}
      {isCreatingFolder && (
        <InlineInput
          depth={depth}
          placeholder="Enter folder name..."
          onSubmit={handleCreateFolder}
          onCancel={() => setIsCreatingFolder(false)}
        />
      )}
      {isRenaming && (
        <InlineInput
          depth={depth}
          placeholder="Enter new name..."
          initialValue={fileName}
          onSubmit={handleRename}
          onCancel={() => setIsRenaming(false)}
        />
      )}
      <ConfirmationDialog
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={handleConfirmedDelete}
        title={`Delete ${isFolder ? 'Folder' : 'File'}`}
        description={`Are you sure you want to delete ${isFolder ? 'folder' : 'file'} "${fileName}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
      />
      <ConfirmationDialog
        isOpen={pendingOverwriteDrop !== null}
        onClose={() => setPendingOverwriteDrop(null)}
        onConfirm={() => {
          const pending = pendingOverwriteDrop;
          setPendingOverwriteDrop(null);

          if (pending) {
            void performDrop(pending.files);
          }
        }}
        title="Overwrite existing files?"
        description={<span className="whitespace-pre-line">{pendingOverwriteDrop?.message}</span>}
        confirmLabel="Overwrite"
        variant="destructive"
      />
    </>
  );
}

function Folder({ folder, collapsed, selected = false, onCopyPath, onCopyRelativePath, onClick }: FolderProps) {
  /*
   * Read the lock flag from the already-subscribed dirent rather than calling the
   * side-effecting workbenchStore.isFolderLocked during render (it mutates the store
   * via setKey when localStorage holds a not-yet-synced lock). Fall back to a
   * non-mutating localStorage read when the in-memory dirent lacks the flag.
   */
  const dirent = workbenchStore.files.get()[folder.fullPath];

  const isLocked =
    dirent?.type === 'folder' && dirent.isLocked
      ? true
      : readFolderLockedFromStorage(getCurrentChatId(), folder.fullPath).locked;

  return (
    <FileContextMenu onCopyPath={onCopyPath} onCopyRelativePath={onCopyRelativePath} fullPath={folder.fullPath}>
      <NodeButton
        className={classNames('group', {
          'bg-transparent text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive hover:bg-bolt-elements-item-backgroundActive':
            !selected,
          'bolt-project-file-selected bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
            selected,
        })}
        depth={folder.depth}
        iconClasses={classNames({
          'i-ph:caret-right scale-98': collapsed,
          'i-ph:caret-down scale-98': !collapsed,
        })}
        title={folder.fullPath}
        ariaExpanded={!collapsed}
        onClick={onClick}
      >
        <div className="flex w-full min-w-0 items-center">
          <FileTreeName name={folder.name} className="flex-1" />
          {isLocked && (
            <span
              className={classNames('shrink-0', 'i-ph:lock-simple scale-80 text-red-500')}
              title={'Folder is locked'}
            />
          )}
        </div>
      </NodeButton>
    </FileContextMenu>
  );
}

interface FileProps {
  file: FileNode;
  selected: boolean;
  unsavedChanges?: boolean;
  gitStatus?: GitFileStatus;
  bookmarked?: boolean;
  fileHistory?: Record<string, FileHistory>;
  onToggleBookmark?: () => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onClick: () => void;
  onDoubleClick?: () => void;
}

function File({
  file,
  onClick,
  onDoubleClick,
  onCopyPath,
  onCopyRelativePath,
  selected,
  unsavedChanges = false,
  gitStatus,
  bookmarked = false,
  fileHistory = {},
  onToggleBookmark,
}: FileProps) {
  const { depth, name, fullPath } = file;

  /*
   * Read the lock flag from the already-subscribed dirent rather than calling the
   * side-effecting workbenchStore.isFileLocked during render (it mutates the store
   * via setKey when localStorage holds a not-yet-synced lock). Fall back to a
   * non-mutating localStorage read when the in-memory dirent lacks the flag.
   */
  const dirent = workbenchStore.files.get()[fullPath];

  const locked =
    dirent?.type === 'file' && dirent.isLocked ? true : readFileLockedFromStorage(getCurrentChatId(), fullPath).locked;

  const fileModifications = fileHistory[fullPath];

  const { additions, deletions } = useMemo(() => computeFileDiffStats(fileModifications), [fileModifications]);

  const showStats = additions > 0 || deletions > 0;

  return (
    <FileContextMenu
      onCopyPath={onCopyPath}
      onCopyRelativePath={onCopyRelativePath}
      fullPath={fullPath}
      bookmarked={bookmarked}
      onToggleBookmark={onToggleBookmark}
    >
      <NodeButton
        className={classNames('group', {
          'bg-transparent hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentDefault':
            !selected,
          'bolt-project-file-selected bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
            selected,
        })}
        depth={depth}
        iconClasses={classNames(materialFileIcon(name).icon, 'scale-98', {
          'group-hover:text-bolt-elements-item-contentActive': !selected,
        })}
        title={fullPath}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={classNames('flex w-full min-w-0 items-center', {
            'group-hover:text-bolt-elements-item-contentActive': !selected,
          })}
        >
          <FileTreeName name={name} className="flex-1" />
          <div className="flex items-center gap-1">
            {showStats && (
              <div className="flex items-center gap-1 text-xs">
                {additions > 0 && <span className="text-[var(--status-success-text)]">+{additions}</span>}
                {deletions > 0 && <span className="text-[var(--status-error-text)]">-{deletions}</span>}
              </div>
            )}
            {locked && (
              <span
                className={classNames('shrink-0', 'i-ph:lock-simple scale-80 text-red-500')}
                role="img"
                aria-label="File is locked"
                title={'File is locked'}
              />
            )}
            {bookmarked && (
              <span
                className="i-ph:bookmark-simple-fill scale-75 shrink-0 text-sky-500"
                role="img"
                aria-label="Bookmarked"
                title="Bookmarked"
              />
            )}
            {gitStatus && <GitStatusPill status={gitStatus} />}
            {unsavedChanges && (
              <span
                className="i-ph:circle-fill scale-68 shrink-0 text-orange-500"
                role="img"
                aria-label="Unsaved changes"
                title="Unsaved changes"
              />
            )}
          </div>
        </div>
      </NodeButton>
    </FileContextMenu>
  );
}

function GitStatusPill({ status }: { status: GitFileStatus }) {
  return <GitStatusBadge status={status} size="compact" />;
}

function OutlineView({ symbols, onSelect }: { symbols: OutlineSymbol[]; onSelect: (symbol: OutlineSymbol) => void }) {
  return (
    <div className="space-y-1 p-2">
      {symbols.map((symbol) => (
        <button
          key={symbol.id}
          type="button"
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-item-contentActive"
          onClick={() => onSelect(symbol)}
        >
          <span
            className={classNames('size-4 shrink-0', {
              'i-ph:function': symbol.kind === 'function',
              'i-ph:brackets-curly': symbol.kind === 'component',
              'i-ph:cube': symbol.kind === 'class',
              'i-ph:paint-brush': symbol.kind === 'style',
              'i-ph:text-h': symbol.kind === 'heading',
              'i-ph:dot-outline': symbol.kind === 'symbol',
            })}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{symbol.label}</span>
            <span className="block truncate text-[11px] text-bolt-elements-textTertiary">
              Line {symbol.line} · {symbol.detail}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface EmptyExplorerStateProps {
  icon: string;
  title: string;
  description: string;
  variant?: 'loading' | 'error' | 'empty';
  showReconnect?: boolean;
  onReconnect?: () => void;
}

function EmptyExplorerState({ icon, title, description, showReconnect = false, onReconnect }: EmptyExplorerStateProps) {
  return (
    <div className="flex h-40 flex-col items-center justify-center px-4 text-center text-bolt-elements-textTertiary">
      <span className={classNames('mb-3 size-7', icon)} aria-hidden />
      <p className="text-sm font-medium text-bolt-elements-textSecondary">{title}</p>
      <p className="mt-1 max-w-48 text-xs leading-5">{description}</p>
      {showReconnect && onReconnect ? (
        <button
          type="button"
          onClick={onReconnect}
          className="mt-3 flex items-center gap-1.5 rounded-md bg-bolt-elements-item-backgroundActive px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundAccent"
        >
          <span className="i-ph:arrow-clockwise size-3.5" aria-hidden />
          Reconnect
        </button>
      ) : null}
    </div>
  );
}

interface ButtonProps {
  depth: number;
  iconClasses: string;
  iconStyle?: CSSProperties;
  title?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;

  /*
   * Folder rows pass !collapsed so screen readers announce expand/collapse state;
   * file rows leave it undefined (no aria-expanded attribute).
   */
  ariaExpanded?: boolean;
}

function NodeButton({
  depth,
  iconClasses,
  iconStyle,
  title,
  onClick,
  onDoubleClick,
  className,
  children,
  ariaExpanded,
}: ButtonProps) {
  /*
   * Depth indentation lives on the row (not the icon wrapper): the IDE shell pins
   * .bolt-file-tree-icon-wrap to a fixed 16px width with padding-left:0 !important,
   * which clobbered the old inline padding and flattened the whole tree. The row's
   * base rule uses non-!important padding, so this inline value wins and the
   * hierarchy renders again.
   */
  const rowIndent = { paddingLeft: `${NODE_BASE_PADDING_LEFT + depth * NODE_PADDING_LEFT}px` };

  return (
    <button
      className={classNames('bolt-file-tree-node flex items-center border-transparent text-faded', className)}
      title={title}
      aria-expanded={ariaExpanded}
      style={rowIndent}
      onClick={() => onClick?.()}
      onDoubleClick={() => onDoubleClick?.()}
    >
      <span className="bolt-file-tree-icon-wrap">
        <span className={classNames('shrink-0', iconClasses)} style={iconStyle} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
    </button>
  );
}

type Node = FileNode | FolderNode;

interface BaseNode {
  id: number;
  depth: number;
  name: string;
  fullPath: string;
}

interface FileNode extends BaseNode {
  kind: 'file';
}

interface FolderNode extends BaseNode {
  kind: 'folder';
}

function buildFileList(
  files: FileMap,
  rootFolder = '/',
  hideRoot: boolean,
  hiddenFiles: Array<string | RegExp>,
): Node[] {
  const folderPaths = new Set<string>();
  const fileList: Node[] = [];

  let defaultDepth = 0;

  if (rootFolder === '/' && !hideRoot) {
    defaultDepth = 1;
    fileList.push({ kind: 'folder', name: '/', depth: 0, id: 0, fullPath: '/' });
  }

  for (const [filePath, dirent] of Object.entries(files)) {
    const normalizedFilePath =
      rootFolder && rootFolder !== '/' && !filePath.startsWith(rootFolder)
        ? path.join(rootFolder, filePath.replace(/^\/+/, ''))
        : filePath;

    const segments = normalizedFilePath.split('/').filter((segment) => segment);
    const fileName = segments.at(-1);

    if (!fileName || isHiddenFile(normalizedFilePath, fileName, hiddenFiles)) {
      continue;
    }

    let currentPath = '';

    let i = 0;
    let depth = 0;

    while (i < segments.length) {
      const name = segments[i];
      const fullPath = (currentPath += `/${name}`);

      /*
       * Require a path-segment boundary so sibling dirs that merely share a
       * string prefix (e.g. rootFolder "/home/project" vs "/home/project-bak")
       * are not pulled into the tree.
       */
      const underRoot = rootFolder === '/' || fullPath === rootFolder || fullPath.startsWith(`${rootFolder}/`);

      if (!underRoot || (hideRoot && fullPath === rootFolder)) {
        i++;
        continue;
      }

      if (i === segments.length - 1 && dirent?.type === 'file') {
        fileList.push({
          kind: 'file',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth,
        });
      } else if (!folderPaths.has(fullPath)) {
        folderPaths.add(fullPath);

        fileList.push({
          kind: 'folder',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth,
        });
      }

      i++;
      depth++;
    }
  }

  return sortFileList(rootFolder, fileList, hideRoot);
}

function isHiddenFile(filePath: string, fileName: string, hiddenFiles: Array<string | RegExp>) {
  return hiddenFiles.some((pathOrRegex) => {
    if (typeof pathOrRegex === 'string') {
      return fileName === pathOrRegex;
    }

    return pathOrRegex.test(filePath);
  });
}

/**
 * Sorts the given list of nodes into a tree structure (still a flat list).
 *
 * This function organizes the nodes into a hierarchical structure based on their paths,
 * with folders appearing before files and all items sorted alphabetically within their level.
 *
 * @note This function mutates the given `nodeList` array for performance reasons.
 *
 * @param rootFolder - The path of the root folder to start the sorting from.
 * @param nodeList - The list of nodes to be sorted.
 *
 * @returns A new array of nodes sorted in depth-first order.
 */
function sortFileList(rootFolder: string, nodeList: Node[], hideRoot: boolean): Node[] {
  logger.trace('sortFileList');

  const nodeMap = new Map<string, Node>();
  const childrenMap = new Map<string, Node[]>();

  // pre-sort nodes by name and type
  nodeList.sort((a, b) => compareNodes(a, b));

  for (const node of nodeList) {
    /*
     * Two nodes can normalize to the same fullPath (e.g. NFC vs NFD
     * unicode-equivalent names synced from macOS). Keep the first and skip the
     * duplicate rather than silently clobbering the earlier node in nodeMap and
     * double-listing it under its parent in childrenMap.
     */
    if (nodeMap.has(node.fullPath)) {
      continue;
    }

    nodeMap.set(node.fullPath, node);

    const parentPath = node.fullPath.slice(0, node.fullPath.lastIndexOf('/'));

    if (parentPath !== rootFolder.slice(0, rootFolder.lastIndexOf('/'))) {
      if (!childrenMap.has(parentPath)) {
        childrenMap.set(parentPath, []);
      }

      childrenMap.get(parentPath)?.push(node);
    }
  }

  const sortedList: Node[] = [];

  const depthFirstTraversal = (path: string): void => {
    const node = nodeMap.get(path);

    if (node) {
      sortedList.push(node);
    }

    const children = childrenMap.get(path);

    if (children) {
      for (const child of children) {
        if (child.kind === 'folder') {
          depthFirstTraversal(child.fullPath);
        } else {
          sortedList.push(child);
        }
      }
    }
  };

  if (hideRoot) {
    // if root is hidden, start traversal from its immediate children
    const rootChildren = childrenMap.get(rootFolder) || [];

    for (const child of rootChildren) {
      depthFirstTraversal(child.fullPath);
    }
  } else {
    depthFirstTraversal(rootFolder);
  }

  return sortedList;
}

function compareNodes(a: Node, b: Node): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}
