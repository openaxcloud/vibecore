import { describe, expect, it } from 'vitest';
import { EditorStore } from './editor';
import type { FileMap } from './files';

function fileMap(entries: Record<string, string>): FileMap {
  return Object.fromEntries(
    Object.entries(entries).map(([path, content]) => [path, { type: 'file' as const, content, isBinary: false }]),
  );
}

describe('EditorStore.setDocuments', () => {
  it('populates document values from on-disk content', () => {
    const store = new EditorStore({ getFile: () => undefined } as never);
    store.setDocuments(fileMap({ 'a.ts': 'const a = 1;', 'b.ts': 'const b = 2;' }));

    expect(store.documents.get()['a.ts'].value).toBe('const a = 1;');
    expect(store.documents.get()['b.ts'].value).toBe('const b = 2;');
  });

  it('preserves unsaved in-editor edits when the file tree updates', () => {
    const store = new EditorStore({ getFile: () => undefined } as never);
    store.setDocuments(fileMap({ 'a.ts': 'const a = 1;', 'b.ts': 'const b = 2;' }));

    // Simulate the user editing a.ts in the editor (value diverges from disk).
    store.updateFile('a.ts', 'const a = 999; // unsaved');
    expect(store.documents.get()['a.ts'].value).toBe('const a = 999; // unsaved');

    /*
     * The files store updates (e.g. the AI wrote b.ts). a.ts is still dirty, so
     * its unsaved value must survive even though disk still has the old content.
     */
    store.setDocuments(fileMap({ 'a.ts': 'const a = 1;', 'b.ts': 'const b = 42;' }), new Set(['a.ts']));

    expect(store.documents.get()['a.ts'].value).toBe('const a = 999; // unsaved');
    expect(store.documents.get()['b.ts'].value).toBe('const b = 42;');
  });

  it('resets a clean file to on-disk content (no unsaved guard)', () => {
    const store = new EditorStore({ getFile: () => undefined } as never);
    store.setDocuments(fileMap({ 'a.ts': 'const a = 1;' }));

    // a.ts is not in the unsaved set, so an external/disk update is reflected.
    store.setDocuments(fileMap({ 'a.ts': 'const a = 2;' }), new Set());
    expect(store.documents.get()['a.ts'].value).toBe('const a = 2;');
  });

  it('preserves a dirty buffer, scroll position, and selection when the file is deleted remotely', () => {
    const store = new EditorStore({ getFile: () => undefined } as never);
    store.setDocuments(fileMap({ 'a.ts': 'const a = 1;', 'b.ts': 'const b = 2;' }));
    store.setSelectedFile('a.ts');
    store.updateFile('a.ts', 'const a = 999; // unsaved');
    store.updateScrollPosition('a.ts', { top: 240, left: 18, line: 12, column: 4 });

    const documentBeforeDeletion = store.documents.get()['a.ts'];

    store.setDocuments(fileMap({ 'b.ts': 'const b = 42;' }), new Set(['a.ts']));

    const preservedDocument = store.documents.get()['a.ts'];
    expect(preservedDocument).toBe(documentBeforeDeletion);
    expect(preservedDocument.value).toBe('const a = 999; // unsaved');
    expect(preservedDocument.scroll).toEqual({ top: 240, left: 18, line: 12, column: 4 });
    expect(store.selectedFile.get()).toBe('a.ts');
    expect(store.currentDocument.get()).toBe(preservedDocument);
    expect(store.documents.get()['b.ts'].value).toBe('const b = 42;');
  });

  it('removes a clean document when the file is deleted remotely', () => {
    const store = new EditorStore({ getFile: () => undefined } as never);
    store.setDocuments(fileMap({ 'a.ts': 'const a = 1;', 'b.ts': 'const b = 2;' }));

    store.setDocuments(fileMap({ 'b.ts': 'const b = 2;' }), new Set());

    expect(store.documents.get()).not.toHaveProperty('a.ts');
    expect(store.documents.get()['b.ts'].value).toBe('const b = 2;');
  });
});
