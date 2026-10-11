import { useTranslation } from 'react-i18next';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
import { extractGenerationPrompt, isUngeneratedProject } from '~/lib/runtime/pending-generation';
import type { FileMap } from '~/lib/stores/files';

interface GenerateAppCtaProps {
  files: FileMap | undefined;

  /*
   * Le prompt tel qu'il vit RÉELLEMENT aujourd'hui : dans
   * `ProjectIdeState.chat` (`pendingPrompt`, puis `consumedPrompt`).
   *
   * Le bouton le cherchait uniquement dans le README. Or BUG-QA-PROMPT-IN-README
   * l'a retiré du README — à juste titre, il y fuyait des clés d'API — sans
   * mettre ce site d'appel à jour. Résultat mesuré le 2026-09-06 : le secours ne
   * pouvait plus s'afficher pour AUCUN projet créé depuis ce changement. Le
   * README reste un dernier recours pour les projets antérieurs.
   */
  promptDeSecours?: string;
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
export function GenerateAppCta({ files, promptDeSecours, hasMessages, isGenerating, onGenerate }: GenerateAppCtaProps) {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

  if (hasMessages || isGenerating || !isUngeneratedProject(files)) {
    return null;
  }

  const prompt = promptDeSecours?.trim() || extractGenerationPrompt(files);

  if (!prompt) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 flex w-full max-w-chat flex-col items-stretch justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <span className="i-ph:sparkle-fill shrink-0 text-lg text-bolt-elements-item-contentAccent" aria-hidden />
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['chatResiduals.generate.title']}
          </p>
          <p className="break-words text-xs text-bolt-elements-textSecondary">
            {copy['chatResiduals.generate.description']}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onGenerate(prompt)}
        className="min-h-11 w-full shrink-0 whitespace-normal rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-sm font-medium text-bolt-elements-button-primary-text outline-none transition-colors hover:bg-bolt-elements-button-primary-backgroundHover focus-visible:ring-2 focus-visible:ring-bolt-elements-focus sm:w-auto"
      >
        {copy['chatResiduals.generate.action']}
      </button>
    </div>
  );
}
