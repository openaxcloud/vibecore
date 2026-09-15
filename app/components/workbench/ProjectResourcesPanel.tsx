import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  cpuRatio,
  formatBytes,
  formatCpu,
  usageRatio,
  usageTone,
  type WorkspaceResourceSnapshot,
} from './workspace-resources-format';

/**
 * RPL-IDE-001.7 — Resources panel: real RAM, CPU and Storage for the workspace
 * backing this Project Editor, sitting beside the app name in the topbar.
 *
 * The figures come from the workspace container's own cgroup accounting and the
 * workspace volume's statfs (see `services/workspace-agent/src/workspace-resources.ts`).
 * Anything that cannot be measured is rendered as "not available" rather than as
 * a zero — a 0 %-full bar is a claim about the workspace, and it would be a
 * false one.
 */

/** Poll cadence while the popover is open. Idle = no polling at all. */
const REFRESH_MS = 5_000;

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

export function ProjectResourcesPanel({
  projectId,
  workspaceId,
  className,
}: {
  projectId: string;
  workspaceId?: string | null;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>('idle');
  const [snapshot, setSnapshot] = useState<WorkspaceResourceSnapshot | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  /*
   * The popover is portalled to <body> and positioned from the trigger's rect.
   *
   * It cannot live in the normal flow: the topbar slot it sits in
   * (`.bolt-project-topbar-left`) is 32 px tall with `overflow: hidden`, so an
   * absolutely-positioned panel hanging below the trigger was clipped to
   * nothing — the button lit up and no panel appeared. Measured live at 1440:
   * popover 280×94 at y=37 inside a 32 px clipping ancestor.
   */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);

      return undefined;
    }

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const width = popoverRef.current?.offsetWidth ?? 280;

      /*
       * Keep the panel on screen on narrow viewports rather than letting it
       * hang off the right edge.
       */
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

      setAnchor({ top: rect.bottom + 6, left });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!workspaceId) {
        setState('unavailable');
        return;
      }

      setState((current) => (current === 'ready' ? current : 'loading'));

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/resources?workspaceId=${encodeURIComponent(workspaceId)}`,
          { signal, headers: { accept: 'application/json' } },
        );

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          resources?: WorkspaceResourceSnapshot | null;
        } | null;

        if (!response.ok || !payload?.ok || !payload.resources) {
          setSnapshot(null);
          setState('unavailable');

          return;
        }

        setSnapshot(payload.resources);
        setState('ready');
      } catch (error) {
        if ((error as { name?: string } | undefined)?.name === 'AbortError') {
          return;
        }

        setSnapshot(null);
        setState('unavailable');
      }
    },
    [projectId, workspaceId],
  );

  /*
   * Only poll while the popover is open. A workspace resource read wakes the
   * agent and samples the CPU for 200 ms; doing that every few seconds for every
   * open IDE tab, forever, would be a real cost for a panel nobody is looking at.
   */
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const controller = new AbortController();
    void load(controller.signal);

    const timer = window.setInterval(() => void load(controller.signal), REFRESH_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      // The panel is portalled out of this subtree, so it has to be checked too.
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open]);

  const memoryRatio = usageRatio(snapshot?.memory?.usedBytes ?? 0, snapshot?.memory?.limitBytes);
  const storageRatio = usageRatio(snapshot?.storage?.usedBytes ?? 0, snapshot?.storage?.totalBytes);
  const processorRatio = cpuRatio(snapshot?.cpu ?? null);

  const cpuLabel = formatCpu(snapshot?.cpu ?? null, locale, (cores) => t('workspaceResources.cores', { count: cores }));

  /*
   * The collapsed trigger states the single most actionable number it has:
   * memory pressure if a limit exists, else CPU. It never invents one.
   */
  const summary =
    memoryRatio !== null
      ? `${Math.round(memoryRatio)} %`
      : processorRatio !== null
        ? `${Math.round(processorRatio)} %`
        : null;

  const label = t('workspaceResources.title');

  return (
    <div className={`vc-resources ${className ?? ''}`.trim()} ref={containerRef} data-testid="project-resources">
      <button
        ref={triggerRef}
        type="button"
        className="vc-resources-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid="project-resources-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="i-ph:gauge vc-resources-trigger-icon" aria-hidden />
        <span className="vc-resources-trigger-text">{label}</span>
        {summary ? (
          <span className="vc-resources-trigger-value" data-testid="project-resources-summary">
            {summary}
          </span>
        ) : null}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="vc-resources-popover"
              role="dialog"
              aria-label={label}
              data-testid="project-resources-popover"
              style={anchor ? { top: `${anchor.top}px`, left: `${anchor.left}px` } : { visibility: 'hidden' }}
            >
              <div className="vc-resources-popover-head">
                <strong>{label}</strong>
                <button
                  type="button"
                  className="vc-resources-refresh"
                  aria-label={t('workspaceResources.refresh')}
                  title={t('workspaceResources.refresh')}
                  onClick={() => void load()}
                >
                  <span className="i-ph:arrows-clockwise" aria-hidden />
                </button>
              </div>

              {state === 'loading' && !snapshot ? (
                <p className="vc-resources-state" data-testid="project-resources-loading">
                  {t('workspaceResources.loading')}
                </p>
              ) : null}

              {state === 'unavailable' ? (
                <p className="vc-resources-state" role="status" data-testid="project-resources-unavailable">
                  {t('workspaceResources.unavailable')}
                </p>
              ) : null}

              {snapshot ? (
                <dl className="vc-resources-list">
                  <ResourceRow
                    testId="project-resources-memory"
                    label={t('workspaceResources.memory')}
                    ratio={memoryRatio}
                    value={
                      snapshot.memory
                        ? snapshot.memory.limitBytes !== null
                          ? `${formatBytes(snapshot.memory.usedBytes, locale)} / ${formatBytes(snapshot.memory.limitBytes, locale)}`
                          : t('workspaceResources.usedNoLimit', {
                              used: formatBytes(snapshot.memory.usedBytes, locale),
                            })
                        : null
                    }
                    emptyLabel={t('workspaceResources.notMeasured')}
                  />
                  <ResourceRow
                    testId="project-resources-cpu"
                    label={t('workspaceResources.cpu')}
                    ratio={processorRatio}
                    value={cpuLabel}
                    emptyLabel={t('workspaceResources.notMeasured')}
                  />
                  <ResourceRow
                    testId="project-resources-storage"
                    label={t('workspaceResources.storage')}
                    ratio={storageRatio}
                    value={
                      snapshot.storage
                        ? `${formatBytes(snapshot.storage.usedBytes, locale)} / ${formatBytes(snapshot.storage.totalBytes, locale)}`
                        : null
                    }
                    emptyLabel={t('workspaceResources.notMeasured')}
                  />
                </dl>
              ) : null}

              {snapshot?.capturedAt ? (
                <p className="vc-resources-captured">
                  {t('workspaceResources.capturedAt', {
                    time: new Date(snapshot.capturedAt).toLocaleTimeString(locale),
                  })}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ResourceRow({
  label,
  value,
  ratio,
  emptyLabel,
  testId,
}: {
  label: string;
  value: string | null;
  ratio: number | null;
  emptyLabel: string;
  testId: string;
}) {
  const tone = usageTone(ratio);

  return (
    <div className="vc-resources-row" data-testid={testId} data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value ?? emptyLabel}</dd>
      {/*
        No bar at all when there is no ratio: an empty track would read as
        "0 % used" rather than as "not measured".
      */}
      {ratio !== null ? (
        <div
          className="vc-resources-bar"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio)}
          aria-valuetext={value ?? undefined}
        >
          <span style={{ width: `${ratio}%` }} />
        </div>
      ) : null}
    </div>
  );
}
