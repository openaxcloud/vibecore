/** Read-only diagnostic: compile two virtual fixtures; never repair dependency links. */
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import type * as TypeScript from 'typescript';

const root = process.cwd();
const rootRequire = createRequire(resolve(root, 'package.json'));
const lock = parse(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8'));
const locked = lock.importers['.'].devDependencies;
const compilerPath = resolve(
  root,
  `node_modules/.pnpm/typescript@${locked.typescript.version}/node_modules/typescript`,
);
const ts: typeof TypeScript = rootRequire(compilerPath);
const pluginRequire = createRequire(rootRequire.resolve('@vitejs/plugin-react'));
const pluginVite = dirname(pluginRequire.resolve('vite/package.json'));
const virtualFile = resolve(root, '__dependency_probe_virtual__.ts');
const options: TypeScript.CompilerOptions = {
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: ['node'],
};

function compile(viteImport: string) {
  const source = `import { defineConfig } from ${JSON.stringify(viteImport)};
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()] });`;
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) =>
    filename === virtualFile
      ? ts.createSourceFile(filename, source, languageVersion, true)
      : original(filename, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([virtualFile], options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    code: diagnostic.code,
    file: diagnostic.file?.fileName.replace(`${root}/`, ''),
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

console.log(
  JSON.stringify(
    {
      purpose: 'Causal diagnostic only, not a global typecheck or lockfile validation',
      node: process.version,
      compiler: ts.version,
      locked: Object.fromEntries(['typescript', '@types/node', 'vite'].map((name) => [name, locked[name]])),
      installed: Object.fromEntries(
        ['typescript', '@types/node', 'vite'].map((name) => {
          const manifest = resolve(root, 'node_modules', name, 'package.json');
          return [
            name,
            { version: JSON.parse(readFileSync(manifest, 'utf8')).version, manifest: realpathSync(manifest) },
          ];
        }),
      ),
      pluginVite,
      activeGraph: compile('vite'),
      // Only change this fixture's defineConfig import, using the plugin's existing Vite.
      sameViteAsPlugin: compile(pluginVite),
    },
    null,
    2,
  ),
);
