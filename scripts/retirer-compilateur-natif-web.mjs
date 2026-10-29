#!/usr/bin/env node
/**
 * Remove the optional native TypeScript toolchain from the already-built web image.
 * Keep JavaScript TypeScript versions and the historical pnpm reachability walk.
 * Refuse removal when a surviving package declares a required consumer.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';

const root = resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? '.');
const remove = process.argv.includes('--supprimer');
const modules = join(root, 'node_modules');
const store = join(modules, '.pnpm');
const inside = (path, directory) => path === directory || path.startsWith(directory + sep);
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

try {
  if (!existsSync(join(root, 'package.json')) || !existsSync(store) || realpathSync(store) !== store) {
    throw new Error('Expected an isolated project manifest and physical pnpm store');
  }

  const packages = [];

  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') {
      continue;
    }

    const siblings = join(store, entry.name, 'node_modules');

    if (!existsSync(siblings)) {
      continue;
    }

    for (const child of readdirSync(siblings, { withFileTypes: true })) {
      if (!child.isDirectory()) {
        continue;
      }

      const paths = child.name.startsWith('@')
        ? readdirSync(join(siblings, child.name), { withFileTypes: true })
            .filter((item) => item.isDirectory())
            .map((item) => join(siblings, child.name, item.name))
        : [join(siblings, child.name)];

      for (const path of paths) {
        if (existsSync(join(path, 'package.json'))) {
          packages.push({ path, entry: join(store, entry.name), manifest: json(join(path, 'package.json')) });
        }
      }
    }
  }

  const compilers = packages.filter(
    ({ manifest }) =>
      manifest.name === 'typescript' &&
      Object.keys(manifest.optionalDependencies ?? {}).some((name) => name.startsWith('@typescript/typescript-')),
  );
  const platformNames = new Set(
    compilers.flatMap(({ manifest }) =>
      Object.keys(manifest.optionalDependencies).filter((name) => name.startsWith('@typescript/typescript-')),
    ),
  );

  const targets = packages.filter((pkg) => compilers.includes(pkg) || platformNames.has(pkg.manifest.name));
  const entries = new Set(targets.map((pkg) => pkg.entry));
  const targeted = (path) => [...entries].some((entry) => inside(path, entry));

  const consumers = [
    { path: root, manifest: json(join(root, 'package.json')) },
    ...packages.filter((pkg) => !entries.has(pkg.entry)),
  ];

  const inspected = new Set(consumers.map((consumer) => realpathSync(consumer.path)));

  for (const consumer of consumers) {
    const required = new Set([
      ...Object.keys(consumer.manifest.dependencies ?? {}),
      ...Object.keys(consumer.manifest.optionalDependencies ?? {}),
      ...Object.keys(consumer.manifest.peerDependencies ?? {}).filter(
        (name) => consumer.manifest.peerDependenciesMeta?.[name]?.optional !== true,
      ),
    ]);

    for (const name of required) {
      const resolver = createRequire(join(consumer.path, 'package.json'));

      const resolved = (resolver.resolve.paths(name) ?? [])
        .map((directory) => join(directory, name, 'package.json'))
        .find(existsSync);

      if (!resolved) {
        const specifier =
          consumer.manifest.dependencies?.[name] ??
          consumer.manifest.optionalDependencies?.[name] ??
          consumer.manifest.peerDependencies?.[name];

        if (
          name === 'typescript' ||
          platformNames.has(name) ||
          /^npm:(typescript(?:@|$)|@typescript\/typescript-)/.test(specifier ?? '')
        ) {
          throw new Error(`Cannot verify required ${name} of ${consumer.manifest.name}`);
        }

        continue;
      }

      const packagePath = dirname(realpathSync(resolved));

      if (!inspected.has(packagePath)) {
        inspected.add(packagePath);
        consumers.push({ path: packagePath, manifest: json(resolved) });
      }

      if (targeted(realpathSync(resolved))) {
        throw new Error(`Refusing required ${name} of ${consumer.manifest.name}`);
      }
    }
  }

  const links = [];
  const wrappers = [];

  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);

      if (item.isSymbolicLink()) {
        try {
          if (targeted(realpathSync(path))) {
            links.push(path);
          }
        } catch {
          /* Existing broken links are not ours. */
        }
      } else if (item.isDirectory() && !entries.has(path)) {
        walk(path);
      } else if (
        item.isFile() &&
        dirname(path).endsWith(`${sep}.bin`) &&
        ['tsc', 'tsc.cmd', 'tsc.ps1', 'tsserver', 'tsserver.cmd', 'tsserver.ps1'].includes(item.name)
      ) {
        const linkedCompiler = join(dirname(dirname(path)), 'typescript');

        if (existsSync(linkedCompiler) && targeted(realpathSync(linkedCompiler))) {
          wrappers.push(path);
        }
      }
    }
  }
  walk(modules);
  console.log(
    JSON.stringify({
      remove,
      packages: targets.map(({ manifest }) => `${manifest.name}@${manifest.version}`),
      links: links.length,
      wrappers: wrappers.length,
    }),
  );

  if (remove) {
    for (const path of [...links, ...wrappers]) {
      rmSync(path);
    }

    for (const entry of entries) {
      if (!inside(entry, store) || lstatSync(entry).isSymbolicLink()) {
        throw new Error('Unsafe store entry');
      }

      rmSync(entry, { recursive: true });
    }

    for (const entry of entries) {
      if (existsSync(entry)) {
        throw new Error('Native compiler remains');
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
