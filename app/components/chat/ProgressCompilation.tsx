import { AnimatePresence, motion } from 'framer-motion';
import React, { useMemo, useState } from 'react';
import type { ProgressAnnotation } from '~/types/context';
import { estimateETA, formatDuration } from '~/utils/agent-progress';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

type ToolTiming = {
  startedAt: number;
  completedAt?: number;
};

const STATUS_LABELS: Record<ProgressAnnotation['status'], string> = {
  'in-progress': 'running',
  complete: 'done',
};

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [expanded, setExpanded] = useState(false);
  const [toolTimings, setToolTimings] = React.useState<Record<string, ToolTiming>>({});
  const [now, setNow] = useState(() => Date.now());

  const progressList = useMemo(() => {
    if (!data?.length) {
      return [];
    }

    const progressMap = new Map<string, ProgressAnnotation>();

    for (const item of data) {
      const existingProgress = progressMap.get(item.label);

      if (existingProgress && existingProgress.status === 'complete') {
        continue;
      }

      progressMap.set(item.label, item);
    }

    return Array.from(progressMap.values()).sort((a, b) => a.order - b.order);
  }, [data]);

  React.useEffect(() => {
    if (progressList.length === 0) {
      setToolTimings({});
      return;
    }

    const now = Date.now();

    setToolTimings((current) => {
      let changed = false;

      const next: Record<string, ToolTiming> = {};

      for (const item of progressList) {
        const existing = current[item.label] ?? { startedAt: now };
        const completedAt = item.status === 'complete' ? (existing.completedAt ?? now) : existing.completedAt;

        next[item.label] = { ...existing, completedAt };

        if (!current[item.label] || current[item.label].completedAt !== completedAt) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [progressList]);

  const hasActiveWork = progressList.some((item) => item.status === 'in-progress');

  React.useEffect(() => {
    if (!hasActiveWork) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [hasActiveWork]);

  if (progressList.length === 0) {
    return null;
  }

  const completedCount = progressList.filter((item) => item.status === 'complete').length;
  const totalCount = progressList.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const activeItem = progressList.find((item) => item.status === 'in-progress') ?? progressList.at(-1);
  const visibleItems = expanded ? progressList : activeItem ? [activeItem] : [];

  const startedAt = Object.values(toolTimings).reduce<number | null>((earliest, timing) => {
    if (!earliest || timing.startedAt < earliest) {
      return timing.startedAt;
    }

    return earliest;
  }, null);

  const elapsedMs = startedAt ? now - startedAt : 0;
  const etaMs = estimateETA(elapsedMs, progressPercent);
  const etaLabel = completedCount === totalCount ? 'complete' : formatDuration(etaMs);

  return (
    <AnimatePresence>
      <section className="bolt-agent-tool-calls" aria-label="Agent tool calls">
        <button
          type="button"
          className="bolt-agent-tool-calls-header"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="bolt-agent-tool-calls-header-icon i-ph:wrench" aria-hidden />
          <span className="bolt-agent-tool-calls-header-copy">
            <strong>Agent tool calls</strong>
            <small>
              {completedCount}/{totalCount} done · {progressPercent}% · ETA {etaLabel}
              {activeItem && activeItem.status === 'in-progress' ? ` · ${formatToolLabel(activeItem.message)}` : ''}
            </small>
            <ProgressBar value={progressPercent} eta={etaLabel} />
          </span>
          <motion.span
            initial={{ rotate: 0 }}
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.15, ease: cubicEasingFn }}
            className="bolt-agent-tool-calls-chevron i-ph:caret-down-bold"
            aria-hidden
          />
        </button>
        <AnimatePresence initial={false}>
          <motion.div
            className="bolt-agent-tool-calls-list"
            initial={false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {visibleItems.map((item) => (
              <ProgressItem key={item.label} progress={item} timing={toolTimings[item.label]} now={now} />
            ))}
          </motion.div>
        </AnimatePresence>
      </section>
    </AnimatePresence>
  );
}

function ProgressBar({ value, eta }: { value: number; eta: string }) {
  const safeValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <span
      className="bolt-agent-tool-progress"
      role="progressbar"
      aria-label={`Agent progress ${safeValue}% complete. ETA ${eta}.`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
    >
      <span className="bolt-agent-tool-progress-fill" style={{ width: `${safeValue}%` }} />
    </span>
  );
}

const ProgressItem = ({
  progress,
  timing,
  now,
}: {
  progress: ProgressAnnotation;
  timing?: ToolTiming;
  now: number;
}) => {
  const status = STATUS_LABELS[progress.status];
  const elapsedMs = timing ? (timing.completedAt ?? now) - timing.startedAt : 0;

  return (
    <motion.div
      className={classNames('bolt-agent-tool-call-row', progress.status === 'complete' && 'is-complete')}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
    >
      <span className="bolt-agent-tool-call-status" data-status={progress.status} aria-hidden>
        {progress.status === 'in-progress' ? (
          <span className="i-svg-spinners:90-ring-with-bg" />
        ) : (
          <span className="i-ph:check-bold" />
        )}
      </span>
      <span className="bolt-agent-tool-call-copy">
        <strong>{formatToolLabel(progress.message)}</strong>
        <small>
          {status} · {formatElapsed(elapsedMs)}
        </small>
      </span>
    </motion.div>
  );
};

function formatToolLabel(message: string) {
  return message.replace(/\s+/g, ' ').trim() || 'Workspace operation';
}

function formatElapsed(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '0.0s';
  }

  const seconds = milliseconds / 1000;

  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }

  return `${Math.round(seconds)}s`;
}
