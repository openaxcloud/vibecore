export interface PreviewPackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface RuntimeDirectoryEntry {
  name: string;
  type?: string;
}

export type RuntimeDirectoryLister = (directory: string) => Promise<RuntimeDirectoryEntry[]>;

export function previewDependencyNames(pkg: PreviewPackageManifest) {
  return Array.from(
    new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]),
  )
    .filter(Boolean)
    .sort();
}

function joinRuntimePath(basePath: string, childPath: string) {
  const base = basePath.replace(/\/+$/, '');
  const child = childPath.replace(/^\/+/, '');

  return base ? `${base}/${child}` : child;
}

function scopedPackageParts(packageName: string) {
  if (!packageName.startsWith('@')) {
    return undefined;
  }

  const [scope, name] = packageName.split('/');

  return scope && name ? { scope, name } : undefined;
}

export async function hasInstalledPreviewDependencies(
  pkg: PreviewPackageManifest,
  listFiles: RuntimeDirectoryLister,
  nodeModulesPath = 'node_modules',
) {
  const dependencies = previewDependencyNames(pkg);

  if (!dependencies.length) {
    return true;
  }

  let nodeModuleEntries: RuntimeDirectoryEntry[];

  try {
    nodeModuleEntries = await listFiles(nodeModulesPath);
  } catch {
    return false;
  }

  const topLevelNames = new Set(nodeModuleEntries.map((entry) => entry.name));
  const scopedDependencies = new Map<string, Set<string>>();

  for (const dependency of dependencies) {
    const scoped = scopedPackageParts(dependency);

    if (!scoped) {
      if (!topLevelNames.has(dependency)) {
        return false;
      }

      continue;
    }

    if (!topLevelNames.has(scoped.scope)) {
      return false;
    }

    const scopedNames = scopedDependencies.get(scoped.scope) ?? new Set<string>();
    scopedNames.add(scoped.name);
    scopedDependencies.set(scoped.scope, scopedNames);
  }

  for (const [scope, packageNames] of scopedDependencies.entries()) {
    let scopedEntries: RuntimeDirectoryEntry[];

    try {
      scopedEntries = await listFiles(joinRuntimePath(nodeModulesPath, scope));
    } catch {
      return false;
    }

    const installedScopedNames = new Set(scopedEntries.map((entry) => entry.name));

    for (const packageName of packageNames) {
      if (!installedScopedNames.has(packageName)) {
        return false;
      }
    }
  }

  return true;
}
