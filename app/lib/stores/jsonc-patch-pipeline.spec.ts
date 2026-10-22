import { describe, expect, it } from 'vitest';
import { reconcileRemoteWrite } from './reconcile-remote-write';
import { mergeJsonContent } from '~/lib/chat/merge-json-content';
import { validateGeneratedFile } from '~/services/agent/post-validate';
import { sanitizeFileContent } from '~/utils/sanitize-file-content';

const proposed = `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "skipLibCheck": true,
    /* Bundler mode */
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    // Linting
    "strict": true,
    /* Path Aliases */
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"], },
  },
  "include": ["src"],
}`;

describe('JSONC patch application pipeline', () => {
  it('preserves a valid commented tsconfig through validation and runtime sanitization', async () => {
    await expect(validateGeneratedFile({ path: 'tsconfig.json', content: proposed })).resolves.toBeUndefined();
    expect(sanitizeFileContent(proposed, 'tsconfig.json')).toMatchObject({ sanitized: proposed, jsonValid: true });
  });

  it('keeps options after comments and concurrent remote keys when reconciling with a stub', () => {
    const stub = '{"compilerOptions":{"target":"ES2020","noEmit":true,"types":["vite/client"]}}';
    const merged = reconcileRemoteWrite('tsconfig.json', stub, proposed);
    expect(JSON.parse(merged)).toEqual({
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020', 'DOM'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] },
        noEmit: true,
        types: ['vite/client'],
      },
      include: ['src'],
    });
    expect(sanitizeFileContent(merged, 'tsconfig.json').jsonValid).toBe(true);
  });

  it.each(['.vscode/package.json', 'nested/.vscode/package.json', 'nested\\.vscode\\package.json'])(
    'keeps package.json strict inside a JSONC directory: %s',
    async (path) => {
      const commented = '{/* configuration comment */"name":"app"}';
      const strict = '{"name":"app"}';

      expect(() => sanitizeFileContent(commented, path)).toThrow();
      await expect(validateGeneratedFile({ path, content: commented })).rejects.toThrow();
      expect(sanitizeFileContent(strict, path)).toMatchObject({ sanitized: strict, jsonValid: true });
      await expect(validateGeneratedFile({ path, content: strict })).resolves.toBeUndefined();
    },
  );

  it('does not treat package.json as JSONC', async () => {
    await expect(validateGeneratedFile({ path: 'package.json', content: proposed })).rejects.toThrow();
    expect(() => sanitizeFileContent(proposed, 'package.json')).toThrow();
  });
});

it('does not silently accept invalid JSONC by falling back to an unchanged valid stub', () => {
  const current = '{"compilerOptions":{"target":"ES2020"}}';
  expect(mergeJsonContent(current, '{"compilerOptions": /* unfinished', { jsonc: true })).toBeUndefined();
});

it('preserves concurrent keys from a commented current configuration too', () => {
  const current = '{// current user settings\n"compilerOptions":{"noEmit":true,"paths":{"local/*":["local/*"]}},}';
  const merged = mergeJsonContent(current, proposed, { jsonc: true });
  expect(JSON.parse(merged!).compilerOptions).toMatchObject({
    noEmit: true,
    jsx: 'react-jsx',
    strict: true,
    paths: { 'local/*': ['local/*'], '@/*': ['./src/*'] },
  });
});
