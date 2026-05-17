/**
 * Live plan-first checklist rendered inside an assistant message (Sprint 5).
 *
 * Takes a parsed `PlanChecklist` (from `parsePlanChecklist`) and renders
 * each item with a status badge + optional result line. The header shows
 * a progress bar driven by `summarizePlanProgress`. Pure presentational
 * — no internal state; the caller owns updates.
 */

import { memo } from 'react';

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

  return (
    <section className="bolt-plan-checklist" aria-label="Plan checklist">
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
    </section>
  );
});

PlanChecklistView.displayName = 'PlanChecklistView';
