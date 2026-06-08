import { acceptCompletion, autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type * as MonacoTypes from 'monaco-editor';

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

          return findWordMatches(contents, word.word).map((match) => ({
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

        const { entries } = getIndex();

        return {
          edits: entries.flatMap(([filePath, contents]) => {
            const targetModel = ensureModel(filePath, contents);

            return findWordMatches(contents, word.word).map((match) => ({
              resource: targetModel.uri,
              textEdit: { range: asRange(targetModel, match.start, match.end), text: newName },
              versionId: targetModel.getVersionId(),
            }));
          }),
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

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    valueRef.current = value;
    filePathRef.current = filePath;
    projectFilesRef.current = projectFiles;
  });

  useEffect(() => {
    if (!containerRef.current || editorRef.current) {
      return;
    }

    let disposed = false;

    void import('monaco-editor/esm/vs/editor/editor.api').then((monaco) => {
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
        fontFamily: '"JetBrains Mono", "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
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
        onChangeRef.current?.({ value: editor.getValue(), source: 'monaco' });
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
          window.dispatchEvent(new CustomEvent('vibecore:open-editor-file', { detail: { filePath: targetFilePath } }));
        },
      });

      if (autoFocus) {
        editor.focus();
      }

      editor.onDidDispose(() => {
        disposable.dispose();
        providerDisposables.forEach((providerDisposable) => providerDisposable.dispose());
        currentModel.dispose();
      });
    }).catch((error) => {
      // A failed code-split chunk load (recurring after deploys due to asset
      // skew) would otherwise reject unhandled and silently leave the editor
      // uninitialised with no surfaced error.
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
      model.setValue(value);
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

function codeMirrorExtensions(
  props: EditorAdapterProps,
  compartments?: { editable: Compartment; readOnly: Compartment },
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
    Prec.highest(
      EditorView.domEventHandlers({
        keydown(event, view) {
          if (view.state.readOnly || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
            return false;
          }

          const keyText = event.key === 'Enter' ? '\n' : event.key.length === 1 ? event.key : undefined;

          if (!keyText) {
            return false;
          }

          event.preventDefault();
          view.dispatch(view.state.replaceSelection(keyText));

          return true;
        },
      }),
    ),
    languageExtension,
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
        fontFamily:
          '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(scriptUrl).catch(() => undefined);
  });
}

export const editorBreakpoints = {
  desktop: 1200,
  tabletLandscape: 900,
  tabletPortrait: 768,
  mobile: 0,
} as const;
