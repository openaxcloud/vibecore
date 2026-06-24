import { acceptCompletion, autocompletion, closeBrackets, insertBracket } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import type * as MonacoTypes from 'monaco-editor';
import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type EditorBreakpoint = 'desktop' | 'tablet-landscape' | 'tablet-portrait' | 'mobile';
export type EditorKind = 'monaco' | 'codemirror';

export const MOBILE_BREAKPOINT = 768;
export const MOBILE_LANDSCAPE_MAX_HEIGHT = 500;
export const TABLET_MIN_WIDTH = 768;
export const TABLET_MAX_WIDTH = 1199;
export const TOUCH_TABLET_MAX_WIDTH = 1366;

export interface EditorAdapterValue {
  value: string;
  filePath?: string;
  language?: string;
  readOnly?: boolean;
}

export interface EditorChange {
  value: string;
  source: EditorKind;
}

export interface EditorAdapterProps extends EditorAdapterValue {
  theme?: 'dark' | 'light';
  autoFocus?: boolean;
  largeFile?: boolean;
  minimapEnabled?: boolean;
  projectFiles?: Record<string, string>;
  className?: string;
  onChange?: (change: EditorChange) => void;
  onSave?: () => void;
}

export const editorMinimapPreviewOptions = {
  autohide: false,
  side: 'right',
  size: 'proportional',
  showSlider: 'always',
  renderCharacters: true,
  maxColumn: 140,
  scale: 1.35,
} satisfies Omit<MonacoTypes.editor.IEditorMinimapOptions, 'enabled'>;

export function getEditorMinimapOptions({
  largeFile,
  minimapEnabled,
}: {
  largeFile?: boolean;
  minimapEnabled?: boolean;
}): MonacoTypes.editor.IEditorMinimapOptions {
  const enabled = !largeFile && minimapEnabled !== false;

  return enabled ? { enabled, ...editorMinimapPreviewOptions } : { enabled: false };
}

const monacoMinimapThemeColors = {
  dark: {
    'minimap.background': '#0A0F1C',
    'minimap.foregroundOpacity': '#F5F9FCCC',
    'minimapSlider.background': '#0099FF2E',
    'minimapSlider.hoverBackground': '#0099FF52',
    'minimapSlider.activeBackground': '#0099FF7A',
  },
  light: {
    'minimap.background': '#F8FAFC',
    'minimap.foregroundOpacity': '#0F172ACC',
    'minimapSlider.background': '#006ADC24',
    'minimapSlider.hoverBackground': '#006ADC42',
    'minimapSlider.activeBackground': '#006ADC66',
  },
} as const;

export interface ResponsiveLayoutState {
  breakpoint: EditorBreakpoint;
  isDesktop: boolean;
  isTablet: boolean;
  isTabletLandscape: boolean;
  isTabletPortrait: boolean;
  isMobile: boolean;
  isLandscape: boolean;
  isMobileLandscape: boolean;
  prefersReducedMotion: boolean;
  hasCoarsePointer: boolean;
  safeArea: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

export function detectMobileViewport(width: number, height = Number.POSITIVE_INFINITY): boolean {
  if (width < MOBILE_BREAKPOINT) {
    return true;
  }

  return height < MOBILE_LANDSCAPE_MAX_HEIGHT;
}

const breakpointFromViewport = (width: number, height: number, coarsePointer = false): EditorBreakpoint => {
  if (detectMobileViewport(width, height)) {
    return 'mobile';
  }

  const isTouchTabletWidth = coarsePointer && width <= TOUCH_TABLET_MAX_WIDTH;

  if (width > TABLET_MAX_WIDTH && !isTouchTabletWidth) {
    return 'desktop';
  }

  if (width >= TABLET_MIN_WIDTH && (width <= TABLET_MAX_WIDTH || isTouchTabletWidth) && width > height) {
    return 'tablet-landscape';
  }

  if (width >= TABLET_MIN_WIDTH && (width <= TABLET_MAX_WIDTH || isTouchTabletWidth)) {
    return 'tablet-portrait';
  }

  return 'mobile';
};

export function getResponsiveLayoutState(
  width: number,
  heightOrOptions: number | { coarsePointer?: boolean; reducedMotion?: boolean } = Number.POSITIVE_INFINITY,
  options?: { coarsePointer?: boolean; reducedMotion?: boolean },
): ResponsiveLayoutState {
  const height = typeof heightOrOptions === 'number' ? heightOrOptions : Number.POSITIVE_INFINITY;
  const resolvedOptions = typeof heightOrOptions === 'number' ? options : heightOrOptions;
  const breakpoint = breakpointFromViewport(width, height, resolvedOptions?.coarsePointer ?? false);
  const isLandscape = width > height;

  return {
    breakpoint,
    isDesktop: breakpoint === 'desktop',
    isTablet: breakpoint === 'tablet-landscape' || breakpoint === 'tablet-portrait',
    isTabletLandscape: breakpoint === 'tablet-landscape',
    isTabletPortrait: breakpoint === 'tablet-portrait',
    isMobile: breakpoint === 'mobile',
    isLandscape,
    isMobileLandscape: breakpoint === 'mobile' && isLandscape,
    prefersReducedMotion: resolvedOptions?.reducedMotion ?? false,
    hasCoarsePointer: resolvedOptions?.coarsePointer ?? false,
    safeArea: {
      top: 'env(safe-area-inset-top, 0px)',
      right: 'env(safe-area-inset-right, 0px)',
      bottom: 'env(safe-area-inset-bottom, 0px)',
      left: 'env(safe-area-inset-left, 0px)',
    },
  };
}

export function useResponsiveLayout(): ResponsiveLayoutState {
  const readState = () => {
    if (typeof window === 'undefined') {
      return getResponsiveLayoutState(1200, 900);
    }

    return getResponsiveLayoutState(window.innerWidth, window.innerHeight, {
      coarsePointer: window.matchMedia('(pointer: coarse)').matches || window.navigator.maxTouchPoints > 0,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  };

  const [state, setState] = useState<ResponsiveLayoutState>(readState);

  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

    const update = () => setState(readState());

    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(update, 100);
    };

    update();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', update);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', update);

      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, []);

  return state;
}

export function useEditorAdapter(): EditorKind {
  const layout = useResponsiveLayout();
  return editorKindForLayout(layout);
}

export function editorKindForLayout(layout: Pick<ResponsiveLayoutState, 'isDesktop'>): EditorKind {
  if (layout.isDesktop) {
    return 'monaco';
  }

  return 'codemirror';
}

const WORKSPACE_SYMBOL_EXTENSIONS =
  /\.(tsx|ts|jsx|js|mjs|cjs|css|scss|html|json|md|mdx|py|go|rs|java|c|cc|cpp|h|hpp|cs)$/i;

const MAX_WORKSPACE_INDEX_FILES = 250;
const MAX_WORKSPACE_INDEX_FILE_BYTES = 500_000;

export function languageForPath(filePath?: string, fallback?: string) {
  if (fallback) {
    return fallback;
  }

  if (!filePath) {
    return 'plaintext';
  }

  const extension = filePath.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
      return 'java';
    case 'c':
    case 'h':
      return 'c';
    case 'cc':
    case 'cpp':
    case 'hpp':
      return 'cpp';
    case 'cs':
      return 'csharp';
    default:
      return 'plaintext';
  }
}

export interface WorkspaceSymbol {
  name: string;
  kind: 'class' | 'function' | 'variable' | 'component' | 'selector';
  filePath: string;
  line: number;
  column: number;
}

export function isWorkspaceSemanticFile(filePath: string, contents: string) {
  return WORKSPACE_SYMBOL_EXTENSIONS.test(filePath) && contents.length <= MAX_WORKSPACE_INDEX_FILE_BYTES;
}

export function extractWorkspaceSymbols(filePath: string, contents: string): WorkspaceSymbol[] {
  if (!isWorkspaceSemanticFile(filePath, contents)) {
    return [];
  }

  const symbols: WorkspaceSymbol[] = [];
  const seen = new Set<string>();

  const patterns: Array<{ regex: RegExp; kind: WorkspaceSymbol['kind']; group?: number }> = [
    { regex: /\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, kind: 'function' },
    { regex: /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: 'function' },
    { regex: /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: 'function' },
    { regex: /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, kind: 'class' },
    { regex: /\bclass\s+([A-Za-z_$][\w$]*)/g, kind: 'class' },
    { regex: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, kind: 'variable' },
    {
      regex: /\b(?:const|let|var)\s+([A-Z][\w$]*)\s*=\s*(?:memo\(|forwardRef\(|\([^)]*\)\s*=>|function\b)/g,
      kind: 'component',
    },
    { regex: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, kind: 'variable' },
    { regex: /^\s*([.#][A-Za-z_-][\w-]*)\s*[{,]/gm, kind: 'selector' },
  ];

  const lineStarts = [0];

  for (let index = 0; index < contents.length; index++) {
    if (contents.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }

  const positionAt = (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);

      if (lineStarts[mid] <= offset) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const lineIndex = Math.max(0, high);

    return {
      line: lineIndex + 1,
      column: offset - lineStarts[lineIndex] + 1,
    };
  };

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;

    for (const match of contents.matchAll(pattern.regex)) {
      const name = match[pattern.group ?? 1];
      const matchIndex = match.index ?? 0;
      const nameOffset = contents.indexOf(name, matchIndex);

      if (!name || nameOffset < 0) {
        continue;
      }

      const key = `${name}:${nameOffset}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      symbols.push({ name, kind: pattern.kind, filePath, ...positionAt(nameOffset) });
    }
  }

  return symbols;
}

function normalizeWorkspaceFilePath(filePath: string) {
  return filePath.replace(/^\/+/, '');
}

const MONACO_ENV_MASK_STYLE_ID = 'vibecore-monaco-env-mask-style';

/**
 * Inject (once) the CSS that hides dotenv secret values in the Monaco editor.
 * The real characters are rendered transparent (so they cannot be read or
 * copied visually) and a non-selectable dotted overlay is shown in their place.
 */
function ensureMonacoEnvMaskStyle() {
  if (typeof document === 'undefined' || document.getElementById(MONACO_ENV_MASK_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = MONACO_ENV_MASK_STYLE_ID;
  style.textContent = [
    '.cm-monaco-env-mask{color:transparent !important;position:relative;}',
    '.cm-monaco-env-mask::after{content:"••••••••";position:absolute;left:0;top:0;color:#9aa4b2;letter-spacing:0.05em;pointer-events:none;}',
  ].join('');
  document.head.appendChild(style);
}

function modelUriForPath(monaco: typeof import('monaco-editor/esm/vs/editor/editor.api'), filePath: string) {
  return monaco.Uri.parse(`file:///${normalizeWorkspaceFilePath(filePath)}`);
}

function getWorkspaceIndex(
  projectFiles: Record<string, string> | undefined,
  currentFilePath?: string,
  currentValue?: string,
) {
  const entries = Object.entries(projectFiles ?? {})
    .filter(([filePath, contents]) => isWorkspaceSemanticFile(filePath, contents))
    .slice(0, MAX_WORKSPACE_INDEX_FILES);

  if (currentFilePath && typeof currentValue === 'string' && isWorkspaceSemanticFile(currentFilePath, currentValue)) {
    const existingIndex = entries.findIndex(([filePath]) => filePath === currentFilePath);

    if (existingIndex >= 0) {
      entries[existingIndex] = [currentFilePath, currentValue];
    } else if (entries.length < MAX_WORKSPACE_INDEX_FILES) {
      entries.unshift([currentFilePath, currentValue]);
    }
  }

  const symbols = entries.flatMap(([filePath, contents]) => extractWorkspaceSymbols(filePath, contents));

  return { entries, symbols };
}

function findWordMatches(contents: string, word: string) {
  const matches: Array<{ start: number; end: number }> = [];
  const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

  for (const match of contents.matchAll(regex)) {
    const start = match.index ?? 0;
    matches.push({ start, end: start + word.length });
  }

  return matches;
}

/**
 * The lexical family a file uses for comments and string literals. This selects
 * which masking contexts {@link findStringAndCommentSpans} recognises so a rename
 * (F2) does not rewrite identifiers that merely appear inside comments/strings.
 *
 * - `c-family`: `//` and `/* *\/` comments, `' " \`` quoted strings (JS/TS, Go,
 *   Rust, Java, C/C++, C#, CSS, …).
 * - `hash`: `#` line comments plus Python triple-quoted (`'''`/`"""`) strings and
 *   single-line `' " ` quotes (Python, Ruby, shell, …).
 */
export type CommentSyntax = 'c-family' | 'hash';

const HASH_COMMENT_LANGUAGES = new Set(['python', 'ruby', 'shell', 'shellscript', 'bash', 'sh', 'yaml', 'toml']);

/**
 * Map a Monaco language id (or a file path) to the lexical family whose
 * comment/string syntax should be masked before computing rename edits. Defaults
 * to the C-family scanner, which is correct for the JS/TS/Go/Rust/Java/C/C#/CSS
 * languages this editor indexes.
 */
export function commentSyntaxForLanguage(languageOrPath?: string): CommentSyntax {
  if (!languageOrPath) {
    return 'c-family';
  }

  const language = languageOrPath.includes('.') ? languageForPath(languageOrPath) : languageOrPath;

  return HASH_COMMENT_LANGUAGES.has(language) ? 'hash' : 'c-family';
}

/**
 * Compute the document offsets that fall inside a string literal or a comment for
 * the syntax `syntax` describes. Used to keep rename (F2) from rewriting an
 * identifier where it merely appears as text — inside a string, a line/block
 * comment, a `#` comment, or a Python triple-quoted docstring — which would
 * corrupt unrelated content.
 *
 * This is a deliberately conservative lexical scan (not a full parser): it only
 * needs to recognise the masking contexts that produce false-positive word
 * matches. Anything it cannot classify is treated as code, so a rename is never
 * silently dropped on a real identifier.
 */
export function findStringAndCommentSpans(
  contents: string,
  syntax: CommentSyntax = 'c-family',
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const length = contents.length;

  let index = 0;

  while (index < length) {
    const char = contents[index];
    const next = contents[index + 1];

    // C-family line comment: // ... until end of line.
    if (syntax === 'c-family' && char === '/' && next === '/') {
      const start = index;
      index += 2;

      while (index < length && contents[index] !== '\n') {
        index++;
      }

      spans.push({ start, end: index });
      continue;
    }

    // C-family block comment: /* ... */ (also covers JSDoc).
    if (syntax === 'c-family' && char === '/' && next === '*') {
      const start = index;
      index += 2;

      while (index < length && !(contents[index] === '*' && contents[index + 1] === '/')) {
        index++;
      }

      index = Math.min(length, index + 2);
      spans.push({ start, end: index });
      continue;
    }

    // Hash line comment: # ... until end of line (Python/Ruby/shell/YAML).
    if (syntax === 'hash' && char === '#') {
      const start = index;
      index++;

      while (index < length && contents[index] !== '\n') {
        index++;
      }

      spans.push({ start, end: index });
      continue;
    }

    /*
     * Python triple-quoted string / docstring: ''' or """ spanning newlines,
     * with backslash escapes. Must be tried before the single-quote case so the
     * three opening quotes are consumed as one delimiter rather than three empty
     * strings (which would leave the docstring body scanned as code).
     */
    if (syntax === 'hash' && (char === '"' || char === "'") && next === char && contents[index + 2] === char) {
      const quote = char;
      const start = index;
      index += 3;

      while (index < length) {
        const stringChar = contents[index];

        if (stringChar === '\\') {
          index += 2;
          continue;
        }

        if (stringChar === quote && contents[index + 1] === quote && contents[index + 2] === quote) {
          index += 3;
          break;
        }

        index++;
      }

      index = Math.min(length, index);
      spans.push({ start, end: index });
      continue;
    }

    // String / template literal: ' " ` with backslash escapes.
    if (char === '"' || char === "'" || (syntax === 'c-family' && char === '`')) {
      const quote = char;
      const start = index;
      index++;

      while (index < length) {
        const stringChar = contents[index];

        if (stringChar === '\\') {
          index += 2;
          continue;
        }

        if (stringChar === quote) {
          index++;
          break;
        }

        /*
         * A non-template quote does not span newlines; bail so an unterminated
         * string does not swallow the rest of the file.
         */
        if (quote !== '`' && stringChar === '\n') {
          break;
        }

        index++;
      }

      spans.push({ start, end: index });
      continue;
    }

    index++;
  }

  return spans;
}

/**
 * Word matches for `word` in `contents`, excluding occurrences that sit inside a
 * string literal or comment. Backs the workspace rename/reference providers so
 * F2 rewrites the identifier as code, not every textual occurrence (which would
 * corrupt strings, comments, and same-named text elsewhere).
 *
 * `languageOrPath` selects the comment/string syntax to mask (e.g. a `.py`
 * path or `'python'` language masks `#` comments and `'''`/`"""` docstrings),
 * defaulting to the C-family syntax used by JS/TS/Go/Rust/Java/C/C#.
 */
export function findRenameMatches(contents: string, word: string, languageOrPath?: string) {
  const masked = findStringAndCommentSpans(contents, commentSyntaxForLanguage(languageOrPath));

  const isMasked = (start: number) => masked.some((span) => start >= span.start && start < span.end);

  return findWordMatches(contents, word).filter((match) => !isMasked(match.start));
}

function installWorkspaceSemanticProviders(
  monaco: typeof import('monaco-editor/esm/vs/editor/editor.api'),
  sources: {
    getCurrentValue: () => string;
    getCurrentFilePath: () => string | undefined;
    getProjectFiles: () => Record<string, string> | undefined;
    onOpenFile: (filePath: string) => void;
  },
) {
  const languageIds = [
    'typescript',
    'javascript',
    'css',
    'html',
    'json',
    'markdown',
    'python',
    'go',
    'rust',
    'java',
    'c',
    'cpp',
    'csharp',
  ];

  const getIndex = () =>
    getWorkspaceIndex(sources.getProjectFiles(), sources.getCurrentFilePath(), sources.getCurrentValue());

  const ensureModel = (filePath: string, contents: string) => {
    const uri = modelUriForPath(monaco, filePath);
    const existing = monaco.editor.getModel(uri);

    if (existing) {
      if (existing.getValue() !== contents) {
        existing.setValue(contents);
      }

      monaco.editor.setModelLanguage(existing, languageForPath(filePath));

      return existing;
    }

    return monaco.editor.createModel(contents, languageForPath(filePath), uri);
  };

  const symbolKind = (kind: WorkspaceSymbol['kind']) => {
    switch (kind) {
      case 'class':
        return monaco.languages.CompletionItemKind.Class;
      case 'function':
        return monaco.languages.CompletionItemKind.Function;
      case 'component':
        return monaco.languages.CompletionItemKind.Module;
      case 'selector':
        return monaco.languages.CompletionItemKind.Property;
      case 'variable':
      default:
        return monaco.languages.CompletionItemKind.Variable;
    }
  };

  const asRange = (model: MonacoTypes.editor.ITextModel, start: number, end: number) => {
    const startPosition = model.getPositionAt(start);
    const endPosition = model.getPositionAt(end);

    return new monaco.Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
  };

  const rangeForSymbol = (model: MonacoTypes.editor.ITextModel, symbol: WorkspaceSymbol) =>
    new monaco.Range(
      symbol.line,
      symbol.column,
      symbol.line,
      Math.min(symbol.column + symbol.name.length, model.getLineMaxColumn(symbol.line)),
    );

  return [
    monaco.languages.registerCompletionItemProvider(languageIds, {
      triggerCharacters: ['.', '/', '@', '#', '<'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const { symbols } = getIndex();
        const seen = new Set<string>();
        const suggestions: MonacoTypes.languages.CompletionItem[] = [];

        for (const symbol of symbols) {
          if (seen.has(symbol.name)) {
            continue;
          }

          seen.add(symbol.name);
          suggestions.push({
            label: symbol.name,
            kind: symbolKind(symbol.kind),
            insertText: symbol.name,
            range,
            detail: `${symbol.kind} - ${normalizeWorkspaceFilePath(symbol.filePath)}:${symbol.line}`,
            sortText: `0_${symbol.name}`,
          });
        }

        suggestions.push(
          {
            label: 'React component',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: [
              'export function ${1:ComponentName}() {',
              '  return (',
              '    <div className="${2:container}">',
              '      ${3:Content}',
              '    </div>',
              '  );',
              '}',
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: 'Vibecore snippet',
            sortText: '1_react_component',
          },
          {
            label: 'async function',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: ['async function ${1:name}(${2:input}) {', '  ${3:return input;}', '}'].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: 'Vibecore snippet',
            sortText: '1_async_function',
          },
        );

        return { suggestions };
      },
    }),
    monaco.languages.registerDefinitionProvider(languageIds, {
      provideDefinition(model, position) {
        const word = model.getWordAtPosition(position);

        if (!word) {
          return undefined;
        }

        const { entries, symbols } = getIndex();
        const definitions = symbols.filter((symbol) => symbol.name === word.word);
        const locations: MonacoTypes.languages.Location[] = [];

        for (const symbol of definitions) {
          const contents = entries.find(([filePath]) => filePath === symbol.filePath)?.[1];

          if (!contents) {
            continue;
          }

          const targetModel = ensureModel(symbol.filePath, contents);

          locations.push({
            uri: targetModel.uri,
            range: rangeForSymbol(targetModel, symbol),
          });
        }

        return locations;
      },
    }),
    monaco.languages.registerReferenceProvider(languageIds, {
      provideReferences(model, position) {
        const word = model.getWordAtPosition(position);

        if (!word) {
          return [];
        }

        const { entries } = getIndex();

        return entries.flatMap(([filePath, contents]) => {
          const targetModel = ensureModel(filePath, contents);

          return findRenameMatches(contents, word.word, filePath).map((match) => ({
            uri: targetModel.uri,
            range: asRange(targetModel, match.start, match.end),
          }));
        });
      },
    }),
    monaco.languages.registerRenameProvider(languageIds, {
      resolveRenameLocation(model: MonacoTypes.editor.ITextModel, position: MonacoTypes.Position) {
        const word = model.getWordAtPosition(position);

        if (!word) {
          return {
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: '',
            rejectReason: 'No symbol selected',
          };
        }

        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          text: word.word,
        };
      },
      provideRenameEdits(model, position, newName) {
        const word = model.getWordAtPosition(position);

        if (!word || !/^[A-Za-z_$][\w$]*$/.test(newName)) {
          return {
            edits: [],
            rejectReason: 'Use a valid identifier name.',
          };
        }

        /*
         * Scope the rename to the active model only. A naive `\bword\b`
         * replacement across every indexed file has no scope/AST awareness, so
         * renaming across files would rewrite same-named-but-unrelated locals
         * and properties in other modules. Restrict edits to the current file
         * and skip occurrences inside strings/comments so only real code
         * identifiers are renamed.
         */
        const contents = model.getValue();

        return {
          edits: findRenameMatches(contents, word.word, model.getLanguageId()).map((match) => ({
            resource: model.uri,
            textEdit: { range: asRange(model, match.start, match.end), text: newName },
            versionId: model.getVersionId(),
          })),
        };
      },
    }),
    monaco.languages.registerDocumentSymbolProvider(languageIds, {
      provideDocumentSymbols(model) {
        return extractWorkspaceSymbols(model.uri.path, model.getValue()).map((symbol) => ({
          name: symbol.name,
          detail: symbol.kind,
          tags: [],
          kind:
            symbol.kind === 'class'
              ? monaco.languages.SymbolKind.Class
              : symbol.kind === 'function'
                ? monaco.languages.SymbolKind.Function
                : symbol.kind === 'component'
                  ? monaco.languages.SymbolKind.Module
                  : symbol.kind === 'selector'
                    ? monaco.languages.SymbolKind.Property
                    : monaco.languages.SymbolKind.Variable,
          range: rangeForSymbol(model, symbol),
          selectionRange: rangeForSymbol(model, symbol),
        }));
      },
    }),
    monaco.languages.registerCodeLensProvider(languageIds, {
      provideCodeLenses(model) {
        const lenses = extractWorkspaceSymbols(model.uri.path, model.getValue())
          .filter((symbol) => symbol.kind === 'function' || symbol.kind === 'class' || symbol.kind === 'component')
          .slice(0, 40)
          .flatMap((symbol) => {
            const range = rangeForSymbol(model, symbol);

            return [
              {
                range,
                id: `${symbol.name}:refs`,
                command: {
                  id: 'editor.action.goToReferences',
                  title: 'Find references',
                  arguments: [model.uri, { lineNumber: symbol.line, column: symbol.column }],
                },
              },
              {
                range,
                id: `${symbol.name}:open`,
                command: {
                  id: 'vibecore.openIndexedFile',
                  title: normalizeWorkspaceFilePath(model.uri.path),
                  arguments: [model.uri.path],
                },
              },
            ];
          });

        return { lenses, dispose: () => undefined };
      },
      resolveCodeLens(_model, codeLens) {
        return codeLens;
      },
    }),
    monaco.editor.registerCommand('vibecore.openIndexedFile', (_accessor, targetPath: string) => {
      sources.onOpenFile(targetPath.replace(/^\/+/, ''));
    }),
  ];
}

export function DesktopCodeEditor({
  value,
  filePath,
  language,
  readOnly,
  largeFile,
  minimapEnabled = true,
  projectFiles,
  theme = 'dark',
  autoFocus,
  className,
  onChange,
  onSave,
}: EditorAdapterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor/esm/vs/editor/editor.api') | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);
  const filePathRef = useRef(filePath);
  const projectFilesRef = useRef(projectFiles);
  const ownedWorkspaceModelsRef = useRef<Set<string>>(new Set());
  const envMaskDecorationsRef = useRef<string[]>([]);

  /*
   * Set while we programmatically push an external/agent-streamed value into the
   * Monaco model via setValue(). Monaco fires onDidChangeModelContent
   * synchronously for setValue, so without this guard each programmatic update
   * would re-fire onChange — collapsing the user's selection, polluting the undo
   * stack, and scheduling redundant autosaves while an agent is writing.
   */
  const isApplyingExternalRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    valueRef.current = value;
    filePathRef.current = filePath;
    projectFilesRef.current = projectFiles;
  });

  /*
   * Recompute the .env secret-value masks for the active model, leaving the
   * line(s) the caret/selection touches unmasked so a secret stays readable
   * while it is being edited. Runs from the value/path effect and again on every
   * cursor move (registered in onMount) so the reveal follows the caret.
   */
  const applyEnvMaskDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();

    if (!editor || !monaco || !model || !isEnvFilePath(filePathRef.current)) {
      return;
    }

    const lineTexts: string[] = [];

    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
      lineTexts.push(model.getLineContent(lineNumber));
    }

    const revealLines = computeEnvRevealLines(editor.getSelections());

    envMaskDecorationsRef.current = editor.deltaDecorations(
      envMaskDecorationsRef.current,
      computeEnvMaskLineRanges(lineTexts, revealLines).map((range) => ({
        range: new monaco.Range(range.line, range.startColumn, range.line, range.endColumn),
        options: { inlineClassName: 'cm-monaco-env-mask', stickiness: 1 },
      })),
    );
  }, []);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) {
      return;
    }

    let disposed = false;

    void import('monaco-editor/esm/vs/editor/editor.api')
      .then((monaco) => {
        if (disposed || !containerRef.current) {
          return;
        }

        monacoRef.current = monaco;

        const currentModel = monaco.editor.createModel(
          value,
          languageForPath(filePath, language),
          modelUriForPath(monaco, filePath ?? 'untitled'),
        );

        monaco.editor.defineTheme('vibecore-vs-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: '', foreground: 'F5F9FC', background: '0A0F1C' },
            { token: 'comment', foreground: '6E7681' },
            { token: 'keyword', foreground: '0099FF' },
            { token: 'string', foreground: '3FB950' },
            { token: 'number', foreground: 'D29922' },
          ],
          colors: {
            'editor.background': '#0A0F1C',
            'editor.foreground': '#F5F9FC',
            'editorLineNumber.foreground': '#6E7681',
            'editorLineNumber.activeForeground': '#C2C8CC',
            'editorIndentGuide.background1': '#2B3245',
            'editorIndentGuide.activeBackground1': '#3B4358',
            'editor.lineHighlightBackground': '#1A2030',
            'editor.selectionBackground': '#0099FF4D',
            'editor.inactiveSelectionBackground': '#0099FF26',
            'editorSuggestWidget.background': '#1A2030',
            'editorSuggestWidget.border': '#2B3245',
            'editorSuggestWidget.foreground': '#F5F9FC',
            'editorSuggestWidget.selectedBackground': '#2B3245',
            'editorError.foreground': '#F85149',
            'editorWarning.foreground': '#D29922',
            'editorGutter.background': '#0A0F1C',
            ...monacoMinimapThemeColors.dark,
          },
        });
        monaco.editor.defineTheme('vibecore-vs-light', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#FFFFFF',
            'editor.foreground': '#0F172A',
            ...monacoMinimapThemeColors.light,
          },
        });

        const editor = monaco.editor.create(containerRef.current, {
          model: currentModel,
          readOnly,
          automaticLayout: true,
          minimap: getEditorMinimapOptions({ largeFile, minimapEnabled }),
          fontSize: 13,
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontLigatures: !largeFile,
          tabSize: 2,
          wordWrap: largeFile ? 'off' : 'on',
          scrollBeyondLastLine: false,
          largeFileOptimizations: true,
          inlineSuggest: { enabled: !largeFile },
          suggest: { preview: !largeFile, showInlineDetails: true, snippetsPreventQuickSuggestions: false },
          quickSuggestions: !largeFile,
          suggestOnTriggerCharacters: !largeFile,
          parameterHints: { enabled: !largeFile },
          codeLens: !largeFile,
          inlayHints: { enabled: largeFile ? 'off' : 'on' },
          stickyScroll: { enabled: !largeFile },
          renderWhitespace: largeFile ? 'none' : 'selection',
          occurrencesHighlight: largeFile ? 'off' : 'singleFile',
          selectionHighlight: !largeFile,
          folding: !largeFile,
          renderLineHighlight: largeFile ? 'none' : 'line',
          glyphMargin: !largeFile,
          bracketPairColorization: { enabled: !largeFile },
          guides: {
            indentation: true,
            highlightActiveIndentation: true,
            bracketPairs: !largeFile,
            bracketPairsHorizontal: !largeFile,
          },
          lightbulb: {
            enabled: !largeFile ? monaco.editor.ShowLightbulbIconMode.On : monaco.editor.ShowLightbulbIconMode.Off,
          },
          gotoLocation: {
            multipleDefinitions: 'peek',
            multipleReferences: 'peek',
            multipleImplementations: 'peek',
            multipleDeclarations: 'peek',
          },
          roundedSelection: false,
          overviewRulerBorder: false,
          theme: theme === 'dark' ? 'vibecore-vs-dark' : 'vibecore-vs-light',
          padding: { top: 12, bottom: 12 },
        });

        editorRef.current = editor;

        const disposable = editor.onDidChangeModelContent(() => {
          if (isApplyingExternalRef.current) {
            return;
          }

          onChangeRef.current?.({ value: editor.getValue(), source: 'monaco' });
        });

        /*
         * Re-mask on cursor move so the line being edited reveals while every
         * other secret value stays masked (mirrors the CodeMirror behaviour).
         */
        const selectionDisposable = editor.onDidChangeCursorSelection(() => {
          applyEnvMaskDecorations();
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          onSaveRef.current?.();
        });
        editor.addAction({
          id: 'vibecore.rename-symbol',
          label: 'Rename Symbol',
          keybindings: [monaco.KeyCode.F2],
          run: (activeEditor) => activeEditor.getAction('editor.action.rename')?.run(),
        });
        editor.addAction({
          id: 'vibecore.find-references',
          label: 'Find References',
          keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
          run: (activeEditor) => activeEditor.getAction('editor.action.goToReferences')?.run(),
        });
        editor.addAction({
          id: 'vibecore.go-to-definition',
          label: 'Go to Definition',
          keybindings: [monaco.KeyCode.F12],
          run: (activeEditor) => activeEditor.getAction('editor.action.revealDefinition')?.run(),
        });
        editor.addAction({
          id: 'vibecore.refactor',
          label: 'Refactor...',
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR],
          run: (activeEditor) => activeEditor.getAction('editor.action.refactor')?.run(),
        });

        const providerDisposables = installWorkspaceSemanticProviders(monaco, {
          getCurrentValue: () => valueRef.current,
          getCurrentFilePath: () => filePathRef.current,
          getProjectFiles: () => projectFilesRef.current,
          onOpenFile: (targetFilePath) => {
            window.dispatchEvent(
              new CustomEvent('vibecore:open-editor-file', { detail: { filePath: targetFilePath } }),
            );
          },
        });

        if (autoFocus) {
          editor.focus();
        }

        editor.onDidDispose(() => {
          disposable.dispose();
          selectionDisposable.dispose();
          providerDisposables.forEach((providerDisposable) => providerDisposable.dispose());
          currentModel.dispose();
        });
      })
      .catch((error) => {
        /*
         * A failed code-split chunk load (recurring after deploys due to asset
         * skew) would otherwise reject unhandled and silently leave the editor
         * uninitialised with no surfaced error.
         */
        if (!disposed) {
          console.error('Failed to load the Monaco editor module', error);
        }
      });

    return () => {
      disposed = true;

      editorRef.current?.dispose();
      editorRef.current = null;

      for (const uriString of ownedWorkspaceModelsRef.current) {
        monacoRef.current?.editor.getModel(monacoRef.current.Uri.parse(uriString))?.dispose();
      }

      ownedWorkspaceModelsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (!editor) {
      return;
    }

    if (monaco && filePath) {
      const uri = modelUriForPath(monaco, filePath);
      const activeModel = editor.getModel();

      let targetModel = monaco.editor.getModel(uri);

      if (!targetModel) {
        targetModel = monaco.editor.createModel(value, languageForPath(filePath, language), uri);
      }

      if (activeModel?.uri.toString() !== targetModel.uri.toString()) {
        editor.setModel(targetModel);
      }
    }

    const model = editor.getModel();

    if (model && model.getValue() !== value) {
      isApplyingExternalRef.current = true;

      try {
        model.setValue(value);
      } finally {
        isApplyingExternalRef.current = false;
      }
    }

    editor.updateOptions({
      readOnly,
      minimap: getEditorMinimapOptions({ largeFile, minimapEnabled }),
      wordWrap: largeFile ? 'off' : 'on',
      fontLigatures: !largeFile,
      inlineSuggest: { enabled: !largeFile },
      quickSuggestions: !largeFile,
      suggestOnTriggerCharacters: !largeFile,
      parameterHints: { enabled: !largeFile },
      codeLens: !largeFile,
      inlayHints: { enabled: largeFile ? 'off' : 'on' },
      stickyScroll: { enabled: !largeFile },
      occurrencesHighlight: largeFile ? 'off' : 'singleFile',
      selectionHighlight: !largeFile,
      folding: !largeFile,
      renderLineHighlight: largeFile ? 'none' : 'line',
      glyphMargin: !largeFile,
      bracketPairColorization: { enabled: !largeFile },
      guides: {
        indentation: true,
        highlightActiveIndentation: true,
        bracketPairs: !largeFile,
        bracketPairsHorizontal: !largeFile,
      },
    });

    if (model && monaco) {
      monaco.editor.setModelLanguage(model, languageForPath(filePath, language));

      if (isEnvFilePath(filePath)) {
        ensureMonacoEnvMaskStyle();
        applyEnvMaskDecorations();
      } else if (envMaskDecorationsRef.current.length > 0) {
        envMaskDecorationsRef.current = editor.deltaDecorations(envMaskDecorationsRef.current, []);
      }

      const { entries } = getWorkspaceIndex(projectFiles, filePath, value);
      const nextOwnedModelUris = new Set<string>();

      for (const [workspaceFilePath, contents] of entries) {
        if (workspaceFilePath === filePath) {
          continue;
        }

        const uri = modelUriForPath(monaco, workspaceFilePath);
        const existingModel = monaco.editor.getModel(uri);

        if (existingModel) {
          if (existingModel.getValue() !== contents) {
            existingModel.setValue(contents);
          }

          monaco.editor.setModelLanguage(existingModel, languageForPath(workspaceFilePath));
        } else {
          monaco.editor.createModel(contents, languageForPath(workspaceFilePath), uri);
        }

        nextOwnedModelUris.add(uri.toString());
      }

      for (const uriString of ownedWorkspaceModelsRef.current) {
        if (!nextOwnedModelUris.has(uriString)) {
          monaco.editor.getModel(monaco.Uri.parse(uriString))?.dispose();
        }
      }

      ownedWorkspaceModelsRef.current = nextOwnedModelUris;
    }
  }, [filePath, language, largeFile, minimapEnabled, projectFiles, readOnly, value]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(theme === 'dark' ? 'vibecore-vs-dark' : 'vibecore-vs-light');
  }, [theme]);

  useEffect(() => {
    const runEditorCommand = (event: Event) => {
      const editor = editorRef.current;
      const command = (event as CustomEvent<{ command?: string }>).detail?.command;

      if (!editor || !command) {
        return;
      }

      const actionIdByCommand: Record<string, string> = {
        goToDefinition: 'editor.action.revealDefinition',
        findReferences: 'editor.action.goToReferences',
        renameSymbol: 'editor.action.rename',
        refactor: 'editor.action.refactor',
        toggleComment: 'editor.action.commentLine',
        quickFix: 'editor.action.quickFix',
        inlineSuggest: 'editor.action.inlineSuggest.trigger',
      };

      const actionId = actionIdByCommand[command];

      if (actionId) {
        void editor.getAction(actionId)?.run();
      }
    };

    window.addEventListener('vibecore:editor-command', runEditorCommand);

    return () => window.removeEventListener('vibecore:editor-command', runEditorCommand);
  }, []);

  return createElement('div', { ref: containerRef, className, 'data-editor-kind': 'monaco' });
}

const LOCAL_DRAFT_UPSTREAM_PROTECTION_MS = 120_000;

interface LocalDocumentDraft {
  filePath?: string;
  value: string;
  updatedAt: number;
}

/**
 * A dotenv file holds secrets (API keys, tokens, DB URLs). Treat `.env`,
 * `.env.local`, `.env.production`, etc. as masked so values never render in
 * cleartext in the live editor.
 */
export function isEnvFilePath(filePath?: string): boolean {
  if (!filePath) {
    return false;
  }

  const fileName = filePath.split('/').pop() ?? filePath;

  return fileName === '.env' || fileName.startsWith('.env.') || fileName.endsWith('.env');
}

export interface EnvMaskRange {
  /** Document offset where the secret value begins (just after the `=`). */
  from: number;

  /** Document offset where the secret value ends (end of the line). */
  to: number;

  /** The raw secret text, used to size the mask. */
  value: string;
}

interface EnvMaskLine {
  /** Document offset of the first character of the line. */
  from: number;

  /** Document offset just past the last character of the line. */
  to: number;

  /** The full text of the line. */
  text: string;
}

/**
 * Compute the offset ranges of secret VALUES on `KEY=VALUE` lines so they can be
 * replaced with a masked widget. Comment lines (`#`) and lines without a value
 * are skipped. Lines whose range intersects `revealLineFroms` (e.g. the line the
 * caret is on) are left unmasked so the file stays editable.
 */
export function computeEnvMaskRanges(
  lines: EnvMaskLine[],
  revealLineFroms: ReadonlySet<number> = new Set(),
): EnvMaskRange[] {
  const ranges: EnvMaskRange[] = [];

  for (const line of lines) {
    if (revealLineFroms.has(line.from)) {
      continue;
    }

    const text = line.text;

    if (text.trim().startsWith('#')) {
      continue;
    }

    const separatorIndex = text.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const value = text.slice(separatorIndex + 1);

    if (value.length === 0) {
      continue;
    }

    const from = line.from + separatorIndex + 1;

    ranges.push({ from, to: line.to, value });
  }

  return ranges;
}

export interface EnvMaskLineRange {
  /** 1-based line number. */
  line: number;

  /** 1-based column where the secret value begins (just after `=`). */
  startColumn: number;

  /** 1-based column just past the end of the secret value. */
  endColumn: number;

  /** Length of the masked secret, used to size the overlay. */
  length: number;
}

/**
 * Monaco variant of {@link computeEnvMaskRanges}: returns 1-based line/column
 * ranges for the secret VALUE of each `KEY=VALUE` line. `lineTexts[i]` is the
 * text of line `i + 1`. Comment and value-less lines are skipped. Lines whose
 * 1-based number is in `revealLines` (e.g. the line(s) the caret/selection
 * touches) are left unmasked so a secret can be read while it is being edited.
 */
export function computeEnvMaskLineRanges(
  lineTexts: readonly string[],
  revealLines: ReadonlySet<number> = new Set(),
): EnvMaskLineRange[] {
  const ranges: EnvMaskLineRange[] = [];

  for (let index = 0; index < lineTexts.length; index++) {
    const lineNumber = index + 1;

    if (revealLines.has(lineNumber)) {
      continue;
    }

    const text = lineTexts[index];

    if (text.trim().startsWith('#')) {
      continue;
    }

    const separatorIndex = text.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const value = text.slice(separatorIndex + 1);

    if (value.length === 0) {
      continue;
    }

    ranges.push({
      line: index + 1,
      startColumn: separatorIndex + 2,
      endColumn: text.length + 1,
      length: value.length,
    });
  }

  return ranges;
}

/**
 * Collect the set of 1-based line numbers that a list of Monaco selections
 * touches (start + end of each selection), so those lines can be left unmasked
 * while the user edits a secret. Mirrors the CodeMirror `revealLineFroms` logic.
 */
export function computeEnvRevealLines(
  selections: readonly { startLineNumber: number; endLineNumber: number }[] | null | undefined,
): Set<number> {
  const revealLines = new Set<number>();

  for (const selection of selections ?? []) {
    revealLines.add(selection.startLineNumber);
    revealLines.add(selection.endLineNumber);
  }

  return revealLines;
}

class MaskedSecretWidget extends WidgetType {
  constructor(private readonly length: number) {
    super();
  }

  eq(other: MaskedSecretWidget) {
    return other.length === this.length;
  }

  toDOM() {
    const span = document.createElement('span');
    span.textContent = '•'.repeat(Math.max(1, this.length));
    span.className = 'cm-masked-secret';
    span.setAttribute('aria-label', 'Masked secret value');

    return span;
  }

  ignoreEvent() {
    return false;
  }
}

function buildEnvMaskDecorations(view: EditorView, getFilePath: () => string | undefined): DecorationSet {
  if (!isEnvFilePath(getFilePath())) {
    return Decoration.none;
  }

  const doc = view.state.doc;
  const revealLineFroms = new Set<number>();

  for (const range of view.state.selection.ranges) {
    revealLineFroms.add(doc.lineAt(range.head).from);

    if (range.anchor !== range.head) {
      revealLineFroms.add(doc.lineAt(range.anchor).from);
    }
  }

  const lines: EnvMaskLine[] = [];

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    lines.push({ from: line.from, to: line.to, text: line.text });
  }

  const decorations = computeEnvMaskRanges(lines, revealLineFroms).map((range) =>
    Decoration.replace({ widget: new MaskedSecretWidget(range.value.length) }).range(range.from, range.to),
  );

  return Decoration.set(decorations);
}

/**
 * CodeMirror ViewPlugin that masks dotenv secret values in the live editor. This
 * ports the masking that previously lived only in the unused app CodeMirror
 * component so the editor actually rendered in the IDE no longer leaks secrets.
 */
export function createEnvMaskingExtension(getFilePath: () => string | undefined) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildEnvMaskDecorations(view, getFilePath);
      }

      update(update: { docChanged: boolean; selectionSet: boolean; viewportChanged: boolean; view: EditorView }) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildEnvMaskDecorations(update.view, getFilePath);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

function codeMirrorExtensions(
  props: EditorAdapterProps,
  compartments?: { editable: Compartment; readOnly: Compartment },
  getFilePath: () => string | undefined = () => props.filePath,
): Extension[] {
  const largeFile = Boolean(props.largeFile);
  const language = languageForPath(props.filePath, props.language);

  const languageExtension = largeFile
    ? []
    : language === 'typescript'
      ? javascript({ typescript: true, jsx: props.filePath?.endsWith('.tsx') })
      : language === 'javascript'
        ? javascript({ jsx: props.filePath?.endsWith('.jsx') })
        : language === 'json'
          ? json()
          : language === 'markdown'
            ? markdown()
            : [];

  return [
    lineNumbers(),
    history(),
    drawSelection(),
    dropCursor(),
    ...(largeFile ? [] : [highlightActiveLine()]),
    bracketMatching(),
    ...(largeFile
      ? []
      : [
          closeBrackets(),
          autocompletion(),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ]),
    keymap.of([
      { key: 'Mod-s', run: () => (props.onSave?.(), true) },
      { key: 'Enter', run: insertNewlineAndIndent },
      { key: 'Tab', run: acceptCompletion },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    ...(largeFile ? [] : [EditorView.lineWrapping]),
    ...(compartments
      ? [
          compartments.editable.of(EditorView.editable.of(!props.readOnly)),
          compartments.readOnly.of(EditorState.readOnly.of(Boolean(props.readOnly))),
        ]
      : [EditorView.editable.of(!props.readOnly), EditorState.readOnly.of(Boolean(props.readOnly))]),

    /*
     * Touch/IME fallback: on mobile (and in environments whose contentEditable
     * input pipeline does not synthesise input events for every keystroke) raw
     * keydowns would otherwise never reach the document. This handler turns those
     * keystrokes into edits — but it MUST defer to the configured keymap and to
     * closeBrackets so Enter still auto-indents (insertNewlineAndIndent) and
     * typing an opening bracket/quote still auto-closes. We therefore:
     *   - skip Enter entirely (let the { key: 'Enter' } keymap binding run), and
     *   - route printable characters through insertBracket() first (the same
     *     primitive closeBrackets uses) so '(', '{', '[', '"', '`' auto-close.
     */
    Prec.high(
      EditorView.domEventHandlers({
        keydown(event, view) {
          if (view.state.readOnly || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
            return false;
          }

          // Enter and other non-printable keys are owned by the keymap.
          if (event.key.length !== 1) {
            return false;
          }

          const keyText = event.key;

          // Let closeBrackets auto-close/skip-over brackets and quotes.
          const bracketTransaction = insertBracket(view.state, keyText);

          if (bracketTransaction) {
            event.preventDefault();
            view.dispatch(bracketTransaction);

            return true;
          }

          event.preventDefault();
          view.dispatch({
            ...view.state.replaceSelection(keyText),
            scrollIntoView: true,
            userEvent: 'input.type',
          });

          return true;
        },
      }),
    ),
    languageExtension,
    createEnvMaskingExtension(getFilePath),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        props.onChange?.({ value: update.state.doc.toString(), source: 'codemirror' });
      }
    }),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
      },
      '.cm-scroller': {
        fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontVariantLigatures: 'contextual common-ligatures',
        fontFeatureSettings: '"liga" 1, "calt" 1',
        overscrollBehavior: 'contain',
      },
      '.cm-content': {
        minHeight: '100%',
        padding: '12px 0',
      },
      '.cm-line': {
        padding: '0 12px',
      },
      '.cm-masked-secret': {
        letterSpacing: '0.05em',
        opacity: '0.85',
      },
    }),
  ];
}

export function MobileCodeEditor(props: EditorAdapterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartmentRef = useRef(new Compartment());
  const readOnlyCompartmentRef = useRef(new Compartment());
  const localDocumentChangedRef = useRef(false);
  const localDocumentFilePathRef = useRef(props.filePath);
  const localDocumentDraftRef = useRef<LocalDocumentDraft | null>(null);
  const lastAppliedValueRef = useRef(props.value);
  const lastFilePathRef = useRef(props.filePath);
  const propsRef = useRef(props);

  propsRef.current = props;

  useEffect(() => {
    if (!containerRef.current || viewRef.current) {
      return;
    }

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: propsRef.current.value,
        extensions: codeMirrorExtensions(
          {
            ...propsRef.current,
            onChange: (change) => {
              localDocumentChangedRef.current = true;
              localDocumentFilePathRef.current = propsRef.current.filePath;
              localDocumentDraftRef.current = {
                filePath: propsRef.current.filePath,
                value: change.value,
                updatedAt: Date.now(),
              };
              propsRef.current.onChange?.(change);
            },
            onSave: () => propsRef.current.onSave?.(),
          },
          { editable: editableCompartmentRef.current, readOnly: readOnlyCompartmentRef.current },
          () => propsRef.current.filePath,
        ),
      }),
    });

    viewRef.current = view;

    if (propsRef.current.autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    const filePathChanged = lastFilePathRef.current !== props.filePath;
    const upstreamChanged = lastAppliedValueRef.current !== props.value;
    const localDraft = localDocumentDraftRef.current;

    const draftSwitchesAwayFromEditedFile =
      filePathChanged &&
      Boolean(localDraft?.filePath) &&
      Boolean(props.filePath) &&
      localDraft?.filePath !== props.filePath;
    const draftBelongsToCurrentFile =
      Boolean(localDraft) &&
      !draftSwitchesAwayFromEditedFile &&
      (localDraft?.filePath === props.filePath || !localDraft?.filePath || !props.filePath);
    const shouldProtectRecentLocalDraft =
      Boolean(localDraft) &&
      draftBelongsToCurrentFile &&
      current === localDraft?.value &&
      current !== props.value &&
      Date.now() - localDraft.updatedAt <= LOCAL_DRAFT_UPSTREAM_PROTECTION_MS;
    const hasUnappliedLocalChange =
      localDocumentChangedRef.current && current !== lastAppliedValueRef.current && current !== props.value;
    const switchedAwayFromLocallyEditedFile =
      filePathChanged &&
      Boolean(props.filePath) &&
      Boolean(localDocumentFilePathRef.current) &&
      props.filePath !== localDocumentFilePathRef.current;

    if (!filePathChanged && !upstreamChanged) {
      return;
    }

    if (shouldProtectRecentLocalDraft) {
      lastFilePathRef.current = props.filePath;

      return;
    }

    if (current === props.value) {
      localDocumentChangedRef.current = false;
      localDocumentFilePathRef.current = props.filePath;
      lastAppliedValueRef.current = props.value;
      lastFilePathRef.current = props.filePath;

      return;
    }

    if (hasUnappliedLocalChange && !switchedAwayFromLocallyEditedFile) {
      lastFilePathRef.current = props.filePath;

      return;
    }

    if (filePathChanged || !localDocumentChangedRef.current || current === lastAppliedValueRef.current) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: props.value } });
      localDocumentChangedRef.current = false;
      localDocumentFilePathRef.current = props.filePath;
      localDocumentDraftRef.current = null;
      lastAppliedValueRef.current = props.value;
      lastFilePathRef.current = props.filePath;
    }
  }, [props.value, props.filePath]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: [
        editableCompartmentRef.current.reconfigure(EditorView.editable.of(!props.readOnly)),
        readOnlyCompartmentRef.current.reconfigure(EditorState.readOnly.of(Boolean(props.readOnly))),
      ],
    });
  }, [props.readOnly]);

  useEffect(() => {
    const insertText = (event: Event) => {
      const view = viewRef.current;
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;

      if (!view || !text || view.state.readOnly) {
        return;
      }

      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    };

    window.addEventListener('bolt:insert-editor-text', insertText);

    return () => window.removeEventListener('bolt:insert-editor-text', insertText);
  }, []);

  return createElement('div', { ref: containerRef, className: props.className, 'data-editor-kind': 'codemirror' });
}

export function EditorAdapter(props: EditorAdapterProps) {
  const adapter = useEditorAdapter();

  return adapter === 'monaco' ? createElement(DesktopCodeEditor, props) : createElement(MobileCodeEditor, props);
}

export interface TouchSymbolToolbarProps {
  onInsert: (symbol: string) => void;
  symbols?: string[];
  children?: ReactNode;
}

export function TouchSymbolToolbar({
  onInsert,
  symbols = ['{', '}', '(', ')', '[', ']', '<', '>', '/', '\\', '=', ':', ';', '.', ',', '"', "'", '`', '|', '&'],
  children,
}: TouchSymbolToolbarProps) {
  return createElement(
    'div',
    { className: 'vc-touch-symbol-toolbar', role: 'toolbar', 'aria-label': 'Coding symbols' },
    ...symbols.map((symbol) =>
      createElement(
        'button',
        { key: symbol, type: 'button', onClick: () => onInsert(symbol), 'aria-label': `Insert ${symbol}` },
        symbol,
      ),
    ),
    children,
  );
}

export function installEditorPwaServiceWorker(scriptUrl = '/sw.js') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const register = () => {
    navigator.serviceWorker.register(scriptUrl).catch(() => undefined);
  };

  /*
   * This is typically called from a React effect, which runs *after* the
   * document 'load' event has already fired on a normal hard page load. In
   * that case adding a 'load' listener would never invoke the callback and the
   * service worker would never register. Register immediately when the
   * document has finished loading; otherwise defer until 'load'.
   */
  if (typeof document === 'undefined' || document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

export const editorBreakpoints = {
  desktop: 1200,
  tabletLandscape: 900,
  tabletPortrait: 768,
  mobile: 0,
} as const;
