/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DesktopCodeEditor,
  DesktopEditorFocusProvider,
  preloadDesktopCodeEditor,
  useDesktopEditorFocusHandoff,
  useDesktopEditorComposing,
} from './index.js';

type TestUri = { path: string; toString: () => string };
type TestModel = {
  isDisposed: () => boolean;
  uri: TestUri;
  getValue: () => string;
  setValue: (value: string) => void;
  dispose: () => void;
};
type TestEditor = {
  getModel: () => TestModel;
  getValue: () => string;
  contentChanged: () => void;
  updateOptions: ReturnType<typeof vi.fn>;
  disposed: boolean;
  input: HTMLTextAreaElement;
  startComposition(): void;
  endComposition(): void;
  viewState: { column: number; scrollTop: number };
  focusedViewState?: { column: number; scrollTop: number };
};

const pendingMonaco = vi.hoisted(() => {
  let release!: () => void;

  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { ready, release, created: [] as TestEditor[], setTheme: vi.fn() };
});

const pendingTabFocus = vi.hoisted(() => {
  let release!: () => void;

  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { ready, release };
});

vi.mock('monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js', async () => {
  await pendingTabFocus.ready;

  return {};
});

vi.mock('monaco-editor/esm/vs/editor/editor.api', async () => {
  await pendingMonaco.ready;

  const models = new Map<string, TestModel>();
  const disposable = () => ({ dispose: vi.fn() });

  const createModel = (initial: string, _language: string, uri: TestUri): TestModel => {
    if (models.has(uri.toString())) {
      throw new Error(`ModelService: Cannot add model because it already exists: ${uri.toString()}`);
    }

    let value = initial;
    let disposed = false;

    const model: TestModel = {
      uri,
      isDisposed: () => disposed,
      getValue: () => value,
      setValue: (next) => {
        value = next;

        for (const editor of pendingMonaco.created) {
          if (!editor.disposed && editor.getModel() === model) {
            editor.contentChanged();
          }
        }
      },
      dispose: () => {
        disposed = true;
        models.delete(uri.toString());
      },
    };
    models.set(uri.toString(), model);

    return model;
  };

  return {
    Uri: { parse: (uri: string): TestUri => ({ path: uri.replace('file://', ''), toString: () => uri }) },
    KeyMod: { CtrlCmd: 1, Shift: 2 },
    KeyCode: { KeyS: 1, F2: 2, F12: 3, KeyR: 4 },
    editor: {
      createModel,
      getModel: (uri: TestUri) => models.get(uri.toString()),
      defineTheme: vi.fn(),
      setTheme: pendingMonaco.setTheme,
      setModelLanguage: vi.fn(),
      registerCommand: disposable,
      ShowLightbulbIconMode: { On: 'on', Off: 'off' },
      create: (_container: HTMLElement, options: { model: TestModel }) => {
        const input = document.createElement('textarea');
        _container.append(input);

        let model = options.model;
        let onChange: () => void = () => undefined;
        let onDispose: () => void = () => undefined;
        let onCompositionStart = () => undefined as void;
        let onCompositionEnd = () => undefined as void;

        const editor = {
          input,
          startComposition: () => onCompositionStart(),
          endComposition: () => onCompositionEnd(),
          onDidCompositionStart: (callback: () => void) => {
            onCompositionStart = callback;
            return disposable();
          },
          onDidCompositionEnd: (callback: () => void) => {
            onCompositionEnd = callback;
            return disposable();
          },
          viewState: { column: 1, scrollTop: 0 },
          focusedViewState: undefined as TestEditor['focusedViewState'],
          saveViewState: () => ({ ...editor.viewState }),
          restoreViewState: (state: TestEditor['viewState']) => {
            editor.viewState = { ...state };
          },
          disposed: false,
          getModel: () => model,
          getValue: () => model.getValue(),
          contentChanged: () => onChange(),
          setModel: (next: TestModel) => {
            model = next;
          },
          onDidChangeModelContent: (callback: () => void) => {
            onChange = callback;
            return disposable();
          },
          onDidChangeCursorSelection: disposable,
          onDidDispose: (callback: () => void) => {
            onDispose = callback;
            return disposable();
          },
          dispose: () => {
            editor.disposed = true;
            input.remove();
            onDispose();
          },
          addCommand: vi.fn(),
          addAction: vi.fn(),
          updateOptions: vi.fn(),
          focus: vi.fn(() => {
            editor.focusedViewState = { ...editor.viewState };
            input.focus();
          }),
          hasTextFocus: () => document.activeElement === input,
        };
        pendingMonaco.created.push(editor);

        return editor;
      },
    },
    languages: {
      registerCompletionItemProvider: disposable,
      registerDefinitionProvider: disposable,
      registerReferenceProvider: disposable,
      registerRenameProvider: disposable,
      registerDocumentSymbolProvider: disposable,
      registerCodeLensProvider: disposable,
    },
  };
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('lang');
  pendingMonaco.created.length = 0;
});

it('initializes the latest document after a delayed import and ignores an unmounted editor', async () => {
  const preload = preloadDesktopCodeEditor();
  expect(preloadDesktopCodeEditor()).toBe(preload);
  expect(pendingMonaco.created).toHaveLength(0);

  const onChange = vi.fn();
  const onSave = vi.fn();
  const props = (filePath: string, value: string) => ({ filePath, value, onChange, onSave });
  const mounted = render(createElement(DesktopCodeEditor, props('/README.md', 'INITIAL README')));
  const removed = render(createElement(DesktopCodeEditor, props('/removed.txt', 'UNMOUNTED')));
  removed.unmount();
  mounted.rerender(createElement(DesktopCodeEditor, props('/a.txt', 'DOCUMENT A')));
  mounted.rerender(createElement(DesktopCodeEditor, props('/b.txt', 'DOCUMENT B')));
  mounted.rerender(
    createElement(DesktopCodeEditor, { ...props('/a.txt', 'LATEST A'), readOnly: true, theme: 'light' }),
  );
  await act(async () => {
    pendingMonaco.release();
    await pendingMonaco.ready;
  });
  expect(pendingMonaco.created).toHaveLength(0);
  await act(async () => {
    pendingTabFocus.release();
    await preload;
  });
  expect(pendingMonaco.created).toHaveLength(1);

  const editor = pendingMonaco.created[0];
  expect(editor.getModel().uri.path).toBe('/a.txt');
  expect(editor.getValue()).toBe('LATEST A');
  expect(editor.updateOptions).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true }));
  expect(pendingMonaco.setTheme).toHaveBeenLastCalledWith('vibecore-vs-light');
  expect(onChange).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  mounted.rerender(createElement(DesktopCodeEditor, props('/b.txt', 'DOCUMENT B')));
  expect(editor.getModel().uri.path).toBe('/b.txt');
  expect(editor.getValue()).toBe('DOCUMENT B');
  mounted.rerender(createElement(DesktopCodeEditor, props('/a.txt', 'LATEST A')));
  expect(editor.getModel().uri.path).toBe('/a.txt');
  expect(editor.getValue()).toBe('LATEST A');
  mounted.rerender(createElement(DesktopCodeEditor, props('/a.txt', 'EXTERNAL UPDATE')));
  expect(editor.getValue()).toBe('EXTERNAL UPDATE');
  expect(onChange).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  act(() => editor.getModel().setValue('USER EDIT'));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ value: 'USER EDIT', source: 'monaco' });
  expect(onSave).not.toHaveBeenCalled();
  onChange.mockClear();
  mounted.rerender(
    createElement(DesktopCodeEditor, { ...props('/a.txt', 'LATEST A'), readOnly: true, theme: 'light' }),
  );
  await act(async () => {
    document.documentElement.lang = 'fr';
    window.dispatchEvent(new Event('vibecore:language-change'));
    await Promise.resolve();
  });
  expect(pendingMonaco.created).toHaveLength(2);

  const remounted = pendingMonaco.created[1];
  expect(remounted.getModel().uri.path).toBe('/a.txt');
  expect(remounted.getValue()).toBe('LATEST A');
  expect(remounted.updateOptions).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true }));
  expect(pendingMonaco.setTheme).toHaveBeenLastCalledWith('vibecore-vs-light');
  expect(onChange).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
});

it('borrows an existing model and never destroys it on unmount', async () => {
  pendingMonaco.release();

  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
  const uri = monaco.Uri.parse('file:///existing.txt');
  const external = monaco.editor.createModel('EXTERNAL', 'plaintext', uri);
  const mounted = render(createElement(DesktopCodeEditor, { filePath: '/existing.txt', value: 'EXTERNAL' }));
  await waitFor(() => expect(pendingMonaco.created.filter((e) => !e.disposed)).toHaveLength(1));

  const editor = pendingMonaco.created.find((e) => !e.disposed)!;
  expect(editor.getModel()).toBe(external);
  mounted.unmount();
  expect(external.isDisposed()).toBe(false);
  external.dispose();
});

it('shares one file across two editors, locale remount and independent unmount', async () => {
  pendingMonaco.release();

  const onChange = vi.fn();
  const props = { filePath: '/shared.txt', value: 'SHARED DRAFT', onChange };
  const first = render(createElement(DesktopCodeEditor, props));
  await waitFor(() => expect(pendingMonaco.created.filter((e) => !e.disposed)).toHaveLength(1));

  const model = pendingMonaco.created.find((e) => !e.disposed)!.getModel();

  const second = render(createElement(DesktopCodeEditor, props));
  await waitFor(() => expect(pendingMonaco.created.filter((e) => !e.disposed)).toHaveLength(2));
  expect(pendingMonaco.created.filter((e) => !e.disposed).every((e) => e.getModel() === model)).toBe(true);
  first.rerender(createElement(DesktopCodeEditor, { ...props, value: 'EXTERNAL UPDATE' }));
  second.rerender(createElement(DesktopCodeEditor, { ...props, value: 'EXTERNAL UPDATE' }));
  expect(onChange).not.toHaveBeenCalled();
  first.rerender(createElement(DesktopCodeEditor, props));
  second.rerender(createElement(DesktopCodeEditor, props));
  expect(onChange).not.toHaveBeenCalled();
  first.unmount();
  expect(model.isDisposed()).toBe(false);
  expect(pendingMonaco.created.find((e) => !e.disposed)!.getValue()).toBe('SHARED DRAFT');
  await act(async () => {
    document.documentElement.lang = 'fr';
    window.dispatchEvent(new Event('vibecore:language-change'));
    await Promise.resolve();
  });

  await waitFor(() => expect(pendingMonaco.created.filter((editor) => !editor.disposed)).toHaveLength(1));

  const active = pendingMonaco.created.filter((e) => !e.disposed);
  expect(active).toHaveLength(1);
  expect(active[0].getValue()).toBe('SHARED DRAFT');
  expect(active[0].getModel().isDisposed()).toBe(false);
  second.unmount();
  expect(active[0].getModel().isDisposed()).toBe(true);
});

it('keeps borrowed workspace models alive when indexing stops and the owner unmounts', async () => {
  pendingMonaco.release();

  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
  const external = monaco.editor.createModel('EXTERNAL INDEX', 'plaintext', monaco.Uri.parse('file:///index.ts'));

  const owner = render(
    createElement(DesktopCodeEditor, {
      filePath: '/owner.ts',
      value: 'OWNER',
      projectFiles: { '/index.ts': 'EXTERNAL INDEX', '/other.ts': 'OTHER' },
    }),
  );
  await waitFor(() => expect(pendingMonaco.created.filter((e) => !e.disposed)).toHaveLength(1));

  const indexed = monaco.editor.getModel(monaco.Uri.parse('file:///other.ts'))!;
  expect(indexed).toBeTruthy();

  const borrower = render(createElement(DesktopCodeEditor, { filePath: '/other.ts', value: 'OTHER' }));
  await waitFor(() => expect(pendingMonaco.created.filter((e) => !e.disposed)).toHaveLength(2));
  owner.rerender(createElement(DesktopCodeEditor, { filePath: '/owner.ts', value: 'OWNER', projectFiles: {} }));
  expect(external.isDisposed()).toBe(false);
  expect(indexed.isDisposed()).toBe(false);
  owner.unmount();
  expect(indexed.isDisposed()).toBe(false);
  expect(pendingMonaco.created.find((e) => !e.disposed)!.getModel()).toBe(indexed);
  borrower.unmount();
  expect(indexed.isDisposed()).toBe(true);
  expect(external.isDisposed()).toBe(false);
  external.dispose();
});

function focusShell({
  identity = 'pane-a:/focus.txt',
  visible = true,
  filePath = '/focus.txt',
  value = 'FOCUS',
}: {
  identity?: string;
  visible?: boolean;
  filePath?: string;
  value?: string;
}) {
  useDesktopEditorFocusHandoff();
  return visible ? createElement(DesktopCodeEditor, { filePath, value, focusIdentity: identity }) : null;
}

function focusTree(
  shell: string,
  identity = 'pane-a:/focus.txt',
  visible = true,
  scope = 'project-a',
  options: { filePath?: string; value?: string } = {},
) {
  return createElement(DesktopEditorFocusProvider, {
    key: scope,
    children: createElement(focusShell, { key: shell, identity, visible, ...options }),
  });
}

async function newestEditor() {
  await waitFor(() => expect(pendingMonaco.created.filter((editor) => !editor.disposed)).toHaveLength(1));
  return pendingMonaco.created.find((editor) => !editor.disposed)!;
}

it('hands off focused text across a shell replacement without initial autofocus', async () => {
  const mounted = render(focusTree('pending'));
  const initial = await newestEditor();
  expect(document.activeElement).not.toBe(initial.input);
  initial.viewState = { column: 6, scrollTop: 120 };
  initial.input.focus();
  mounted.rerender(focusTree('ready'));

  const replacement = await newestEditor();
  expect(replacement).not.toBe(initial);
  expect(document.activeElement).toBe(replacement.input);
  expect(replacement.viewState).toEqual({ column: 6, scrollTop: 120 });
  expect(replacement.focusedViewState).toEqual({ column: 6, scrollTop: 120 });
});

it('retains the shell handoff across StrictMode layout effect replay', async () => {
  const mounted = render(createElement(StrictMode, { children: focusTree('pending') }));
  (await newestEditor()).input.focus();
  mounted.rerender(createElement(StrictMode, { children: focusTree('ready') }));

  const replacement = await newestEditor();
  expect(document.activeElement).toBe(replacement.input);
});

it.each(['focus', 'pointer', 'keyboard'])(
  'does not steal focus after an external %s during async replacement',
  async (interaction) => {
    const mounted = render(focusTree('pending'));
    const initial = await newestEditor();
    initial.input.focus();

    const outside = document.createElement('button');
    document.body.append(outside);

    try {
      mounted.rerender(focusTree('ready'));

      if (interaction === 'focus') {
        outside.focus();
      }

      if (interaction === 'pointer') {
        outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      }

      if (interaction === 'keyboard') {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      }

      const replacement = await newestEditor();
      expect(document.activeElement).not.toBe(replacement.input);

      if (interaction === 'focus') {
        expect(document.activeElement).toBe(outside);
      }
    } finally {
      outside.remove();
    }
  },
);

it('does not retain focus after closing and reopening an editor in the same shell', async () => {
  const mounted = render(focusTree('ready'));
  (await newestEditor()).input.focus();
  mounted.rerender(focusTree('ready', undefined, false));
  await act(async () => {
    await Promise.resolve();
  });
  mounted.rerender(focusTree('ready'));

  const replacement = await newestEditor();
  expect(document.activeElement).not.toBe(replacement.input);
});

it.each(['pane-b:/focus.txt', 'pane-a:/other.txt'])(
  'does not transfer focus to different identity %s',
  async (identity) => {
    const mounted = render(focusTree('pending'));
    (await newestEditor()).input.focus();
    mounted.rerender(focusTree('ready', identity));

    const replacement = await newestEditor();
    expect(document.activeElement).not.toBe(replacement.input);
  },
);

it('does not carry focus across a provider scope change', async () => {
  const mounted = render(focusTree('pending'));
  (await newestEditor()).input.focus();
  mounted.rerender(focusTree('ready', undefined, true, 'project-b'));

  const replacement = await newestEditor();
  expect(document.activeElement).not.toBe(replacement.input);
});

it('does not restore a shell intent after a commit without a matching replacement', async () => {
  const mounted = render(focusTree('pending'));
  (await newestEditor()).input.focus();
  mounted.rerender(focusTree('intermediate', undefined, false));
  await act(async () => {
    await Promise.resolve();
  });
  mounted.rerender(focusTree('later'));

  const replacement = await newestEditor();
  expect(document.activeElement).not.toBe(replacement.input);
});

it.each([
  ['contents', { value: 'CHANGED' }],
  ['URI', { filePath: '/different.txt' }],
] as const)('does not restore stale caret or focus after model %s diverges', async (_kind, options) => {
  const mounted = render(focusTree('pending'));
  const initial = await newestEditor();
  initial.viewState = { column: 6, scrollTop: 120 };
  initial.input.focus();
  mounted.rerender(focusTree('ready', undefined, true, undefined, options));

  const replacement = await newestEditor();
  expect(document.activeElement).not.toBe(replacement.input);
  expect(replacement.viewState).toEqual({ column: 1, scrollTop: 0 });
});

it('does not restore focus when a borrowed model still has old content but incoming props changed', async () => {
  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
  const model = monaco.editor.createModel('FOCUS', 'plaintext', monaco.Uri.parse('file:///focus.txt'));
  const mounted = render(focusTree('pending'));
  (await newestEditor()).input.focus();
  mounted.rerender(focusTree('ready', undefined, true, undefined, { value: 'CHANGED' }));

  const replacement = await newestEditor();
  expect(replacement.getValue()).toBe('CHANGED');
  expect(document.activeElement).not.toBe(replacement.input);
  mounted.unmount();
  model.dispose();
});

function compositionStatus() {
  return createElement('output', { 'data-testid': 'composition-status' }, String(useDesktopEditorComposing()));
}

function compositionTree(visible = true, scope = 'project-a') {
  return createElement(DesktopEditorFocusProvider, {
    key: scope,
    children: [
      visible ? createElement(DesktopCodeEditor, { key: 'editor', filePath: '/composition.txt', value: 'IME' }) : null,
      createElement(compositionStatus, { key: 'status' }),
    ],
  });
}

it('reports only native composition activity, not focus or ordinary typing', async () => {
  const mounted = render(compositionTree());
  const editor = await newestEditor();
  editor.input.focus();
  act(() => editor.getModel().setValue('ordinary typing'));
  expect(mounted.getByTestId('composition-status').textContent).toBe('false');
  act(() => editor.startComposition());
  expect(mounted.getByTestId('composition-status').textContent).toBe('true');
  act(() => {
    editor.getModel().setValue('日本');
    editor.endComposition();
  });
  expect(mounted.getByTestId('composition-status').textContent).toBe('false');
  expect(editor.getValue()).toBe('日本');
});

it('clears composition when its editor is disposed and never carries it into another scope', async () => {
  const mounted = render(compositionTree());
  act(() => pendingMonaco.created.find((editor) => !editor.disposed)?.startComposition());

  const initial = await newestEditor();
  act(() => initial.startComposition());
  expect(mounted.getByTestId('composition-status').textContent).toBe('true');
  mounted.rerender(compositionTree(false));
  expect(mounted.getByTestId('composition-status').textContent).toBe('false');
  mounted.rerender(compositionTree());

  const next = await newestEditor();
  act(() => next.startComposition());
  mounted.rerender(compositionTree(true, 'project-b'));
  await newestEditor();
  expect(mounted.getByTestId('composition-status').textContent).toBe('false');
});

it('keeps simultaneous compositions independent within the same provider', async () => {
  const mounted = render(
    createElement(DesktopEditorFocusProvider, {
      children: [
        createElement(DesktopCodeEditor, { key: 'a', filePath: '/composition-a.txt', value: 'A' }),
        createElement(DesktopCodeEditor, { key: 'b', filePath: '/composition-b.txt', value: 'B' }),
        createElement(compositionStatus, { key: 'status' }),
      ],
    }),
  );
  await waitFor(() => expect(pendingMonaco.created.filter((editor) => !editor.disposed)).toHaveLength(2));

  const [first, second] = pendingMonaco.created.filter((editor) => !editor.disposed);
  act(() => {
    first.startComposition();
    second.startComposition();
  });
  expect(mounted.getByTestId('composition-status').textContent).toBe('true');
  act(() => first.endComposition());
  expect(mounted.getByTestId('composition-status').textContent).toBe('true');
  act(() => second.endComposition());
  expect(mounted.getByTestId('composition-status').textContent).toBe('false');
});
