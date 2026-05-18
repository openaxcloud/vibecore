import { describe, expect, it } from 'vitest';
import {
  GeneratedFileJsonError,
  GeneratedFileParseError,
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

  it('rejects syntactically invalid generated source files before they can be applied', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'src/components/AboutSection.tsx',
          content: "export function AboutSection() {\n  return 'unterminated;\n}\n",
        },
      ]),
    ).rejects.toBeInstanceOf(GeneratedFileParseError);
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
