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

  it('does NOT fail a barrel import of a directory that has sibling modules but no index yet', async () => {
    /*
     * App.tsx imports the ./components DIRECTORY; there is no index.ts yet, but the
     * folder has modules — the preview repair synthesizes the barrel, so this must
     * not hard-fail (which would cascade to main.tsx → './App').
     */
    await expect(
      validateGeneratedFiles([
        {
          path: 'src/main.tsx',
          content: "import App from './App';\nconsole.log(App);\n",
        },
        {
          path: 'src/App.tsx',
          content:
            "import { CityInput } from './components';\nexport default function App() { return <CityInput />; }\n",
        },
        {
          path: 'src/components/CityInput.tsx',
          content: 'export function CityInput() { return <input />; }\n',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('still fails a directory import when the directory is empty (genuinely missing)', async () => {
    await expect(
      validateImports(
        {
          path: 'src/App.tsx',
          content: "import { X } from './missing';\nconsole.log(X);\n",
        },
        new Map([['src/App.tsx', '']]),
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

  it('does not validate dependency internals copied into the runtime file tree', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'node_modules/@babel/core/src/config/files/index-browser.ts',
          content: "import type { Handler } from './types.ts';\nexport const handler = {} as Handler;\n",
        },
        {
          path: 'node_modules/@babel/core/package.json',
          content: '{ invalid vendor package json',
        },
        {
          path: 'src/App.tsx',
          content: 'export default function App() { return <main />; }\n',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('still validates generated app imports when dependency folders are present', async () => {
    await expect(
      validateGeneratedFiles([
        {
          path: 'node_modules/@babel/core/src/config/files/index-browser.ts',
          content: "import type { Handler } from './types.ts';\nexport const handler = {} as Handler;\n",
        },
        {
          path: 'src/main.tsx',
          content: "import App from './MissingApp';\nconsole.log(App);\n",
        },
      ]),
    ).rejects.toBeInstanceOf(MissingImportError);
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

  it('does not reject a truncated package-lock.json (lockfiles are machine-generated)', async () => {
    /*
     * A cached template seeded a truncated package-lock.json; validating it as
     * authored JSON threw GeneratedFileJsonError, which blocked the preview from
     * starting and surfaced a dead "Preview Error: Invalid JSON in
     * package-lock.json". Lockfiles are regenerated on install, so they must be
     * skipped here regardless of how malformed they are.
     */
    await expect(
      validateGeneratedFiles([
        { path: 'package.json', content: '{ "name": "app", "private": true }' },
        { path: 'package-lock.json', content: '{ "name": "app", "lockfileVersion": 3, "packages":' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('skips lockfiles in nested package directories too', async () => {
    await expect(
      validateGeneratedFiles([{ path: 'apps/web/npm-shrinkwrap.json', content: '{ truncated' }]),
    ).resolves.toBeUndefined();
  });

  describe('JSONC config files (tsconfig/jsconfig/.vscode)', () => {
    /*
     * The default tsconfig.json from `npm create vite@latest` / `tsc --init`
     * ships with `//` comments and trailing commas. Strict JSON.parse threw
     * GeneratedFileJsonError, silently dropping the agent's write — the same
     * class of false-block already fixed for lockfiles.
     */
    const tsconfigWithComments = `{
  // Compiler options for the app
  "compilerOptions": {
    "target": "ES2020",
    "strict": true, /* enable all strict checks */
    "jsx": "react-jsx",
  },
  "include": ["src"], // trailing comma below is JSONC-legal
}`;

    it('does not reject tsconfig.json with comments and trailing commas', async () => {
      await expect(
        validateGeneratedFiles([{ path: 'tsconfig.json', content: tsconfigWithComments }]),
      ).resolves.toBeUndefined();
    });

    it('does not reject tsconfig.app.json / tsconfig.node.json', async () => {
      await expect(
        validateGeneratedFiles([
          { path: 'tsconfig.app.json', content: tsconfigWithComments },
          { path: 'tsconfig.node.json', content: tsconfigWithComments },
        ]),
      ).resolves.toBeUndefined();
    });

    it('does not reject jsconfig.json with comments', async () => {
      await expect(
        validateGeneratedFiles([
          { path: 'jsconfig.json', content: '{\n  // paths\n  "compilerOptions": { "baseUrl": "." },\n}' },
        ]),
      ).resolves.toBeUndefined();
    });

    it('does not reject .vscode/settings.json with comments', async () => {
      await expect(
        validateGeneratedFiles([
          {
            path: '.vscode/settings.json',
            content: '{\n  // editor prefs\n  "editor.tabSize": 2,\n  "files.eol": "\\n",\n}',
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it('preserves string content containing comment-like sequences', async () => {
      await expect(
        validateGeneratedFiles([
          {
            path: '.vscode/settings.json',
            content: '{\n  "url": "https://e-code.ai/path",\n  "glob": "**/*.ts", // keep\n}',
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it('still rejects a JSONC config that is structurally invalid', async () => {
      await expect(
        validateGeneratedFiles([{ path: 'tsconfig.json', content: '{ "compilerOptions": { ' }]),
      ).rejects.toBeInstanceOf(GeneratedFileJsonError);
    });

    it('still rejects a plain (non-JSONC) .json file with comments', async () => {
      await expect(
        validateGeneratedFiles([{ path: 'data.json', content: '{\n  // not allowed here\n  "a": 1\n}' }]),
      ).rejects.toBeInstanceOf(GeneratedFileJsonError);
    });
  });

  describe('root-absolute imports (Vite public/ dir)', () => {
    /*
     * `import logo from '/vite.svg'` is the Vite-scaffolded default. A leading
     * '/' resolves from the dev-server root (the public/ directory), not from a
     * file literally named 'vite.svg' at the project root. The validator
     * stripped the slash to 'vite.svg', failed to resolve it, threw
     * MissingImportError and dropped the agent's write.
     */
    it('does not block a patch on a public/ asset that is not in the file map', async () => {
      await expect(
        validateGeneratedFiles([
          {
            path: 'src/App.tsx',
            content: "import logo from '/vite.svg';\nexport default function App() { return <img src={logo} />; }\n",
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it('resolves a root-absolute import to the public/ directory when the asset exists', () => {
      const files = new Map([
        ['src/App.tsx', ''],
        ['public/vite.svg', ''],
      ]);

      expect(resolveImport('/vite.svg', 'src/App.tsx', files)).toBe('public/vite.svg');
    });

    it('still resolves a root-absolute import that lives at the project root', () => {
      const files = new Map([
        ['src/main.tsx', ''],
        ['src/app.css', ''],
      ]);

      expect(resolveImport('/src/app.css', 'src/main.tsx', files)).toBe('src/app.css');
    });

    it('never throws on root-absolute imports even when unresolvable', async () => {
      await expect(
        validateImports(
          {
            path: 'src/main.tsx',
            content: "import './nope-relative.css';\nimport '/totally-missing.svg';\n",
          },
          new Map([
            ['src/main.tsx', ''],
            ['src/nope-relative.css', ''],
          ]),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('type-only imports of .d.ts declaration files', () => {
    /*
     * `import type { Foo } from './types'` where the declaration lives in
     * 'types.d.ts' is a normal TS pattern. RESOLVABLE_EXTENSIONS produced
     * 'types.ts'/'types.tsx'/… but never 'types.d.ts', so resolveImport
     * returned undefined and MissingImportError failed the proposal.
     */
    it('resolves an extensionless import to a sibling .d.ts file', () => {
      const files = new Map([
        ['src/main.ts', ''],
        ['src/types.d.ts', ''],
      ]);

      expect(resolveImport('./types', 'src/main.ts', files)).toBe('src/types.d.ts');
    });

    it('resolves a directory import to its index.d.ts barrel', () => {
      const files = new Map([
        ['src/main.ts', ''],
        ['src/types/index.d.ts', ''],
      ]);

      expect(resolveImport('./types', 'src/main.ts', files)).toBe('src/types/index.d.ts');
    });

    it('does not block a TS patch that type-imports a generated .d.ts file', async () => {
      await expect(
        validateGeneratedFiles([
          {
            path: 'src/main.ts',
            content: "import type { Config } from './config';\nexport const x: Config = {} as Config;\n",
          },
          {
            path: 'src/config.d.ts',
            content: 'export interface Config { debug: boolean; }\n',
          },
        ]),
      ).resolves.toBeUndefined();
    });
  });

  describe('re-export statements (export ... from)', () => {
    /*
     * Babel parses `export { X } from './m'` as ExportNamedDeclaration and
     * `export * from './m'` as ExportAllDeclaration — neither is an
     * ImportDeclaration. Both carry a relative `node.source` that must resolve
     * exactly like an import, otherwise a broken barrel re-export slips past
     * validation while the equivalent plain import is caught.
     */
    it('throws when a named re-export targets a missing relative module', async () => {
      await expect(
        validateImports(
          {
            path: 'src/index.ts',
            content: "export { Button } from './Missing';\n",
          },
          new Map([['src/index.ts', '']]),
        ),
      ).rejects.toBeInstanceOf(MissingImportError);
    });

    it('throws when a star re-export targets a missing relative module', async () => {
      await expect(
        validateImports(
          {
            path: 'src/index.ts',
            content: "export * from './Missing';\n",
          },
          new Map([['src/index.ts', '']]),
        ),
      ).rejects.toBeInstanceOf(MissingImportError);
    });

    it('allows a re-export that resolves to a generated sibling', async () => {
      await expect(
        validateGeneratedFiles([
          {
            path: 'src/index.ts',
            content: "export { Button } from './Button';\nexport * from './Card';\n",
          },
          {
            path: 'src/Button.tsx',
            content: 'export const Button = () => <button />;\n',
          },
          {
            path: 'src/Card.tsx',
            content: 'export const Card = () => <div />;\n',
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it('ignores a local export with no source module', async () => {
      await expect(
        validateImports(
          {
            path: 'src/index.ts',
            content: 'export const x = 1;\nexport default x;\n',
          },
          new Map([['src/index.ts', '']]),
        ),
      ).resolves.toBeUndefined();
    });

    it('does not block a leading-slash re-export (dev-server-root asset)', async () => {
      await expect(
        validateImports(
          {
            path: 'src/index.ts',
            content: "export * from '/generated/registry';\n",
          },
          new Map([['src/index.ts', '']]),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
