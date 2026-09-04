/**
 * AUDX-170 — keep build-only toolchains out of the production dependency graph.
 *
 * The production image is built as:
 *
 *     RUN pnpm prune --prod --ignore-scripts          # Dockerfile
 *     COPY --from=prod-deps /app/node_modules /app/node_modules
 *
 * so ANY package still reachable from `dependencies` after the prune ships to
 * production. `pnpm prune --prod` does not "remove build tools": it removes
 * devDependencies. A build tool reachable — even transitively, even through an
 * auto-installed peer — from `dependencies` survives it untouched.
 *
 * That is what happened: `@react-router/fs-routes` and `vite-plugin-node-polyfills`
 * sat in `dependencies` while being BUILD-TIME only, and dragged
 * `@react-router/dev` → vite → esbuild and → wrangler → esbuild into the runtime
 * image. Measured on `origin/main`: 51 esbuild packages reachable from
 * production dependencies, including two complete native toolchains that the
 * runtime never executes (verified: 0 references to any of them in
 * `build/server`).
 *
 * A native compiler in a runtime image is not merely dead weight — it is an
 * arbitrary-code-generation primitive sitting next to the application.
 *
 * ⚠️ This reads `pnpm-lock.yaml`, NOT the installed tree.
 *
 * The first version of this guard shelled out to `pnpm why --prod`, which
 * consults `node_modules`. In a worktree borrowing another checkout's
 * node_modules it reported that checkout's state — it called the FIXED tree
 * broken. A guard whose verdict depends on ambient install state is worse than
 * no guard: it teaches people to ignore it. The lockfile is the same input CI
 * installs from, and it cannot be shadowed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

/** Packages that must never be reachable from `dependencies`. */
const FORBIDDEN = new Map([
  ['esbuild', 'native bundler/compiler — build-time only'],
  ['vite', 'build tool — the server runs the compiled output'],
  ['wrangler', 'Cloudflare deploy CLI — never invoked at runtime'],
  ['@react-router/dev', 'framework build CLI — build-time only'],
]);

const lock = parse(readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8'));

if (!lock?.importers || !lock?.snapshots) {
  throw new Error('AUDX-170: pnpm-lock.yaml has no importers/snapshots; the guard would pass vacuously');
}

/** `foo@1.2.3(peer@4)` / `@scope/foo@1.2.3` → `foo` / `@scope/foo`. */
function packageName(id) {
  const withoutPeers = id.replace(/\(.*\)$/, '');
  const at = withoutPeers.lastIndexOf('@');

  return at <= 0 ? withoutPeers : withoutPeers.slice(0, at);
}

/**
 * Walk the production graph from the ROOT importer only.
 *
 * The root importer is what the Dockerfile builds and prunes; workspace packages
 * are linked, not installed into the image's node_modules tree.
 */
const root = lock.importers['.'];

if (!root) {
  throw new Error('AUDX-170: pnpm-lock.yaml has no root importer');
}

/*
 * A snapshot key is `<name>@<version>`, e.g.
 * `@ai-sdk/amazon-bedrock@1.0.6(zod@3.25.76)`. The importer entry carries only
 * the VERSION, so the name has to be put back — feeding the bare version in
 * matched nothing, the walk stopped after the direct dependencies, and the guard
 * passed on a tree that was demonstrably broken.
 */
const rootProdIds = Object.entries(root.dependencies ?? {})
  .map(([name, entry]) => {
    const version = typeof entry === 'string' ? entry : entry?.version;

    return version ? `${name}@${version}` : undefined;
  })
  .filter(Boolean);

if (rootProdIds.length === 0) {
  throw new Error('AUDX-170: the root importer declares no production dependencies; the guard would pass vacuously');
}

const violations = new Map();
const seen = new Set();

/** Resolve a dependency reference to the snapshot key it names. */
function snapshotKey(name, version) {
  const direct = `${name}@${version}`;

  return lock.snapshots[direct] ? direct : undefined;
}

function walk(id, trail) {
  if (seen.has(id)) {
    return;
  }

  seen.add(id);

  const name = packageName(id);

  if (FORBIDDEN.has(name)) {
    const paths = violations.get(name) ?? [];

    if (paths.length < 3) {
      paths.push([...trail, name].join(' > '));
    }

    violations.set(name, paths);
  }

  const snapshot = lock.snapshots[id];

  if (!snapshot) {
    return;
  }

  /*
   * Optional and auto-installed peer deps count: `autoInstallPeers: true` is set
   * in this lockfile, so a peer IS installed and IS shipped. Walking only
   * `dependencies` under-reports — it missed the
   * `@react-router/dev > wrangler > esbuild` path that `pnpm why` does find.
   */
  const edges = {
    ...(snapshot.dependencies ?? {}),
    ...(snapshot.optionalDependencies ?? {}),
  };

  for (const [depName, depVersion] of Object.entries(edges)) {
    const key = snapshotKey(depName, depVersion);

    if (key) {
      walk(key, [...trail, name]);
    }
  }
}

for (const id of rootProdIds) {
  walk(id, []);
}

for (const [name, why] of FORBIDDEN) {
  console.log(violations.has(name) ? `  ✗ ${name}: reachable from dependencies` : `  ✓ ${name}: not in the production graph`);
  void why;
}

if (violations.size > 0) {
  console.error('\nAUDX-170 — build-only tooling reachable from production dependencies:\n');

  for (const [name, paths] of violations) {
    console.error(`  ${name} — ${FORBIDDEN.get(name)}`);

    for (const path of paths) {
      console.error(`      via ${path}`);
    }
  }

  console.error(
    '\n`pnpm prune --prod` will NOT remove these: it removes devDependencies, and\n' +
      'these are reachable from `dependencies`. Move the offending ROOT package to\n' +
      'devDependencies (the paths above name it first).\n',
  );
  process.exit(1);
}

console.log(`no build-only tooling in the production dependency graph (${seen.size} packages walked)`);
