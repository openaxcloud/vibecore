/**
 * Repair review UI — lists the durable agent self-repair audit log for the
 * current project (backend contract §9, via `fetchAgentRepairEvents`).
 *
 * Distinct from the transient "Self-repair attempt 1/2…" banner on a patch
 * card: this is the persisted history (repaired / failed / gave_up per file,
 * with the validation/repair error), so a user can review what the agent's
 * AST self-repair loop did across reloads. Renders nothing until there is at
 * least one event, so it is zero-impact when self-repair never fired.
 */

import { memo, useCallback, useEffect, useState } from 'react';

import { fetchAgentRepairEvents, type AgentRepairEvent } from '~/lib/persistence/agentRepairEventSync';
import { workspaceEvents } from '~/lib/runtime/workspace-events';

interface AgentRepairHistoryProps {
  projectId: string;
}

const OUTCOME_LABEL: Record<AgentRepairEvent['outcome'], string> = {
  repaired: 'Repaired',
  failed: 'Failed',
  gave_up: 'Gave up',
};

const OUTCOME_CLASS: Record<AgentRepairEvent['outcome'], string> = {
  repaired: 'text-[var(--status-success-text)]',
  failed: 'text-amber-500',
  gave_up: 'text-[var(--status-error-text)]',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const AgentRepairHistory = memo(({ projectId }: AgentRepairHistoryProps) => {
  const [events, setEvents] = useState<AgentRepairEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!projectId) {
      return;
    }

    void fetchAgentRepairEvents(projectId).then(setEvents);
  }, [projectId]);

  useEffect(() => {
    refresh();

    /*
     * Refresh shortly after a new terminal outcome is mirrored to the server.
     * The persistence POST is fire-and-forget, so wait a beat before re-reading
     * to let it land. Coalesce bursts (Apply-all repairs many files) into a
     * single refetch.
     */
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = workspaceEvents.on('agent:self-repair:event', () => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(refresh, 750);
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
      }

      unsubscribe();
    };
  }, [refresh]);

  if (events.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
      aria-label="Agent self-repair history"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-bolt-elements-textPrimary"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={isOpen ? 'i-ph:caret-down' : 'i-ph:caret-right'} aria-hidden />
        <span>Self-repair history</span>
        <span className="rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
          {events.length}
        </span>
      </button>

      {isOpen ? (
        <ul className="divide-y divide-bolt-elements-borderColor border-t border-bolt-elements-borderColor">
          {events.map((event) => (
            <li key={event.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-medium ${OUTCOME_CLASS[event.outcome]}`}>{OUTCOME_LABEL[event.outcome]}</span>
                <span className="font-mono text-xs text-bolt-elements-textPrimary">{event.relativePath}</span>
                <span className="text-xs text-bolt-elements-textSecondary">attempt {event.attempt}</span>
                <span className="ml-auto text-xs text-bolt-elements-textSecondary">{formatTime(event.createdAt)}</span>
              </div>
              {event.validationError ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-bolt-elements-textSecondary">
                  {event.validationError}
                </p>
              ) : null}
              {event.repairError ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-bolt-elements-textSecondary">
                  {event.repairError}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
});

AgentRepairHistory.displayName = 'AgentRepairHistory';
