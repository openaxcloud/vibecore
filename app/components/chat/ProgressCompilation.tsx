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
export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
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
  const activeItem = progressList.find((item) => item.status === 'in-progress') ?? progressList.at(-1);
  const localizedMessage = localizePersistedProgressMessage(activeItem?.message, language);

  const phase = hasActiveWork
    ? formatPhase(localizedMessage, copy['chatResiduals.progress.working'])
    : copy['chatResiduals.progress.done'];

  const formattedPercent = formatChatResidualsNumber(progressPercent, language);

  return (
    <div
      className="bolt-agent-statusline relative flex items-center gap-2 w-full px-3 py-1.5 text-xs border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1"
      role="status"
      aria-live="polite"
      aria-label={formatChatResidualsCopy(copy['chatResiduals.progress.aria'], {
        phase,
        percent: formattedPercent,
      })}
      data-active-work={hasActiveWork ? 'true' : 'false'}
    >
      <span
        className={`${hasActiveWork ? 'i-svg-spinners:90-ring-with-bg text-bolt-elements-item-contentAccent' : 'i-ph:check-circle-fill text-emerald-500'} text-sm shrink-0`}
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
          className="block h-full bg-bolt-elements-item-contentAccent transition-[width] duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </span>
    </div>
  );
}

function formatPhase(message: string | undefined, fallback: string) {
  return (message ?? '').replace(/\s+/g, ' ').trim() || fallback;
}
