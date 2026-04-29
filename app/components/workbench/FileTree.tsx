import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { FileMap } from '~/lib/stores/files';
import { classNames } from '~/utils/classNames';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { FileHistory } from '~/types/actions';
import { diffLines, type Change } from 'diff';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';
import { path } from '~/utils/path';

const logger = createScopedLogger('FileTree');

const NODE_PADDING_LEFT = 16;
const DEFAULT_HIDDEN_FILES = [/\/node_modules\//, /\/\.next/, /\/\.astro/];

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
  }: Props) => {
    renderLogger.trace('FileTree');

    const computedHiddenFiles = useMemo(() => [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])], [hiddenFiles]);

    const fileList = useMemo(() => {
      return buildFileList(files, rootFolder, hideRoot, computedHiddenFiles);
    }, [files, rootFolder, hideRoot, computedHiddenFiles]);

    const [collapsedFolders, setCollapsedFolders] = useState(() => {
      return collapsed
        ? new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath))
        : new Set<string>();
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

    return (
      <div className={classNames('text-sm', className, 'overflow-y-auto modern-scrollbar')}>
        {filteredFileList.map((fileOrFolder) => {
          switch (fileOrFolder.kind) {
            case 'file': {
              return (
                <File
                  key={fileOrFolder.id}
                  selected={selectedFile === fileOrFolder.fullPath}
                  file={fileOrFolder}
                  unsavedChanges={unsavedFiles instanceof Set && unsavedFiles.has(fileOrFolder.fullPath)}
                  fileHistory={fileHistory}
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
        })}
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
      const value = inputRef.current?.value.trim();

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
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
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
}: FolderContextMenuProps & { fullPath: string }) {
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const depth = useMemo(() => fullPath.split('/').length, [fullPath]);
  const fileName = useMemo(() => path.basename(fullPath), [fullPath]);

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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items = Array.from(e.dataTransfer.items);
      const files = items.filter((item) => item.kind === 'file');

      for (const item of files) {
        const file = item.getAsFile();

        if (file) {
          try {
            const filePath = path.join(fullPath, file.name);

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
      }

      setIsDragging(false);
    },
    [fullPath],
  );

  const handleCreateFile = async (fileName: string) => {
    const newFilePath = path.join(targetPath, fileName);
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
    const success = await workbenchStore.createFolder(newFolderPath);

    if (success) {
      toast.success('Folder created successfully');
    } else {
      toast.error('Failed to create folder');
    }

    setIsCreatingFolder(false);
  };

  const handleDelete = async () => {
    try {
      if (!confirm(`Are you sure you want to delete ${isFolder ? 'folder' : 'file'}: ${fileName}?`)) {
        return;
      }

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
            await workbenchStore.createFile(renamedPath, entry.content);
          }
        }

        await workbenchStore.deleteFolder(fullPath);
      } else {
        const entry = files[fullPath];

        if (entry?.type !== 'file') {
          throw new Error('File content not available');
        }

        await workbenchStore.createFile(nextPath, entry.content);
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
    const duplicateName =
      !isFolder && extensionIndex > 0
        ? `${fileName.slice(0, extensionIndex)} copy${fileName.slice(extensionIndex)}`
        : `${fileName} copy`;
    const duplicatePath = path.join(path.dirname(fullPath), duplicateName);

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
            await workbenchStore.createFile(copiedPath, entry.content);
          }
        }
      } else {
        const entry = files[fullPath];

        if (entry?.type !== 'file') {
          throw new Error('File content not available');
        }

        await workbenchStore.createFile(duplicatePath, entry.content);
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
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
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
                <div className="flex items-center gap-2 text-red-500">
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
    </>
  );
}

function Folder({ folder, collapsed, selected = false, onCopyPath, onCopyRelativePath, onClick }: FolderProps) {
  // Check if the folder is locked
  const { isLocked } = workbenchStore.isFolderLocked(folder.fullPath);

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
        iconStyle={{ color: '#D29922' }}
        onClick={onClick}
      >
        <div className="flex items-center w-full">
          <div className="flex-1 truncate pr-2">{folder.name}</div>
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
  fileHistory?: Record<string, FileHistory>;
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
  fileHistory = {},
}: FileProps) {
  const { depth, name, fullPath } = file;

  // Check if the file is locked
  const { locked } = workbenchStore.isFileLocked(fullPath);

  const fileModifications = fileHistory[fullPath];

  const { additions, deletions } = useMemo(() => {
    if (!fileModifications?.originalContent) {
      return { additions: 0, deletions: 0 };
    }

    const normalizedOriginal = fileModifications.originalContent.replace(/\r\n/g, '\n');
    const normalizedCurrent =
      fileModifications.versions[fileModifications.versions.length - 1]?.content.replace(/\r\n/g, '\n') || '';

    if (normalizedOriginal === normalizedCurrent) {
      return { additions: 0, deletions: 0 };
    }

    const changes = diffLines(normalizedOriginal, normalizedCurrent, {
      newlineIsToken: false,
      ignoreWhitespace: true,
      ignoreCase: false,
    });

    return changes.reduce(
      (acc: { additions: number; deletions: number }, change: Change) => {
        if (change.added) {
          acc.additions += change.value.split('\n').length;
        }

        if (change.removed) {
          acc.deletions += change.value.split('\n').length;
        }

        return acc;
      },
      { additions: 0, deletions: 0 },
    );
  }, [fileModifications]);

  const showStats = additions > 0 || deletions > 0;

  return (
    <FileContextMenu onCopyPath={onCopyPath} onCopyRelativePath={onCopyRelativePath} fullPath={fullPath}>
      <NodeButton
        className={classNames('group', {
          'bg-transparent hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentDefault':
            !selected,
          'bolt-project-file-selected bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
            selected,
        })}
        depth={depth}
        iconClasses={classNames('i-ph:file-duotone scale-98', {
          'group-hover:text-bolt-elements-item-contentActive': !selected,
        })}
        iconStyle={{ color: fileIconColor(name) }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={classNames('flex items-center', {
            'group-hover:text-bolt-elements-item-contentActive': !selected,
          })}
        >
          <div className="flex-1 truncate pr-2">{name}</div>
          <div className="flex items-center gap-1">
            {showStats && (
              <div className="flex items-center gap-1 text-xs">
                {additions > 0 && <span className="text-green-500">+{additions}</span>}
                {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
              </div>
            )}
            {locked && (
              <span
                className={classNames('shrink-0', 'i-ph:lock-simple scale-80 text-red-500')}
                title={'File is locked'}
              />
            )}
            {unsavedChanges && <span className="i-ph:circle-fill scale-68 shrink-0 text-orange-500" />}
          </div>
        </div>
      </NodeButton>
    </FileContextMenu>
  );
}

interface ButtonProps {
  depth: number;
  iconClasses: string;
  iconStyle?: CSSProperties;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

function NodeButton({ depth, iconClasses, iconStyle, onClick, onDoubleClick, className, children }: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center gap-1.5 w-full pr-2 border-2 border-transparent text-faded py-0.5',
        className,
      )}
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
      onClick={() => onClick?.()}
      onDoubleClick={() => onDoubleClick?.()}
    >
      <div className={classNames('scale-120 shrink-0', iconClasses)} style={iconStyle}></div>
      <div className="truncate w-full text-left">{children}</div>
    </button>
  );
}

function fileIconColor(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'ts' || extension === 'tsx' || extension === 'js' || extension === 'jsx') {
    return '#0099FF';
  }

  if (extension === 'json') {
    return '#D29922';
  }

  if (extension === 'css' || extension === 'scss') {
    return '#FF6B9D';
  }

  if (extension === 'md' || extension === 'mdx') {
    return '#6E7681';
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension ?? '')) {
    return '#7B61FF';
  }

  return '#C2C8CC';
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
    const segments = filePath.split('/').filter((segment) => segment);
    const fileName = segments.at(-1);

    if (!fileName || isHiddenFile(filePath, fileName, hiddenFiles)) {
      continue;
    }

    let currentPath = '';

    let i = 0;
    let depth = 0;

    while (i < segments.length) {
      const name = segments[i];
      const fullPath = (currentPath += `/${name}`);

      if (!fullPath.startsWith(rootFolder) || (hideRoot && fullPath === rootFolder)) {
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
