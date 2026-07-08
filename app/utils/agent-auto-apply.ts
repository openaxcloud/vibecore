/**
 * Decide whether an AI-generated file patch can be applied automatically
 * (Replit-style auto-apply) or whether the user must still review it.
 *
 * Contract: auto-apply is always enabled. Every pending proposal — future
 * and existing — is accepted silently. The
 * `isRiskyAgentPatchPath` predicate stays exported as a passive signal
 * (callers can label which files would have been "risky" in the review
 * queue), but it does NOT short-circuit the auto-accept; making the
 * setting is surfaced in Settings as read-only policy information.
 *
 * The predicates are pure so they stay cheap to call from React effects
 * and have full unit-test coverage.
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
  /** Whether auto-apply is enabled (the inverse of "require review of AI changes"). */
  autoApplyEnabled: boolean;

  /** Current proposal status — only `'pending'` is eligible for auto-apply. */
  status: string;
}

export interface AutoApplyAttemptKeyInput {
  /** Stable proposal identifier, usually `${artifactId}:${actionId}`. */
  id: string;

  /** Updated whenever the proposal content/status is refreshed. */
  updatedAt: string;

  /** Proposed file content for this exact attempt. */
  proposedContent: string;
}

/**
 * Auto-apply a proposal only when auto-apply is enabled AND the proposal is
 * still pending. When the user has turned ON "Require review of AI changes"
 * (`autoApplyEnabled === false`) the proposal stays pending for the review
 * queue instead of being accepted silently.
 */
export function shouldAutoApplyPatch(input: AutoApplyDecisionInput): boolean {
  return input.autoApplyEnabled && input.status === 'pending';
}

/**
 * Builds a per-version key for the auto-apply effect. The proposal id alone
 * is not enough because the agent may regenerate the same action after a
 * validation failure. Using the content and timestamp lets the effect retry
 * genuinely new patch versions while avoiding an infinite loop for the same
 * failing proposal.
 */
export function autoApplyAttemptKey(input: AutoApplyAttemptKeyInput): string {
  return `${input.id}:${input.updatedAt}:${input.proposedContent.length}`;
}
