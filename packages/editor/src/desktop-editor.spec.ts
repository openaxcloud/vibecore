/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopCodeEditor, preloadDesktopCodeEditor } from './index.js';

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
        let model = options.model;
        let onChange: () => void = () => undefined;
        let onDispose: () => void = () => undefined;

        const editor = {
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
            onDispose();
          },
          addCommand: vi.fn(),
          addAction: vi.fn(),
          updateOptions: vi.fn(),
          focus: vi.fn(),
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
