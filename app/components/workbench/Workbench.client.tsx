/* eslint-disable import/order */
import { Popover, Transition } from '@headlessui/react';
import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useResponsiveLayout } from '@vibecore/editor';
import { diffLines, type Change } from 'diff';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { DiffView } from './DiffView';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { GitTab } from '~/components/git/GitTab';
import { PanelBoundary } from '~/components/ui/PanelBoundary';
import useViewport from '~/lib/hooks';

import { chatStore } from '~/lib/stores/chat';
import type { ElementInfo } from './Inspector';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { useChatHistory } from '~/lib/persistence';
import {
  formatWorkbenchSurfaceCopy,
  formatWorkbenchSurfaceNumber,
  getWorkbenchSurfaceCopy,
  type WorkbenchSurfaceKey,
} from '~/lib/i18n/catalogs/workbench-surface';
import {
  type CompactPreviewRunState,
  compactPreviewRunAriaLabel,
  compactPreviewRunIcon,
  compactPreviewRunText,
  isCompactPreviewRunActive,
  resolveCompactPreviewRunState,
} from '~/lib/runtime/preview-run-state';
import { isWorkspaceReallyRunning, workspaceUiState } from '~/lib/runtime/workspace-status';
import { streamingState } from '~/lib/stores/streaming';
import type { FileHistory } from '~/types/actions';
import { buttonVariants } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';
import { getLanguageFromExtension } from '~/utils/getLanguageFromExtension';
import { type MobileWorkbenchPanel, resolveActiveWorkbenchView } from './active-workbench-view';
import { shouldAutoRunPreview } from './preview-frame-recovery';

/* Libellé du Terminal mobile — surface GELÉE par Avi (ref IMG_9149). */
const SHELL_TERMINAL_LABEL = 'Shell (Terminal)';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  metadata?: {
    gitUrl?: string;
  };
  updateChatMestaData?: (metadata: any) => void;
  setSelectedElement?: (element: ElementInfo | null) => void;
  mobilePanel?: MobileWorkbenchPanel;
  onMobilePanelChange?: (panel: MobileWorkbenchPanel) => void;
  projectId?: string;
}

const viewTransition = { ease: cubicEasingFn };

const workbenchTabs: ReadonlyArray<{ value: WorkbenchViewType; labelKey: WorkbenchSurfaceKey; icon: string }> = [
  { value: 'code', labelKey: 'workbenchSurface.tab.code', icon: 'i-ph:code' },
  { value: 'diff', labelKey: 'workbenchSurface.tab.diff', icon: 'i-ph:git-diff' },
  { value: 'preview', labelKey: 'workbenchSurface.tab.preview', icon: 'i-ph:browser' },
  { value: 'git', labelKey: 'workbenchSurface.tab.git', icon: 'i-ph:git-branch' },
];

const WorkbenchTabBar = memo(
  ({ selected, onSelect }: { selected: WorkbenchViewType; onSelect: (value: WorkbenchViewType) => void }) => {
    const { i18n } = useTranslation();
    const copy = getWorkbenchSurfaceCopy(i18n.resolvedLanguage ?? i18n.language);

    return (
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-bolt-elements-background-depth-1 p-1">
        {workbenchTabs.map((tab) => {
          const active = selected === tab.value;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onSelect(tab.value)}
              className={classNames(
                'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
                active
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive',
              )}
              aria-pressed={active}
            >
              <span className={classNames(tab.icon, 'text-base')} aria-hidden />
              <span>{copy[tab.labelKey]}</span>
            </button>
          );
        })}
      </div>
    );
  },
);

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

const FileModifiedDropdown = memo(
  ({
    fileHistory,
    onSelectFile,
  }: {
    fileHistory: Record<string, FileHistory>;
    onSelectFile: (filePath: string) => void;
  }) => {
    const { i18n } = useTranslation();
    const language = i18n.resolvedLanguage ?? i18n.language;
    const copy = getWorkbenchSurfaceCopy(language);
    const modifiedFiles = Object.entries(fileHistory);
    const hasChanges = modifiedFiles.length > 0;
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFiles = useMemo(() => {
      return modifiedFiles.filter(([filePath]) => filePath.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [fileHistory, searchQuery]);

    return (
      <div className="flex items-center gap-2">
        <Popover className="relative">
          {({ open }: { open: boolean }) => (
            <>
              <Popover.Button className="flex min-h-[36px] items-center gap-2 rounded-lg bg-bolt-elements-background-depth-2 px-3 py-1.5 text-sm text-bolt-elements-item-contentDefault transition-colors hover:bg-bolt-elements-background-depth-3">
                <span className="whitespace-normal text-left">{copy['workbenchSurface.files.changes']}</span>
                {hasChanges && (
                  <span className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--vc-action-primary)_20%,transparent)] text-[var(--vc-action-primary)] text-xs flex items-center justify-center border border-[color-mix(in_srgb,var(--vc-action-primary)_30%,transparent)]">
                    {formatWorkbenchSurfaceNumber(language, modifiedFiles.length)}
                  </span>
                )}
              </Popover.Button>
              <Transition
                show={open}
                enter="transition duration-100 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-75 ease-out"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <Popover.Panel
                  anchor={{ to: 'bottom end', gap: 8 }}
                  className="z-[60] w-[min(20rem,calc(100vw-24px))] max-h-[min(70dvh,420px)] origin-top-right overflow-hidden rounded-xl bg-bolt-elements-background-depth-2 shadow-xl border border-bolt-elements-borderColor"
                >
                  <div className="p-2">
                    <div className="relative mx-2 mb-2">
                      <input
                        type="text"
                        placeholder={copy['workbenchSurface.files.search']}
                        aria-label={copy['workbenchSurface.files.search']}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary">
                        <div className="i-ph:magnifying-glass" />
                      </div>
                    </div>

                    <div className="max-h-[min(60dvh,15rem)] overflow-y-auto">
                      {filteredFiles.length > 0 ? (
                        filteredFiles.map(([filePath, history]) => {
                          const basename = filePath.split('/').pop() ?? '';
                          const extension = basename.includes('.') ? (basename.split('.').pop() ?? '') : '';
                          const language = getLanguageFromExtension(extension);

                          return (
                            <button
                              key={filePath}
                              onClick={() => onSelectFile(filePath)}
                              className="w-full px-3 py-2 text-left rounded-md hover:bg-bolt-elements-background-depth-1 transition-colors group bg-transparent"
                            >
                              <div className="flex items-center gap-2">
                                <div className="shrink-0 w-5 h-5 text-bolt-elements-textTertiary">
                                  {['typescript', 'javascript', 'jsx', 'tsx'].includes(language) && (
                                    <div className="i-ph:file-js" />
                                  )}
                                  {['css', 'scss', 'less'].includes(language) && <div className="i-ph:paint-brush" />}
                                  {language === 'html' && <div className="i-ph:code" />}
                                  {language === 'json' && <div className="i-ph:brackets-curly" />}
                                  {language === 'python' && <div className="i-ph:file-text" />}
                                  {language === 'markdown' && <div className="i-ph:article" />}
                                  {['yaml', 'yml'].includes(language) && <div className="i-ph:file-text" />}
                                  {language === 'sql' && <div className="i-ph:database" />}
                                  {language === 'dockerfile' && <div className="i-ph:cube" />}
                                  {language === 'shell' && <div className="i-ph:terminal" />}
                                  {![
                                    'typescript',
                                    'javascript',
                                    'css',
                                    'html',
                                    'json',
                                    'python',
                                    'markdown',
                                    'yaml',
                                    'yml',
                                    'sql',
                                    'dockerfile',
                                    'shell',
                                    'jsx',
                                    'tsx',
                                    'scss',
                                    'less',
                                  ].includes(language) && <div className="i-ph:file-text" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                                        {filePath.split('/').pop()}
                                      </span>
                                      <span className="truncate text-xs text-bolt-elements-textTertiary">
                                        {filePath}
                                      </span>
                                    </div>
                                    {(() => {
                                      // Calculate diff stats
                                      const { additions, deletions } = (() => {
                                        if (!history.originalContent) {
                                          return { additions: 0, deletions: 0 };
                                        }

                                        const normalizedOriginal = history.originalContent.replace(/\r\n/g, '\n');

                                        const normalizedCurrent =
                                          history.versions[history.versions.length - 1]?.content?.replace(
                                            /\r\n/g,
                                            '\n',
                                          ) || '';

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
                                            /*
                                             * jsdiff line chunks end with a trailing newline, so a naive
                                             * split('\n') yields a spurious empty final segment that inflates
                                             * the count by one. Prefer the library-provided line count, and
                                             * fall back to a trailing-newline-stripped split.
                                             */
                                            const lineCount =
                                              change.count ?? change.value.replace(/\n$/, '').split('\n').length;

                                            if (change.added) {
                                              acc.additions += lineCount;
                                            }

                                            if (change.removed) {
                                              acc.deletions += lineCount;
                                            }

                                            return acc;
                                          },
                                          { additions: 0, deletions: 0 },
                                        );
                                      })();

                                      const showStats = additions > 0 || deletions > 0;

                                      return (
                                        showStats && (
                                          <div className="flex items-center gap-1 text-xs shrink-0">
                                            {additions > 0 && (
                                              <span className="text-[var(--status-success-text)]">+{additions}</span>
                                            )}
                                            {deletions > 0 && (
                                              <span className="text-[var(--status-error-text)]">-{deletions}</span>
                                            )}
                                          </div>
                                        )
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                          <div className="w-12 h-12 mb-2 text-bolt-elements-textTertiary">
                            <div className="i-ph:file-dashed" />
                          </div>
                          <p className="text-sm font-medium text-bolt-elements-textPrimary">
                            {searchQuery
                              ? copy['workbenchSurface.files.noMatches']
                              : copy['workbenchSurface.files.noModified']}
                          </p>
                          <p className="text-xs text-bolt-elements-textTertiary mt-1">
                            {searchQuery
                              ? copy['workbenchSurface.files.tryAnotherSearch']
                              : copy['workbenchSurface.files.changesAppear']}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasChanges && (
                    <div className="border-t border-bolt-elements-borderColor p-2">
                      <button
                        onClick={() => {
                          /*
                           * Only confirm success once the clipboard write actually resolves,
                           * otherwise the toast lies when the API is blocked or permission is denied.
                           */
                          navigator.clipboard
                            ?.writeText(filteredFiles.map(([filePath]) => filePath).join('\n'))
                            ?.then(() => {
                              toast(copy['workbenchSurface.files.copySuccess'], {
                                icon: <div className="i-ph:check-circle text-[var(--vc-action-primary)]" />,
                              });
                            })
                            ?.catch(() => {
                              toast.error(copy['workbenchSurface.files.copyFailed']);
                            });
                        }}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal rounded-lg bg-bolt-elements-background-depth-1 px-3 py-2 text-center text-sm text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                      >
                        {copy['workbenchSurface.files.copy']}
                      </button>
                    </div>
                  )}
                </Popover.Panel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    );
  },
);

export const Workbench = memo(
  ({
    chatStarted,
    isStreaming,
    metadata: _metadata,
    updateChatMestaData: _updateChatMestaData,
    setSelectedElement,
    mobilePanel,
    onMobilePanelChange,
    projectId,
  }: WorkspaceProps) => {
    renderLogger.trace('Workbench');

    const { i18n } = useTranslation();
    const language = i18n.resolvedLanguage ?? i18n.language;
    const copy = getWorkbenchSurfaceCopy(language);
    const [fileHistory, setFileHistory] = useState<Record<string, FileHistory>>({});

    // const modifiedFiles = Array.from(useStore(workbenchStore.unsavedFiles).keys());

    const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));

    const hasReadyPreview = useStore(
      computed(workbenchStore.previews, (previews) => previews.some((preview) => preview.ready)),
    );

    const workspaceStatus = useStore(workbenchStore.workspaceStatus);
    const showWorkbench = useStore(workbenchStore.showWorkbench);
    const selectedFile = useStore(workbenchStore.selectedFile);
    const currentDocument = useStore(workbenchStore.currentDocument);
    const unsavedFiles = useStore(workbenchStore.unsavedFiles);
    const files = useStore(workbenchStore.files);
    const selectedView = useStore(workbenchStore.currentView);
    const previewServerState = useStore(workbenchStore.previewServerState);
    const { showChat } = useStore(chatStore);
    const canHideChat = showWorkbench || !showChat;

    const isSmallViewport = useViewport(1024);
    const layout = useResponsiveLayout();
    const useMobileWorkbench = layout.isMobile || layout.isTablet;
    const streaming = useStore(streamingState);
    const { exportChat } = useChatHistory();
    const [isSyncing, setIsSyncing] = useState(false);

    /*
     * Tracks whether the user (or a ?view= URL param) explicitly chose a view,
     * so the auto-switch-to-preview effect doesn't stomp that selection.
     */
    const explicitViewRef = useRef(false);
    const didAutoSwitchPreviewRef = useRef(false);

    const setSelectedView = (view: WorkbenchViewType) => {
      explicitViewRef.current = true;
      workbenchStore.currentView.set(view);
    };

    useEffect(() => {
      if (useMobileWorkbench) {
        return;
      }

      /*
       * Auto-switch to preview at most once, and never over an explicit
       * user/URL selection — otherwise a newly-ready preview yanks the user
       * off the tab they were looking at (code/git/diff).
       */
      if (hasPreview && !explicitViewRef.current && !didAutoSwitchPreviewRef.current) {
        didAutoSwitchPreviewRef.current = true;
        workbenchStore.currentView.set('preview');
      }
    }, [hasPreview, useMobileWorkbench]);

    useEffect(() => {
      if (typeof window === 'undefined') {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requested = params.get('view');

      if (requested === 'git' || requested === 'code' || requested === 'diff' || requested === 'preview') {
        explicitViewRef.current = true;
        workbenchStore.currentView.set(requested);
        workbenchStore.showWorkbench.set(true);
      }
    }, []);

    useEffect(() => {
      workbenchStore.setDocuments(files);
    }, [files]);

    useEffect(() => {
      if (useMobileWorkbench && mobilePanel === 'terminal') {
        workbenchStore.toggleTerminal(true);
      }
    }, [mobilePanel, useMobileWorkbench]);

    const onEditorChange = useCallback<OnEditorChange>((update) => {
      workbenchStore.setCurrentDocumentContent(update.content);

      const filePath = workbenchStore.currentDocument.get()?.filePath;

      if (filePath) {
        workbenchStore.scheduleFileAutosave(filePath, update.content);
      }
    }, []);

    const onEditorScroll = useCallback<OnEditorScroll>((position) => {
      workbenchStore.setCurrentDocumentScrollPosition(position);
    }, []);

    const onFileSelect = useCallback(
      (filePath: string | undefined) => {
        workbenchStore.setSelectedFile(filePath);
        workbenchStore.currentView.set('code');

        if (filePath && useMobileWorkbench && mobilePanel === 'files') {
          onMobilePanelChange?.('editor');
        }
      },
      [mobilePanel, onMobilePanelChange, useMobileWorkbench],
    );

    const onFileSave = useCallback(() => {
      const filePath = workbenchStore.currentDocument.get()?.filePath;

      workbenchStore
        .saveCurrentDocument()
        .then(() => {
          /*
           * Refresh all previews via the workbench's own previews store. Using
           * the standalone usePreviewStore() singleton instead spun up a SECOND
           * PreviewsStore — double-patching localStorage.setItem and refreshing a
           * store bound to a stale runtime after a project switch.
           */
          workbenchStore.refreshAllPreviews();
          toast.success(
            filePath
              ? formatWorkbenchSurfaceCopy(copy['workbenchSurface.files.savedNamed'], {
                  file: filePath.split('/').pop() ?? filePath,
                })
              : copy['workbenchSurface.files.saved'],
            { toastId: 'file-saved' },
          );
        })
        .catch(() => {
          toast.error(copy['workbenchSurface.files.saveFailed']);
        });
    }, [copy]);

    const onFileReset = useCallback(() => {
      workbenchStore.resetCurrentDocument();
    }, []);

    const [mobilePreviewRunFeedbackState, setMobilePreviewRunFeedbackState] = useState<CompactPreviewRunState | null>(
      null,
    );

    const resolvedMobilePreviewRunState = resolveCompactPreviewRunState({
      previewServerStatus: previewServerState.status,
      runtimeRunning: hasReadyPreview || isWorkspaceReallyRunning(workspaceStatus),
      runtimeStarting: workspaceUiState(workspaceStatus) === 'starting',
    });

    const mobilePreviewRunState = mobilePreviewRunFeedbackState ?? resolvedMobilePreviewRunState;

    const isMobilePreviewRunActive = isCompactPreviewRunActive(mobilePreviewRunState);
    const isMobilePreviewStopping = mobilePreviewRunState === 'stopping';
    const isMobilePreviewTransitioning = mobilePreviewRunState === 'starting' || mobilePreviewRunState === 'stopping';

    useEffect(() => {
      if (!mobilePreviewRunFeedbackState) {
        return;
      }

      if (mobilePreviewRunFeedbackState === 'starting' && resolvedMobilePreviewRunState !== 'idle') {
        setMobilePreviewRunFeedbackState(null);
      }

      if (
        mobilePreviewRunFeedbackState === 'stopping' &&
        (resolvedMobilePreviewRunState === 'stopping' || !isCompactPreviewRunActive(resolvedMobilePreviewRunState))
      ) {
        setMobilePreviewRunFeedbackState(null);
      }
    }, [mobilePreviewRunFeedbackState, resolvedMobilePreviewRunState]);

    const runMobilePreview = useCallback(() => {
      workbenchStore.currentView.set('preview');

      if (isMobilePreviewRunActive) {
        setMobilePreviewRunFeedbackState('stopping');
        void workbenchStore.stopPreviewServer().catch(() => {
          setMobilePreviewRunFeedbackState(null);
          toast.error(copy['workbenchSurface.preview.stopFailed']);
        });

        return;
      }

      setMobilePreviewRunFeedbackState('starting');
      void workbenchStore.startPreviewServer().catch(() => {
        setMobilePreviewRunFeedbackState(null);
        toast.error(copy['workbenchSurface.preview.startFailed']);
      });
    }, [copy, isMobilePreviewRunActive]);

    const handleSelectFile = useCallback((filePath: string) => {
      workbenchStore.setSelectedFile(filePath);
      workbenchStore.currentView.set('diff');
    }, []);

    const handleSyncFiles = useCallback(async () => {
      setIsSyncing(true);

      try {
        const directoryHandle = await window.showDirectoryPicker();
        await workbenchStore.syncFiles(directoryHandle);
        toast.success(copy['workbenchSurface.sync.success']);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.error('Error syncing files:', error);
        toast.error(copy['workbenchSurface.sync.failed']);
      } finally {
        setIsSyncing(false);
      }
    }, [copy]);

    const activeWorkbenchView: WorkbenchViewType = resolveActiveWorkbenchView({
      useMobileWorkbench,
      mobilePanel,
      selectedView,
    });

    /*
     * AV-UX point 1 — on mobile the toolbar's sidebar toggle and close button
     * are display:none'd by the responsive stylesheet, so for every panel but
     * the editor (Run/Review actions) the row rendered as an EMPTY 48px strip
     * under the mobile header (seen on Webview). Only the editor keeps it.
     */
    const showWorkbenchToolbar = !useMobileWorkbench || mobilePanel === 'editor';

    return (
      chatStarted && (
        <motion.div
          initial="closed"
          animate={showWorkbench ? 'open' : 'closed'}
          variants={workbenchVariants}
          className={classNames('z-workbench', {
            'bolt-workbench-mobile': useMobileWorkbench,
          })}
        >
          <div
            className={classNames(
              'fixed top-[calc(var(--header-height)+1.2rem)] bottom-6 w-[var(--workbench-inner-width)] z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
              {
                'w-full': isSmallViewport,
                'top-[calc(var(--header-height)+3rem+env(safe-area-inset-top,0px))] bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]':
                  useMobileWorkbench,
                'left-0': showWorkbench && isSmallViewport,
                'left-[var(--workbench-left)]': showWorkbench,
                'left-[100%]': !showWorkbench,
              },
            )}
          >
            <div className="absolute inset-0 px-2 lg:px-4">
              <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm rounded-lg overflow-hidden">
                {showWorkbenchToolbar ? (
                  <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor gap-1.5 overflow-x-auto">
                    <button
                      className={`${showChat ? 'i-ph:sidebar-simple-fill' : 'i-ph:sidebar-simple'} text-lg text-bolt-elements-textSecondary mr-1`}
                      aria-label={showChat ? copy['workbenchSurface.agent.hide'] : copy['workbenchSurface.agent.show']}
                      title={showChat ? copy['workbenchSurface.agent.hide'] : copy['workbenchSurface.agent.show']}
                      disabled={!canHideChat || isSmallViewport}
                      onClick={() => {
                        if (canHideChat) {
                          chatStore.setKey('showChat', !showChat);
                        }
                      }}
                    />
                    {!useMobileWorkbench && <WorkbenchTabBar selected={selectedView} onSelect={setSelectedView} />}
                    {/*
                     * SCR-002 — « supprimer la ligne redondante "Aperçu" sous l'en-tête
                     * Webview, et tout sous-titre qui répète le titre de son panneau ».
                     *
                     * Cette ligne redisait le nom du panneau actif alors que l'en-tête
                     * mobile l'affiche déjà, une trentaine de pixels plus haut : mesuré
                     * en production à 390 px, « Webview » à y=14 et « Aperçu » à y=62 —
                     * deux fois la même information, pour deux rangées de hauteur prises
                     * à l'aperçu lui-même. Le nom vient de `ECODE_MOBILE_TAB_META`, qui
                     * couvre exactement les mêmes panneaux : rien n'est perdu.
                     *
                     * Les libellés du catalogue restent en place — ils servent aux
                     * étiquettes d'accessibilité de la coque mobile.
                     *
                     * SEULE EXCEPTION : le Terminal. Sa surface mobile est GELÉE par Avi
                     * (ref IMG_9149) ; lui retirer son en-tête la modifierait. Il garde
                     * donc son libellé, et lui seul.
                     */}
                    {useMobileWorkbench && mobilePanel === 'terminal' && (
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                        <span className="truncate">{SHELL_TERMINAL_LABEL}</span>
                      </div>
                    )}
                    <div className="ml-auto" />
                    {selectedView === 'code' && !useMobileWorkbench && (
                      <div className="flex min-w-0 overflow-x-auto">
                        {/* Export Chat Button */}
                        <ExportChatButton exportChat={exportChat} />

                        {/* Sync Button */}
                        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden ml-1">
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger
                              disabled={isSyncing || streaming}
                              className={classNames(buttonVariants({ variant: 'primary', size: 'sm' }), 'gap-1.5')}
                            >
                              {isSyncing ? copy['workbenchSurface.sync.syncing'] : copy['workbenchSurface.sync.action']}
                              <span className={classNames('i-ph:caret-down transition-transform')} />
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content
                              className={classNames(
                                'min-w-[min(240px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-24px))] overflow-auto z-[250]',
                                'bg-bolt-elements-background-depth-2',
                                'rounded-lg shadow-lg',
                                'border border-bolt-elements-borderColor',
                                'animate-in fade-in-0 zoom-in-95',
                                'py-1',
                              )}
                              sideOffset={5}
                              align="end"
                              collisionPadding={12}
                              hideWhenDetached
                            >
                              <DropdownMenu.Item
                                className={classNames(
                                  'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                                )}
                                onClick={handleSyncFiles}
                                disabled={isSyncing}
                              >
                                <div className="flex items-center gap-2">
                                  {isSyncing ? (
                                    <div className="i-ph:spinner animate-spin" />
                                  ) : (
                                    <div className="i-ph:cloud-arrow-down" />
                                  )}
                                  <span className="whitespace-normal">
                                    {isSyncing
                                      ? copy['workbenchSurface.sync.syncing']
                                      : copy['workbenchSurface.sync.files']}
                                  </span>
                                </div>
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Root>
                        </div>

                        {/* Toggle Terminal Button */}
                        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden ml-1">
                          <button
                            onClick={() => {
                              workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                            }}
                            className={classNames(buttonVariants({ variant: 'primary', size: 'sm' }), 'gap-1.5')}
                          >
                            <div className="i-ph:terminal" />
                            <span className="whitespace-nowrap">{copy['workbenchSurface.terminal.toggle']}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedView === 'diff' && !useMobileWorkbench && (
                      <FileModifiedDropdown fileHistory={fileHistory} onSelectFile={handleSelectFile} />
                    )}
                    {useMobileWorkbench && mobilePanel === 'editor' && (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          className={classNames('bolt-workbench-mobile-action bolt-workbench-mobile-run-action', {
                            'is-running': isMobilePreviewRunActive,
                            'is-error': mobilePreviewRunState === 'error',
                          })}
                          type="button"
                          aria-busy={isMobilePreviewTransitioning || undefined}
                          aria-label={compactPreviewRunAriaLabel(mobilePreviewRunState, language)}
                          aria-pressed={isMobilePreviewRunActive}
                          data-preview-state={previewServerState.status}
                          data-run-state={mobilePreviewRunState}
                          data-testid="mobile-editor-run-toggle"
                          onClick={runMobilePreview}
                          disabled={isMobilePreviewStopping}
                          title={compactPreviewRunAriaLabel(mobilePreviewRunState, language)}
                        >
                          <span className={compactPreviewRunIcon(mobilePreviewRunState)} aria-hidden />
                          <span>{compactPreviewRunText(mobilePreviewRunState, language)}</span>
                        </button>
                        <button
                          className="bolt-workbench-mobile-action"
                          type="button"
                          onClick={() => setSelectedView(selectedView === 'diff' ? 'code' : 'diff')}
                        >
                          {selectedView === 'diff'
                            ? copy['workbenchSurface.review.editor']
                            : copy['workbenchSurface.review.review']}
                        </button>
                      </div>
                    )}
                    <IconButton
                      icon="i-ph:x-circle"
                      title={copy['workbenchSurface.close']}
                      className="-mr-1"
                      size="xl"
                      onClick={() => {
                        workbenchStore.showWorkbench.set(false);
                      }}
                    />
                  </div>
                ) : null}
                <div className="relative flex-1 overflow-hidden">
                  <View initial={{ x: '0%' }} animate={{ x: activeWorkbenchView === 'code' ? '0%' : '-100%' }}>
                    <EditorPanel
                      editorDocument={currentDocument}
                      isStreaming={isStreaming}
                      selectedFile={selectedFile}
                      files={files}
                      unsavedFiles={unsavedFiles}
                      fileHistory={fileHistory}
                      onFileSelect={onFileSelect}
                      onEditorScroll={onEditorScroll}
                      onEditorChange={onEditorChange}
                      onFileSave={onFileSave}
                      onFileReset={onFileReset}
                      mobilePanel={
                        mobilePanel === 'files' ||
                        mobilePanel === 'search' ||
                        mobilePanel === 'locks' ||
                        mobilePanel === 'terminal'
                          ? mobilePanel
                          : 'editor'
                      }
                    />
                  </View>
                  <View
                    initial={{ x: '100%' }}
                    animate={{
                      x: activeWorkbenchView === 'diff' ? '0%' : activeWorkbenchView === 'code' ? '100%' : '-100%',
                    }}
                  >
                    <PanelBoundary title={copy['workbenchSurface.tab.diff']}>
                      <DiffView fileHistory={fileHistory} setFileHistory={setFileHistory} />
                    </PanelBoundary>
                  </View>
                  <View initial={{ x: '100%' }} animate={{ x: activeWorkbenchView === 'preview' ? '0%' : '100%' }}>
                    <PanelBoundary title={copy['workbenchSurface.tab.preview']}>
                      <Preview
                        setSelectedElement={setSelectedElement}
                        projectId={projectId}
                        autoStart={shouldAutoRunPreview({
                          isMobileWorkbench: useMobileWorkbench,
                          hasProject: Boolean(projectId),
                          isPreviewTabActive: activeWorkbenchView === 'preview',
                        })}
                      />
                    </PanelBoundary>
                  </View>
                  <View initial={{ x: '100%' }} animate={{ x: activeWorkbenchView === 'git' ? '0%' : '100%' }}>
                    <PanelBoundary title={copy['workbenchSurface.tab.git']}>
                      {projectId ? (
                        <GitTab projectId={projectId} />
                      ) : (
                        <div className="flex h-full items-center justify-center p-4 text-sm text-bolt-elements-textSecondary">
                          {copy['workbenchSurface.git.unavailable']}
                        </div>
                      )}
                    </PanelBoundary>
                  </View>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )
    );
  },
);

// View component for rendering content with motion transitions
interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});
