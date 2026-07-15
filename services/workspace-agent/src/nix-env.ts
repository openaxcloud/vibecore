/*
 * ecode.nix — the project's declared toolchain — and its materialisation.
 *
 * DESIGN (candidate E, see docs/RUNTIME_NIX_PHASE0_SPIKE.md):
 *
 *   /nix is a SHARED, PRE-BUILT, READ-ONLY store mounted into every workspace pod.
 *   Every package we support is ALREADY in it. So "install ffmpeg" involves no
 *   download and no build — only a lookup.
 *
 *   Crucially, we do NOT use `nix profile install`: that realises a NEW store path
 *   (the profile's buildEnv derivation) and therefore WRITES to /nix/store, which
 *   fails on a read-only store. Instead we do the buildEnv by hand — resolve each
 *   package to its (already present) store path and symlink its ./bin into a
 *   per-project link farm on the project's OWN PVC. Zero store writes, zero builds,
 *   instantaneous.
 *
 *   The link farm lives under WORKSPACE_ROOT/.ecode/bin, i.e. inside the PVC the
 *   workspace already has. It costs ZERO extra storage quota — which is the whole
 *   reason /nix must never get a PVC of its own (2Gi x ~384 workspaces = +768Gi,
 *   quota blown).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectLanguages } from './language-detect.js';

/** Default toolchain for a project with no ecode.nix yet, by detected language. */
export const DEFAULT_PACKAGES: Record<string, readonly string[]> = {
  python: ['python312', 'uv'],
  node: ['nodejs_22', 'pnpm'],
  go: ['go'],
  rust: ['rustc', 'cargo'],
  java: ['jdk21', 'maven'],
  php: ['php', 'phpPackages.composer'],
  ruby: ['ruby', 'bundler'],
};

/**
 * Render an ecode.nix. Deliberately a flat, boring list: this file is edited by
 * HUMANS and by the AI agent ("add ffmpeg"), so it must be trivially parseable and
 * trivially patchable. No functions, no let-bindings, no imports beyond pkgs.
 */
export function renderEcodeNix(packages: readonly string[]): string {
  const lines = packages.map((pkg) => `    pkgs.${pkg}`).join('\n');

  return `# ecode.nix — the toolchain for this project.
# Add a package by adding a line. Everything here is already present in the
# shared read-only Nix store, so changes apply instantly: no download, no build.
{ pkgs }: {
  packages = [
${lines}
  ];
}
`;
}

/**
 * Parse the package list back out of an ecode.nix.
 *
 * A real Nix evaluation would be more correct, but this file is OURS: we generate
 * it, and both the user and the AI agent edit it in the shape we generated. A
 * regex over `pkgs.<name>` is enough, and it cannot fail closed on a malformed
 * file — it just yields fewer packages, which surfaces as a missing binary rather
 * than a crashed agent.
 */
export function parseEcodeNix(source: string): string[] {
  const packages: string[] = [];

  for (const line of source.split('\n')) {
    // Ignore comments so a commented-out package is genuinely off.
    const code = line.split('#')[0];
    const match = code.match(/pkgs\.([A-Za-z0-9_.'-]+)/);

    if (match) {
      packages.push(match[1]);
    }
  }

  return packages;
}

/** Add a package to an ecode.nix source, idempotently. This is what the AI agent calls. */
export function addPackageToEcodeNix(source: string, pkg: string): string {
  if (parseEcodeNix(source).includes(pkg)) {
    return source;
  }

  const lines = source.split('\n');
  const closing = lines.findIndex((line) => line.trim() === '];');

  if (closing === -1) {
    // Malformed / hand-mangled file: regenerate from what we can read rather than corrupt it.
    return renderEcodeNix([...parseEcodeNix(source), pkg]);
  }

  lines.splice(closing, 0, `    pkgs.${pkg}`);

  return lines.join('\n');
}

function run(command: string, args: string[], timeoutMs = 30_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: '', stderr: String(error) });
    });
  });
}

/**
 * Resolve a package name to its store path. `--offline` is not a nicety: it is the
 * PROOF that the package came from the pre-built store. If it is missing, this
 * fails fast instead of silently trying to fetch/build (which would hang for
 * minutes under gVisor and look like a broken workspace).
 */
export async function resolveStorePath(pkg: string, nixpkgs = 'nixpkgs'): Promise<string | null> {
  const { code, stdout } = await run('nix', [
    'eval',
    '--raw',
    '--offline',
    '--extra-experimental-features',
    'nix-command flakes',
    `${nixpkgs}#${pkg}`,
  ]);

  return code === 0 && stdout.startsWith('/nix/store/') ? stdout : null;
}

export interface MaterialiseResult {
  binDir: string;
  linked: string[];
  missing: string[];
}

/**
 * Build the link farm: for each declared package, symlink every binary of its
 * (already present) store path into <workspaceRoot>/.ecode/bin.
 *
 * Rebuilt from scratch each time so a package REMOVED from ecode.nix actually
 * disappears from PATH — otherwise the env would only ever grow, and "remove the
 * package" would silently do nothing.
 */
export async function materialiseEnv(workspaceRoot: string, packages: readonly string[]): Promise<MaterialiseResult> {
  const binDir = join(workspaceRoot, '.ecode', 'bin');

  await rm(binDir, { recursive: true, force: true });
  await mkdir(binDir, { recursive: true });

  const linked: string[] = [];
  const missing: string[] = [];

  for (const pkg of packages) {
    const storePath = await resolveStorePath(pkg);

    if (!storePath) {
      missing.push(pkg);
      continue;
    }

    let binaries: string[];

    try {
      binaries = await readdir(join(storePath, 'bin'));
    } catch {
      // A package with no ./bin (a library) is legitimate — it is on PATH via its deps.
      continue;
    }

    for (const binary of binaries) {
      try {
        await symlink(join(storePath, 'bin', binary), join(binDir, binary));
        linked.push(binary);
      } catch {
        // First package wins on a name collision; mirrors nix buildEnv's default.
      }
    }
  }

  return { binDir, linked, missing };
}

/**
 * Boot hook, called once from server.ts before the agent listens.
 *
 * Detect the project's language -> ensure it has an ecode.nix -> materialise the
 * link farm. Idempotent, and a NO-OP when /nix isn't mounted, so a pod without the
 * shared store (every workspace in prod today) boots exactly as it does now.
 *
 * Never throws: a broken toolchain must degrade to "the package isn't on PATH",
 * never to "the agent didn't start" (which is a blank editor and a dead preview).
 */
export async function bootstrapNixEnv(
  workspaceRoot = process.env.WORKSPACE_ROOT ?? '/workspace',
): Promise<MaterialiseResult | null> {
  if (!existsSync('/nix/store')) {
    return null;
  }

  try {
    const rootFiles = await readdir(workspaceRoot).catch(() => [] as string[]);
    const { primary } = detectLanguages(rootFiles);

    const packages = await loadOrCreateEcodeNix(workspaceRoot, primary, async (path, content) => {
      await writeFile(path, content, 'utf8');
    });

    const result = await materialiseEnv(workspaceRoot, packages);

    console.log(
      `nix-env: language=${primary} packages=${packages.length} linked=${result.linked.length}` +
        (result.missing.length ? ` MISSING=${result.missing.join(',')}` : ''),
    );

    return result;
  } catch (error) {
    console.warn('nix-env: bootstrap failed, continuing without link farm', error);

    return null;
  }
}

/**
 * Read ecode.nix, creating it from the detected language if absent.
 * Returns the package list to materialise.
 */
export async function loadOrCreateEcodeNix(
  workspaceRoot: string,
  primaryLanguage: string,
  write: (path: string, content: string) => Promise<void>,
): Promise<string[]> {
  const path = join(workspaceRoot, 'ecode.nix');

  try {
    return parseEcodeNix(await readFile(path, 'utf8'));
  } catch {
    const packages = [...(DEFAULT_PACKAGES[primaryLanguage] ?? DEFAULT_PACKAGES.node)];
    await write(path, renderEcodeNix(packages));

    return packages;
  }
}
