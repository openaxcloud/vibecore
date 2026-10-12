/** Offline compatibility probe, not an exact-dependency certification or publish. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listGalleryDemoApps, materializeGalleryDemoApp } from '../../packages/template-catalog/src/server.js';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const nodeModules = path.join(root, 'node_modules');
const output = process.argv[2];
if (!output) throw new Error('Pass a local JSON report path; no installation is performed.');
const results = [];

function run(directory: string, binary: string, args: string[]) {
  const result = spawnSync(process.execPath, [binary, ...args], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, NODE_OPTIONS: '--max-old-space-size=1536', CI: '1' },
  });
  return {
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
    output: (result.stdout + result.stderr).replaceAll(directory, '<project>').replaceAll(root, '<repository>'),
  };
}

for (const app of listGalleryDemoApps()) {
  const snapshot = materializeGalleryDemoApp(app.id)!;
  const pkg = JSON.parse(snapshot.files['package.json'] ?? '{}');
  const requested: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
  const dependencyVersions = Object.entries(requested).map(([name, version]) => {
    let restored: string | null = null;
    try {
      restored = JSON.parse(readFileSync(path.join(nodeModules, name, 'package.json'), 'utf8')).version;
    } catch {
      /* absent */
    }
    return { name, requested: version, restored };
  });
  const directory = mkdtempSync(path.join(tmpdir(), `a37-gallery-${app.id}-`));
  try {
    for (const [filename, content] of Object.entries(snapshot.files)) {
      const destination = path.join(directory, filename);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
    symlinkSync(nodeModules, path.join(directory, 'node_modules'), 'dir');
    const requestedTs = requested.typescript;
    const tsVersion = requestedTs?.startsWith('~5.9') ? '5.9.3' : requestedTs;
    let compiler = tsVersion
      ? path.join(nodeModules, '.pnpm', `typescript@${tsVersion}`, 'node_modules/typescript/bin/tsc')
      : undefined;
    let compilerVersion: string | null = null;
    if (compiler) {
      try {
        compilerVersion = JSON.parse(
          readFileSync(path.join(path.dirname(path.dirname(compiler)), 'package.json'), 'utf8'),
        ).version;
      } catch {
        compiler = undefined;
      }
    }
    const typecheck = compiler ? run(directory, compiler, ['--noEmit', '-p', 'tsconfig.json']) : null;
    const buildScript: string | undefined = pkg.scripts?.build;
    let build: ReturnType<typeof run> | { unavailable: string } | null = null;
    if (buildScript === 'tsc -b && vite build' && !compiler) {
      build = { unavailable: 'TypeScript compiler unavailable; full build not executed.' };
    } else if (buildScript === 'tsc -b && vite build' || buildScript === 'vite build') {
      const tscBuild = buildScript.startsWith('tsc') && compiler ? run(directory, compiler, ['-b']) : null;
      build =
        tscBuild && tscBuild.exitCode !== 0
          ? tscBuild
          : run(directory, path.join(nodeModules, 'vite/bin/vite.js'), ['build']);
    } else if (buildScript) {
      build = { unavailable: `Not executed: ${buildScript}; required toolchain absent from restored dependencies.` };
    }
    const result = {
      id: app.id,
      contentHash: snapshot.contentHash,
      compilerVersion,
      compilerUnavailable: requestedTs && !compiler ? requestedTs : null,
      buildScript: buildScript ?? null,
      viteVersionUsed: require('vite/package.json').version,
      exactDependencyCertification: false,
      dependencyVersions,
      typecheck,
      build,
    };
    results.push(result);
    console.log(
      `${app.id}: tsc=${typecheck?.exitCode ?? 'unavailable'} build=${build && 'exitCode' in build ? build.exitCode : 'unavailable'}`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
writeFileSync(
  output,
  JSON.stringify(
    {
      baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      mode: 'Offline compatibility probe: original snapshot files; existing root dependency graph; exact requested compiler where available. Version mismatches are explicit and results do not certify isolated installs.',
      nodeVersion: process.version,
      results,
    },
    null,
    2,
  ) + '\n',
);
