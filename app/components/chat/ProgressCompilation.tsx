import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatChatResidualsCopy,
  formatChatResidualsNumber,
  getChatResidualsCopy,
  localizePersistedProgressMessage,
} from '~/lib/i18n/catalogs/chat-residuals';
import type { ProgressAnnotation } from '~/types/context';

/**
 * Thin, one-line agent status bar (agent-panel UX refonte, point 2).
 *
 * Replaces the old tall "Agent tool calls" banner + gauges + expandable list.
 * Renders a single line — "⟳ Agent · <phase> · <pct>%" — with a 2px progress
 * underline, so the agent's streamed answer stays the primary content and the
 * panel keeps its height. Individual tool calls now live inline in the message
 * (see ToolInvocations), so this only surfaces the current phase.
 */
/**
 * L'état affiché est DÉRIVÉ des signaux réellement disponibles, jamais déduit
 * d'une absence d'activité (BUG-QA-AGENT-PROGRESS-001).
 *
 * Le composant ne connaissait que `in-progress` et `complete` — le type
 * `ProgressAnnotation` n'a pas d'état d'erreur. Après une erreur TERMINALE, plus
 * aucune annotation n'est `in-progress` et toutes ne sont pas `complete` : il
 * affichait donc la COCHE VERTE et « Terminé » avec la barre figée à 67 %,
 * c'est-à-dire un succès qui ne vérifie pas ce qu'il annonce.
 *
 * `streaming` et `failed` viennent de l'appelant, qui les connaît (`isStreaming`,
 * `llmErrorAlert`). Règle : on n'affiche « terminé » QUE si tout est réellement
 * complet ; toute autre fin est un état « interrompu » explicite.
 */
export function deriveProgressState({
  completedCount,
  totalCount,
  hasActiveWork,
  streaming,
  failed,
}: {
  completedCount: number;
  totalCount: number;
  hasActiveWork: boolean;
  streaming?: boolean;
  failed?: boolean;
}): 'working' | 'done' | 'interrupted' {
  if (failed) {
    return 'interrupted';
  }

  if (streaming || hasActiveWork) {
    return 'working';
  }

  // Terminé sans erreur ET sans reste : le seul cas où « terminé » est vrai.
  return totalCount > 0 && completedCount === totalCount ? 'done' : 'interrupted';
}

export default function ProgressCompilation({
  data,
  streaming,
  failed,
}: {
  data?: ProgressAnnotation[];
  streaming?: boolean;
  failed?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatResidualsCopy(language);

  const progressList = useMemo(() => {
    if (!data?.length) {
      return [] as ProgressAnnotation[];
    }

    const progressMap = new Map<string, ProgressAnnotation>();

    for (const item of data) {
      const existing = progressMap.get(item.label);

      if (existing && existing.status === 'complete') {
        continue;
      }

      progressMap.set(item.label, item);
    }

    return Array.from(progressMap.values()).sort((a, b) => a.order - b.order);
  }, [data]);

  if (progressList.length === 0) {
    return null;
  }

  const completedCount = progressList.filter((item) => item.status === 'complete').length;
  const totalCount = progressList.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasActiveWork = progressList.some((item) => item.status === 'in-progress');
  const state = deriveProgressState({ completedCount, totalCount, hasActiveWork, streaming, failed });
  const activeItem = progressList.find((item) => item.status === 'in-progress') ?? progressList.at(-1);
  const localizedMessage = localizePersistedProgressMessage(activeItem?.message, language);

  const phase =
    state === 'working'
      ? formatPhase(localizedMessage, copy['chatResiduals.progress.working'])
      : state === 'done'
        ? copy['chatResiduals.progress.done']
        : copy['chatResiduals.progress.interrupted'];

  const formattedPercent = formatChatResidualsNumber(progressPercent, language);

  return (
    <div
      className="bolt-agent-statusline relative flex items-center gap-2 w-full px-3 py-1.5 text-xs border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1"
      role="status"
      aria-live="polite"
      aria-label={
        state === 'interrupted'
          ? formatChatResidualsCopy(copy['chatResiduals.progress.ariaInterrupted'], { percent: formattedPercent })
          : formatChatResidualsCopy(copy['chatResiduals.progress.aria'], { phase, percent: formattedPercent })
      }
      data-active-work={state === 'working' ? 'true' : 'false'}
      data-progress-state={state}
    >
      <span
        className={`${
          state === 'working'
            ? 'i-svg-spinners:90-ring-with-bg text-bolt-elements-item-contentAccent'
            : state === 'done'
              ? 'i-ph:check-circle-fill text-emerald-500'
              : 'i-ph:warning-circle-fill text-amber-500'
        } text-sm shrink-0`}
        aria-hidden
      />
      <span className="shrink-0 font-medium text-bolt-elements-textPrimary">
        {copy['chatResiduals.progress.agent']}
      </span>
      <span className="text-bolt-elements-textSecondary truncate">· {phase}</span>
      <span className="[margin-inline-start:auto] shrink-0 tabular-nums text-bolt-elements-textSecondary">
        {formatChatResidualsCopy(copy['chatResiduals.progress.percent'], { percent: formattedPercent })}
      </span>
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-bolt-elements-background-depth-3"
        aria-hidden
      >
        <span
          className={`block h-full transition-[width] duration-300 ${
            state === 'interrupted' ? 'bg-amber-500' : 'bg-bolt-elements-item-contentAccent'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </span>
    </div>
  );
}

function formatPhase(message: string | undefined, fallback: string) {
  return (message ?? '').replace(/\s+/g, ' ').trim() || fallback;
}
