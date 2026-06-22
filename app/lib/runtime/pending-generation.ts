import type { FileMap } from '~/lib/stores/files';

export interface GenerationOutcome {
  /** File count captured right before the generation prompt was sent. */
  baselineFileCount: number;

  /** File count after the generation attempt settled. */
  finalFileCount: number;

  /** The generation stream errored (dropped connection, provider error, abort). */
  errored: boolean;
}

/**
 * Decide whether a project's queued generation prompt (`pendingPrompt`) should be
 * cleared after a generation attempt.
 *
 * The pending prompt is the project's ONLY retry handle: a project created from a
 * prompt is seeded with just a README, and the agent is expected to generate the
 * real app on first open. The previous code cleared the prompt the instant it was
 * sent, so any failure (provider error, the runtime not yet attachable, a truncated
 * response that wrote nothing) left the project permanently stuck with just its
 * README and no way to regenerate. Keep the prompt unless the agent actually wrote
 * at least one new file, so a failed attempt retries on the next open instead.
 */
export function resolvePendingPrompt(outcome: GenerationOutcome): 'keep' | 'clear' {
  if (outcome.errored) {
    return 'keep';
  }

  return outcome.finalFileCount > outcome.baselineFileCount ? 'clear' : 'keep';
}

/** Count real files (ignoring folders / pruned entries) in a workbench FileMap snapshot. */
export function countWorkspaceFiles(files: FileMap | undefined): number {
  if (!files) {
    return 0;
  }

  return Object.values(files).filter((entry) => entry?.type === 'file').length;
}

/**
 * A project is "ungenerated" when its only real files are docs/config scaffolding
 * (README, .gitignore) — i.e. the agent never produced the app. Used to surface a
 * "Generate app" CTA so the user can (re)trigger generation instead of staring at
 * an empty workspace.
 */
const SCAFFOLD_FILE_PATTERN = /(^|\/)(readme(\.md)?|\.gitignore|license(\.md|\.txt)?)$/i;

export function isUngeneratedProject(files: FileMap | undefined): boolean {
  if (!files) {
    return false;
  }

  const realFiles = Object.entries(files).filter(([, entry]) => entry?.type === 'file');

  if (realFiles.length === 0) {
    return false;
  }

  return realFiles.every(([path]) => SCAFFOLD_FILE_PATTERN.test(path));
}
