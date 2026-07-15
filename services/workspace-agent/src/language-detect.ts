/*
 * Language / stack detection for a workspace project.
 *
 * Until now the agent assumed Node: the project root was located by finding a
 * `package.json` and every install/build path was npm-shaped. With the Nix store
 * mounted at /nix, a workspace can run any language — so the FIRST thing the
 * lifecycle needs is to know which one.
 *
 * Detection is by marker file, in priority order. A project can legitimately match
 * several (a Flask backend with a Vite frontend is Python + Node): the caller gets
 * the full ordered list, and `primary` is the first match. Priority puts the
 * "backend" languages before Node, because a polyglot project's RUN command is
 * almost always the backend's — the frontend is a build step feeding it.
 */

export type Language = 'python' | 'go' | 'rust' | 'java' | 'php' | 'ruby' | 'node';

export interface LanguageMarker {
  language: Language;
  /** Marker files, in the order we look for them. */
  markers: readonly string[];
}

/*
 * Order matters: first match wins for `primary`. Node is LAST on purpose — a
 * `package.json` sitting next to a `pyproject.toml` is a frontend inside a Python
 * project, not the other way round.
 */
export const LANGUAGE_MARKERS: readonly LanguageMarker[] = [
  { language: 'python', markers: ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py', 'uv.lock'] },
  { language: 'go', markers: ['go.mod'] },
  { language: 'rust', markers: ['Cargo.toml'] },
  { language: 'java', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'] },
  { language: 'php', markers: ['composer.json'] },
  { language: 'ruby', markers: ['Gemfile'] },
  { language: 'node', markers: ['package.json'] },
];

export interface DetectionResult {
  /** Every language whose marker is present, in LANGUAGE_MARKERS order. */
  languages: Language[];
  /** First match, or 'node' when nothing matched (the historical default — never break an empty project). */
  primary: Language;
  /** The marker files actually found, for logging / debugging. */
  matched: string[];
}

/**
 * Detect from a flat list of file names present at the project root.
 * Pure — the fs walk is the caller's job, which keeps this unit-testable.
 */
export function detectLanguages(rootFileNames: readonly string[]): DetectionResult {
  const present = new Set(rootFileNames);
  const languages: Language[] = [];
  const matched: string[] = [];

  for (const entry of LANGUAGE_MARKERS) {
    const hit = entry.markers.find((marker) => present.has(marker));

    if (hit) {
      languages.push(entry.language);
      matched.push(hit);
    }
  }

  return {
    languages,
    /*
     * Empty / unknown project => 'node'. This is the ONLY safe default: every
     * existing workspace in prod is Node, and an unrecognised project must keep
     * behaving exactly as it does today.
     */
    primary: languages[0] ?? 'node',
    matched,
  };
}

/*
 * Install command per language.
 *
 * Python uses `uv` rather than `pip`: it resolves and installs ~10x faster, which
 * matters double under gVisor (every syscall is proxied by the Sentry, so process
 * and file churn is the dominant cost). `uv pip install` is argv-compatible with
 * pip, so the panel/API surface does not change shape.
 *
 * Returns null for languages with no install step (a bare Go file needs none) so
 * the caller can skip rather than run a no-op command.
 */
export function installCommand(
  language: Language,
  packages: readonly string[] = [],
  options: { dev?: boolean } = {},
): { command: string; args: string[] } | null {
  const has = packages.length > 0;

  switch (language) {
    case 'python':
      // No packages => materialise the declared env (requirements.txt / pyproject).
      return has
        ? { command: 'uv', args: ['pip', 'install', ...packages] }
        : { command: 'uv', args: ['pip', 'install', '-r', 'requirements.txt'] };

    case 'go':
      return has ? { command: 'go', args: ['get', ...packages] } : { command: 'go', args: ['mod', 'download'] };

    case 'rust':
      return has ? { command: 'cargo', args: ['add', ...packages] } : { command: 'cargo', args: ['fetch'] };

    case 'java':
      return has ? null : { command: 'mvn', args: ['dependency:resolve'] };

    case 'php':
      return has
        ? { command: 'composer', args: ['require', ...(options.dev ? ['--dev'] : []), ...packages] }
        : { command: 'composer', args: ['install'] };

    case 'ruby':
      return has ? { command: 'bundle', args: ['add', ...packages] } : { command: 'bundle', args: ['install'] };

    case 'node':
      // Node keeps its EXISTING path (api buildInstallCommand + lockfile detection);
      // returning null here means "not my business", not "nothing to do".
      return null;

    default:
      return null;
  }
}

/*
 * Is this command a transient package install? Extends the Node-only
 * isTransientPackageCommand so the workspace GC never stops a pod mid-`uv pip
 * install` / `go mod download` / `cargo fetch` — the exact failure the Node
 * version was written to prevent.
 */
const INSTALL_SUBCOMMANDS: Record<string, readonly string[]> = {
  uv: ['pip', 'sync', 'add', 'install'],
  pip: ['install'],
  pip3: ['install'],
  poetry: ['install', 'add'],
  go: ['get', 'mod'],
  cargo: ['fetch', 'add', 'build'],
  composer: ['install', 'require', 'update'],
  bundle: ['install', 'add'],
  mvn: ['dependency:resolve', 'install'],
};

export function isTransientLanguageInstall(command: string, args: readonly string[] = []): boolean {
  const parts = command.trim().split(/\s+/);
  const binary = parts[0]?.split('/').pop() ?? '';
  const subcommands = INSTALL_SUBCOMMANDS[binary];

  if (!subcommands) {
    return false;
  }

  const sub = parts[1] ?? args[0] ?? '';

  return subcommands.includes(sub);
}
