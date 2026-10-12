/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopCodeEditor } from './index.js';

type TestUri = { path: string; toString: () => string };
type TestModel = { uri: TestUri; getValue: () => string; setValue: (value: string) => void; dispose: () => void };
type TestEditor = {
  getModel: () => TestModel;
  getValue: () => string;
  contentChanged: () => void;
  updateOptions: ReturnType<typeof vi.fn>;
};

const pendingMonaco = vi.hoisted(() => {
  let release!: () => void;

  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { ready, release, created: [] as TestEditor[], setTheme: vi.fn() };
});

vi.mock('monaco-editor/esm/vs/editor/editor.api', async () => {
  await pendingMonaco.ready;

  const models = new Map<string, TestModel>();
  const disposable = () => ({ dispose: vi.fn() });

  const createModel = (initial: string, _language: string, uri: TestUri): TestModel => {
    let value = initial;

    const model: TestModel = {
      uri,
      getValue: () => value,
      setValue: (next) => {
        value = next;

        for (const editor of pendingMonaco.created) {
          if (editor.getModel() === model) {
            editor.contentChanged();
          }
        }
      },
      dispose: () => {
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
          dispose: () => onDispose(),
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
});

it('initializes the latest document after a delayed import and ignores an unmounted editor', async () => {
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
