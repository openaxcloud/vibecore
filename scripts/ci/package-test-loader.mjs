import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

/** Execute repository helpers and their real local catalogues, without network or service dependencies. */
export function loadPackageTestModule(path, globals = {}) {
  const exports = {};

  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requireLocal = (specifier) => {
    const dependency = resolve(dirname(path), specifier);

    if (dependency.endsWith('.json')) {
      return { default: JSON.parse(readFileSync(dependency, 'utf8')) };
    }

    return loadPackageTestModule(dependency.replace(/\.js$/, '.ts'));
  };
  new Function('exports', 'require', ...Object.keys(globals), source)(exports, requireLocal, ...Object.values(globals));

  return exports;
}
