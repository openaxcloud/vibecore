import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const output = 'infra/helm/stage-manager-before-api.bundle.mjs';

const result = await build({
  entryPoints: ['infra/helm/stage-manager-before-api.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: "import { createRequire as bundleCreateRequire } from 'node:module'; const require = bundleCreateRequire(import.meta.url);",
  },
  write: false,
  legalComments: 'inline',
  sourcemap: false,
});

const text = result.outputFiles[0].text;

if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== text) {
    throw new Error('Staged manager bundle differs from its source');
  }
} else {
  writeFileSync(output, text);
}
