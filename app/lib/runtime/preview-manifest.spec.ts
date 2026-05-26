import { describe, expect, it } from 'vitest';
import { buildPreviewManifestRepair, inferRuntimeDependenciesFromImports } from './preview-manifest';

function packageJsonFromRepair(files: Record<string, string>) {
  const repair = buildPreviewManifestRepair(files);
  const content = repair.packageJson?.content;

  if (!content) {
    throw new Error('Expected package.json repair content');
  }

  return { repair, packageJson: JSON.parse(content) as Record<string, any> };
}

describe('preview manifest repair', () => {
  it('detects React package imports from explicit and subpath imports', () => {
    expect(
      [
        ...inferRuntimeDependenciesFromImports({
          'src/main.tsx': [
            "import React from 'react';",
            "import { createRoot } from 'react-dom/client';",
            "import './styles.css';",
            '',
          ].join('\n'),
        }),
      ].sort(),
    ).toEqual(['react', 'react-dom']);
  });

  it('adds missing React dependencies and scripts to an incomplete Vite package', () => {
    const { repair, packageJson } = packageJsonFromRepair({
      'package.json': JSON.stringify({
        name: 'broken-preview',
        scripts: { dev: 'vite' },
        dependencies: { vite: '^5.4.19' },
      }),
      'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx': [
        "import React from 'react';",
        "import { createRoot } from 'react-dom/client';",
        'createRoot(document.getElementById("root")!).render(<main />);',
        '',
      ].join('\n'),
    });

    expect(repair.packageJson?.changed).toBe(true);
    expect(repair.packageJson?.missingDependencies).toEqual(
      expect.arrayContaining(['@vitejs/plugin-react', 'react', 'react-dom', 'typescript']),
    );
    expect(packageJson.dependencies).toMatchObject({
      '@vitejs/plugin-react': '^4.3.4',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      typescript: '^5.7.2',
      vite: '^5.4.19',
    });
    expect(packageJson.scripts).toMatchObject({
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    });
  });

  it('creates a runnable Vite manifest and glue files when React entry files exist without package.json', () => {
    const { repair, packageJson } = packageJsonFromRepair({
      'src/App.tsx': 'export default function App() { return <main>Preview</main>; }\n',
      'src/main.tsx': "import { createRoot } from 'react-dom/client';\nimport App from './App';\n",
    });

    expect(repair.packageJson?.created).toBe(true);
    expect(repair.packageJson?.path).toBe('package.json');
    expect(packageJson.scripts).toMatchObject({
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    });
    expect(packageJson.dependencies).toMatchObject({
      '@vitejs/plugin-react': '^4.3.4',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      typescript: '^5.7.2',
      vite: '^5.4.19',
    });
    expect(repair.supplementalFiles.map((file) => file.path).sort()).toEqual(['index.html', 'vite.config.ts']);
  });

  it('does not synthesize an application package for README-only AI projects', () => {
    const repair = buildPreviewManifestRepair({
      'README.md': '# Prompt-only project\n',
    });

    expect(repair.packageJson).toBeUndefined();
    expect(repair.supplementalFiles).toEqual([]);
  });

  it('does not create a React plugin config for vanilla Vite entries', () => {
    const { repair, packageJson } = packageJsonFromRepair({
      'src/main.ts': 'document.body.textContent = "hello";\n',
    });

    expect(packageJson.dependencies).toMatchObject({
      typescript: '^5.7.2',
      vite: '^5.4.19',
    });
    expect(packageJson.dependencies.react).toBeUndefined();
    expect(packageJson.dependencies['@vitejs/plugin-react']).toBeUndefined();
    expect(repair.supplementalFiles).toEqual([
      expect.objectContaining({
        path: 'index.html',
        content: expect.stringContaining('/src/main.ts'),
      }),
    ]);
  });
});
