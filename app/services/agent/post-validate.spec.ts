import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GeneratedFileJsonError,
  MissingImportError,
  resolveImport,
  validateGeneratedFiles,
  validateImports,
} from './post-validate';

describe('agent post-generation import validation', () => {
  it('resolves extensionless relative imports to generated tsx files', () => {
    const files = new Map([
      ['src/main.tsx', ''],
      ['src/App.tsx', ''],
    ]);

    expect(resolveImport('./App', 'src/main.tsx', files)).toBe('src/App.tsx');
  });

  it('allows generated files to satisfy each other in the same batch', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'src/main.tsx',
          content: "import App from './App';\nconsole.log(App);\n",
        },
        {
          path: 'src/App.tsx',
          content: 'export default function App() { return <main />; }\n',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('throws when a generated relative import has no matching file', async () => {
    await expect(
      validateImports(
        {
          path: 'src/main.tsx',
          content: "import App from './App';\nconsole.log(App);\n",
        },
        new Map([['src/main.tsx', '']]),
      ),
    ).rejects.toBeInstanceOf(MissingImportError);
  });

  it('ignores package imports and validates css side-effect imports', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: '/home/project/src/main.tsx',
          content: "import React from 'react';\nimport './styles.css';\nconsole.log(React);\n",
        },
        {
          path: '/home/project/src/styles.css',
          content: 'body { margin: 0; }\n',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  describe('fail-open on parser errors (Replit/Cursor parity)', () => {
    /*
     * `@babel/parser` lags TC39 + TypeScript feature flags, so a syntactically
     * valid file can still fail to parse. Blocking the agent on a parser hiccup
     * confused the auto-apply UX (proposal stuck in "Review AI changes" with
     * status `failed`). The contract is now: log a warning, skip the import
     * check for that file, and let the TS LSP + preview build surface real
     * syntax errors as diagnostics.
     */
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('does not reject when a generated file fails to parse', async () => {
      await expect(
        validateGeneratedFiles([
          {
            path: 'src/components/AboutSection.tsx',
            content: "export function AboutSection() {\n  return 'unterminated;\n}\n",
          },
        ]),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping import check for src/components/AboutSection.tsx'),
      );
    });

    it('still validates resolvable imports in the rest of the batch', async () => {
      /*
       * Unparseable file shouldn't poison the batch — sibling files keep
       * their import validation. A missing import elsewhere must still fail.
       */
      await expect(
        validateGeneratedFiles([
          {
            path: 'src/broken.tsx',
            content: "export function Broken() { return 'unterminated;\n}\n",
          },
          {
            path: 'src/main.tsx',
            content: "import App from './App';\nconsole.log(App);\n",
          },
        ]),
      ).rejects.toBeInstanceOf(MissingImportError);
    });
  });

  it('accepts plain .ts files that use legacy <Type>value casts without tripping the jsx plugin', async () => {
    /*
     * Repro for the "Unable to validate imports in src/types/index.ts:
     * Unexpected token, expected ';'" bug — when the jsx plugin was enabled
     * for every extension the parser interpreted `<MyType>value` as a JSX
     * opening tag, which then failed with the unexpected-token error and
     * marked the proposal as `failed`, surfacing it in the Review queue even
     * when auto-apply was on.
     */
    await expect(
      validateGeneratedFiles([
        {
          path: 'src/types/index.ts',
          content: [
            'export type Brand<T, B extends string> = T & { readonly __brand: B };',
            'export function asUserId(value: string) {',
            '  return <Brand<string, "UserId">>value;',
            '}',
            '',
          ].join('\n'),
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('accepts plain .ts files that declare ambiguous arrow generics', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'src/utils/identity.ts',
          content: 'export const identity = <T>(value: T): T => value;\n',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('still parses JSX in .tsx and .jsx generated files', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'src/App.tsx',
          content: 'export default function App() { return <main>hi</main>; }\n',
        },
        {
          path: 'src/Legacy.jsx',
          content: 'export default function Legacy() { return <section>hi</section>; }\n',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid generated JSON before package parsing reaches preview startup', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'package.json',
          content: '{ "scripts": { "dev": "vite' + String.fromCharCode(7) + '" } }',
        },
      ]),
    ).rejects.toBeInstanceOf(GeneratedFileJsonError);
  });
});
