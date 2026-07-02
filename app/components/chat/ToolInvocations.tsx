import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useMemo, useState, useEffect } from 'react';
import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';
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
  className?: string;
  code: string;
  theme: Theme;
}

function JsonCodeBlock({ className, code, theme }: JsonCodeBlockProps) {
  let formattedCode = code;

  try {
    if (typeof formattedCode === 'object') {
      formattedCode = JSON.stringify(formattedCode, null, 2);
    } else if (typeof formattedCode === 'string') {
      // Attempt to parse and re-stringify for formatting
      try {
        const parsed = JSON.parse(formattedCode);
        formattedCode = JSON.stringify(parsed, null, 2);
      } catch {
        // Leave as is if not JSON
      }
    }
  } catch (e) {
    // If parsing fails, keep original code
    logger.error('Failed to parse JSON', { error: e });
  }

  return (
    <div
      className={classNames('text-xs rounded-md overflow-hidden mcp-tool-invocation-code', className)}
      dangerouslySetInnerHTML={{
        __html: jsonHighlighter.codeToHtml(formattedCode, {
          lang: 'json',
          theme: theme === 'dark' ? 'dark-plus' : 'light-plus',
        }),
      }}
      style={{
        padding: '0',
        margin: '0',
      }}
    ></div>
  );
}

interface ToolInvocationsProps {
  toolInvocations: ToolInvocationUIPart[];
  toolCallAnnotations: ToolCallAnnotation[];
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const ToolInvocations = memo(({ toolInvocations, toolCallAnnotations, addToolResult }: ToolInvocationsProps) => {
  const theme = useStore(themeStore);
  const [showDetails, setShowDetails] = useState(false);

  const toggleDetails = () => {
    setShowDetails((prev) => !prev);
  };

  const toolCalls = useMemo(
    () => toolInvocations.filter((inv) => inv.toolInvocation.state === 'call'),
    [toolInvocations],
  );

  const toolResults = useMemo(
    () => toolInvocations.filter((inv) => inv.toolInvocation.state === 'result'),
    [toolInvocations],
  );

  const hasToolCalls = toolCalls.length > 0;
  const hasToolResults = toolResults.length > 0;

  if (!hasToolCalls && !hasToolResults) {
    return null;
  }

  /*
   * Compact, inline, collapsed-by-default summary (agent-panel UX refonte): the
   * tool activity is an EVENT inside the agent turn, not a fixed widget that
   * hides the agent's answer. Header is a single line — "🔧 Tool calls · R/T ·
   * P% ▸" — and both the in-flight calls and the results only expand on tap, so
   * the agent's streamed text stays the primary content.
   */
  const total = toolCalls.length + toolResults.length;
  const resolved = toolResults.length;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const running = hasToolCalls;

  return (
    <div className="tool-invocation border border-bolt-elements-borderColor flex flex-col overflow-hidden rounded-lg w-full transition-border duration-150">
      <button
        type="button"
        onClick={toggleDetails}
        aria-expanded={showDetails}
        aria-label={showDetails ? 'Collapse tool calls' : 'Expand tool calls'}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-artifacts-backgroundHover"
      >
        <span
          className={`${running ? 'i-ph:circle-notch animate-spin text-bolt-elements-item-contentAccent' : 'i-ph:wrench text-bolt-elements-textSecondary'} text-base shrink-0`}
          aria-hidden
        />
        <span className="font-medium text-bolt-elements-textPrimary">Tool calls</span>
        <span className="text-bolt-elements-textSecondary truncate">
          · {resolved}/{total} · {pct}%
        </span>
        <span
          className={`[margin-inline-start:auto] shrink-0 ${showDetails ? 'i-ph:caret-down' : 'i-ph:caret-right'} text-bolt-elements-textSecondary`}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            className="details overflow-hidden"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15, ease: cubicEasingFn }}
          >
            <div className="bg-bolt-elements-artifacts-borderColor h-[1px]" />

            {hasToolCalls && (
              <div className="px-3 py-3 text-left bg-bolt-elements-background-depth-2">
                <ToolCallsList
                  toolInvocations={toolCalls}
                  toolCallAnnotations={toolCallAnnotations}
                  addToolResult={addToolResult}
                  theme={theme}
                />
              </div>
            )}

            {hasToolResults && (
              <div className="p-5 text-left bg-bolt-elements-actions-background">
                <ToolResultsList
                  toolInvocations={toolResults}
                  toolCallAnnotations={toolCallAnnotations}
                  theme={theme}
                />
              </div>
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
}

const ToolResultsList = memo(({ toolInvocations, toolCallAnnotations, theme }: ToolResultsListProps) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ul className="list-none space-y-4">
        {toolInvocations.map((tool, index) => {
          const toolCallState = tool.toolInvocation.state;

          if (toolCallState !== 'result') {
            return null;
          }

          const { toolName, toolCallId } = tool.toolInvocation;

          const annotation = toolCallAnnotations.find((annotation) => {
            return annotation.toolCallId === toolCallId;
          });

          const isErrorResult = [TOOL_NO_EXECUTE_FUNCTION, TOOL_EXECUTION_DENIED, TOOL_EXECUTION_ERROR].includes(
            tool.toolInvocation.result,
          );

          return (
            <motion.li
              key={index}
              variants={toolVariants}
              initial="hidden"
              animate="visible"
              transition={{
                duration: 0.2,
                ease: cubicEasingFn,
              }}
            >
              <div className="flex items-center gap-1.5 text-xs mb-1">
                {isErrorResult ? (
                  <div className="text-lg text-bolt-elements-icon-error">
                    <div className="i-ph:x"></div>
                  </div>
                ) : (
                  <div className="text-lg text-bolt-elements-icon-success">
                    <div className="i-ph:check"></div>
                  </div>
                )}
                <div className="text-bolt-elements-textSecondary text-xs">Server:</div>
                <div className="text-bolt-elements-textPrimary font-semibold">{annotation?.serverName}</div>
              </div>

              <div className="ml-6 mb-2">
                <div className="text-bolt-elements-textSecondary text-xs mb-1">
                  Tool: <span className="text-bolt-elements-textPrimary font-semibold">{toolName}</span>
                </div>
                <div className="text-bolt-elements-textSecondary text-xs mb-1">
                  Description:{' '}
                  <span className="text-bolt-elements-textPrimary font-semibold">{annotation?.toolDescription}</span>
                </div>
                <div className="text-bolt-elements-textSecondary text-xs mb-1">Parameters:</div>
                <div className="bg-bolt-elements-background-depth-1 p-3 rounded-md">
                  <JsonCodeBlock className="mb-0" code={JSON.stringify(tool.toolInvocation.args)} theme={theme} />
                </div>
                <div className="text-bolt-elements-textSecondary text-xs mt-3 mb-1">Result:</div>
                <div className="bg-bolt-elements-background-depth-1 p-3 rounded-md">
                  <JsonCodeBlock className="mb-0" code={JSON.stringify(tool.toolInvocation.result)} theme={theme} />
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
});

interface ToolCallsListProps {
  toolInvocations: ToolInvocationUIPart[];
  toolCallAnnotations: ToolCallAnnotation[];
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  theme: Theme;
}

/**
 * Resolve which tool-call id the global Cmd/Ctrl+Enter / +Backspace shortcut should target.
 *
 * The shortcut is unambiguous only when exactly one tool call is pending approval. When two or
 * more calls are pending concurrently there is no way to know which prompt the user is looking at,
 * and silently approving/rejecting the first-keyed one is a data-affecting mistake. In that case we
 * return `null` so the keyboard handler is a no-op and the user must click the intended button.
 *
 * `pendingIds` is the list of tool-call ids currently awaiting a decision (i.e. in the `call` state).
 */
export function resolveShortcutTargetId(pendingIds: string[]): string | null {
  return pendingIds.length === 1 ? pendingIds[0] : null;
}

const ToolCallsList = memo(({ toolInvocations, toolCallAnnotations, addToolResult }: ToolCallsListProps) => {
  const [expanded, setExpanded] = useState<{ [id: string]: boolean }>({});

  // OS detection for shortcut display
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const expandedState: { [id: string]: boolean } = {};
    toolInvocations.forEach((inv) => {
      if (inv.toolInvocation.state === 'call') {
        expandedState[inv.toolInvocation.toolCallId] = true;
      }
    });
    setExpanded(expandedState);
  }, [toolInvocations]);

  // Keyboard shortcut logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea/contenteditable
      const active = document.activeElement as HTMLElement | null;

      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }

      /*
       * Only fire the global shortcut when a single tool call is pending approval. With multiple
       * concurrent prompts there is no reliable way to tell which one the user means, so we require
       * an explicit button click instead of guessing the first-keyed id.
       */
      const openId = resolveShortcutTargetId(Object.keys(expanded).filter((id) => expanded[id]));

      if (!openId) {
        return;
      }

      // Cancel: Cmd/Ctrl + Backspace
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        addToolResult({
          toolCallId: openId,
          result: TOOL_EXECUTION_APPROVAL.REJECT,
        });
      }

      // Run tool: Cmd/Ctrl + Enter
      if ((isMac ? e.metaKey : e.ctrlKey) && (e.key === 'Enter' || e.key === 'Return')) {
        e.preventDefault();
        addToolResult({
          toolCallId: openId,
          result: TOOL_EXECUTION_APPROVAL.APPROVE,
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded, addToolResult, isMac]);

  /*
   * The global keyboard shortcut only acts when a single tool call is pending; otherwise it would
   * ambiguously target the first-keyed call. Hide the per-button shortcut hint when it is inactive
   * so the affordance never lies about what Cmd/Ctrl+Enter will do.
   */
  const pendingCount = toolInvocations.filter((inv) => inv.toolInvocation.state === 'call').length;
  const shortcutActive = pendingCount === 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ul className="list-none space-y-4">
        {toolInvocations.map((tool, index) => {
          const toolCallState = tool.toolInvocation.state;

          if (toolCallState !== 'call') {
            return null;
          }

          const { toolName, toolCallId } = tool.toolInvocation;
          const annotation = toolCallAnnotations.find((annotation) => annotation.toolCallId === toolCallId);

          return (
            <motion.li
              key={index}
              variants={toolVariants}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.2, ease: cubicEasingFn }}
            >
              <div className="bg-bolt-elements-background-depth-3 rounded-lg p-2">
                <div key={toolCallId} className="flex gap-1">
                  <div className="flex flex-col items-center ">
                    <span className="[margin-inline-end:auto] font-light font-normal text-md text-bolt-elements-textPrimary rounded-md">
                      {toolName}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary font-light break-words max-w-64">
                      {annotation?.toolDescription}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 [margin-inline-start:auto]">
                    <button
                      className={classNames(
                        'h-10 px-2.5 py-1.5 rounded-lg text-xs h-auto',
                        'bg-transparent',
                        'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
                        'transition-all duration-200',
                        'flex items-center gap-2',
                      )}
                      onClick={() =>
                        addToolResult({
                          toolCallId,
                          result: TOOL_EXECUTION_APPROVAL.REJECT,
                        })
                      }
                    >
                      Cancel{' '}
                      {shortcutActive && (
                        <span className="opacity-70 text-xs ml-1">{isMac ? '⌘⌫' : 'Ctrl+Backspace'}</span>
                      )}
                    </button>
                    <button
                      className={classNames(
                        'h-10 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-normal rounded-lg transition-colors',
                        'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                        'text-accent-500 hover:text-bolt-elements-textPrimary',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                      onClick={() =>
                        addToolResult({
                          toolCallId,
                          result: TOOL_EXECUTION_APPROVAL.APPROVE,
                        })
                      }
                    >
                      Run tool{' '}
                      {shortcutActive && <span className="opacity-70 text-xs ml-1">{isMac ? '⌘↵' : 'Ctrl+Enter'}</span>}
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
});
