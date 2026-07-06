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

    /*
     * The generated vite.config must wire HMR through the preview proxy (reads the
     * workspace-injected VITE_HMR_CLIENT_PORT) so the dev server does not build a
     * `wss://localhost:undefined` HMR websocket behind the TLS proxy.
     */
    const viteConfig = repair.supplementalFiles.find((file) => file.path === 'vite.config.ts');
    expect(viteConfig?.content).toContain('VITE_HMR_CLIENT_PORT');
    expect(viteConfig?.content).toContain('clientPort');
    expect(viteConfig?.content).toContain('host: true');
  });

  it('does not synthesize an application package for README-only AI projects', () => {
    const repair = buildPreviewManifestRepair({
      'README.md': '# Prompt-only project\n',
    });

    expect(repair.packageJson).toBeUndefined();
    expect(repair.supplementalFiles).toEqual([]);
  });

  it('repairs an empty package.json (truncated AI emission) into a runnable React manifest', () => {
    /*
     * The model is expected to emit package.json for AI projects; a cut-off stream lands
     * it as a 0-byte / blank file. The repair must synthesize a valid manifest instead of
     * throwing on JSON.parse — otherwise the preview dies with "Invalid JSON in package.json".
     */
    const { repair, packageJson } = packageJsonFromRepair({
      'package.json': '',
      'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx': [
        "import { createRoot } from 'react-dom/client';",
        "import App from './App';",
        'createRoot(document.getElementById("root")!).render(<App />);',
        '',
      ].join('\n'),
      'src/App.tsx': 'export default function App() { return <main>Calc</main>; }\n',
    });

    expect(repair.packageJson?.created).toBe(true);
    expect(repair.packageJson?.changed).toBe(true);
    expect(packageJson.dependencies).toMatchObject({
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      vite: '^5.4.19',
    });
    expect(packageJson.scripts).toMatchObject({ dev: 'vite', build: 'vite build', preview: 'vite preview' });
  });

  it('overwrites a blank package.json with a minimal valid manifest even with no toolchain need', () => {
    const repair = buildPreviewManifestRepair({
      'package.json': '   \n',
      'README.md': '# notes\n',
    });

    expect(repair.packageJson?.created).toBe(true);
    expect(repair.packageJson?.path).toBe('package.json');
    expect(() => JSON.parse(repair.packageJson!.content)).not.toThrow();
  });

  it('treats malformed (non-empty) package.json JSON as needing repair instead of throwing', () => {
    const { packageJson } = packageJsonFromRepair({
      'package.json': '{ "name": "broken", ', // truncated mid-object
      'src/main.tsx': "import { createRoot } from 'react-dom/client';\n",
    });

    expect(() => packageJson).not.toThrow();
    expect(packageJson.dependencies).toMatchObject({ react: '^18.3.1', vite: '^5.4.19' });
  });

  it('selects the real root package.json over a deceptively-named sibling file', () => {
    /*
     * A file like 'foopackage.json' ends with the literal 'package.json' but is not a
     * manifest. It sorts before the real 'package.json' at the same depth, so a substring
     * match would feed the wrong file into the repair. The basename must match exactly.
     */
    const { repair, packageJson } = packageJsonFromRepair({
      'foopackage.json': JSON.stringify({ unrelated: true }),
      'package.json': JSON.stringify({ name: 'real-app', dependencies: { vite: '^5.4.19' } }),
      'src/main.tsx': "import { createRoot } from 'react-dom/client';\nimport App from './App';\n",
      'src/App.tsx': 'export default function App() { return <main>Real</main>; }\n',
    });

    expect(repair.packageJson?.path).toBe('package.json');
    expect(packageJson.name).toBe('real-app');
    expect(packageJson.unrelated).toBeUndefined();
    expect(packageJson.dependencies).toMatchObject({ react: '^18.3.1' });
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
