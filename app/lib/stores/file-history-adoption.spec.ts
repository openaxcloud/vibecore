/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { EditorStore } from './editor';
import { FilesStore } from './files';

describe('authoritative File History content adoption', () => {
  it('updates the persisted baseline and editor buffer without a second runtime write', async () => {
    const runtime = createRuntime();
    const files = new FilesStore(runtime as never);
    const path = '/home/project/src/App.tsx';

    await files.createFile(path, 'const value = 3;\n');

    const editor = new EditorStore(files);
    editor.setDocuments(files.files.get());
    runtime.writeFile.mockClear();
    runtime.createFile.mockClear();

    expect(files.adoptPersistedFileContent(path, 'const value = 1;\n')).toBe(true);
    expect(editor.adoptPersistedFileContent(path, 'const value = 1;\n')).toBe(true);

    expect(files.getFile(path)?.content).toBe('const value = 1;\n');
    expect(editor.documents.get()[path].value).toBe('const value = 1;\n');
    expect(runtime.writeFile).not.toHaveBeenCalled();
    expect(runtime.createFile).not.toHaveBeenCalled();
  });

  it('refuses to adopt content into a missing or binary file', () => {
    const runtime = createRuntime();
    const files = new FilesStore(runtime as never);
    const editor = new EditorStore(files);

    expect(files.adoptPersistedFileContent('/home/project/missing.ts', 'content')).toBe(false);
    expect(editor.adoptPersistedFileContent('/home/project/missing.ts', 'content')).toBe(false);
  });
});

function createRuntime() {
  return {
    workdir: '/home/project',
    mode: 'test',
    hasWorkspaceId: () => true,
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
    createFile: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    watchFiles: vi.fn(async () => () => undefined),
    watchPorts: vi.fn(async () => () => undefined),
  };
}
