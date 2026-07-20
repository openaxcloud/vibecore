import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AlertTriangle, Cpu, Gauge, HardDrive, MemoryStick, RefreshCw } from 'lucide-react';
import { Component, Fragment, useEffect, useState, type ReactNode } from 'react';
import styles from './ProjectResourcesPopover.module.scss';
import {
  projectResourcesUrl,
  resolveProjectResources,
  type ProjectResourceKey,
  type ProjectResourcesSnapshot,
} from '~/lib/project-resources';

type ResourcesPanelState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: ProjectResourcesSnapshot }
  | { kind: 'error'; message: string };

const PROJECT_RESOURCE_ICONS = {
  cpu: Cpu,
  memory: MemoryStick,
  storage: HardDrive,
} satisfies Record<ProjectResourceKey, typeof Cpu>;

function payloadMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const error = (payload as Record<string, unknown>).error;

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;

    return typeof message === 'string' && message.trim() ? message.trim() : undefined;
  }

  return undefined;
}

async function rejectedResponseMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => undefined);

  return payloadMessage(payload) ?? `The resources request failed with status ${response.status}.`;
}

function ResourcesSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Loading project resources">
      <span className="sr-only">Loading project resources…</span>
      {[0, 1, 2].map((item) => (
        <div className={styles.skeletonCard} key={item} aria-hidden>
          <span className={styles.skeletonIcon} />
          <span className={styles.skeletonLine} />
          <span className={styles.skeletonValue} />
          <span className={styles.skeletonDetail} />
        </div>
      ))}
    </div>
  );
}

function ResourcesError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.errorState} role="alert">
      <span className={styles.errorIcon} aria-hidden>
        <AlertTriangle />
      </span>
      <div>
        <strong>Resources unavailable</strong>
        <p>{message}</p>
      </div>
      <button
        type="button"
        className={styles.retryButton}
        aria-label="Retry loading project resources"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden />
        Retry
      </button>
    </div>
  );
}

function ResourcesMetrics({ snapshot }: { snapshot: ProjectResourcesSnapshot }) {
  return (
    <>
      <div className={styles.sourceStatus} data-available={snapshot.runtimeStatusAvailable ? 'true' : 'false'}>
        <span className={styles.sourceDot} aria-hidden />
        <span>
          {snapshot.runtimeStatusAvailable ? `Runtime ${snapshot.runtimeStatus}` : 'Runtime status unavailable'}
        </span>
        {snapshot.workspaceId ? <code title={snapshot.workspaceId}>{snapshot.workspaceId}</code> : null}
      </div>
      <ul className={styles.metricGrid} aria-label="Project resource measurements">
        {snapshot.metrics.map((metric) => {
          const Icon = PROJECT_RESOURCE_ICONS[metric.key];

          return (
            <li
              className={styles.metricCard}
              data-availability={metric.availability}
              data-testid={`project-resource-${metric.key}`}
              key={metric.key}
            >
              <div className={styles.metricHeading}>
                <span className={styles.metricIcon} aria-hidden>
                  <Icon />
                </span>
                <span>{metric.label}</span>
              </div>
              <output className={styles.metricValue}>{metric.value}</output>
              <p>{metric.detail}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ProjectResourcesPanel({ projectId, workspaceId }: { projectId: string; workspaceId?: string }) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<ResourcesPanelState>({ kind: 'loading' });

  useEffect(() => {
    const abortController = new AbortController();

    setState({ kind: 'loading' });

    void fetch(projectResourcesUrl(projectId, workspaceId), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await rejectedResponseMessage(response));
        }

        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!abortController.signal.aborted) {
          setState({ kind: 'ready', snapshot: resolveProjectResources(payload) });
        }
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'The project resources request failed.',
        });
      });

    return () => abortController.abort();
  }, [projectId, requestVersion, workspaceId]);

  const retry = () => {
    setState({ kind: 'loading' });
    setRequestVersion((version) => version + 1);
  };

  return (
    <section
      className={styles.panel}
      aria-busy={state.kind === 'loading' ? 'true' : undefined}
      aria-labelledby="project-resources-title"
      data-testid="project-resources-panel"
    >
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden>
          <Gauge />
        </span>
        <div>
          <h2 id="project-resources-title">Resources</h2>
          <p>Measurements from this project’s monitoring sources</p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          aria-label="Refresh project resources"
          title="Refresh project resources"
          disabled={state.kind === 'loading'}
          onClick={retry}
        >
          <RefreshCw className={state.kind === 'loading' ? styles.spinning : undefined} aria-hidden />
        </button>
      </header>

      {state.kind === 'loading' ? <ResourcesSkeleton /> : null}
      {state.kind === 'error' ? <ResourcesError message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <ResourcesMetrics snapshot={state.snapshot} /> : null}

      <p className={styles.disclosure}>No estimated usage is shown. Missing telemetry stays explicitly unavailable.</p>
    </section>
  );
}

class ProjectResourcesErrorBoundary extends Component<{ children: ReactNode }, { error?: Error; retryKey: number }> {
  state: { error?: Error; retryKey: number } = { retryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <section className={styles.panel} aria-label="Resources">
          <ResourcesError
            message="The Resources panel encountered an unexpected rendering error."
            onRetry={() => this.setState((state) => ({ error: undefined, retryKey: state.retryKey + 1 }))}
          />
        </section>
      );
    }

    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}

export function ProjectResourcesPopover({
  projectId,
  projectName,
  workspaceId,
  triggerTestId = 'project-resources-trigger',
}: {
  projectId: string;
  projectName: string;
  workspaceId?: string;
  triggerTestId?: string;
}) {
  const [open, setOpen] = useState(false);

  /*
   * The Project Editor registers several global keyboard layers. Keep Escape
   * deterministic even when one of those layers handles the key before Radix's
   * dismissable layer, while still allowing the event to reach other overlays.
   */
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape, true);

    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [open]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`Resources for ${projectName}`}
          title={`Resources for ${projectName}`}
          data-testid={triggerTestId}
        >
          <Gauge aria-hidden />
          <span>Resources</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={5}
          collisionPadding={12}
          hideWhenDetached
          className={styles.popover}
          aria-label={`Resources for ${projectName}`}
          data-testid="project-resources-popover"
          onEscapeKeyDown={() => setOpen(false)}
        >
          <ProjectResourcesErrorBoundary>
            <ProjectResourcesPanel projectId={projectId} workspaceId={workspaceId} />
          </ProjectResourcesErrorBoundary>
          <PopoverPrimitive.Arrow className={styles.arrow} aria-hidden />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
