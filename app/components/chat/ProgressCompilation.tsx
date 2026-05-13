import { AnimatePresence, motion } from 'framer-motion';
import React, { useMemo, useState } from 'react';
import type { ProgressAnnotation } from '~/types/context';
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

  if (progressList.length === 0) {
    return null;
  }

  const completedCount = progressList.filter((item) => item.status === 'complete').length;
  const activeItem = progressList.find((item) => item.status === 'in-progress') ?? progressList.at(-1);
  const visibleItems = expanded ? progressList : activeItem ? [activeItem] : [];

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
              {completedCount}/{progressList.length} done
              {activeItem && activeItem.status === 'in-progress' ? ` · ${formatToolLabel(activeItem.message)}` : ''}
            </small>
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
              <ProgressItem key={item.label} progress={item} timing={toolTimings[item.label]} />
            ))}
          </motion.div>
        </AnimatePresence>
      </section>
    </AnimatePresence>
  );
}

const ProgressItem = ({ progress, timing }: { progress: ProgressAnnotation; timing?: ToolTiming }) => {
  const status = STATUS_LABELS[progress.status];
  const elapsedMs = timing ? (timing.completedAt ?? Date.now()) - timing.startedAt : 0;

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
