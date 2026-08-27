import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { computed, map } from 'nanostores';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';
import { DiffActionRow } from './DiffActionRow';
import { type BundledArtifactState, deriveBundledArtifactState } from './bundled-artifact-state';
import {
  type ChatRenderersCopy,
  formatChatRendererDuration,
  formatChatRenderersCopy,
  getChatRenderersCopy,
} from '~/lib/i18n/catalogs/chat-renderers';
import type { ActionState } from '~/lib/runtime/action-runner';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';

const highlighterOptions = {
  langs: ['shell'],
  themes: ['light-plus', 'dark-plus'],
};

/*
 * Stable empty actions store used when an artifact is momentarily absent from the
 * workbench store (e.g. while a proposal is being accepted and artifacts are
 * reset/recreated). Reading `artifact.runner.actions` directly in that window
 * throws "Cannot read properties of undefined (reading 'runner')".
 */
const EMPTY_ACTIONS = map<Record<string, ActionState>>({});

const shellHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> =
  import.meta.hot?.data?.shellHighlighter ?? (await createHighlighter(highlighterOptions));

if (import.meta.hot?.data) {
  import.meta.hot.data.shellHighlighter = shellHighlighter;
}

interface ArtifactProps {
  messageId: string;
  artifactId: string;
}

export const Artifact = memo(({ artifactId }: ArtifactProps) => {
  const { i18n } = useTranslation();
  const copy = getChatRenderersCopy(i18n.resolvedLanguage ?? i18n.language ?? 'en');
  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(false);
  const [bundledState, setBundledState] = useState<BundledArtifactState>('running');

  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[artifactId];

  const actionsStore = artifact?.runner.actions ?? EMPTY_ACTIONS;

  const filteredActions = useMemo(
    () =>
      computed(actionsStore, (actions) => {
        // Filter out Supabase actions except for migrations
        return Object.values(actions).filter((action) => {
          // Exclude actions with type 'supabase' or actions that contain 'supabase' in their content
          return action.type !== 'supabase' && !(action.type === 'shell' && action.content?.includes('supabase'));
        });
      }),
    [actionsStore],
  );

  const actions = useStore(filteredActions);

  const toggleActions = () => {
    userToggledActions.current = true;
    setShowActions(!showActions);
  };

  useEffect(() => {
    if (actions.length && !userToggledActions.current) {
      setShowActions(true);
    }

    if (actions.length !== 0 && artifact?.type === 'bundled') {
      const nextState = deriveBundledArtifactState(actions);

      if (bundledState !== nextState) {
        setBundledState(nextState);
      }
    }
  }, [actions, artifact?.type, bundledState]);

  /*
   * The artifact may briefly be missing from the store (e.g. during proposal
   * accept/reset). Bail out after hooks have run rather than dereferencing it.
   */
  if (!artifact) {
    return null;
  }

  const isRestore = artifact?.id === 'restored-project-setup';

  /*
   * Determine the dynamic title based on state for bundled artifacts. A failed or
   * aborted setup action must surface a real failure title instead of spinning on
   * "Creating Project…" forever.
   */
  let dynamicTitle = artifact?.title; // Fallback to original title for non-bundled or if artifact is missing

  if (artifact?.type === 'bundled') {
    if (bundledState === 'failed') {
      dynamicTitle = isRestore
        ? copy['chatRenderers.artifact.restoreFailedTitle']
        : copy['chatRenderers.artifact.setupFailedTitle'];
    } else if (bundledState === 'complete') {
      dynamicTitle = isRestore
        ? copy['chatRenderers.artifact.restoredTitle']
        : copy['chatRenderers.artifact.createdTitle'];
    } else {
      dynamicTitle = isRestore
        ? copy['chatRenderers.artifact.restoringTitle']
        : copy['chatRenderers.artifact.creatingTitle'];
    }
  }

  return (
    <>
      <div className="artifact border border-bolt-elements-borderColor flex flex-col overflow-hidden rounded-lg w-full transition-border duration-150">
        <div className="flex min-w-0">
          <button
            type="button"
            className="flex min-h-11 min-w-0 w-full items-stretch overflow-hidden bg-bolt-elements-artifacts-background outline-none hover:bg-bolt-elements-artifacts-backgroundHover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-borderColorActive"
            onClick={() => {
              const showWorkbench = workbenchStore.showWorkbench.get();
              workbenchStore.showWorkbench.set(!showWorkbench);
            }}
          >
            <div className="min-w-0 w-full px-5 p-3.5 text-left">
              <div className="w-full break-words text-bolt-elements-textPrimary font-medium leading-5 text-sm">
                {/* Use the dynamic title here */}
                {dynamicTitle}
              </div>
              <div className="mt-0.5 w-full break-words text-xs text-bolt-elements-textSecondary">
                {copy['chatRenderers.artifact.openWorkbench']}
              </div>
            </div>
          </button>
          {artifact.type !== 'bundled' && <div className="bg-bolt-elements-artifacts-borderColor w-[1px]" />}
          <AnimatePresence>
            {actions.length > 0 && artifact.type !== 'bundled' && (
              <motion.button
                type="button"
                aria-label={
                  showActions ? copy['chatRenderers.artifact.hideActions'] : copy['chatRenderers.artifact.showActions']
                }
                aria-expanded={showActions}
                title={
                  showActions ? copy['chatRenderers.artifact.hideActions'] : copy['chatRenderers.artifact.showActions']
                }
                initial={{ width: 0 }}
                animate={{ width: 'auto' }}
                exit={{ width: 0 }}
                transition={{ duration: 0.15, ease: cubicEasingFn }}
                className="min-h-11 min-w-11 shrink-0 bg-bolt-elements-artifacts-background outline-none hover:bg-bolt-elements-artifacts-backgroundHover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-borderColorActive"
                onClick={toggleActions}
              >
                <div className="p-4">
                  <div className={showActions ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'} aria-hidden="true"></div>
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        {artifact.type === 'bundled' && (
          <div
            className="flex min-w-0 flex-col gap-1.5 border-t border-bolt-elements-artifacts-borderColor bg-bolt-elements-actions-background p-5"
            aria-live="polite"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <div
                className={classNames(
                  'text-lg',
                  getIconColor(
                    bundledState === 'complete' ? 'complete' : bundledState === 'failed' ? 'failed' : 'running',
                  ),
                )}
                aria-hidden="true"
              >
                {bundledState === 'complete' ? (
                  <div className="i-ph:check"></div>
                ) : bundledState === 'failed' ? (
                  <div className="i-ph:x"></div>
                ) : (
                  <div className="i-svg-spinners:90-ring-with-bg"></div>
                )}
              </div>
              <div className="min-w-0 break-words text-bolt-elements-textPrimary font-medium leading-5 text-sm">
                {bundledState === 'complete'
                  ? isRestore
                    ? copy['chatRenderers.artifact.restoreFiles']
                    : copy['chatRenderers.artifact.initialFilesCreated']
                  : bundledState === 'failed'
                    ? isRestore
                      ? copy['chatRenderers.artifact.restoreFailed']
                      : copy['chatRenderers.artifact.setupFailed']
                    : copy['chatRenderers.artifact.creatingInitialFiles']}
              </div>
            </div>
            {bundledState === 'failed' ? (
              <div className="ml-[1.625rem] break-words text-xs text-bolt-elements-icon-error" role="alert">
                {copy['chatRenderers.artifact.failureSafe']}
              </div>
            ) : null}
          </div>
        )}
        <AnimatePresence>
          {artifact.type !== 'bundled' && showActions && actions.length > 0 && (
            <motion.div
              className="actions"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: '0px' }}
              transition={{ duration: 0.15 }}
            >
              <div className="bg-bolt-elements-artifacts-borderColor h-[1px]" />

              <div className="p-5 text-left bg-bolt-elements-actions-background">
                <ActionList actions={actions} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
});

interface ShellCodeBlockProps {
  classsName?: string;
  code: string;
}

function ShellCodeBlock({ classsName, code }: ShellCodeBlockProps) {
  /* Follow the active app theme so shell previews aren't dark in light mode. */
  const activeTheme = useStore(themeStore);

  return (
    <div
      className={classNames('text-xs', classsName)}
      dangerouslySetInnerHTML={{
        __html: shellHighlighter.codeToHtml(code, {
          lang: 'shell',
          theme: activeTheme === 'light' ? 'light-plus' : 'dark-plus',
        }),
      }}
    ></div>
  );
}

interface ActionListProps {
  actions: ActionState[];
}

const actionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function openArtifactInWorkbench(filePath: any) {
  if (!filePath) {
    return;
  }

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function statusLabel(status: ActionState['status'], copy: ChatRenderersCopy): string {
  switch (status) {
    case 'pending':
      return copy['chatRenderers.artifact.status.pending'];
    case 'running':
      return copy['chatRenderers.artifact.status.running'];
    case 'complete':
      return copy['chatRenderers.artifact.status.complete'];
    case 'failed':
      return copy['chatRenderers.artifact.status.failed'];
    case 'aborted':
      return copy['chatRenderers.artifact.status.aborted'];
    default:
      return copy['chatRenderers.artifact.status.failed'];
  }
}

function ActionDurationBadge({
  action,
  copy,
  language,
}: {
  action: ActionState;
  copy: ChatRenderersCopy;
  language: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (action.status !== 'running' || !action.startedAt) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 500);

    return () => window.clearInterval(interval);
  }, [action.status, action.startedAt]);

  let durationMs: number | undefined;

  if (action.status === 'running' && action.startedAt) {
    durationMs = now - action.startedAt;
  } else if (action.startedAt && action.finishedAt) {
    durationMs = action.finishedAt - action.startedAt;
  }

  const label = formatChatRendererDuration(language, durationMs);

  if (!label) {
    return null;
  }

  return (
    <span
      className="ml-1 inline-flex items-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-1.5 py-0 text-[11px] font-medium leading-4 text-bolt-elements-textSecondary"
      aria-label={formatChatRenderersCopy(copy['chatRenderers.artifact.duration'], { duration: label })}
    >
      {label}
    </span>
  );
}

const ActionList = memo(({ actions }: ActionListProps) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getChatRenderersCopy(language);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ul className="list-none space-y-2.5">
        {actions.map((action, index) => {
          const { status, type, content } = action;
          const isLast = index === actions.length - 1;
          const hasShellPreview = type === 'shell' || type === 'start';
          const statusText = statusLabel(status, copy);

          return (
            <motion.li
              key={(type === 'file' || type === 'diff' ? action.filePath : undefined) ?? `${type}-${index}`}
              variants={actionVariants}
              initial="hidden"
              animate="visible"
              transition={{
                duration: 0.2,
                ease: cubicEasingFn,
              }}
              className="bolt-action-row min-w-0"
              data-status={status}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                <div
                  className={classNames('text-lg', getIconColor(action.status))}
                  role="status"
                  aria-label={statusText}
                >
                  {status === 'running' ? (
                    <>
                      {type !== 'start' ? (
                        <div className="i-svg-spinners:90-ring-with-bg"></div>
                      ) : (
                        <div className="i-ph:terminal-window-duotone"></div>
                      )}
                    </>
                  ) : status === 'pending' ? (
                    <div className="i-ph:circle-duotone"></div>
                  ) : status === 'complete' ? (
                    <div className="i-ph:check"></div>
                  ) : status === 'failed' || status === 'aborted' ? (
                    <div className="i-ph:x"></div>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {type === 'file' ? (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span className="shrink-0">{copy['chatRenderers.artifact.createFile']}</span>
                      <button
                        type="button"
                        className="inline-flex min-h-11 min-w-0 max-w-full items-center rounded-md bg-bolt-elements-artifacts-inlineCode-background px-1.5 py-1 text-bolt-elements-item-contentAccent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
                        onClick={() => openArtifactInWorkbench(action.filePath)}
                        aria-label={formatChatRenderersCopy(copy['chatRenderers.artifact.openFile'], {
                          path: action.filePath,
                        })}
                      >
                        <code className="truncate text-bolt-elements-artifacts-inlineCode-text">{action.filePath}</code>
                      </button>
                    </div>
                  ) : type === 'diff' ? (
                    <DiffActionRow
                      filePath={action.filePath}
                      diffApply={action.diffApply}
                      onOpenFile={openArtifactInWorkbench}
                    />
                  ) : type === 'shell' ? (
                    <span className="flex min-h-11 flex-1 items-center break-words">
                      {copy['chatRenderers.artifact.runCommand']}
                    </span>
                  ) : type === 'start' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        workbenchStore.currentView.set('preview');
                      }}
                      className="flex min-h-11 min-w-0 flex-1 items-center rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
                    >
                      {copy['chatRenderers.artifact.startApplication']}
                    </button>
                  ) : null}
                </div>
                {statusText ? (
                  <span
                    className={classNames(
                      'shrink-0 rounded-full border px-1.5 py-0 text-[11px] font-medium leading-4',
                      'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                      status === 'complete'
                        ? 'text-bolt-elements-icon-success'
                        : status === 'failed'
                          ? 'text-bolt-elements-icon-error'
                          : status === 'running'
                            ? 'text-bolt-elements-loader-progress'
                            : 'text-bolt-elements-textSecondary',
                    )}
                  >
                    {statusText}
                  </span>
                ) : null}
                <ActionDurationBadge action={action} copy={copy} language={language} />
              </div>
              {hasShellPreview && content ? (
                <details
                  className={classNames('bolt-action-row-details mt-1', { 'mb-3.5': !isLast })}
                  open={status === 'running' || status === 'failed'}
                >
                  <summary className="inline-flex min-h-11 max-w-full cursor-pointer select-none items-center break-words rounded-md text-xs text-bolt-elements-textSecondary outline-none hover:text-bolt-elements-textPrimary focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive">
                    {status === 'failed'
                      ? copy['chatRenderers.artifact.showFailedCommand']
                      : copy['chatRenderers.artifact.showCommand']}
                  </summary>
                  <ShellCodeBlock classsName="mt-1" code={content} />
                </details>
              ) : null}
              {status === 'failed' ? (
                <div
                  className={classNames('mt-1 break-words text-xs text-bolt-elements-icon-error', {
                    'mb-3.5': !isLast,
                  })}
                  role="alert"
                >
                  {copy['chatRenderers.artifact.actionFailedSafe']}
                </div>
              ) : null}
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
});

function getIconColor(status: ActionState['status']) {
  switch (status) {
    case 'pending': {
      return 'text-bolt-elements-textTertiary';
    }
    case 'running': {
      return 'text-bolt-elements-loader-progress';
    }
    case 'complete': {
      return 'text-bolt-elements-icon-success';
    }
    case 'aborted': {
      return 'text-bolt-elements-textSecondary';
    }
    case 'failed': {
      return 'text-bolt-elements-icon-error';
    }
    default: {
      return undefined;
    }
  }
}
