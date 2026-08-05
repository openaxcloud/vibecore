import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';

import {
  formatToolInvocationsCopy,
  formatToolInvocationsNumber,
  formatToolInvocationsPercent,
  formatToolInvocationsProgress,
  getToolInvocationSafeResultCopy,
  getToolInvocationsCopy,
  resolveToolInvocationsLanguage,
  type ToolInvocationSafeResultKind,
  type ToolInvocationsCopy,
} from '~/lib/i18n/catalogs/tool-invocations';
import { themeStore, type Theme } from '~/lib/stores/theme';
import type { ToolCallAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import {
  TOOL_EXECUTION_APPROVAL,
  TOOL_EXECUTION_DENIED,
  TOOL_EXECUTION_ERROR,
  TOOL_NO_EXECUTE_FUNCTION,
} from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';

const highlighterOptions = {
  langs: ['json'],
  themes: ['light-plus', 'dark-plus'],
};

const jsonHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> =
  import.meta.hot?.data?.jsonHighlighter ?? (await createHighlighter(highlighterOptions));

if (import.meta.hot?.data) {
  import.meta.hot.data.jsonHighlighter = jsonHighlighter;
}

interface JsonCodeBlockProps {
  ariaLabel: string;
  className?: string;
  code: string;
  theme: Theme;
}

function JsonCodeBlock({ ariaLabel, className, code, theme }: JsonCodeBlockProps) {
  let formattedCode = code;

  try {
    const parsed = JSON.parse(formattedCode);
    formattedCode = JSON.stringify(parsed, null, 2);
  } catch {
    // Non-JSON tool output is intentionally rendered verbatim.
  }

  try {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className={classNames(
          'm-0 max-w-full overflow-x-auto rounded-md p-0 text-xs mcp-tool-invocation-code',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
          className,
        )}
        dangerouslySetInnerHTML={{
          __html: jsonHighlighter.codeToHtml(formattedCode, {
            lang: 'json',
            theme: theme === 'dark' ? 'dark-plus' : 'light-plus',
          }),
        }}
      />
    );
  } catch (error) {
    logger.error('Failed to highlight tool invocation JSON', { error });

    return (
      <pre
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className={classNames(
          'm-0 max-w-full overflow-x-auto whitespace-pre rounded-md p-3 text-xs text-bolt-elements-textPrimary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
          className,
        )}
      >
        {formattedCode}
      </pre>
    );
  }
}

type AddToolResult = ({ toolCallId, result }: { toolCallId: string; result: any }) => void;

interface ToolInvocationsProps {
  toolInvocations: ToolInvocationUIPart[];
  toolCallAnnotations: ToolCallAnnotation[];
  addToolResult: AddToolResult;
}

/**
 * Application-owned approval/error sentinels are UI state, not tool output. Classifying only these
 * exact values prevents internal English error strings from leaking while preserving arbitrary
 * server names, tool names, arguments, results, stderr, and user-authored content without localization.
 */
export function classifyToolInvocationSafeResult(result: unknown): ToolInvocationSafeResultKind | null {
  if (result === TOOL_EXECUTION_APPROVAL.APPROVE) {
    return 'approved';
  }

  if (result === TOOL_EXECUTION_APPROVAL.REJECT || result === TOOL_EXECUTION_DENIED) {
    return 'denied';
  }

  if (result === TOOL_NO_EXECUTE_FUNCTION) {
    return 'unavailable';
  }

  if (result === TOOL_EXECUTION_ERROR) {
    return 'failed';
  }

  return null;
}

export function serializeToolInvocationValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);

    return serialized === undefined ? String(value) : serialized;
  } catch (error) {
    logger.error('Failed to serialize tool invocation value', { error });

    return String(value);
  }
}

export const ToolInvocations = memo(({ toolInvocations, toolCallAnnotations, addToolResult }: ToolInvocationsProps) => {
  const theme = useStore(themeStore);
  const { i18n } = useTranslation();
  const language = resolveToolInvocationsLanguage(i18n?.resolvedLanguage ?? i18n?.language);
  const copy = getToolInvocationsCopy(language);
  const reduceMotion = Boolean(useReducedMotion());
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();
  const pendingHeadingId = useId();
  const resultsHeadingId = useId();

  const toolCalls = useMemo(
    () => toolInvocations.filter((invocation) => invocation.toolInvocation.state === 'call'),
    [toolInvocations],
  );

  const toolResults = useMemo(
    () => toolInvocations.filter((invocation) => invocation.toolInvocation.state === 'result'),
    [toolInvocations],
  );

  const hasToolCalls = toolCalls.length > 0;
  const hasToolResults = toolResults.length > 0;

  if (!hasToolCalls && !hasToolResults) {
    return null;
  }

  const total = toolCalls.length + toolResults.length;
  const resolved = toolResults.length;
  const ratio = total > 0 ? resolved / total : 0;
  const running = hasToolCalls;
  const progress = formatToolInvocationsProgress(resolved, total, language);
  const status = copy[running ? 'toolInvocations.summary.running' : 'toolInvocations.summary.complete'];
  const toggleLabel = copy[showDetails ? 'toolInvocations.summary.collapse' : 'toolInvocations.summary.expand'];

  return (
    <div className="tool-invocation flex min-w-0 w-full flex-col overflow-hidden rounded-lg border border-bolt-elements-borderColor transition-border duration-150">
      <button
        type="button"
        onClick={() => setShowDetails((previous) => !previous)}
        aria-controls={detailsId}
        aria-expanded={showDetails}
        aria-label={`${toggleLabel}. ${status}. ${progress}`}
        className={classNames(
          'flex min-h-[44px] w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-xs',
          'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-artifacts-backgroundHover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vc-ide-focus-ring)]',
        )}
      >
        <span
          className={classNames(
            running
              ? 'i-ph:circle-notch motion-safe:animate-spin text-bolt-elements-item-contentAccent'
              : 'i-ph:wrench text-bolt-elements-textSecondary',
            'shrink-0 text-base',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 break-words font-medium leading-5 text-bolt-elements-textPrimary">
          {copy['toolInvocations.summary.label']}
          <span
            className="ms-1.5 inline whitespace-nowrap font-normal text-bolt-elements-textSecondary"
            aria-hidden="true"
          >
            · {formatToolInvocationsNumber(resolved, language)}/{formatToolInvocationsNumber(total, language)} ·{' '}
            {formatToolInvocationsPercent(ratio, language)}
          </span>
        </span>
        <span
          className={classNames(
            showDetails ? 'i-ph:caret-down' : 'i-ph:caret-right',
            'ms-auto shrink-0 text-bolt-elements-textSecondary',
          )}
          aria-hidden="true"
        />
      </button>

      <span className="sr-only" aria-live="polite">
        {status}. {progress}
      </span>

      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            id={detailsId}
            className="details min-w-0 overflow-hidden"
            initial={reduceMotion ? false : { height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15, ease: cubicEasingFn }}
          >
            <div className="h-px bg-bolt-elements-artifacts-borderColor" aria-hidden="true" />

            {hasToolCalls && (
              <section
                aria-labelledby={pendingHeadingId}
                className="min-w-0 bg-bolt-elements-background-depth-2 px-3 py-4 text-left sm:px-4"
              >
                <h3 id={pendingHeadingId} className="sr-only">
                  {copy['toolInvocations.section.pending']}
                </h3>
                <ToolCallsList
                  toolInvocations={toolCalls}
                  toolCallAnnotations={toolCallAnnotations}
                  addToolResult={addToolResult}
                  copy={copy}
                  reduceMotion={reduceMotion}
                />
              </section>
            )}

            {hasToolResults && (
              <section
                aria-labelledby={resultsHeadingId}
                className="min-w-0 bg-bolt-elements-actions-background px-3 py-4 text-left sm:p-5"
              >
                <h3 id={resultsHeadingId} className="sr-only">
                  {copy['toolInvocations.section.results']}
                </h3>
                <ToolResultsList
                  toolInvocations={toolResults}
                  toolCallAnnotations={toolCallAnnotations}
                  theme={theme}
                  copy={copy}
                  language={language}
                  reduceMotion={reduceMotion}
                />
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const toolVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

interface ToolResultsListProps {
  toolInvocations: ToolInvocationUIPart[];
  toolCallAnnotations: ToolCallAnnotation[];
  theme: Theme;
  copy: ToolInvocationsCopy;
  language: string;
  reduceMotion: boolean;
}

const ToolResultsList = memo(
  ({ toolInvocations, toolCallAnnotations, theme, copy, language, reduceMotion }: ToolResultsListProps) => {
    return (
      <motion.div
        className="min-w-0"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.15 }}
      >
        <ul className="min-w-0 list-none space-y-4">
          {toolInvocations.map((tool) => {
            const toolCallState = tool.toolInvocation.state;

            if (toolCallState !== 'result') {
              return null;
            }

            const { toolName, toolCallId, args, result } = tool.toolInvocation;
            const annotation = toolCallAnnotations.find((item) => item.toolCallId === toolCallId);
            const safeResultKind = classifyToolInvocationSafeResult(result);
            const isErrorResult = safeResultKind !== null && safeResultKind !== 'approved';
            const safeResultCopy = safeResultKind ? getToolInvocationSafeResultCopy(safeResultKind, language) : null;

            const statusCopy =
              copy[
                safeResultKind === 'approved'
                  ? 'toolInvocations.status.approved'
                  : isErrorResult
                    ? 'toolInvocations.status.error'
                    : 'toolInvocations.status.success'
              ];

            return (
              <motion.li
                key={toolCallId}
                className="min-w-0"
                variants={toolVariants}
                initial={reduceMotion ? false : 'hidden'}
                animate="visible"
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: cubicEasingFn }}
              >
                <div className="mb-2 flex min-w-0 items-start gap-2 text-xs">
                  <span
                    className={classNames(
                      isErrorResult
                        ? 'i-ph:x text-bolt-elements-icon-error'
                        : 'i-ph:check text-bolt-elements-icon-success',
                      'shrink-0 text-lg',
                    )}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{statusCopy}</span>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="text-bolt-elements-textSecondary">{copy['toolInvocations.field.server']}:</span>
                    <code dir="ltr" className="min-w-0 break-all font-semibold text-bolt-elements-textPrimary">
                      {annotation?.serverName ?? '—'}
                    </code>
                  </div>
                </div>

                <div className="min-w-0 ps-0 sm:ps-7">
                  <div className="mb-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
                    <span className="text-bolt-elements-textSecondary">{copy['toolInvocations.field.tool']}:</span>
                    <code dir="ltr" className="min-w-0 break-all font-semibold text-bolt-elements-textPrimary">
                      {toolName}
                    </code>
                  </div>
                  <div className="mb-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
                    <span className="text-bolt-elements-textSecondary">
                      {copy['toolInvocations.field.description']}:
                    </span>
                    <span className="min-w-0 [overflow-wrap:anywhere] font-semibold text-bolt-elements-textPrimary">
                      {annotation?.toolDescription ?? '—'}
                    </span>
                  </div>

                  <div className="mb-1 text-xs text-bolt-elements-textSecondary">
                    {copy['toolInvocations.field.parameters']}:
                  </div>
                  <div className="min-w-0 max-w-full overflow-hidden rounded-md bg-bolt-elements-background-depth-1 p-2 sm:p-3">
                    <JsonCodeBlock
                      ariaLabel={formatToolInvocationsCopy(copy['toolInvocations.code.parametersAria'], { toolName })}
                      className="mb-0"
                      code={serializeToolInvocationValue(args)}
                      theme={theme}
                    />
                  </div>

                  <div className="mb-1 mt-3 text-xs text-bolt-elements-textSecondary">
                    {copy['toolInvocations.field.result']}:
                  </div>
                  {safeResultCopy ? (
                    <div
                      role={isErrorResult ? 'alert' : 'status'}
                      className={classNames(
                        'min-w-0 rounded-md border p-3 text-xs',
                        isErrorResult
                          ? 'border-bolt-elements-icon-error/35 bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary'
                          : 'border-bolt-elements-icon-success/35 bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary',
                      )}
                    >
                      <strong className="block font-semibold">{safeResultCopy.title}</strong>
                      <span className="mt-1 block [overflow-wrap:anywhere] text-bolt-elements-textSecondary">
                        {safeResultCopy.body}
                      </span>
                    </div>
                  ) : (
                    <div className="min-w-0 max-w-full overflow-hidden rounded-md bg-bolt-elements-background-depth-1 p-2 sm:p-3">
                      <JsonCodeBlock
                        ariaLabel={formatToolInvocationsCopy(copy['toolInvocations.code.resultAria'], { toolName })}
                        className="mb-0"
                        code={serializeToolInvocationValue(result)}
                        theme={theme}
                      />
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    );
  },
);

interface ToolCallsListProps {
  toolInvocations: ToolInvocationUIPart[];
  toolCallAnnotations: ToolCallAnnotation[];
  addToolResult: AddToolResult;
  copy: ToolInvocationsCopy;
  reduceMotion: boolean;
}

/**
 * Resolve which tool-call id the global Cmd/Ctrl+Enter / +Backspace shortcut should target.
 * The shortcut is intentionally disabled when more than one approval is pending.
 */
export function resolveShortcutTargetId(pendingIds: string[]): string | null {
  return pendingIds.length === 1 ? pendingIds[0] : null;
}

const ToolCallsList = memo(
  ({ toolInvocations, toolCallAnnotations, addToolResult, copy, reduceMotion }: ToolCallsListProps) => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    const pendingIds = useMemo(
      () =>
        toolInvocations.flatMap((invocation) =>
          invocation.toolInvocation.state === 'call' ? [invocation.toolInvocation.toolCallId] : [],
        ),
      [toolInvocations],
    );

    const shortcutTargetId = resolveShortcutTargetId(pendingIds);

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        const active = document.activeElement as HTMLElement | null;

        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
          return;
        }

        if (!shortcutTargetId) {
          return;
        }

        if ((isMac ? event.metaKey : event.ctrlKey) && event.key === 'Backspace') {
          event.preventDefault();
          addToolResult({
            toolCallId: shortcutTargetId,
            result: TOOL_EXECUTION_APPROVAL.REJECT,
          });
        }

        if ((isMac ? event.metaKey : event.ctrlKey) && (event.key === 'Enter' || event.key === 'Return')) {
          event.preventDefault();
          addToolResult({
            toolCallId: shortcutTargetId,
            result: TOOL_EXECUTION_APPROVAL.APPROVE,
          });
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [addToolResult, isMac, shortcutTargetId]);

    const shortcutActive = shortcutTargetId !== null;
    const cancelShortcut = isMac ? '⌘⌫' : 'Ctrl+Backspace';
    const runShortcut = isMac ? '⌘↵' : 'Ctrl+Enter';

    return (
      <motion.div
        className="min-w-0"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.15 }}
      >
        <ul className="min-w-0 list-none space-y-4">
          {toolInvocations.map((tool) => {
            const toolCallState = tool.toolInvocation.state;

            if (toolCallState !== 'call') {
              return null;
            }

            const { toolName, toolCallId } = tool.toolInvocation;
            const annotation = toolCallAnnotations.find((item) => item.toolCallId === toolCallId);

            const cancelAriaLabel = formatToolInvocationsCopy(copy['toolInvocations.action.cancelAria'], {
              toolName,
            });

            const runAriaLabel = formatToolInvocationsCopy(copy['toolInvocations.action.runAria'], { toolName });

            return (
              <motion.li
                key={toolCallId}
                className="min-w-0"
                variants={toolVariants}
                initial={reduceMotion ? false : 'hidden'}
                animate="visible"
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: cubicEasingFn }}
              >
                <div className="min-w-0 rounded-lg bg-bolt-elements-background-depth-3 p-3">
                  <span className="sr-only">{copy['toolInvocations.status.pending']}</span>
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <code
                        dir="ltr"
                        className="max-w-full break-all text-sm font-normal text-bolt-elements-textPrimary"
                      >
                        {toolName}
                      </code>
                      {annotation?.toolDescription ? (
                        <span className="max-w-full [overflow-wrap:anywhere] text-xs font-light text-bolt-elements-textSecondary">
                          {annotation.toolDescription}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
                      <button
                        type="button"
                        aria-label={cancelAriaLabel}
                        title={
                          shortcutActive
                            ? formatToolInvocationsCopy(copy['toolInvocations.shortcut.cancel'], {
                                shortcut: cancelShortcut,
                              })
                            : cancelAriaLabel
                        }
                        className={classNames(
                          'inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs',
                          'bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
                          'transition-colors duration-200 motion-reduce:transition-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
                        )}
                        onClick={() =>
                          addToolResult({
                            toolCallId,
                            result: TOOL_EXECUTION_APPROVAL.REJECT,
                          })
                        }
                      >
                        <span className="min-w-0 break-words">{copy['toolInvocations.action.cancel']}</span>
                        {shortcutActive && (
                          <kbd dir="ltr" aria-hidden="true" className="shrink-0 whitespace-nowrap text-xs opacity-70">
                            {cancelShortcut}
                          </kbd>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={runAriaLabel}
                        title={
                          shortcutActive
                            ? formatToolInvocationsCopy(copy['toolInvocations.shortcut.run'], {
                                shortcut: runShortcut,
                              })
                            : runAriaLabel
                        }
                        className={classNames(
                          'inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-normal',
                          'border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                          'text-accent-500 hover:text-bolt-elements-textPrimary',
                          'transition-colors motion-reduce:transition-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
                        )}
                        onClick={() =>
                          addToolResult({
                            toolCallId,
                            result: TOOL_EXECUTION_APPROVAL.APPROVE,
                          })
                        }
                      >
                        <span className="min-w-0 break-words">{copy['toolInvocations.action.run']}</span>
                        {shortcutActive && (
                          <kbd dir="ltr" aria-hidden="true" className="shrink-0 whitespace-nowrap text-xs opacity-70">
                            {runShortcut}
                          </kbd>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    );
  },
);
