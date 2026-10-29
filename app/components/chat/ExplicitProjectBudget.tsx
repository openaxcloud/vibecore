import { useEffect, useState } from 'react';
import { explicitBudgetSummarySchema, type ExplicitBudgetSummary } from '~/lib/chat/explicit-budget-summary';
import { formatChatControlsCopy, getChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';

/** Mounted only while the explicit model sheet is open; no reservation or provider call. */
export function ExplicitProjectBudget({ projectId, language }: { projectId: string; language?: string }) {
  const copy = getChatControlsCopy(language);
  const [state, setState] = useState<{ projectId: string; value?: ExplicitBudgetSummary; failed?: boolean }>();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);

    const timeout = setTimeout(() => {
      setState({ projectId, failed: true });
      controller.abort();
    }, 10000);

    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/explicit-budget`, {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error();
        }

        const parsed = explicitBudgetSummarySchema.safeParse(await response.json());

        if (!parsed.success) {
          throw new Error();
        }

        if (!controller.signal.aborted) {
          setState({ projectId, value: parsed.data });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ projectId, failed: true });
        }
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [projectId, refresh]);

  const current = state?.projectId === projectId ? state : undefined;

  const money = (micros: number) =>
    new Intl.NumberFormat(language || 'en', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(micros / 1000000);

  return (
    <div className="mt-2 text-xs text-bolt-elements-textSecondary" role="status" aria-live="polite">
      {!current
        ? copy['chatControls.power.budgetLoading']
        : current.failed || !current.value
          ? copy['chatControls.power.budgetUnavailable']
          : formatChatControlsCopy(copy['chatControls.power.budgetBalance'], {
              reserved: money(current.value.reservedMicros),
              remaining: money(current.value.remainingMicros),
            })}
      <p>{copy['chatControls.power.budgetHistoryUnknown']}</p>
      <button
        type="button"
        className="mt-1 underline"
        disabled={!current}
        onClick={() => setRefresh((value) => value + 1)}
      >
        {copy['chatControls.power.budgetRefresh']}
      </button>
    </div>
  );
}
