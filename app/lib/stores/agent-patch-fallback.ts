/**
 * Pure recovery logic for an AI file patch whose hunk-applied content fails
 * validation. Extracted from `WorkbenchStore.acceptAgentPatchProposal` so the
 * fallback decision (which content, if any, to write instead of hard-failing)
 * is unit-testable without mounting the store or the runtime.
 *
 * Two tolerances, matching what the generator actually produces:
 *
 * - JSON files: MERGE the agent's intent onto the current file (a template may
 *   have rewritten it after the diff base was captured), scaffolding a minimal
 *   valid package.json as a last resort. (bug #21 behaviour, unchanged.)
 *
 * - Non-JSON files: hunk application can produce invalid content when the diff
 *   base drifted (create-vs-edit, a concurrent lane rewrote the file) even
 *   though the agent emitted a complete, self-consistent file. When EVERY hunk
 *   was accepted (a full apply — silent auto-apply / Accept all) and the full
 *   proposed content validates ON ITS OWN, write that full content instead of
 *   failing. Never substitute the full file for a PARTIAL hunk selection (that
 *   would silently apply rejected hunks) and never write content that doesn't
 *   itself validate, so a genuinely truncated/invalid stream still fails loudly.
 */

export interface AgentPatchFallbackContext {
  /** The proposal's relative path (used to branch JSON vs non-JSON and log). */
  relativePath: string;

  /** Content produced by applying the accepted hunks — already failed validation. */
  acceptedContent: string;

  /** The complete file content the agent emitted for this proposal. */
  proposedContent: string;

  /** True when every hunk in the proposal was accepted (a full apply). */
  acceptedEveryHunk: boolean;

  /** Freshest current content of the file (for the JSON merge base). */
  currentContent: string;

  /** The original validation failure, re-thrown when no valid fallback exists. */
  validationError: unknown;
}

export interface AgentPatchFallbackDeps {
  /** Re-run the real proposal validation against a candidate content. Throws on invalid. */
  validate: (content: string) => Promise<void>;

  /** Tolerant JSON merge (bug #21). Returns undefined when nothing is recoverable. */
  mergeJson: (currentContent: string, proposedContent: string) => string | undefined;

  /** Minimal valid package.json scaffold used as a last resort. */
  scaffoldPackageJson: () => string;

  /** Append a workspace log line describing the applied fallback. */
  onLog: (message: string) => void;
}

function isPackageJsonPath(relativePath: string): boolean {
  return relativePath.split('/').pop() === 'package.json';
}

/**
 * Resolve the content to write for a proposal whose hunk-applied content failed
 * validation, or re-throw the original `validationError` when no VALID fallback
 * exists. Never returns known-invalid content.
 */
export async function resolveFailedAgentPatchContent(
  context: AgentPatchFallbackContext,
  deps: AgentPatchFallbackDeps,
): Promise<string> {
  if (!context.relativePath.endsWith('.json')) {
    if (!context.acceptedEveryHunk || !context.proposedContent || context.proposedContent === context.acceptedContent) {
      throw context.validationError;
    }

    try {
      await deps.validate(context.proposedContent);
    } catch {
      // The full content is itself invalid (truncated stream) — keep the original failure.
      throw context.validationError;
    }

    deps.onLog(`AI patch for ${context.relativePath} applied via full-content fallback`);

    return context.proposedContent;
  }

  let merged = deps.mergeJson(context.currentContent, context.proposedContent);

  /*
   * Nothing recoverable from either side (both truncated/empty). For
   * package.json specifically, a hard-fail here strands `npm install` and the
   * preview with no manifest and stacks an identical "AI patch failed" on every
   * retry. Scaffold a minimal VALID manifest instead — the preview repair then
   * infers the real dependencies from the emitted imports. Other .json files
   * keep the strict behaviour.
   */
  if (merged === undefined && isPackageJsonPath(context.relativePath)) {
    merged = deps.scaffoldPackageJson();
  }

  if (merged === undefined) {
    throw context.validationError;
  }

  await deps.validate(merged);
  deps.onLog(`AI patch for ${context.relativePath} applied via tolerant JSON merge`);

  return merged;
}
