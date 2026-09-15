/**
 * AUDX-012 — per-service secret scoping guard.
 *
 * Every Deployment used to mount the whole platform Secret via `envFrom`: 31
 * secrets into 8 services, so `screenshotter` — a headless browser rendering
 * untrusted user pages — carried STRIPE_SECRET_KEY, six AI provider keys,
 * JWT_SECRET, DATABASE_URL and CONFIG_ENCRYPTION_KEY, none of which it reads.
 *
 * This guard checks the RENDERED manifests, not the values file, and fails in
 * both directions:
 *
 *   1. a scoped service must not also carry the whole Secret (belt and braces
 *      both fastened would silently undo the scoping);
 *   2. a secret whose name appears in a scoped service's source must be in that
 *      service's list — otherwise the next person to read a new secret gets an
 *      undefined variable in production instead of a failing check here.
 *
 * Direction 2 is deliberately one-way: an EXTRA key in the list is allowed,
 * because a service can read a secret through a computed name. That is not
 * hypothetical — the api resolves OAuth client secrets as
 * `process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]`, which is exactly
 * why `api`, `web` and `admin` are left unscoped rather than given a
 * grep-derived allowlist.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseAllDocuments } from 'yaml';

const infraRoot = resolve(new URL('..', import.meta.url).pathname);
const repoRoot = resolve(infraRoot, '..');
const chart = join(infraRoot, 'helm/platform');
const valuesProd = join(chart, 'values-prod.yaml');

/** values `services.<key>` -> source directory holding that service's code. */
const SERVICE_SOURCES = {
  screenshotter: 'services/screenshotter/src',
  previewProxy: 'services/preview-proxy/src',
  workspaceManager: 'services/workspace-manager/src',
  worker: 'services/worker/src',
  aiGateway: 'services/ai-gateway/src',
  api: 'services/api/src',
};

const PLATFORM_SECRET = 'vibecore-platform-secrets';

function render() {
  const out = execFileSync(
    'helm',
    ['template', 'vibecore', chart, '--namespace', 'vibecore', '-f', valuesProd],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  return parseAllDocuments(out)
    .map((doc) => doc.toJS())
    .filter((doc) => doc && doc.kind === 'Deployment');
}

function readValues() {
  const [values] = parseAllDocuments(readFileSync(join(chart, 'values.yaml'), 'utf8')).map((doc) => doc.toJS());

  return values;
}

/** Every *.ts file under a directory, recursively, tests excluded. */
function sourceFiles(dir) {
  const full = join(repoRoot, dir);

  if (!existsSync(full)) {
    return [];
  }

  const found = [];

  for (const entry of readdirSync(full)) {
    const path = join(full, entry);

    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(join(dir, entry)));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      found.push(path);
    }
  }

  return found;
}


/**
 * Source text a service can actually reach: its own files plus the `src` of
 * every `@vibecore/*` workspace package it imports (one hop, then the packages
 * those import, transitively).
 */
function readReachableSource(serviceDir) {
  if (!serviceDir) {
    return '';
  }

  const seen = new Set();
  const queue = [serviceDir];
  const chunks = [];

  while (queue.length > 0) {
    const dir = queue.shift();

    if (seen.has(dir)) {
      continue;
    }

    seen.add(dir);

    for (const file of sourceFiles(dir)) {
      const content = readFileSync(file, 'utf8');
      chunks.push(content);

      for (const match of content.matchAll(/@vibecore\/([a-z0-9-]+)/g)) {
        const packageDir = `packages/${match[1]}/src`;

        if (!seen.has(packageDir) && existsSync(join(repoRoot, packageDir))) {
          queue.push(packageDir);
        }
      }
    }
  }

  return chunks.join('\n');
}

const values = readValues();
const perService = values?.secrets?.perService ?? {};
const secretKeys = Object.keys(readValues()?.secrets?.secretManagerMap ?? {});
const prodValues = parseAllDocuments(readFileSync(valuesProd, 'utf8')).map((doc) => doc.toJS())[0];
const allSecretNames = Object.keys(prodValues?.secrets?.secretManagerMap ?? {});
const knownSecrets = allSecretNames.length > 0 ? allSecretNames : secretKeys;

if (knownSecrets.length === 0) {
  throw new Error('AUDX-012: could not read secretManagerMap; the guard would pass vacuously');
}

const deployments = render();

if (deployments.length === 0) {
  throw new Error('AUDX-012: helm rendered no Deployments; the guard would pass vacuously');
}

const problems = [];
const summary = [];

for (const deployment of deployments) {
  const rendered = deployment.metadata.name.replace(/^vibecore-vibecore-platform-/, '');
  const container = deployment.spec.template.spec.containers[0];

  // values key -> rendered name is kebabcase; match back by comparing kebabcase.
  const serviceKey = Object.keys(perService).find(
    (key) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`) === rendered,
  );

  const carriesWholeSecret = (container.envFrom ?? []).some(
    (entry) => entry.secretRef?.name === PLATFORM_SECRET,
  );
  const projected = (container.env ?? [])
    .filter((entry) => entry.valueFrom?.secretKeyRef?.name === PLATFORM_SECRET)
    .map((entry) => entry.name);

  if (!serviceKey) {
    summary.push(`${rendered}: UNSCOPED (whole platform Secret)`);
    continue;
  }

  const declared = perService[serviceKey] ?? [];

  if (carriesWholeSecret) {
    problems.push(`${rendered} is scoped in values but still mounts the whole ${PLATFORM_SECRET} via envFrom`);
  }

  const missing = declared.filter((key) => !projected.includes(key));

  if (missing.length > 0) {
    problems.push(`${rendered} declares ${missing.join(', ')} but the rendered Deployment does not project them`);
  }

  /*
   * Direction 2: a secret named in this service's reachable source must be
   * scoped in. "Reachable" includes the @vibecore/* packages the service
   * imports, not just its own src — CONFIG_ENCRYPTION_KEY, for instance, is
   * never written literally in services/worker/src: the worker calls
   * `decryptJson`, and it is packages/security that reads the variable. A guard
   * looking only at the service directory would have declared that secret
   * unneeded and had the worker fail to decrypt in production.
   */
  const text = readReachableSource(SERVICE_SOURCES[serviceKey] ?? '');
  const readButNotGranted = knownSecrets.filter(
    (secret) => new RegExp(`\\b${secret}\\b`).test(text) && !declared.includes(secret),
  );

  if (readButNotGranted.length > 0) {
    problems.push(
      `${rendered} reads ${readButNotGranted.join(', ')} in source reachable from ${SERVICE_SOURCES[serviceKey]} (its own src or an imported @vibecore package) but they are not in secrets.perService.${serviceKey}`,
    );
  }

  summary.push(`${rendered}: ${projected.length} of ${knownSecrets.length} secrets`);
}

for (const line of summary.sort()) {
  console.log(`  ${line}`);
}

if (problems.length > 0) {
  console.error('\nAUDX-012 secret scoping failed:');

  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }

  process.exit(1);
}

console.log('secret scoping valid');
