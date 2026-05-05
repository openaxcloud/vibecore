import { acceptCompletion, autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type * as MonacoTypes from 'monaco-editor';

export type EditorBreakpoint = 'desktop' | 'tablet-landscape' | 'tablet-portrait' | 'mobile';
export type EditorKind = 'monaco' | 'codemirror';

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
  className?: string;
  onChange?: (change: EditorChange) => void;
  onSave?: () => void;
}

export interface ResponsiveLayoutState {
  breakpoint: EditorBreakpoint;
  isDesktop: boolean;
  isTabletLandscape: boolean;
  isTabletPortrait: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  hasCoarsePointer: boolean;
  safeArea: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

const breakpointFromWidth = (width: number): EditorBreakpoint => {
  if (width >= 1200) {
    return 'desktop';
  }

  if (width >= 900) {
    return 'tablet-landscape';
  }

  if (width >= 768) {
    return 'tablet-portrait';
  }

  return 'mobile';
};

export function getResponsiveLayoutState(
  width: number,
  options?: { coarsePointer?: boolean; reducedMotion?: boolean },
): ResponsiveLayoutState {
  const breakpoint = breakpointFromWidth(width);

  return {
    breakpoint,
    isDesktop: breakpoint === 'desktop',
    isTabletLandscape: breakpoint === 'tablet-landscape',
    isTabletPortrait: breakpoint === 'tablet-portrait',
    isMobile: breakpoint === 'mobile',
    prefersReducedMotion: options?.reducedMotion ?? false,
    hasCoarsePointer: options?.coarsePointer ?? false,
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
      return getResponsiveLayoutState(1200);
    }

    return getResponsiveLayoutState(window.innerWidth, {
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  };

  const [state, setState] = useState<ResponsiveLayoutState>(readState);

  useEffect(() => {
    const update = () => setState(readState());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return state;
}

export function useEditorAdapter(): EditorKind {
  const layout = useResponsiveLayout();
  return editorKindForLayout(layout);
}

export function editorKindForLayout(
  layout: Pick<ResponsiveLayoutState, 'isDesktop' | 'isTabletLandscape'>,
): EditorKind {
  if (layout.isDesktop || layout.isTabletLandscape) {
    return 'monaco';
  }

  return 'codemirror';
}

function languageForPath(filePath?: string, fallback?: string) {
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
    default:
      return 'plaintext';
  }
}

export function DesktopCodeEditor({
  value,
  filePath,
  language,
  readOnly,
  largeFile,
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

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
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
        },
      });

      const editor = monaco.editor.create(containerRef.current, {
        value,
        language: languageForPath(filePath, language),
        readOnly,
        automaticLayout: true,
        minimap: { enabled: !largeFile },
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontLigatures: !largeFile,
        tabSize: 2,
        wordWrap: largeFile ? 'off' : 'on',
        scrollBeyondLastLine: false,
        largeFileOptimizations: true,
        renderWhitespace: largeFile ? 'none' : 'selection',
        occurrencesHighlight: largeFile ? 'off' : 'singleFile',
        selectionHighlight: !largeFile,
        folding: !largeFile,
        renderLineHighlight: largeFile ? 'none' : 'line',
        guides: { indentation: true, highlightActiveIndentation: true },
        roundedSelection: false,
        overviewRulerBorder: false,
        theme: theme === 'dark' ? 'vibecore-vs-dark' : 'vs',
        padding: { top: 12, bottom: 12 },
      });

      editorRef.current = editor;
      const disposable = editor.onDidChangeModelContent(() => {
        onChangeRef.current?.({ value: editor.getValue(), source: 'monaco' });
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current?.();
      });

      if (autoFocus) {
        editor.focus();
      }

      editor.onDidDispose(() => {
        disposable.dispose();
      });
    });

    return () => {
      disposed = true;

      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    if (editor.getValue() !== value) {
      editor.setValue(value);
    }

    editor.updateOptions({
      readOnly,
      minimap: { enabled: !largeFile },
      wordWrap: largeFile ? 'off' : 'on',
      fontLigatures: !largeFile,
      occurrencesHighlight: largeFile ? 'off' : 'singleFile',
      selectionHighlight: !largeFile,
      folding: !largeFile,
      renderLineHighlight: largeFile ? 'none' : 'line',
    });

    const model = editor.getModel();
    const monaco = monacoRef.current;

    if (model && monaco) {
      monaco.editor.setModelLanguage(model, languageForPath(filePath, language));
    }
  }, [filePath, language, largeFile, readOnly, value]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(theme === 'dark' ? 'vibecore-vs-dark' : 'vs');
  }, [theme]);

  return createElement('div', { ref: containerRef, className, 'data-editor-kind': 'monaco' });
}

function codeMirrorExtensions(props: EditorAdapterProps): Extension[] {
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
    EditorView.editable.of(!props.readOnly),
    EditorState.readOnly.of(Boolean(props.readOnly)),
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
        extensions: codeMirrorExtensions(propsRef.current),
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

    if (current !== props.value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: props.value } });
    }
  }, [props.value, props.filePath]);

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
