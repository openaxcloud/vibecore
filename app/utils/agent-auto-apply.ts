/**
 * Decide whether an AI-generated file patch can be applied automatically
 * (Replit-style auto-apply) or whether the user must still review it.
 *
 * Two reasons block auto-apply:
 *
 *  1. The user has explicitly turned the auto-apply toggle off.
 *  2. The target file is structurally sensitive — dependency manifests,
 *     build configuration, secrets — where a silent change is much harder
 *     to recover from. These always surface in the review queue regardless
 *     of the toggle, so the user can sanity-check before they land.
 *
 * The predicate is pure so it stays cheap to call from React effects and
 * has full unit-test coverage.
 */

/**
 * Substring matches: file is risky if its relative path ends with one of
 * these (case-insensitive). Use this for fixed, well-known filenames where
 * the basename is enough to identify the file.
 */
export const RISKY_AGENT_PATCH_PATH_SUFFIXES: readonly string[] = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'jsconfig.json',
  'wrangler.toml',
  'wrangler.jsonc',
];

/**
 * Pattern matches: file is risky when its basename matches one of these
 * regexes. Use this for file families like `vite.config.*`, `.env*`, etc.
 */
export const RISKY_AGENT_PATCH_BASENAME_PATTERNS: readonly RegExp[] = [
  /^vite\.config\.(?:c|m)?[jt]sx?$/i,
  /^tailwind\.config\.(?:c|m)?[jt]sx?$/i,
  /^postcss\.config\.(?:c|m)?[jt]sx?$/i,
  /^next\.config\.(?:c|m)?[jt]sx?$/i,
  /^remix\.config\.(?:c|m)?[jt]sx?$/i,
  /^astro\.config\.(?:c|m)?[jt]sx?$/i,
  /^svelte\.config\.(?:c|m)?[jt]sx?$/i,
  /^\.env(?:\.[a-z0-9_.-]+)?$/i,
];

function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function basenameOf(input: string): string {
  const normalized = normalizeRelativePath(input);
  const slash = normalized.lastIndexOf('/');

  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

/**
 * True when the agent should NOT silently auto-apply a patch to this path.
 * Returns false on empty / unusable input so callers fall back to "treat as
 * safe" instead of throwing.
 */
export function isRiskyAgentPatchPath(relativePath: string | null | undefined): boolean {
  if (!relativePath || typeof relativePath !== 'string') {
    return false;
  }

  const normalized = normalizeRelativePath(relativePath).toLowerCase();

  if (RISKY_AGENT_PATCH_PATH_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(`/${suffix}`))) {
    return true;
  }

  const basename = basenameOf(normalized);

  return RISKY_AGENT_PATCH_BASENAME_PATTERNS.some((pattern) => pattern.test(basename));
}

export interface AutoApplyDecisionInput {
  /** Current value of the `vibecore:agent-auto-apply` user setting. */
  autoApplyEnabled: boolean;
  relativePath: string | null | undefined;

  /** Current proposal status — only `'pending'` is eligible for auto-apply. */
  status: string;
}

/**
 * Returns true only when every condition for a silent auto-apply is met:
 * setting on, status pending, path not risky.
 */
export function shouldAutoApplyPatch(input: AutoApplyDecisionInput): boolean {
  if (!input.autoApplyEnabled) {
    return false;
  }

  if (input.status !== 'pending') {
    return false;
  }

  return !isRiskyAgentPatchPath(input.relativePath);
}
