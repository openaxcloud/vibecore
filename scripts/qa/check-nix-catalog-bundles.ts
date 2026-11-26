// Read-only check of the declared registry. Does not access the store or verify its signature.
// pnpm exec tsx scripts/qa/check-nix-catalog-bundles.ts infra/helm/platform/values-prod.yaml python312 nodejs22 go rust
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  assertLockAgainstRegistry,
  assertLockPublishable,
  buildEcodeLock,
} from '../../packages/k8s-client/src/ecode-lock';
import { activeNixGeneration, parseNixGenerationRegistry } from '../../packages/k8s-client/src/nix-generations';

const [valuesFile, ...names] = process.argv.slice(2);
if (!valuesFile || names.length === 0) throw new Error('Expected a Helm values file followed by bundle names.');

const values = parse(readFileSync(valuesFile, 'utf8'));
const registry = parseNixGenerationRegistry(values.platformEnv.runtime.nixGenerations);
const generation = activeNixGeneration(registry);
if (!generation) throw new Error('No active Nix generation.');

for (const name of names) {
  try {
    const lock = buildEcodeLock(generation, [name]);
    assertLockPublishable(lock);
    assertLockAgainstRegistry(lock, registry);
    console.log(`${generation.id} ${name}: lock matches the declared registry`);
  } catch (error) {
    console.error(`${generation.id} ${name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
