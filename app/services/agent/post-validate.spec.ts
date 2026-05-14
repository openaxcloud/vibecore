import { describe, expect, it } from 'vitest';
import { MissingImportError, resolveImport, validateGeneratedFiles, validateImports } from './post-validate';

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
});
