#!/usr/bin/env -S node --import tsx

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type * as Esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const { build } = require('esbuild') as typeof Esbuild;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const source = resolve(scriptDirectory, 'validate-github-actions-pinned.ts');
const output = resolve(scriptDirectory, 'validate-github-actions-pinned.bundle.mjs');

const banner = [
  '// GENERATED FILE — DO NOT EDIT.',
  '// Source: scripts/validate-github-actions-pinned.ts',
  '// Regenerate with: node --import tsx scripts/build-github-actions-validator.ts',
  "import { createRequire as __bundleCreateRequire } from 'node:module';",
  'const require = __bundleCreateRequire(import.meta.url);',
].join('\n');

export async function buildValidatorBundle(): Promise<string> {
  const result = await build({
    absWorkingDir: repositoryRoot,
    banner: { js: banner },
    bundle: true,
    entryPoints: [relative(repositoryRoot, source)],
    format: 'esm',
    legalComments: 'none',
    logLevel: 'silent',

    /*
     * Besides keeping the reviewed bootstrap small, minification removes
     * dependency-install paths from module banners so builds are identical in
     * pnpm worktrees and clean GitHub runners.
     */
    minify: true,
    platform: 'node',
    sourcemap: false,
    target: 'node20',
    treeShaking: true,
    write: false,
  });

  const file = result.outputFiles[0];

  if (!file) {
    throw new Error('esbuild did not produce the validator bundle');
  }

  return file.text;
}

async function main(): Promise<void> {
  const generated = await buildValidatorBundle();

  if (process.argv.includes('--check')) {
    let committed: string;

    try {
      committed = readFileSync(output, 'utf8');
    } catch {
      throw new Error(`generated validator bundle is missing: ${relative(repositoryRoot, output)}`);
    }

    if (committed !== generated) {
      throw new Error(
        'generated validator bundle is stale; run `node --import tsx scripts/build-github-actions-validator.ts` and commit the result',
      );
    }

    console.log('GitHub Actions validator bundle reproducibility: PASS');

    return;
  }

  writeFileSync(output, generated, 'utf8');
  console.log(`wrote ${relative(repositoryRoot, output)}`);
}

const invokedPath = process.argv[1];

if (invokedPath && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  await main();
}
