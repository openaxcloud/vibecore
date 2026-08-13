/**
 * Live plan-first checklist rendered inside an assistant message (Sprint 5).
 *
 * Takes a parsed `PlanChecklist` (from `parsePlanChecklist`) and renders
 * each item with a status badge + optional result line. The header shows
 * a progress bar driven by `summarizePlanProgress`. Pure presentational
 * — no internal state; the caller owns updates.
 */

import { memo, useState } from 'react';

import { summarizePlanProgress, type PlanChecklist, type PlanItemStatus } from '~/lib/chat/plan-checklist';
import { t, type TranslationKey } from '~/lib/i18n/dictionary';

const STATUS_LABEL_KEY: Record<PlanItemStatus, TranslationKey> = {
  pending: 'plan.statusPending',
  in_progress: 'plan.statusInProgress',
  completed: 'plan.statusCompleted',
  failed: 'plan.statusFailed',
};

const STATUS_ICON: Record<PlanItemStatus, string> = {
  pending: 'i-ph:circle',
  in_progress: 'i-svg-spinners:90-ring-with-bg',
  completed: 'i-ph:check-circle-fill',
  failed: 'i-ph:warning-circle-fill',
};

export interface PlanChecklistProps {
  plan: PlanChecklist;
}

export const PlanChecklistView = memo(({ plan }: PlanChecklistProps) => {
  const progress = summarizePlanProgress(plan);
  const percent = Math.round(progress.completionRatio * 100);

  /*
   * Collapsed by default (agent-panel UX refonte): the plan is an inline event
   * summarised on one line — "✓ Plan · 3/5 ▸" — that expands on tap, so it no
   * longer pushes the agent's streamed answer off-screen. The expanded body is
   * the existing checklist (unchanged), preserving the desktop design.
   */
  const [expanded, setExpanded] = useState(false);
  const allDone = progress.total > 0 && progress.completed === progress.total && progress.failed === 0;

  return (
    <section className="bolt-plan-checklist" aria-label="Plan checklist">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs rounded-md bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-artifacts-backgroundHover"
      >
        <span
          className={`${allDone ? 'i-ph:check-circle-fill text-emerald-500' : 'i-ph:list-checks text-bolt-elements-item-contentAccent'} text-base shrink-0`}
          aria-hidden
        />
        <span className="font-medium text-bolt-elements-textPrimary truncate">{plan.title || 'Plan'}</span>
        <span className="text-bolt-elements-textSecondary shrink-0">
          · {progress.completed}/{progress.total}
          {progress.failed > 0 ? ` · ${progress.failed} failed` : ''}
        </span>
        <span
          className={`[margin-inline-start:auto] shrink-0 ${expanded ? 'i-ph:caret-down' : 'i-ph:caret-right'} text-bolt-elements-textSecondary`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <>
          <header className="bolt-plan-checklist-header">
            {plan.title ? <h3 className="bolt-plan-checklist-title">{plan.title}</h3> : null}
            <div className="bolt-plan-checklist-progress" role="group" aria-label="Plan progress">
              <span className="bolt-plan-checklist-progress-label">
                {progress.failed > 0
                  ? t('plan.progressLabelWithFailed', {
                      completed: progress.completed,
                      total: progress.total,
                      failed: progress.failed,
                    })
                  : t('plan.progressLabel', { completed: progress.completed, total: progress.total })}
              </span>
              <div
                className="bolt-plan-checklist-progress-bar"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="bolt-plan-checklist-progress-bar-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </header>
          <ol className="bolt-plan-checklist-items">
            {plan.items.map((item) => (
              <li
                key={item.id}
                className="bolt-plan-checklist-item"
                data-status={item.status}
                aria-label={`${item.description}, ${t(STATUS_LABEL_KEY[item.status])}`}
              >
                <span className={`${STATUS_ICON[item.status]} bolt-plan-checklist-icon`} aria-hidden />
                <span className="bolt-plan-checklist-description">{item.description}</span>
                <span className="bolt-plan-checklist-status">{t(STATUS_LABEL_KEY[item.status])}</span>
                {item.result ? <span className="bolt-plan-checklist-result">{item.result}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
});

PlanChecklistView.displayName = 'PlanChecklistView';
