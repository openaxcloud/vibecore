/*
 * Minimal TS loader for the sandbox: resolves NodeNext-style `./foo.js`
 * specifiers to `./foo.ts` and transpiles with the TypeScript compiler API
 * (pure JS — unlike esbuild/rollup, whose native binaries in this repo are
 * darwin-arm64 and cannot run here, which is why vitest can't start).
 * Throwaway: CI runs the real vitest suite.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const asTs = fileURLToPath(new URL(specifier, pathToFileURL(parent))).replace(/\.js$/, '.ts');

    if (existsSync(asTs)) {
      return { url: pathToFileURL(asTs).href, shortCircuit: true, format: 'ts' };
    }
  }

  const resolved = await nextResolve(specifier, context);

  if (resolved.url.endsWith('.ts') || resolved.url.endsWith('.mts')) {
    return { ...resolved, format: 'ts' };
  }

  return resolved;
}

export async function load(url, context, nextLoad) {
  if (context.format === 'ts' || url.endsWith('.ts') || url.endsWith('.mts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8');

    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        useDefineForClassFields: false,
      },
      fileName: fileURLToPath(url),
    });

    return { format: 'module', source: outputText, shortCircuit: true };
  }

  return nextLoad(url, context);
}
