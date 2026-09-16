import { synthesizeMissingBarrels } from './barrel-synthesis';
import { ensureViteApiServeConfig, needsApiDevServe } from './vite-api-serve';
import { ensureViteHmrConfig } from './vite-hmr-config';

export interface GeneratedPreviewFile {
  path: string;
  content: string;
}

export interface PreviewManifestRepair {
  packageJson?: {
    path: string;
    content: string;
    created: boolean;
    changed: boolean;
    missingDependencies: string[];
    addedScripts: string[];

    /** react/react-dom bumped to a React-18 range because the code uses createRoot (P0-2 guard). */
    upgradedDependencies: string[];
  };
  supplementalFiles: GeneratedPreviewFile[];
}

const IMPORT_TO_RUNTIME_DEPENDENCY: Record<string, string> = {
  '@hookform/resolvers': '@hookform/resolvers',
  '@radix-ui/react-accordion': '@radix-ui/react-accordion',
  '@radix-ui/react-alert-dialog': '@radix-ui/react-alert-dialog',
  '@radix-ui/react-avatar': '@radix-ui/react-avatar',
  '@radix-ui/react-checkbox': '@radix-ui/react-checkbox',
  '@radix-ui/react-dialog': '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu': '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label': '@radix-ui/react-label',
  '@radix-ui/react-popover': '@radix-ui/react-popover',
  '@radix-ui/react-progress': '@radix-ui/react-progress',
  '@radix-ui/react-radio-group': '@radix-ui/react-radio-group',
  '@radix-ui/react-scroll-area': '@radix-ui/react-scroll-area',
  '@radix-ui/react-select': '@radix-ui/react-select',
  '@radix-ui/react-separator': '@radix-ui/react-separator',
  '@radix-ui/react-slot': '@radix-ui/react-slot',
  '@radix-ui/react-switch': '@radix-ui/react-switch',
  '@radix-ui/react-tabs': '@radix-ui/react-tabs',
  '@radix-ui/react-toast': '@radix-ui/react-toast',
  '@radix-ui/react-toggle': '@radix-ui/react-toggle',
  '@radix-ui/react-toggle-group': '@radix-ui/react-toggle-group',
  '@radix-ui/react-tooltip': '@radix-ui/react-tooltip',
  '@tanstack/react-query': '@tanstack/react-query',
  '@vitejs/plugin-react': '@vitejs/plugin-react',
  axios: 'axios',
  classnames: 'classnames',
  clsx: 'clsx',
  'date-fns': 'date-fns',
  'framer-motion': 'framer-motion',
  'lucide-react': 'lucide-react',
  react: 'react',
  'react-dom': 'react-dom',
  'react-dom/client': 'react-dom',
  'react/jsx-dev-runtime': 'react',
  'react/jsx-runtime': 'react',
  'react-hook-form': 'react-hook-form',
  'react-icons': 'react-icons',
  'react-router-dom': 'react-router-dom',
  recharts: 'recharts',
  sonner: 'sonner',
  'tailwind-merge': 'tailwind-merge',
  vite: 'vite',
  zod: 'zod',
};

const RUNTIME_DEPENDENCY_VERSIONS: Record<string, string> = {
  '@vitejs/plugin-react': '^4.3.4',
  vite: '^5.4.19',
  typescript: '^5.7.2',
  react: '^18.3.1',
  'react-dom': '^18.3.1',
  'lucide-react': '^0.485.0',
  'react-router-dom': '^6.28.2',
};

const VITE_REACT_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Behind the E-Code preview proxy the dev server is reached over TLS, so Vite's
// HMR websocket must target the public host on 443/wss instead of the in-pod
// localhost:5173 (otherwise it builds "wss://localhost:undefined" and HMR dies).
// The workspace injects VITE_HMR_CLIENT_PORT / VITE_HMR_PROTOCOL in that env;
// running locally they are unset and HMR keeps its default localhost behaviour.
// Leaving VITE_HMR_HOST unset makes the client use the page's own hostname (the
// per-project preview domain).
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    ...(hmrClientPort
      ? {
          // Pin to the port the workspace preview proxy targets for Vite (5173).
          port: 5173,
          strictPort: true,
          hmr: {
            clientPort: Number(hmrClientPort),
            protocol: process.env.VITE_HMR_PROTOCOL || 'wss',
            ...(process.env.VITE_HMR_HOST ? { host: process.env.VITE_HMR_HOST } : {}),
          },
        }
      : {}),
  },
});
`;

const VITE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>E-code preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const VITE_MAIN_TSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

function normalizeRuntimePath(filePath: string) {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^\/?(?:home\/project|workspace)\//, '')
    .replace(/^\/+/, '');
}

function packageDirectory(packageJsonPath: string) {
  const normalizedPath = normalizeRuntimePath(packageJsonPath);
  const directory = normalizedPath.replace(/\/?package\.json$/, '');

  return directory && directory !== normalizedPath ? directory : undefined;
}

function joinRuntimePath(basePath: string | undefined, childPath: string) {
  const child = childPath.replace(/^\/+/, '');

  return basePath ? `${basePath.replace(/\/+$/, '')}/${child}` : child;
}

function normalizeRuntimeFiles(files: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(files).map(([filePath, content]) => [normalizeRuntimePath(filePath), content]),
  );
}

function scopedRuntimeFiles(files: Record<string, string>, packageJsonPath: string) {
  const cwd = packageDirectory(packageJsonPath);

  if (!cwd) {
    return files;
  }

  const prefix = `${cwd}/`;
  const scoped: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    if (filePath.startsWith(prefix)) {
      scoped[filePath.slice(prefix.length)] = content;
    }
  }

  return scoped;
}

function findPackageJsonPath(files: Record<string, string>) {
  return Object.keys(files)
    .filter(
      (filePath) =>
        (filePath === 'package.json' || filePath.endsWith('/package.json')) && !filePath.includes('/node_modules/'),
    )
    .sort((left, right) => left.split('/').length - right.split('/').length || left.localeCompare(right))[0];
}

function hasFile(files: Record<string, string>, filePath: string) {
  return Object.prototype.hasOwnProperty.call(files, filePath);
}

function firstExistingPath(files: Record<string, string>, candidates: string[]) {
  return candidates.find((candidate) => hasFile(files, candidate));
}

function hasReactSource(files: Record<string, string>) {
  return Object.entries(files).some(([filePath, content]) => {
    if (!/\.(jsx|tsx)$/.test(filePath)) {
      return false;
    }

    return /<\s*[A-Za-z][\w.:]*/.test(content) || /\breact-dom\/client\b/.test(content);
  });
}

/*
 * P0-2 guard signal. React's client entry API — `createRoot` / `hydrateRoot`,
 * exported from `react-dom/client` — DOES NOT EXIST before React 18. When the
 * model emits this code but pins react/react-dom below 18 in package.json, the
 * install "succeeds", but `react-dom/client` resolves to nothing, the app never
 * mounts, and the preview (and the deploy build) render blank. Detect the 18-only
 * API so the manifest repair can force a compatible react range.
 */
function usesReact18ClientApi(files: Record<string, string>) {
  return Object.entries(files).some(([filePath, content]) => {
    if (!/\.(c|m)?(j|t)sx?$/.test(filePath)) {
      return false;
    }

    return (
      /\breact-dom\/client\b/.test(content) || /\bcreateRoot\s*\(/.test(content) || /\bhydrateRoot\s*\(/.test(content)
    );
  });
}

/**
 * Lowest major version a semver range permits (first integer in the range), or
 * undefined when unparseable (`latest`, `*`, `workspace:*`). Used to tell an
 * incompatible react pin (`^17`, `~16`, `17.0.2`) from an already-fine one
 * (`^18.2.0`, `19.0.0`) without pulling in a full semver parser.
 */
function versionMajorFloor(range: string): number | undefined {
  const match = String(range).match(/\d+/);

  return match ? Number(match[0]) : undefined;
}

function hasViteEntryPoint(files: Record<string, string>) {
  const indexHtml = files['index.html'];

  return (
    Boolean(indexHtml && /<script\b[^>]*\btype=["']module["'][^>]*>/i.test(indexHtml)) ||
    Boolean(firstExistingPath(files, ['src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js']))
  );
}

function runtimeDependencyForImport(specifier: string) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return undefined;
  }

  const barePackage = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

  return IMPORT_TO_RUNTIME_DEPENDENCY[specifier] ?? IMPORT_TO_RUNTIME_DEPENDENCY[barePackage];
}

export function inferRuntimeDependenciesFromImports(files: Record<string, string>) {
  const dependencies = new Set<string>();

  const importPatterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const [filePath, content] of Object.entries(files)) {
    if (!/\.(c|m)?(j|t)sx?$/.test(filePath)) {
      continue;
    }

    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;

      for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
        const dependency = runtimeDependencyForImport(match[1]);

        if (dependency) {
          dependencies.add(dependency);
        }
      }
    }
  }

  return dependencies;
}

function dependencyVersion(packageName: string) {
  return RUNTIME_DEPENDENCY_VERSIONS[packageName] ?? 'latest';
}

function sortedRecord(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function toPreviewPackageName(packageJsonPath: string) {
  const cwd = packageDirectory(packageJsonPath);
  const rawName = cwd?.split('/')?.pop() ?? 'e-code-preview';

  return (
    rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'e-code-preview'
  );
}

function supplementalPreviewFiles(
  files: Record<string, string>,
  packageJsonPath: string,
  options: { hasReact: boolean; shouldUseVite: boolean },
) {
  if (!options.shouldUseVite) {
    return [];
  }

  const cwd = packageDirectory(packageJsonPath);
  const result: GeneratedPreviewFile[] = [];
  const mainPath = firstExistingPath(files, ['src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js']);
  const appPath = firstExistingPath(files, ['src/App.tsx', 'src/App.jsx']);

  if (!hasFile(files, 'index.html') && (mainPath || appPath)) {
    result.push({
      path: joinRuntimePath(cwd, 'index.html'),
      content: mainPath ? viteIndexHtml(mainPath) : VITE_INDEX_HTML,
    });
  }

  if (!mainPath && appPath && options.hasReact) {
    result.push({ path: joinRuntimePath(cwd, 'src/main.tsx'), content: VITE_MAIN_TSX });
  }

  const viteConfigPath = firstExistingPath(files, [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.mts',
  ]);

  /*
   * BUG-GEN-BACKEND-UNSERVED-001: the client calls fetch('/api/...') but nothing
   * serves it in dev — plain `vite` answers /api/* with the SPA index.html
   * fallback and the app dies on res.json(). Inject a configureServer middleware
   * that mounts /api/* onto the project's own handler modules (src/api/**, …).
   */
  const wireApiServe = needsApiDevServe(files);

  if (options.hasReact && !viteConfigPath) {
    result.push({
      path: joinRuntimePath(cwd, 'vite.config.ts'),
      content: wireApiServe ? ensureViteApiServeConfig(VITE_REACT_CONFIG) : VITE_REACT_CONFIG,
    });
  } else if (viteConfigPath) {
    /*
     * The model wrote its OWN vite.config, so the scaffold above is skipped and
     * its HMR isn't wired for the proxy (→ wss://localhost:undefined, blank app).
     * Post-process it to guarantee server.host + server.hmr — and the dev API
     * middleware when needed — without discarding the model's settings. Only
     * re-emit when the merge actually changed it.
     */
    let ensured = ensureViteHmrConfig(files[viteConfigPath]);

    if (wireApiServe) {
      ensured = ensureViteApiServeConfig(ensured);
    }

    if (ensured !== files[viteConfigPath]) {
      result.push({ path: joinRuntimePath(cwd, viteConfigPath), content: ensured });
    }
  }

  return result;
}

function viteIndexHtml(mainPath: string) {
  return VITE_INDEX_HTML.replace('/src/main.tsx', `/${mainPath.replace(/^\/+/, '')}`);
}

export function buildPreviewManifestRepair(filesInput: Record<string, string>): PreviewManifestRepair {
  const files = normalizeRuntimeFiles(filesInput);
  const existingPackageJsonPath = findPackageJsonPath(files);
  const packageJsonPath = existingPackageJsonPath ?? 'package.json';
  const scopedFiles = scopedRuntimeFiles(files, packageJsonPath);
  const requiredDependencies = inferRuntimeDependenciesFromImports(scopedFiles);

  const hasReact =
    hasReactSource(scopedFiles) || requiredDependencies.has('react') || requiredDependencies.has('react-dom');

  const shouldUseVite = hasViteEntryPoint(scopedFiles) || hasReact;

  /*
   * An AI-sourced project relies on the model to emit package.json; if that emission is
   * empty or truncated (streaming cut off mid-file) the manifest lands as 0 bytes or
   * invalid JSON. This repair pass exists precisely to synthesize a valid manifest, so a
   * blank/unparseable existing file must be treated as "needs creating" rather than fed
   * to a bare JSON.parse — otherwise the parse throws, the repair that would have fixed it
   * is skipped, and the preview dies with "Invalid JSON in package.json: Unexpected end of
   * JSON input" with no path to recovery.
   */
  let parsedPackageJson: Record<string, any> | undefined;

  if (existingPackageJsonPath) {
    const raw = files[existingPackageJsonPath];

    if (raw && raw.trim()) {
      try {
        const candidate = JSON.parse(raw);

        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          parsedPackageJson = candidate as Record<string, any>;
        }
      } catch {
        parsedPackageJson = undefined;
      }
    }
  }

  const hasValidExistingPackageJson = parsedPackageJson !== undefined;

  const defaultPackageJson = (): Record<string, any> => ({
    name: toPreviewPackageName(packageJsonPath),
    private: true,
    version: '0.0.0',
    type: 'module',
  });

  if (!hasValidExistingPackageJson && !shouldUseVite) {
    /*
     * Nothing requires a Vite/React toolchain. If a blank package.json physically exists
     * we still overwrite it with a minimal valid one so the preview (and any other JSON
     * consumer) doesn't choke on the empty/invalid file; otherwise there's nothing to do.
     */
    if (existingPackageJsonPath) {
      return {
        packageJson: {
          path: packageJsonPath,
          content: `${JSON.stringify(defaultPackageJson(), null, 2)}\n`,
          created: true,
          changed: true,
          missingDependencies: [],
          addedScripts: [],
          upgradedDependencies: [],
        },
        supplementalFiles: [],
      };
    }

    return { supplementalFiles: [] };
  }

  const packageJson = parsedPackageJson ?? defaultPackageJson();

  const scripts =
    packageJson.scripts && typeof packageJson.scripts === 'object' && !Array.isArray(packageJson.scripts)
      ? Object.fromEntries(Object.entries(packageJson.scripts).map(([name, script]) => [name, String(script)]))
      : {};
  const dependencies =
    packageJson.dependencies && typeof packageJson.dependencies === 'object' && !Array.isArray(packageJson.dependencies)
      ? Object.fromEntries(Object.entries(packageJson.dependencies).map(([name, version]) => [name, String(version)]))
      : {};
  const devDependencies =
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === 'object' &&
    !Array.isArray(packageJson.devDependencies)
      ? Object.fromEntries(
          Object.entries(packageJson.devDependencies).map(([name, version]) => [name, String(version)]),
        )
      : undefined;

  const nextDependencies = { ...dependencies };
  const neededDependencies = new Set(requiredDependencies);

  if (shouldUseVite) {
    neededDependencies.add('vite');
    neededDependencies.add('typescript');

    if (hasReact) {
      neededDependencies.add('react');
      neededDependencies.add('react-dom');
      neededDependencies.add('@vitejs/plugin-react');
    }
  }

  const missingDependencies = [...neededDependencies].filter(
    (dependency) => !dependencies[dependency] && !devDependencies?.[dependency],
  );

  let changed = !hasValidExistingPackageJson;

  for (const dependency of new Set([...Object.keys(nextDependencies), ...neededDependencies])) {
    const pinnedVersion = RUNTIME_DEPENDENCY_VERSIONS[dependency];

    if (pinnedVersion && nextDependencies[dependency] === 'latest') {
      nextDependencies[dependency] = pinnedVersion;
      changed = true;
    }
  }

  for (const dependency of missingDependencies) {
    nextDependencies[dependency] = dependencyVersion(dependency);
    changed = true;
  }

  /*
   * P0-2 React 17/18 guard. The model frequently emits React-18 client code
   * (`react-dom/client`, `createRoot`) while pinning `react`/`react-dom` at ^17
   * (or lower) in the same package.json — a combination that installs cleanly but
   * never renders (`createRoot` doesn't exist in React <18). The pin loops above
   * don't catch it: an explicit `^17.0.0` is neither "missing" nor `'latest'`.
   * When the code uses the 18-only API, force any react/react-dom pin whose floor
   * is below 18 up to the supported range. A pin that's already >=18 (incl. an
   * intentional React 19 app, whose newer APIs a downgrade would break) is left
   * untouched.
   */
  const upgradedDependencies: string[] = [];

  if (hasReact && usesReact18ClientApi(scopedFiles)) {
    for (const dependency of ['react', 'react-dom']) {
      const current = nextDependencies[dependency];
      const floor = current ? versionMajorFloor(current) : undefined;

      if (floor !== undefined && floor < 18) {
        nextDependencies[dependency] = RUNTIME_DEPENDENCY_VERSIONS[dependency];
        upgradedDependencies.push(dependency);
        changed = true;
      }
    }
  }

  const addedScripts: string[] = [];
  const nextScripts = { ...scripts };

  if (shouldUseVite) {
    for (const [name, command] of Object.entries({ dev: 'vite', build: 'vite build', preview: 'vite preview' })) {
      if (!nextScripts[name]) {
        nextScripts[name] = command;
        addedScripts.push(name);
        changed = true;
      }
    }
  }

  const nextPackageJson = {
    ...packageJson,
    scripts: Object.keys(nextScripts).length ? nextScripts : packageJson.scripts,
    dependencies: Object.keys(nextDependencies).length ? sortedRecord(nextDependencies) : packageJson.dependencies,
    devDependencies:
      devDependencies && Object.keys(devDependencies).length
        ? sortedRecord(devDependencies)
        : packageJson.devDependencies,
  };

  const content = `${JSON.stringify(nextPackageJson, null, 2)}\n`;
  const supplementalFiles = supplementalPreviewFiles(scopedFiles, packageJsonPath, { hasReact, shouldUseVite });

  /*
   * Synthesize barrel index files for directory imports that lack one (e.g. the
   * model wrote `import { X } from './components'` but never created
   * src/components/index.ts). Without this Vite can't resolve the directory and
   * the app renders blank. Runs over the full scoped file set, so it is order-
   * independent — every module is known here regardless of which patch landed
   * first.
   */
  const cwd = packageDirectory(packageJsonPath);

  for (const barrel of synthesizeMissingBarrels(scopedFiles)) {
    supplementalFiles.push({ path: joinRuntimePath(cwd, barrel.path), content: barrel.content });
  }

  return {
    packageJson: {
      path: packageJsonPath,
      content,
      created: !hasValidExistingPackageJson,
      changed,
      missingDependencies,
      addedScripts,
      upgradedDependencies,
    },
    supplementalFiles,
  };
}
