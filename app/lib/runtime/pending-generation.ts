import type { FileMap } from '~/lib/stores/files';

export interface GenerationOutcome {
  /** File count captured right before the generation prompt was sent. */
  baselineFileCount: number;

  /** File count after the generation attempt settled. */
  finalFileCount: number;

  /** The generation stream errored (dropped connection, provider error, abort). */
  errored: boolean;

  /** Stable signature captured before the prompt was sent. */
  baselineSignature?: string;

  /** Hydrated workspace after all streamed file actions settled. */
  finalFiles?: FileMap;
}

/** Must stay byte-identical to the API's public scaffold marker. */
export const AI_GENERATION_SCAFFOLD_MARKER = '@vibecore-ai-generation-scaffold:v1';

function normalizedFileEntries(files: FileMap | undefined) {
  return Object.entries(files ?? {})
    .filter((entry): entry is [string, Extract<NonNullable<FileMap[string]>, { type: 'file' }>] =>
      Boolean(entry[1]?.type === 'file'),
    )
    .map(([path, entry]) => [path.replace(/\\/g, '/'), entry.content] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

function fileContentAt(files: FileMap | undefined, suffix: string): string | undefined {
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;

  return normalizedFileEntries(files).find(([path]) => `/${path.replace(/^\/+/, '')}`.endsWith(normalizedSuffix))?.[1];
}

/**
 * The API seeds /from-ai with a real Vite runtime, but it is only an honest
 * "generation pending" shell. Requiring the marker on package + entry + app
 * distinguishes that shell from generated output even though both are runnable.
 * Extra files do not turn it into a completed app: a truncated model response
 * may write helpers before it ever replaces the visible entry point.
 */
export function isAiGenerationScaffold(files: FileMap | undefined): boolean {
  const packageJson = fileContentAt(files, 'package.json');
  const entry = fileContentAt(files, 'src/main.tsx') ?? fileContentAt(files, 'src/main.jsx');
  const app = fileContentAt(files, 'src/App.tsx') ?? fileContentAt(files, 'src/App.jsx');

  return Boolean(
    packageJson?.includes(AI_GENERATION_SCAFFOLD_MARKER) &&
      entry?.includes(AI_GENERATION_SCAFFOLD_MARKER) &&
      app?.includes(AI_GENERATION_SCAFFOLD_MARKER),
  );
}

/**
 * A successful initial generation must leave a startable package, not merely
 * increment the file count. This is intentionally framework-neutral: generated
 * projects may use any source layout, but `npm run dev` must exist and there must
 * be an HTML or source entry for Preview to serve.
 */
export function hasRunnableWorkspace(files: FileMap | undefined): boolean {
  const packageJson = fileContentAt(files, 'package.json');

  if (!packageJson) {
    return false;
  }

  try {
    const manifest = JSON.parse(packageJson) as { scripts?: Record<string, unknown> };
    const dev = manifest.scripts?.dev;

    if (typeof dev !== 'string' || dev.trim().length === 0) {
      return false;
    }
  } catch {
    return false;
  }

  return normalizedFileEntries(files).some(([path]) =>
    /(?:^|\/)(?:index\.html|src\/(?:main|index|app)\.[cm]?[jt]sx?)$/i.test(path),
  );
}

/** Fast, deterministic (non-security) signature used only to detect a no-op response. */
export function workspaceGenerationSignature(files: FileMap | undefined): string {
  const entries = normalizedFileEntries(files);

  let hash = 0x811c9dc5;

  for (const [path, content] of entries) {
    const value = `${path}\0${content}\0`;

    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
    }
  }

  return `${entries.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Decide whether a project's queued generation prompt (`pendingPrompt`) should be
 * cleared after a generation attempt.
 *
 * The pending prompt is the project's ONLY retry handle. New projects start with a
 * runnable but explicitly pending Vite shell, and the agent replaces that shell on
 * first open. The previous code cleared the prompt based only on file count, so an
 * in-place replacement was indistinguishable from a no-op while partial/non-runnable
 * output could be mistaken for success. Clear only after a changed, startable,
 * non-shell workspace; provider/stream failure always keeps the prompt.
 */
export function resolvePendingPrompt(outcome: GenerationOutcome): 'keep' | 'clear' {
  if (outcome.errored) {
    return 'keep';
  }

  if (outcome.finalFiles) {
    if (!hasRunnableWorkspace(outcome.finalFiles) || isAiGenerationScaffold(outcome.finalFiles)) {
      return 'keep';
    }

    if (
      outcome.baselineSignature !== undefined &&
      workspaceGenerationSignature(outcome.finalFiles) === outcome.baselineSignature
    ) {
      return 'keep';
    }

    return 'clear';
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
 * A project is "ungenerated" when it is the marked runnable AI shell or its only
 * real files are legacy docs/config scaffolding (README, .gitignore). Used by the
 * pending-prompt replay gate and the legacy "Generate app" recovery CTA.
 */
const SCAFFOLD_FILE_PATTERN = /(^|\/)(readme(\.md)?|\.gitignore|license(\.md|\.txt)?)$/i;

export function isUngeneratedProject(files: FileMap | undefined): boolean {
  if (!files) {
    return false;
  }

  if (isAiGenerationScaffold(files)) {
    return true;
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

export type PendingPromptReplayDecision = 'defer' | 'replay' | 'skip';

/**
 * Gate the pending-prompt replay on the workspace file map being CONFIRMED
 * hydrated (loaded from the runtime or project storage at least once for THIS
 * project).
 *
 * The race this closes: on reopen the file map starts empty and is filled
 * asynchronously (runtime reload / project-storage archive). If the replay
 * effect evaluates `shouldReplayPendingPrompt` against that not-yet-hydrated
 * empty snapshot, `countWorkspaceFiles === 0` reads as "ungenerated" and the
 * queued prompt is re-appended — regenerating over an app that already exists
 * the instant its files finish loading (clobbering files + double-charging
 * tokens). A `0-files` snapshot that merely means "not loaded yet" must NEVER
 * be treated as "ungenerated → replay".
 *
 *   - not hydrated yet          -> 'defer'  (do NOT replay, do NOT clear; re-check after hydration)
 *   - hydrated + empty/scaffold -> 'replay' (genuinely needs first generation)
 *   - hydrated + real app       -> 'skip'   (app already exists; clear the stale prompt)
 *
 * The legitimate first-generation path is preserved: a truly new project whose
 * hydration reveals only an empty/scaffold (README/.gitignore) workspace still
 * replays its queued prompt exactly once.
 */
export function decidePendingPromptReplay(
  files: FileMap | undefined,
  filesHydrated: boolean,
): PendingPromptReplayDecision {
  if (!filesHydrated) {
    return 'defer';
  }

  return shouldReplayPendingPrompt(files) ? 'replay' : 'skip';
}

/**
 * Recover the original generation prompt from a seeded README so the "Generate
 * app" CTA can re-run generation for a stranded project (one whose one-shot
 * generation never produced files and whose pendingPrompt is already gone). The
 * AI starter README ends with `...\n\nPrompt:\n\n<prompt>\n` (see starterFiles('ai')).
 */
const PROMPT_SECTION_DELIMITER = '\n\nPrompt:\n\n';

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

  /*
   * Anchor on the FIRST occurrence of the exact template header delimiter
   * (`\n\nPrompt:\n\n`). The header is emitted by the README template before any
   * user-supplied prompt text, so the first match is always the section header.
   * A previous `lastIndexOf('Prompt:')` truncated the recovered prompt whenever
   * the user's own prompt contained the substring "Prompt:" (e.g. "Build a tool
   * to manage my Prompt: templates"), returning only the tail after that inner
   * occurrence and re-running generation against a corrupted prompt.
   */
  const marker = readme.content.indexOf(PROMPT_SECTION_DELIMITER);

  if (marker === -1) {
    return undefined;
  }

  const prompt = readme.content.slice(marker + PROMPT_SECTION_DELIMITER.length).trim();

  return prompt || undefined;
}
