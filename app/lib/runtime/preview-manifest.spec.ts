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

  it('post-processes an AI-generated vite.config to guarantee proxy HMR', () => {
    const repair = buildPreviewManifestRepair({
      'package.json': JSON.stringify({
        name: 'kanban',
        scripts: { dev: 'vite' },
        dependencies: { vite: '^5.4.19', react: '^18.3.1', 'react-dom': '^18.3.1' },
      }),
      'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx': [
        "import { createRoot } from 'react-dom/client';",
        "import App from './App';",
        "createRoot(document.getElementById('root')!).render(<App />);",
        '',
      ].join('\n'),
      'src/App.tsx': 'export default function App() { return <main />; }\n',

      // The model wrote its OWN vite.config (no server.hmr).
      'vite.config.ts': "import { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [] });\n",
    });

    const emittedConfig = repair.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'));

    expect(emittedConfig).toBeDefined();
    expect(emittedConfig?.content).toContain('__ecodeMergeConfig');
    expect(emittedConfig?.content).toContain('VITE_HMR_CLIENT_PORT');

    // The scaffold VITE_REACT_CONFIG must NOT overwrite the model's config.
    expect(emittedConfig?.content).toContain('const __ecodeUserConfig = defineConfig({ plugins: [] })');
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

  it('P0-2: upgrades a react ^17 pin to 18 when the entry uses createRoot (react-dom/client)', () => {
    const { repair, packageJson } = packageJsonFromRepair({
      'package.json': JSON.stringify({
        name: 'react17-createroot',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { react: '^17.0.2', 'react-dom': '^17.0.2', vite: '^5.4.19' },
      }),
      'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx': [
        "import React from 'react';",
        "import { createRoot } from 'react-dom/client';",
        "import App from './App';",
        'createRoot(document.getElementById("root")!).render(<App />);',
        '',
      ].join('\n'),
      'src/App.tsx': 'export default function App() { return <main>Hi</main>; }\n',
    });

    // react/react-dom forced to the supported 18 range — createRoot now resolves.
    expect(packageJson.dependencies.react).toBe('^18.3.1');
    expect(packageJson.dependencies['react-dom']).toBe('^18.3.1');
    expect(repair.packageJson?.changed).toBe(true);
    expect(repair.packageJson?.upgradedDependencies.sort()).toEqual(['react', 'react-dom']);
  });

  it('P0-2: leaves an already-18 (and a deliberate 19) react pin untouched', () => {
    const { repair, packageJson } = packageJsonFromRepair({
      'package.json': JSON.stringify({
        name: 'react19-app',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', vite: '^5.4.19' },
      }),
      'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx':
        "import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
      'src/App.tsx': 'export default function App() { return <main>Hi</main>; }\n',
    });

    // React 19 also has createRoot — downgrading it would break React-19 APIs, so keep it.
    expect(packageJson.dependencies.react).toBe('^19.0.0');
    expect(packageJson.dependencies['react-dom']).toBe('^19.0.0');
    expect(repair.packageJson?.upgradedDependencies).toEqual([]);
  });

  it('P0-2: does not touch a react ^17 pin when the code uses no React-18 client API', () => {
    const { repair, packageJson } = packageJsonFromRepair({
      'package.json': JSON.stringify({
        name: 'react17-legacy',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { react: '^17.0.2', 'react-dom': '^17.0.2', vite: '^5.4.19' },
      }),
      'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',

      // Legacy React 17 entry — ReactDOM.render, no createRoot.
      'src/main.tsx':
        "import React from 'react';\nimport ReactDOM from 'react-dom';\nimport App from './App';\nReactDOM.render(<App />, document.getElementById('root'));\n",
      'src/App.tsx': 'export default function App() { return <main>Hi</main>; }\n',
    });

    expect(packageJson.dependencies.react).toBe('^17.0.2');
    expect(packageJson.dependencies['react-dom']).toBe('^17.0.2');
    expect(repair.packageJson?.upgradedDependencies).toEqual([]);
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
