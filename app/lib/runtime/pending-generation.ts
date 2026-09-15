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

/** Le prompt tel qu'il voyage dans `ProjectIdeState.chat`. */
export interface PromptDeGeneration {
  id: string;
  prompt: string;
  model?: string;
  provider?: string;
  createdAt: string;
  aiFallback?: boolean;
  aiFallbackReason?: string;
}

export interface PromptConsomme extends PromptDeGeneration {
  clearedAt: string;
  reason: 'generated' | 'skipped-existing-app';
}

/**
 * Transforme un prompt en attente en prompt CONSOMMÉ, au lieu de le détruire.
 *
 * Deux effaceurs écrivaient `pendingPrompt: null` sans laisser de trace. Sur les
 * 22 projets échoués mesurés en production le 2026-09-06, il était impossible de
 * dire lequel était passé — ni même si un prompt avait jamais existé. `reason`
 * répond au premier, `clearedAt` au second.
 */
export function consommerPrompt(
  prompt: PromptDeGeneration,
  reason: PromptConsomme['reason'],
  maintenant: () => string = () => new Date().toISOString(),
): PromptConsomme {
  return { ...prompt, clearedAt: maintenant(), reason };
}

/**
 * Le prompt d'origine, où qu'il se trouve.
 *
 * ORDRE VOULU : `pendingPrompt` d'abord — s'il est encore là, la génération n'a
 * pas eu lieu et c'est lui qu'il faut rejouer. `consumedPrompt` ensuite : la
 * génération a été tentée ou écartée, mais l'utilisateur peut vouloir relancer.
 *
 * Mesuré en production : sur 22 projets échoués, 12 portaient encore un
 * `pendingPrompt`. Les brancher ici les débloque sans rien redemander.
 */
export function promptRecuperable(
  chat:
    | {
        pendingPrompt?: PromptDeGeneration | null;
        consumedPrompt?: PromptConsomme | null;
      }
    | undefined,
): string | undefined {
  const brut = chat?.pendingPrompt?.prompt ?? chat?.consumedPrompt?.prompt;
  const prompt = brut?.trim();

  return prompt ? prompt : undefined;
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

  /*
   * ANCRAGE INDÉPENDANT DE LA LANGUE.
   *
   * Ce test cherchait `/This project was created from an AI prompt/i` — une
   * phrase d'INTERFACE, donc traduite. Le README d'un utilisateur francophone dit
   * « Ce projet a été créé à partir d'un prompt d'IA » : aucune correspondance,
   * `undefined`, et le bouton de secours ne s'affichait jamais. Mesuré le
   * 2026-09-06 sur la production d'un utilisateur francophone.
   *
   * Un mécanisme qui reconnaît du texte d'interface est cassé par la traduction,
   * et la traduction ne prévient personne. On s'ancre donc sur la STRUCTURE — le
   * délimiteur de section, qui n'est pas traduit — et sur le nom du fichier.
   */
  const readme = Object.values(files).find(
    (entry): entry is Extract<NonNullable<FileMap[string]>, { type: 'file' }> =>
      entry?.type === 'file' && entry.content.includes(PROMPT_SECTION_DELIMITER),
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
