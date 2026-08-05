import { useStore } from '@nanostores/react';
import { diffLines, type Change } from 'diff';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getHighlighter } from 'shiki';
import { formatModifiedTime } from './diff-modified-time';
import type { EditorDocument } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  formatDiffViewCopy,
  formatDiffViewNumber,
  formatDiffViewStatLabel,
  getDiffViewCopy,
  resolveDiffViewLanguage,
  type DiffViewCopy,
} from '~/lib/i18n/catalogs/diff-view';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import '~/styles/diff-view.css';
import type { FileHistory } from '~/types/actions';
import { diffFiles, extractRelativePath } from '~/utils/diff';
import { getLanguageFromExtension } from '~/utils/getLanguageFromExtension';

interface CodeComparisonProps {
  beforeCode: string;
  afterCode: string;
  language: string;
  locale: string;
  copy: DiffViewCopy;
  filename: string;
  lightTheme: string;
  darkTheme: string;
  lastModified?: number;
}

/*
 * Escape raw text for the pre-highlighter fallback paths below. Those branches
 * feed file content straight into dangerouslySetInnerHTML before/while shiki
 * loads; without escaping, attacker-controlled file content (e.g. `<img onerror>`)
 * is parsed as HTML — stored XSS in the diff panel.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/*
 * The grammars loaded into the shared shiki highlighter. getLanguageFromExtension can
 * return languages outside this set (e.g. 'swift', 'bash'); passing one of those to
 * codeToHtml throws synchronously inside dangerouslySetInnerHTML during a child render,
 * which the DiffView try/catch cannot catch — crashing the whole diff panel. Any language
 * not in this set is clamped to 'plaintext'.
 */
const DIFF_SUPPORTED_LANGS = [
  'typescript',
  'javascript',
  'json',
  'html',
  'css',
  'jsx',
  'tsx',
  'python',
  'php',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'ruby',
  'rust',
  'plaintext',
] as const;

function safeDiffLanguage(language: string): string {
  return (DIFF_SUPPORTED_LANGS as readonly string[]).includes(language) ? language : 'plaintext';
}

interface DiffBlock {
  lineNumber: number;
  content: string;
  type: 'added' | 'removed' | 'unchanged';
  correspondingLine?: number;
  charChanges?: Array<{
    value: string;
    type: 'added' | 'removed' | 'unchanged';
  }>;
}

interface FullscreenButtonProps {
  onClick: () => void;
  isFullscreen: boolean;
  enterLabel: string;
  exitLabel: string;
}

const FullscreenButton = memo(({ onClick, isFullscreen, enterLabel, exitLabel }: FullscreenButtonProps) => {
  const label = isFullscreen ? exitLabel : enterLabel;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] motion-reduce:transition-none"
      title={label}
    >
      <span className={isFullscreen ? 'i-ph:corners-in' : 'i-ph:corners-out'} aria-hidden="true" />
    </button>
  );
});

const FullscreenOverlay = memo(
  ({
    isFullscreen,
    onClose,
    dialogLabel,
    closeLabel,
    children,
  }: {
    isFullscreen: boolean;
    onClose?: () => void;
    dialogLabel: string;
    closeLabel: string;
    children: React.ReactNode;
  }) => {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!isFullscreen || !onClose) {
        return undefined;
      }

      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', onKey);
      dialogRef.current?.focus();

      return () => document.removeEventListener('keydown', onKey);
    }, [isFullscreen, onClose]);

    if (!isFullscreen) {
      return <>{children}</>;
    }

    /*
     * Portal to <body>: rendered inline, the fixed overlay is clamped to the
     * nearest transformed/contained ancestor (the workbench panel) instead of
     * the viewport. Backdrop click + Escape (above) close it.
     */
    if (typeof document === 'undefined') {
      return null;
    }

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 lg:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={dialogLabel}
          tabIndex={-1}
          className="relative z-10 h-full max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] sm:max-h-[90dvh] sm:max-w-[90vw]"
        >
          {children}
        </div>
        <button
          type="button"
          className="absolute inset-0 min-h-11 min-w-11 cursor-default bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vc-ide-accent-action)]"
          aria-label={closeLabel}
          title={closeLabel}
          onClick={() => onClose?.()}
        />
      </div>,
      document.body,
    );
  },
);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const BINARY_REGEX = /[\x00-\x08\x0E-\x1F]/;

const isBinaryFile = (content: string) => {
  return content.length > MAX_FILE_SIZE || BINARY_REGEX.test(content);
};

export const processChanges = (beforeCode: string, afterCode: string) => {
  try {
    if (isBinaryFile(beforeCode) || isBinaryFile(afterCode)) {
      return {
        beforeLines: [],
        afterLines: [],
        hasChanges: false,
        lineChanges: { before: new Set(), after: new Set() },
        unifiedBlocks: [],
        isBinary: true,
      };
    }

    // Normalize line endings and content
    const normalizeContent = (content: string): string[] => {
      return content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd());
    };

    const beforeLines = normalizeContent(beforeCode);
    const afterLines = normalizeContent(afterCode);

    // Early return if files are identical
    if (beforeLines.join('\n') === afterLines.join('\n')) {
      return {
        beforeLines,
        afterLines,
        hasChanges: false,
        lineChanges: { before: new Set(), after: new Set() },
        unifiedBlocks: [],
        isBinary: false,
      };
    }

    const lineChanges = {
      before: new Set<number>(),
      after: new Set<number>(),
    };

    const unifiedBlocks: DiffBlock[] = [];

    // Compare lines directly for more accurate diff
    let i = 0,
      j = 0;

    while (i < beforeLines.length || j < afterLines.length) {
      if (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
        // Unchanged line
        unifiedBlocks.push({
          lineNumber: j,
          content: afterLines[j],
          type: 'unchanged',
          correspondingLine: i,
        });
        i++;
        j++;
      } else {
        // Look ahead for potential matches
        let matchFound = false;

        const lookAhead = 3; // Number of lines to look ahead

        // Try to find matching lines ahead
        for (let k = 1; k <= lookAhead && i + k < beforeLines.length && j + k < afterLines.length; k++) {
          if (beforeLines[i + k] === afterLines[j]) {
            // Found match in after lines - mark lines as removed
            for (let l = 0; l < k; l++) {
              lineChanges.before.add(i + l);
              unifiedBlocks.push({
                lineNumber: i + l,
                content: beforeLines[i + l],
                type: 'removed',
                correspondingLine: j,
                charChanges: [{ value: beforeLines[i + l], type: 'removed' }],
              });
            }
            i += k;
            matchFound = true;
            break;
          } else if (beforeLines[i] === afterLines[j + k]) {
            // Found match in before lines - mark lines as added
            for (let l = 0; l < k; l++) {
              lineChanges.after.add(j + l);
              unifiedBlocks.push({
                lineNumber: j + l,
                content: afterLines[j + l],
                type: 'added',
                correspondingLine: i,
                charChanges: [{ value: afterLines[j + l], type: 'added' }],
              });
            }
            j += k;
            matchFound = true;
            break;
          }
        }

        if (!matchFound) {
          // No match found - try to find character-level changes
          if (i < beforeLines.length && j < afterLines.length) {
            const beforeLine = beforeLines[i];
            const afterLine = afterLines[j];

            // Find common prefix and suffix
            let prefixLength = 0;

            while (
              prefixLength < beforeLine.length &&
              prefixLength < afterLine.length &&
              beforeLine[prefixLength] === afterLine[prefixLength]
            ) {
              prefixLength++;
            }

            let suffixLength = 0;

            while (
              suffixLength < beforeLine.length - prefixLength &&
              suffixLength < afterLine.length - prefixLength &&
              beforeLine[beforeLine.length - 1 - suffixLength] === afterLine[afterLine.length - 1 - suffixLength]
            ) {
              suffixLength++;
            }

            const prefix = beforeLine.slice(0, prefixLength);
            const beforeMiddle = beforeLine.slice(prefixLength, beforeLine.length - suffixLength);
            const afterMiddle = afterLine.slice(prefixLength, afterLine.length - suffixLength);
            const suffix = beforeLine.slice(beforeLine.length - suffixLength);

            if (beforeMiddle || afterMiddle) {
              // There are character-level changes
              if (beforeMiddle) {
                lineChanges.before.add(i);
                unifiedBlocks.push({
                  lineNumber: i,
                  content: beforeLine,
                  type: 'removed',
                  correspondingLine: j,
                  charChanges: [
                    { value: prefix, type: 'unchanged' },
                    { value: beforeMiddle, type: 'removed' },
                    { value: suffix, type: 'unchanged' },
                  ],
                });
                i++;
              }

              if (afterMiddle) {
                lineChanges.after.add(j);
                unifiedBlocks.push({
                  lineNumber: j,
                  content: afterLine,
                  type: 'added',
                  correspondingLine: i - 1,
                  charChanges: [
                    { value: prefix, type: 'unchanged' },
                    { value: afterMiddle, type: 'added' },
                    { value: suffix, type: 'unchanged' },
                  ],
                });
                j++;
              }
            } else {
              // No character-level changes found, treat as regular line changes
              if (i < beforeLines.length) {
                lineChanges.before.add(i);
                unifiedBlocks.push({
                  lineNumber: i,
                  content: beforeLines[i],
                  type: 'removed',
                  correspondingLine: j,
                  charChanges: [{ value: beforeLines[i], type: 'removed' }],
                });
                i++;
              }

              if (j < afterLines.length) {
                lineChanges.after.add(j);
                unifiedBlocks.push({
                  lineNumber: j,
                  content: afterLines[j],
                  type: 'added',
                  correspondingLine: i - 1,
                  charChanges: [{ value: afterLines[j], type: 'added' }],
                });
                j++;
              }
            }
          } else {
            // Handle remaining lines
            if (i < beforeLines.length) {
              lineChanges.before.add(i);
              unifiedBlocks.push({
                lineNumber: i,
                content: beforeLines[i],
                type: 'removed',
                correspondingLine: j,
                charChanges: [{ value: beforeLines[i], type: 'removed' }],
              });
              i++;
            }

            if (j < afterLines.length) {
              lineChanges.after.add(j);
              unifiedBlocks.push({
                lineNumber: j,
                content: afterLines[j],
                type: 'added',
                correspondingLine: i - 1,
                charChanges: [{ value: afterLines[j], type: 'added' }],
              });
              j++;
            }
          }
        }
      }
    }

    // Sort blocks by line number
    const processedBlocks = unifiedBlocks.sort((a, b) => a.lineNumber - b.lineNumber);

    return {
      beforeLines,
      afterLines,
      hasChanges: lineChanges.before.size > 0 || lineChanges.after.size > 0,
      lineChanges,
      unifiedBlocks: processedBlocks,
      isBinary: false,
    };
  } catch (error) {
    console.error('Error processing changes:', error);
    return {
      beforeLines: [],
      afterLines: [],
      hasChanges: false,
      lineChanges: { before: new Set(), after: new Set() },
      unifiedBlocks: [],
      error: true,
      isBinary: false,
    };
  }
};

/*
 * Compute additions/deletions for the diff-stat badges from jsdiff `diffLines`
 * output. jsdiff line chunks end with a trailing newline, so a naive
 * `value.split('\n').length` yields a spurious empty final segment and inflates
 * the count by one per chunk (a single-line edit would report +2/-2). Prefer the
 * chunk's own `count`, falling back to a trailing-newline-stripped split. This
 * mirrors the already-fixed computation in Workbench.client.tsx.
 */
export function computeDiffStat(changes: Change[]): { additions: number; deletions: number } {
  return changes.reduce(
    (acc: { additions: number; deletions: number }, change: Change) => {
      const lineCount = change.count ?? change.value.replace(/\n$/, '').split('\n').length;

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
}

const lineNumberStyles =
  'w-9 shrink-0 pl-2 py-1 text-left font-mono text-bolt-elements-textTertiary border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1';
const lineContentStyles =
  'px-1 py-1 font-mono whitespace-pre flex-1 group-hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary';

const diffPanelStyles = 'h-full overflow-auto diff-panel-content';

// Updated color styles for better consistency
const diffLineStyles = {
  added: 'bg-green-500/10 dark:bg-green-500/20 border-l-4 border-green-500',
  removed: 'bg-red-500/10 dark:bg-red-500/20 border-l-4 border-red-500',
  unchanged: '',
};

const changeColorStyles = {
  added: 'text-[var(--status-success-text)] bg-green-500/10 dark:bg-green-500/20',
  removed: 'text-[var(--status-error-text)] bg-red-500/10 dark:bg-red-500/20',
  unchanged: 'text-bolt-elements-textPrimary',
};

const renderContentWarning = (type: 'binary' | 'error', copy: DiffViewCopy) => {
  const title = type === 'binary' ? copy['diffView.warning.binary.title'] : copy['diffView.warning.processing.title'];

  const description =
    type === 'binary' ? copy['diffView.warning.binary.description'] : copy['diffView.warning.processing.description'];

  return (
    <div
      className="flex h-full min-w-0 items-center justify-center bg-bolt-elements-background-depth-1 p-4 text-bolt-elements-textPrimary sm:p-6"
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="max-w-md min-w-0 text-center text-bolt-elements-textTertiary">
        <span
          className={`i-ph:${type === 'binary' ? 'file-x' : 'warning-circle'} mx-auto mb-3 block text-4xl text-[var(--status-error-text)]`}
          aria-hidden="true"
        />
        <p className="break-words font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">{title}</p>
        <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{description}</p>
      </div>
    </div>
  );
};

const NoChangesView = memo(
  ({
    beforeCode,
    language,
    highlighter,
    theme,
    copy,
  }: {
    beforeCode: string;
    language: string;
    highlighter: any;
    theme: string;
    copy: DiffViewCopy;
  }) => (
    <div className="flex h-full min-w-0 flex-col items-center justify-center bg-bolt-elements-background-depth-1 p-4 sm:p-6">
      <div className="min-w-0 max-w-md text-center text-bolt-elements-textTertiary" role="status">
        <span className="i-ph:files mx-auto mb-3 block text-4xl text-[var(--status-success-text)]" aria-hidden="true" />
        <p className="break-words font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
          {copy['diffView.identical.title']}
        </p>
        <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{copy['diffView.identical.description']}</p>
      </div>
      <div className="mt-4 w-full min-w-0 max-w-2xl overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="break-words border-b border-bolt-elements-borderColor p-2 text-xs font-bold text-bolt-elements-textTertiary [overflow-wrap:anywhere]">
          {copy['diffView.identical.currentContent']}
        </div>
        <div className="max-h-96 overflow-auto">
          {beforeCode.split('\n').map((line, index) => (
            <div key={index} className="flex group min-w-fit">
              <div className={lineNumberStyles}>{index + 1}</div>
              <div className={lineContentStyles}>
                <span className="mr-2"> </span>
                <span
                  dangerouslySetInnerHTML={{
                    __html: highlighter
                      ? highlighter
                          .codeToHtml(line, {
                            lang: language,
                            theme: theme === 'dark' ? 'github-dark' : 'github-light',
                          })
                          .replace(/<\/?pre[^>]*>/g, '')
                          .replace(/<\/?code[^>]*>/g, '')
                      : escapeHtml(line),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
);

// Otimização do processamento de diferenças com memoização
const useProcessChanges = (beforeCode: string, afterCode: string) => {
  return useMemo(() => processChanges(beforeCode, afterCode), [beforeCode, afterCode]);
};

// Componente otimizado para renderização de linhas de código
const CodeLine = memo(
  ({
    lineNumber,
    content,
    type,
    highlighter,
    language,
    block,
    theme,
  }: {
    lineNumber: number;
    content: string;
    type: 'added' | 'removed' | 'unchanged';
    highlighter: any;
    language: string;
    block: DiffBlock;
    theme: string;
  }) => {
    const bgColor = diffLineStyles[type];

    const renderContent = () => {
      if (type === 'unchanged' || !block.charChanges) {
        const highlightedCode = highlighter
          ? highlighter
              .codeToHtml(content, { lang: language, theme: theme === 'dark' ? 'github-dark' : 'github-light' })
              .replace(/<\/?pre[^>]*>/g, '')
              .replace(/<\/?code[^>]*>/g, '')
          : escapeHtml(content);
        return <span dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
      }

      return (
        <>
          {block.charChanges.map((change, index) => {
            const changeClass = changeColorStyles[change.type];

            const highlightedCode = highlighter
              ? highlighter
                  .codeToHtml(change.value, {
                    lang: language,
                    theme: theme === 'dark' ? 'github-dark' : 'github-light',
                  })
                  .replace(/<\/?pre[^>]*>/g, '')
                  .replace(/<\/?code[^>]*>/g, '')
              : escapeHtml(change.value);

            return <span key={index} className={changeClass} dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
          })}
        </>
      );
    };

    return (
      <div className="flex group min-w-fit">
        <div className={lineNumberStyles}>{lineNumber + 1}</div>
        <div className={`${lineContentStyles} ${bgColor}`}>
          <span className="mr-2 text-bolt-elements-textTertiary">
            {type === 'added' && <span className="text-[var(--status-success-text)]">+</span>}
            {type === 'removed' && <span className="text-[var(--status-error-text)]">-</span>}
            {type === 'unchanged' && ' '}
          </span>
          {renderContent()}
        </div>
      </div>
    );
  },
);

// Componente para exibir informações sobre o arquivo
const FileInfo = memo(
  ({
    filename,
    hasChanges,
    onToggleFullscreen,
    isFullscreen,
    beforeCode,
    afterCode,
    lastModified,
    copy,
    locale,
  }: {
    filename: string;
    hasChanges: boolean;
    onToggleFullscreen: () => void;
    isFullscreen: boolean;
    beforeCode: string;
    afterCode: string;
    lastModified?: number;
    copy: DiffViewCopy;
    locale: string;
  }) => {
    /*
     * Calculate additions and deletions from the current document.
     *
     * Derive the counts from the SAME diff that drives the rendered body
     * (`processChanges`, which normalizes lines with `trimEnd()` only) instead of
     * a separate `diffLines(..., { ignoreWhitespace: true })`. Otherwise an edit
     * that only changes leading whitespace/indentation highlights red/green lines
     * in the body (processChanges sees a change) while the whitespace-insensitive
     * stat reports +0/-0, leaving a "Modified" badge with no change counts.
     */
    const { additions, deletions } = useMemo(() => {
      if (!hasChanges) {
        return { additions: 0, deletions: 0 };
      }

      const { lineChanges } = processChanges(beforeCode, afterCode);

      return { additions: lineChanges.after.size, deletions: lineChanges.before.size };
    }, [hasChanges, beforeCode, afterCode]);

    const showStats = additions > 0 || deletions > 0;
    const modifiedTime = formatModifiedTime(lastModified, locale);

    return (
      <div className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm text-bolt-elements-textPrimary sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-2 sm:items-center">
          <span className="i-ph:file mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
          <span className="min-w-0 break-all [overflow-wrap:anywhere]">{filename}</span>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end">
          {hasChanges ? (
            <>
              {showStats && (
                <div className="flex items-center gap-1 text-xs">
                  {additions > 0 && (
                    <span
                      className="text-[var(--status-success-text)]"
                      aria-label={formatDiffViewStatLabel('additions', additions, locale)}
                    >
                      +{formatDiffViewNumber(additions, locale)}
                    </span>
                  )}
                  {deletions > 0 && (
                    <span
                      className="text-[var(--status-error-text)]"
                      aria-label={formatDiffViewStatLabel('deletions', deletions, locale)}
                    >
                      -{formatDiffViewNumber(deletions, locale)}
                    </span>
                  )}
                </div>
              )}
              <span className="text-[var(--status-warning-text)]" aria-live="polite">
                {copy['diffView.status.modified']}
              </span>
              {modifiedTime && lastModified !== undefined && (
                <time
                  dateTime={new Date(lastModified).toISOString()}
                  aria-label={formatDiffViewCopy(copy['diffView.status.modifiedAt'], { date: modifiedTime })}
                  className="break-words text-xs text-bolt-elements-textTertiary [overflow-wrap:anywhere]"
                >
                  {modifiedTime}
                </time>
              )}
            </>
          ) : (
            <span className="text-[var(--status-success-text)]" role="status">
              {copy['diffView.status.noChanges']}
            </span>
          )}
          <span className="ml-auto sm:ml-1">
            <FullscreenButton
              onClick={onToggleFullscreen}
              isFullscreen={isFullscreen}
              enterLabel={copy['diffView.fullscreen.enter']}
              exitLabel={copy['diffView.fullscreen.exit']}
            />
          </span>
        </div>
      </div>
    );
  },
);

// Create and manage a single highlighter instance at the module level
let highlighterInstance: any = null;
let highlighterPromise: Promise<any> | null = null;

const HIGHLIGHTER_TIMEOUT_MS = 15_000;

const getSharedHighlighter = async () => {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (highlighterPromise) {
    return highlighterPromise;
  }

  const pendingHighlighter = getHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [...DIFF_SUPPORTED_LANGS],
  });
  highlighterPromise = pendingHighlighter;

  try {
    highlighterInstance = await pendingHighlighter;

    return highlighterInstance;
  } finally {
    if (highlighterPromise === pendingHighlighter) {
      highlighterPromise = null;
    }
  }
};

type HighlighterStatus = 'loading' | 'ready' | 'error';

const InlineDiffComparison = memo(
  ({ beforeCode, afterCode, filename, language, locale, copy, lastModified }: CodeComparisonProps) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [highlighter, setHighlighter] = useState<any>(null);
    const [highlighterStatus, setHighlighterStatus] = useState<HighlighterStatus>('loading');
    const [loadAttempt, setLoadAttempt] = useState(0);
    const theme = useStore(themeStore);

    const toggleFullscreen = useCallback(() => {
      setIsFullscreen((prev) => !prev);
    }, []);

    const { unifiedBlocks, hasChanges, isBinary, error } = useProcessChanges(beforeCode, afterCode);

    useEffect(() => {
      let active = true;
      let timedOut = false;
      setHighlighter(null);
      setHighlighterStatus('loading');

      const timeout = window.setTimeout(() => {
        if (!active) {
          return;
        }

        timedOut = true;
        highlighterPromise = null;
        setHighlighterStatus('error');
      }, HIGHLIGHTER_TIMEOUT_MS);

      void getSharedHighlighter()
        .then((instance) => {
          if (!active || timedOut) {
            return;
          }

          window.clearTimeout(timeout);
          setHighlighter(instance);
          setHighlighterStatus('ready');
        })
        .catch((highlighterError: unknown) => {
          if (!active) {
            return;
          }

          window.clearTimeout(timeout);
          console.error('Diff syntax highlighter failed:', highlighterError);
          setHighlighterStatus('error');
        });

      return () => {
        active = false;
        window.clearTimeout(timeout);
      };
    }, [loadAttempt]);

    if (isBinary || error) {
      return renderContentWarning(isBinary ? 'binary' : 'error', copy);
    }

    if (highlighterStatus === 'loading') {
      return (
        <div
          className="flex h-full min-w-0 items-center justify-center bg-bolt-elements-background-depth-1 p-4 text-bolt-elements-textPrimary sm:p-6"
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="diff-view-loading"
        >
          <div className="w-full max-w-md min-w-0 text-center">
            <span
              className="i-ph:spinner-gap-bold mx-auto mb-3 block text-3xl text-[var(--vc-ide-accent-action)] motion-safe:animate-spin"
              aria-hidden="true"
            />
            <p className="break-words font-medium [overflow-wrap:anywhere]">{copy['diffView.loading.title']}</p>
            <p className="mt-1 break-words text-sm text-bolt-elements-textTertiary [overflow-wrap:anywhere]">
              {copy['diffView.loading.description']}
            </p>
            <div className="mx-auto mt-5 grid max-w-sm gap-2" aria-hidden="true">
              <span className="h-3 w-full rounded bg-bolt-elements-background-depth-3 motion-safe:animate-pulse" />
              <span className="h-3 w-4/5 rounded bg-bolt-elements-background-depth-3 motion-safe:animate-pulse" />
              <span className="h-3 w-3/5 rounded bg-bolt-elements-background-depth-3 motion-safe:animate-pulse" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <FullscreenOverlay
        isFullscreen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        dialogLabel={formatDiffViewCopy(copy['diffView.fullscreen.dialog'], { fileName: filename })}
        closeLabel={copy['diffView.fullscreen.close']}
      >
        <div className="flex h-full w-full min-w-0 flex-col bg-bolt-elements-background-depth-2">
          <FileInfo
            filename={filename}
            hasChanges={hasChanges}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            beforeCode={beforeCode}
            afterCode={afterCode}
            lastModified={lastModified}
            copy={copy}
            locale={locale}
          />
          {highlighterStatus === 'error' ? (
            <div
              className="flex min-w-0 flex-col gap-3 border-b border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-sm text-[var(--status-error-text)] sm:flex-row sm:items-center sm:justify-between"
              role="alert"
              data-testid="diff-view-highlighter-error"
            >
              <div className="min-w-0">
                <p className="break-words font-medium [overflow-wrap:anywhere]">
                  {copy['diffView.loading.error.title']}
                </p>
                <p className="mt-1 break-words text-xs [overflow-wrap:anywhere]">
                  {copy['diffView.loading.error.description']}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md border border-current px-4 py-2 font-medium transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] motion-reduce:transition-none sm:w-auto"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                {copy['diffView.loading.retry']}
              </button>
            </div>
          ) : null}
          <div className={diffPanelStyles}>
            {hasChanges ? (
              <div className="overflow-x-auto min-w-full">
                {unifiedBlocks.map((block, index) => (
                  <CodeLine
                    key={`${block.lineNumber}-${index}`}
                    lineNumber={block.lineNumber}
                    content={block.content}
                    type={block.type}
                    highlighter={highlighter} // Pass the shared instance
                    language={language}
                    block={block}
                    theme={theme}
                  />
                ))}
              </div>
            ) : (
              <NoChangesView
                beforeCode={beforeCode}
                language={language}
                highlighter={highlighter}
                theme={theme}
                copy={copy}
              />
            )}
          </div>
        </div>
      </FullscreenOverlay>
    );
  },
);

interface DiffViewProps {
  fileHistory: Record<string, FileHistory>;
  setFileHistory: React.Dispatch<React.SetStateAction<Record<string, FileHistory>>>;
}

export const DiffView = memo(({ fileHistory, setFileHistory }: DiffViewProps) => {
  const { i18n } = useTranslation();
  const locale = resolveDiffViewLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDiffViewCopy(locale);
  const files = useStore(workbenchStore.files) as FileMap;
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument) as EditorDocument;
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [revertFailed, setRevertFailed] = useState(false);

  useEffect(() => {
    if (selectedFile && currentDocument) {
      const file = files[selectedFile];

      if (!file || !('content' in file)) {
        return;
      }

      const existingHistory = fileHistory[selectedFile];
      const currentContent = currentDocument.value;

      // Normalizar o conteúdo para comparação
      const normalizedCurrentContent = currentContent.replace(/\r\n/g, '\n').trim();

      const normalizedOriginalContent = (existingHistory?.originalContent || file.content)
        .replace(/\r\n/g, '\n')
        .trim();

      // Se não há histórico existente, criar um novo apenas se houver diferenças
      if (!existingHistory) {
        if (normalizedCurrentContent !== normalizedOriginalContent) {
          const newChanges = diffLines(file.content, currentContent);
          setFileHistory((prev) => ({
            ...prev,
            [selectedFile]: {
              originalContent: file.content,
              lastModified: Date.now(),
              changes: newChanges,
              versions: [
                {
                  timestamp: Date.now(),
                  content: currentContent,
                },
              ],
              changeSource: 'auto-save',
            },
          }));
        }

        return;
      }

      // Se já existe histórico, verificar se há mudanças reais desde a última versão
      const lastVersion = existingHistory.versions[existingHistory.versions.length - 1];
      const normalizedLastContent = lastVersion?.content?.replace(/\r\n/g, '\n').trim();

      if (normalizedCurrentContent === normalizedLastContent) {
        return; // Não criar novo histórico se o conteúdo é o mesmo
      }

      // Verificar se há mudanças significativas usando diffFiles
      const relativePath = extractRelativePath(selectedFile);
      const unifiedDiff = diffFiles(relativePath, existingHistory.originalContent, currentContent);

      if (unifiedDiff) {
        const newChanges = diffLines(existingHistory.originalContent, currentContent);

        // Verificar se as mudanças são significativas
        const hasSignificantChanges = newChanges.some(
          (change) => (change.added || change.removed) && change.value.trim().length > 0,
        );

        if (hasSignificantChanges) {
          const newHistory: FileHistory = {
            originalContent: existingHistory.originalContent,
            lastModified: Date.now(),
            changes: [...existingHistory.changes, ...newChanges].slice(-100), // Limitar histórico de mudanças
            versions: [
              ...existingHistory.versions,
              {
                timestamp: Date.now(),
                content: currentContent,
              },
            ].slice(-10), // Manter apenas as 10 últimas versões
            changeSource: 'auto-save',
          };

          setFileHistory((prev) => ({ ...prev, [selectedFile]: newHistory }));
        }
      }
    }
  }, [selectedFile, currentDocument?.value, files, setFileHistory, unsavedFiles]);

  if (!selectedFile || !currentDocument) {
    return (
      <div
        className="flex h-full w-full min-w-0 items-center justify-center bg-bolt-elements-background-depth-1 p-4 text-bolt-elements-textPrimary sm:p-6"
        role="status"
        data-testid="diff-view-empty"
      >
        <div className="max-w-md min-w-0 text-center">
          <span
            className="i-ph:file-magnifying-glass mx-auto mb-3 block text-4xl text-bolt-elements-textTertiary"
            aria-hidden="true"
          />
          <p className="break-words font-medium [overflow-wrap:anywhere]">{copy['diffView.empty.title']}</p>
          <p className="mt-1 break-words text-sm text-bolt-elements-textTertiary [overflow-wrap:anywhere]">
            {copy['diffView.empty.description']}
          </p>
        </div>
      </div>
    );
  }

  const file = files[selectedFile];
  const originalContent = file && 'content' in file ? file.content : '';
  const currentContent = currentDocument.value;

  const history = fileHistory[selectedFile];
  const effectiveOriginalContent = history?.originalContent || originalContent;
  const diffBasename = selectedFile.split('/').pop() ?? '';

  const language = safeDiffLanguage(
    getLanguageFromExtension(diffBasename.includes('.') ? (diffBasename.split('.').pop() ?? '') : ''),
  );

  const hasDiff =
    effectiveOriginalContent.replace(/\r\n/g, '\n').trim() !== currentContent.replace(/\r\n/g, '\n').trim();

  const revertFile = async () => {
    setReverting(true);
    setRevertFailed(false);

    try {
      workbenchStore.setCurrentDocumentContent(effectiveOriginalContent);
      await workbenchStore.saveCurrentDocument();
      setFileHistory((prev) => {
        const next = { ...prev };
        delete next[selectedFile];

        return next;
      });
      setRevertOpen(false);
    } catch (revertError) {
      console.error('Diff file revert failed:', revertError);

      try {
        workbenchStore.setCurrentDocumentContent(currentContent);
      } catch (rollbackError) {
        console.error('Diff file revert rollback failed:', rollbackError);
      }

      setRevertFailed(true);
    } finally {
      setReverting(false);
    }
  };

  const closeRevertDialog = () => {
    if (reverting) {
      return;
    }

    setRevertOpen(false);
    setRevertFailed(false);
  };

  try {
    return (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-bolt-elements-background-depth-2">
        {hasDiff ? (
          <div className="flex min-w-0 shrink-0 items-center justify-end border-b border-bolt-elements-borderColor px-2 py-1.5 sm:px-3">
            <button
              type="button"
              onClick={() => {
                setRevertFailed(false);
                setRevertOpen(true);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] motion-reduce:transition-none sm:w-auto"
            >
              <span className="i-ph:arrow-counter-clockwise shrink-0" aria-hidden="true" />
              {copy['diffView.revert.action']}
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <InlineDiffComparison
            beforeCode={effectiveOriginalContent}
            afterCode={currentContent}
            language={language}
            filename={selectedFile}
            lightTheme="github-light"
            darkTheme="github-dark"
            lastModified={history?.lastModified}
            copy={copy}
            locale={locale}
          />
        </div>
        <ConfirmationDialog
          isOpen={revertOpen}
          title={copy['diffView.revert.title']}
          description={
            <div className="min-w-0">
              <p className="break-words [overflow-wrap:anywhere]">
                {formatDiffViewCopy(copy['diffView.revert.description'], { fileName: diffBasename })}
              </p>
              {revertFailed ? (
                <p
                  className="mt-3 break-words rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-[var(--status-error-text)] [overflow-wrap:anywhere]"
                  role="alert"
                >
                  {copy['diffView.revert.error']}
                </p>
              ) : null}
            </div>
          }
          confirmLabel={reverting ? copy['diffView.revert.confirming'] : copy['diffView.revert.confirm']}
          cancelLabel={copy['diffView.revert.cancel']}
          variant="destructive"
          isLoading={reverting}
          onConfirm={() => void revertFile()}
          onClose={closeRevertDialog}
        />
      </div>
    );
  } catch (error) {
    console.error('DiffView render error:', error);
    return (
      <div
        className="flex h-full w-full min-w-0 items-center justify-center bg-bolt-elements-background-depth-1 p-4 text-[var(--status-error-text)] sm:p-6"
        role="alert"
      >
        <div className="max-w-md min-w-0 text-center">
          <span className="i-ph:warning-circle mx-auto mb-3 block text-4xl" aria-hidden="true" />
          <p className="break-words font-medium [overflow-wrap:anywhere]">{copy['diffView.renderError.title']}</p>
          <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">
            {copy['diffView.renderError.description']}
          </p>
        </div>
      </div>
    );
  }
});
