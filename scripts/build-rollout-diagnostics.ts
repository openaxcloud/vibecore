import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as Esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const { build } = require('esbuild') as typeof Esbuild;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const [source, output] of [
  ['scripts/capture-rollout-diagnostics.cli.ts', 'scripts/capture-rollout-diagnostics.bundle.mjs'],
  ['scripts/capture-rollout-diagnostics.checks.ts', 'scripts/capture-rollout-diagnostics.checks.bundle.mjs'],
]) {
  const generated = await build({
    absWorkingDir: root,
    entryPoints: [source],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
    minify: true,
    sourcemap: false,
    treeShaking: true,
    write: false,
    banner: { js: '// GENERATED FILE — DO NOT EDIT. Run node --import tsx scripts/build-rollout-diagnostics.ts' },
  });
  const content = generated.outputFiles[0]?.text;
  if (!content) throw new Error('No generated rollout bundle');
  const path = resolve(root, output);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== content) throw new Error(`Stale generated bundle: ${output}`);
  } else {
    writeFileSync(path, content);
  }
}
console.log('Rollout diagnostics bundles: PASS');
