import { extractGenerationPrompt, isUngeneratedProject } from '~/lib/runtime/pending-generation';
import type { FileMap } from '~/lib/stores/files';

interface GenerateAppCtaProps {
  files: FileMap | undefined;
  hasMessages: boolean;
  isGenerating: boolean;
  onGenerate: (prompt: string) => void;
}

/*
 * Recovery CTA for a "stranded" project: one whose workspace holds only the
 * seeded README (no app) and whose initial one-shot generation never produced
 * files (and whose pendingPrompt is already consumed). Rather than leaving the
 * user facing an empty workspace, surface a one-click "Generate app" that
 * re-runs generation from the original prompt recovered from the README. Renders
 * nothing once a conversation exists, while the agent is working, or once real
 * app files are present.
 */
export function GenerateAppCta({ files, hasMessages, isGenerating, onGenerate }: GenerateAppCtaProps) {
  if (hasMessages || isGenerating || !isUngeneratedProject(files)) {
    return null;
  }

  const prompt = extractGenerationPrompt(files);

  if (!prompt) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 flex w-full max-w-chat items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="i-ph:sparkle-fill shrink-0 text-lg text-bolt-elements-item-contentAccent" aria-hidden />
        <div>
          <p className="text-sm font-medium text-bolt-elements-textPrimary">
            This project hasn&apos;t been generated yet
          </p>
          <p className="text-xs text-bolt-elements-textSecondary">
            The workspace only has a README — generate the app from your original prompt.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onGenerate(prompt)}
        className="shrink-0 rounded-md bg-bolt-elements-button-primary-background px-3 py-1.5 text-sm font-medium text-bolt-elements-button-primary-text transition-colors hover:bg-bolt-elements-button-primary-backgroundHover"
      >
        Generate app
      </button>
    </div>
  );
}
