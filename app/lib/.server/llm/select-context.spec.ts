import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMap } from './constants';

// Mocked so selectContext exercises only its own logic, not a real LLM call.
const generateTextMock = vi.fn();
vi.mock('ai', () => ({ generateText: (...args: unknown[]) => generateTextMock(...args) }));

vi.mock('./model-compat', () => ({ removeUnsupportedModelSettings: (m: unknown) => m }));
vi.mock('./provider-credentials', () => ({
  resolveUsableProvider: () => ({
    provider: {
      name: 'FakeProvider',
      staticModels: [{ name: 'fake-model', provider: 'FakeProvider', maxTokenAllowed: 4000 }],
      getModelInstance: () => ({ id: 'fake-model' }),
    },
    model: 'fake-model',
  }),
}));
vi.mock('~/lib/modules/llm/manager', () => {
  const fakeProvider = {
    name: 'FakeProvider',
    config: { baseUrlKey: 'FAKE_BASE_URL', apiTokenKey: 'FAKE_API_KEY' },
    staticModels: [{ name: 'fake-model', provider: 'FakeProvider', maxTokenAllowed: 4000 }],
    getModelInstance: () => ({ id: 'fake-model' }),
  };

  return {
    LLMManager: {
      getInstance: () => ({
        getStaticModelListFromProvider: () => [{ name: 'fake-model', provider: 'FakeProvider', maxTokenAllowed: 4000 }],
        getModelListFromProvider: async () => [],

        // app/utils/constants.ts calls these at module load.
        getAllProviders: () => [fakeProvider],
        getDefaultProvider: () => fakeProvider,
      }),
    },
  };
});

import { getFilePaths, selectContext, selectContextBufferFiles } from './select-context';

describe('getFilePaths', () => {
  it('does not throw on the bare /home/project root entry (regression: ignore() rejects absolute paths)', () => {
    /*
     * Previously `'/home/project'.replace('/home/project/', '')` left the string
     * absolute, so ig.ignores('/home/project') threw "path should be a
     * `path.relative()`d string", crashing the entire chat stream (code=UNKNOWN).
     */
    const files: FileMap = {
      '/home/project': { type: 'folder' },
      '/home/project/src/App.tsx': { type: 'file', content: 'export default {}', isBinary: false },
      '/home/project/node_modules/foo/index.js': { type: 'file', content: '', isBinary: false },
    } as unknown as FileMap;

    let result: string[] = [];
    expect(() => {
      result = getFilePaths(files);
    }).not.toThrow();

    /*
     * The real source file is kept; the bare root is dropped (empty rel path);
     * node_modules is ignored by IGNORE_PATTERNS.
     */
    expect(result).toContain('/home/project/src/App.tsx');
    expect(result).not.toContain('/home/project');
    expect(result.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('handles a leading-slash absolute path without throwing', () => {
    const files: FileMap = {
      '/home/project/index.html': { type: 'file', content: '<!doctype html>', isBinary: false },
    } as unknown as FileMap;

    expect(() => getFilePaths(files)).not.toThrow();
    expect(getFilePaths(files)).toContain('/home/project/index.html');
  });
});

describe('selectContext fallback when the LLM omits <updateContextBuffer>', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  const files: FileMap = {
    '/home/project/src/App.tsx': { type: 'file', content: 'app', isBinary: false },
    '/home/project/src/index.ts': { type: 'file', content: 'index', isBinary: false },
  } as unknown as FileMap;

  // An assistant turn carrying a prior code-context buffer (src/App.tsx).
  const messages: Message[] = [
    {
      id: 'a1',
      role: 'assistant',
      content: 'prior turn',
      annotations: [{ type: 'codeContext', files: ['src/App.tsx'] }] as unknown as Message['annotations'],
    },
    { id: 'u1', role: 'user', content: 'add a button' },
  ];

  it('returns the existing context buffer instead of throwing (regression: discarded chat summary)', async () => {
    /*
     * Previously a benign tag-omission threw 'Invalid response...', and the sole
     * caller's catch nulled BOTH filteredFiles AND the separately-computed summary.
     * The fallback must keep the prior buffer so the caller retains the summary.
     */
    generateTextMock.mockResolvedValue({ text: 'Sure, here are the relevant files: src/App.tsx' });

    let result: FileMap | undefined;
    await expect(
      (async () => {
        result = (await selectContext({ messages, files, summary: 'chat so far' })) as FileMap;
      })(),
    ).resolves.not.toThrow();

    // Falls back to the prior context buffer (relative-keyed), not an empty/undefined map.
    expect(Object.keys(result ?? {})).toEqual(['src/App.tsx']);
    expect(result?.['src/App.tsx']).toBe(files['/home/project/src/App.tsx']);
  });

  it('still parses a well-formed response with the wrapper present', async () => {
    generateTextMock.mockResolvedValue({
      text: '<updateContextBuffer>\n<includeFile path="src/index.ts"/>\n</updateContextBuffer>',
    });

    const result = (await selectContext({ messages, files, summary: 'chat so far' })) as FileMap;

    // Newly included file plus the surviving prior buffer.
    expect(Object.keys(result).sort()).toEqual(['src/App.tsx', 'src/index.ts']);
  });
});

describe('selectContextBufferFiles', () => {
  const files: FileMap = {
    '/home/project/src/App.tsx': { type: 'file', content: 'app', isBinary: false },
    '/home/project/src/index.ts': { type: 'file', content: 'index', isBinary: false },
  } as unknown as FileMap;

  it('selects files listed in a well-formed codeContext.files array', () => {
    const { contextFiles, currentFiles } = selectContextBufferFiles(files, ['src/App.tsx']);

    expect(currentFiles).toEqual(['src/App.tsx']);
    expect(Object.keys(contextFiles)).toEqual(['src/App.tsx']);
    expect(contextFiles['src/App.tsx']).toBe(files['/home/project/src/App.tsx']);
  });

  it('does not throw when codeContext.files is undefined (regression: deserialized annotation missing files)', () => {
    /*
     * Previously `const codeContextFiles: string[] = codeContext.files;` was
     * dereferenced with `.includes()` and no array guard. A corrupted/older
     * annotation whose `files` is undefined threw a TypeError that aborted the
     * whole context-optimization pass for the turn.
     */
    let result: ReturnType<typeof selectContextBufferFiles> | undefined;

    expect(() => {
      result = selectContextBufferFiles(files, undefined);
    }).not.toThrow();

    expect(result?.contextFiles).toEqual({});
    expect(result?.currentFiles).toEqual([]);
  });

  it('does not throw when codeContext.files is a non-array value', () => {
    for (const bad of [null, 'src/App.tsx', 42, { 0: 'src/App.tsx' }] as unknown[]) {
      let result: ReturnType<typeof selectContextBufferFiles> | undefined;

      expect(() => {
        result = selectContextBufferFiles(files, bad);
      }).not.toThrow();

      expect(result?.contextFiles).toEqual({});
      expect(result?.currentFiles).toEqual([]);
    }
  });
});
