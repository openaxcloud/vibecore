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

/**
 * Decide whether a queued `pendingPrompt` should still be re-appended (re-run) when
 * a project is reopened. The prompt's clear is best-effort (it runs on a delayed
 * onFinish timer and can be lost if the tab is closed or the save fails right after
 * the agent wrote files), so on reopen we must not blindly regenerate over an app
 * that already exists — that clobbers the generated files and double-charges tokens.
 *
 * Return false (skip) once the workspace holds real, non-scaffold files: the app was
 * already produced even though the prompt wasn't cleared. An empty or scaffold-only
 * (README/.gitignore) workspace still needs generation, so the prompt is re-run.
 */
export function shouldReplayPendingPrompt(files: FileMap | undefined): boolean {
  if (isUngeneratedProject(files)) {
    return true;
  }

  return countWorkspaceFiles(files) <= 1;
}

/**
 * Recover the original generation prompt from a seeded README so the "Generate
 * app" CTA can re-run generation for a stranded project (one whose one-shot
 * generation never produced files and whose pendingPrompt is already gone). The
 * AI starter README ends with `Prompt:\n\n<prompt>` (see starterFiles('ai')).
 */
export function extractGenerationPrompt(files: FileMap | undefined): string | undefined {
  if (!files) {
    return undefined;
  }

  const readme = Object.values(files).find(
    (entry): entry is Extract<NonNullable<FileMap[string]>, { type: 'file' }> =>
      entry?.type === 'file' && /This project was created from an AI prompt/i.test(entry.content),
  );

  if (!readme) {
    return undefined;
  }

  const marker = readme.content.lastIndexOf('Prompt:');

  if (marker === -1) {
    return undefined;
  }

  const prompt = readme.content.slice(marker + 'Prompt:'.length).trim();

  return prompt || undefined;
}
