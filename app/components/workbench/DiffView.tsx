import { useStore } from '@nanostores/react';
import { diffLines, type Change } from 'diff';
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getHighlighter } from 'shiki';
import { formatModifiedTime } from './diff-modified-time';
import type { EditorDocument } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ConfirmationDialog } from '~/components/ui/Dialog';
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
}

const FullscreenButton = memo(({ onClick, isFullscreen }: FullscreenButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    className="ml-4 p-1 rounded hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
    title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
  >
    <div className={isFullscreen ? 'i-ph:corners-in' : 'i-ph:corners-out'} />
  </button>
));

const FullscreenOverlay = memo(
  ({ isFullscreen, onClose, children }: { isFullscreen: boolean; onClose?: () => void; children: React.ReactNode }) => {
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
      <div
        className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-6"
        onClick={() => onClose?.()}
      >
        <div
          className="w-full h-full max-w-[90vw] max-h-[90vh] bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor shadow-xl overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
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

const renderContentWarning = (type: 'binary' | 'error') => (
  <div className="h-full flex items-center justify-center p-4">
    <div className="text-center text-bolt-elements-textTertiary">
      <div className={`i-ph:${type === 'binary' ? 'file-x' : 'warning-circle'} text-4xl text-red-400 mb-2 mx-auto`} />
      <p className="font-medium text-bolt-elements-textPrimary">
        {type === 'binary' ? 'Binary file detected' : 'Error processing file'}
      </p>
      <p className="text-sm mt-1">
        {type === 'binary' ? 'Diff view is not available for binary files' : 'Could not generate diff preview'}
      </p>
    </div>
  </div>
);

const NoChangesView = memo(
  ({
    beforeCode,
    language,
    highlighter,
    theme,
  }: {
    beforeCode: string;
    language: string;
    highlighter: any;
    theme: string;
  }) => (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="text-center text-bolt-elements-textTertiary">
        <div className="i-ph:files text-4xl text-green-400 mb-2 mx-auto" />
        <p className="font-medium text-bolt-elements-textPrimary">Files are identical</p>
        <p className="text-sm mt-1">Both versions match exactly</p>
      </div>
      <div className="mt-4 w-full max-w-2xl bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor overflow-hidden">
        <div className="p-2 text-xs font-bold text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor">
          Current Content
        </div>
        <div className="overflow-auto max-h-96">
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
  }: {
    filename: string;
    hasChanges: boolean;
    onToggleFullscreen: () => void;
    isFullscreen: boolean;
    beforeCode: string;
    afterCode: string;
    lastModified?: number;
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

    return (
      <div className="flex items-center bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary shrink-0">
        <div className="i-ph:file mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">{filename}</span>
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {hasChanges ? (
            <>
              {showStats && (
                <div className="flex items-center gap-1 text-xs">
                  {additions > 0 && <span className="text-[var(--status-success-text)]">+{additions}</span>}
                  {deletions > 0 && <span className="text-[var(--status-error-text)]">-{deletions}</span>}
                </div>
              )}
              <span className="text-[var(--status-warning-text)]">Modified</span>
              {formatModifiedTime(lastModified) && (
                <span className="text-bolt-elements-textTertiary text-xs">{formatModifiedTime(lastModified)}</span>
              )}
            </>
          ) : (
            <span className="text-[var(--status-success-text)]">No Changes</span>
          )}
          <FullscreenButton onClick={onToggleFullscreen} isFullscreen={isFullscreen} />
        </span>
      </div>
    );
  },
);

// Create and manage a single highlighter instance at the module level
let highlighterInstance: any = null;
let highlighterPromise: Promise<any> | null = null;

const getSharedHighlighter = async () => {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (highlighterPromise) {
    return highlighterPromise;
  }

  highlighterPromise = getHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [...DIFF_SUPPORTED_LANGS],
  });

  highlighterInstance = await highlighterPromise;
  highlighterPromise = null;

  // Clear the promise once resolved
  return highlighterInstance;
};

const InlineDiffComparison = memo(
  ({ beforeCode, afterCode, filename, language, lastModified }: CodeComparisonProps) => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Use state to hold the shared highlighter instance
    const [highlighter, setHighlighter] = useState<any>(null);
    const theme = useStore(themeStore);

    const toggleFullscreen = useCallback(() => {
      setIsFullscreen((prev) => !prev);
    }, []);

    const { unifiedBlocks, hasChanges, isBinary, error } = useProcessChanges(beforeCode, afterCode);

    useEffect(() => {
      // Fetch the shared highlighter instance
      getSharedHighlighter().then(setHighlighter);

      /*
       * No cleanup needed here for the highlighter instance itself,
       * as it's managed globally. Shiki instances don't typically
       * need disposal unless you are dynamically loading/unloading themes/languages.
       * If you were dynamically loading, you might need a more complex
       * shared instance manager with reference counting or similar.
       * For static themes/langs, a single instance is sufficient.
       */
    }, []); // Empty dependency array ensures this runs only once on mount

    if (isBinary || error) {
      return renderContentWarning(isBinary ? 'binary' : 'error');
    }

    // Render a loading state or null while highlighter is not ready
    if (!highlighter) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-bolt-elements-textTertiary">Loading diff...</div>
        </div>
      );
    }

    return (
      <FullscreenOverlay isFullscreen={isFullscreen} onClose={() => setIsFullscreen(false)}>
        <div className="w-full h-full flex flex-col">
          <FileInfo
            filename={filename}
            hasChanges={hasChanges}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            beforeCode={beforeCode}
            afterCode={afterCode}
            lastModified={lastModified}
          />
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
              <NoChangesView beforeCode={beforeCode} language={language} highlighter={highlighter} theme={theme} />
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
  const files = useStore(workbenchStore.files) as FileMap;
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument) as EditorDocument;
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

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
      <div className="flex w-full h-full justify-center items-center bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
        Select a file to view differences
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

    try {
      workbenchStore.setCurrentDocumentContent(effectiveOriginalContent);

      /*
       * Revert still goes through the conflict prompt: if the file moved on disk
       * since it was loaded, silently clobbering it would destroy someone else's
       * write. On conflict the dialog takes over and the history entry stays put
       * until the user actually resolves it.
       */
      const outcome = await workbenchStore.saveFileWithConflictPrompt(selectedFile);

      if (outcome === 'conflict') {
        return;
      }

      setFileHistory((prev) => {
        const next = { ...prev };
        delete next[selectedFile];

        return next;
      });
    } finally {
      setReverting(false);
      setRevertOpen(false);
    }
  };

  try {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {hasDiff ? (
          <div className="flex shrink-0 items-center justify-end border-b border-bolt-elements-borderColor px-3 py-1.5">
            <button
              type="button"
              onClick={() => setRevertOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              <span className="i-ph:arrow-counter-clockwise" aria-hidden />
              Revert file
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
          />
        </div>
        <ConfirmationDialog
          isOpen={revertOpen}
          title="Revert file?"
          description={`This restores ${diffBasename} to its content before these edits and saves it. This can't be undone from here.`}
          confirmLabel={reverting ? 'Reverting…' : 'Revert file'}
          cancelLabel="Keep changes"
          variant="destructive"
          isLoading={reverting}
          onConfirm={() => void revertFile()}
          onClose={() => setRevertOpen(false)}
        />
      </div>
    );
  } catch (error) {
    console.error('DiffView render error:', error);
    return (
      <div className="flex w-full h-full justify-center items-center bg-bolt-elements-background-depth-1 text-[var(--status-error-text)]">
        <div className="text-center">
          <div className="i-ph:warning-circle text-4xl mb-2" />
          <p>Failed to render diff view</p>
        </div>
      </div>
    );
  }
});
