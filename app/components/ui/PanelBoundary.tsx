import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getErrorSurfacesCopy } from '~/lib/i18n/catalogs/error-surfaces';
import { logStore } from '~/lib/stores/logs';

interface PanelBoundaryProps {
  title: string;
  level?: 'app' | 'zone' | 'panel';
  boundaryId?: string;
  projectId?: string;
  userId?: string | null;
  sessionId?: string | null;
  autoRetry?: boolean;
  maxAutoRetries?: number;
  retryDelayMs?: number;
  getSnapshot?: () => Record<string, unknown>;
  children: ReactNode;
}

interface PanelBoundaryState {
  error?: Error;
  retryCount: number;
  reported: boolean;
}

interface PanelBoundaryImplementationProps extends PanelBoundaryProps {
  language?: string | null;
}

class PanelBoundaryImplementation extends Component<PanelBoundaryImplementationProps, PanelBoundaryState> {
  state: PanelBoundaryState = { retryCount: 0, reported: false };
  #retryTimer?: number;

  static getDerivedStateFromError(error: Error): Partial<PanelBoundaryState> {
    return { error, reported: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.#report(error, errorInfo, 'caught');

    const maxAutoRetries = this.props.maxAutoRetries ?? 1;
    const shouldAutoRetry = this.props.autoRetry !== false && this.state.retryCount < maxAutoRetries;

    if (shouldAutoRetry && typeof window !== 'undefined') {
      this.#retryTimer = window.setTimeout(() => {
        this.setState((state) => ({
          error: undefined,
          retryCount: state.retryCount + 1,
          reported: false,
        }));
      }, this.props.retryDelayMs ?? 1000);
    }
  }

  componentWillUnmount() {
    if (this.#retryTimer && typeof window !== 'undefined') {
      window.clearTimeout(this.#retryTimer);
    }
  }

  #boundaryLevel() {
    return this.props.level ?? 'panel';
  }

  #report(error: Error, errorInfo?: ErrorInfo, source: 'caught' | 'manual' = 'manual') {
    const level = this.#boundaryLevel();
    const boundaryId = this.props.boundaryId ?? this.props.title.toLowerCase().replace(/\s+/g, '-');
    const snapshot = safeSnapshot(this.props.getSnapshot);
    const sessionId = this.props.sessionId ?? getBrowserSessionId();

    console.error(`[${level}Boundary] ${this.props.title} crashed`, error, errorInfo);
    logStore.logError(`${this.props.title} ${level} boundary crashed`, error, {
      boundaryId,
      level,
      projectId: this.props.projectId,
      userId: this.props.userId ?? undefined,
      sessionId,
      source,
      retryCount: this.state.retryCount,
      componentStack: errorInfo?.componentStack,
      snapshot,
    });
  }

  render() {
    if (this.state.error) {
      const level = this.#boundaryLevel();
      const copy = getErrorSurfacesCopy(this.props.language);

      return (
        <section
          className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-bolt-elements-background-depth-1 p-6 text-center"
          role="alert"
          aria-live="polite"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-orange-400/30 bg-orange-400/10 text-orange-300">
            <span className="i-ph:warning-duotone text-2xl" aria-hidden />
          </div>
          <div className="max-w-sm">
            <h2 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
              {copy[`panelBoundary.title.${level}`]}
            </h2>
            <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">
              {copy['panelBoundary.body']}
            </p>
          </div>
          {this.state.retryCount === 0 && this.props.autoRetry !== false ? (
            <p className="text-[11px] text-bolt-elements-textTertiary">{copy['panelBoundary.retrying']}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="min-h-11 min-w-11 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
              onClick={() => this.setState({ error: undefined, reported: false })}
            >
              {copy[`panelBoundary.reload.${level}`]}
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 whitespace-normal rounded-md px-3 py-2 text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
              onClick={() => {
                if (this.state.error) {
                  this.#report(this.state.error, undefined, 'manual');
                  this.setState({ reported: true });
                }
              }}
            >
              {this.state.reported ? copy['panelBoundary.reported'] : copy['panelBoundary.report']}
            </button>
          </div>
        </section>
      );
    }

    /*
     * Key the subtree on retryCount so clearing the error (auto-retry or the
     * manual "Reload" button) fully remounts children rather than re-rendering
     * the identical failing element in place. Without the key, a deterministic
     * mount/init error would re-throw immediately and the retry would be a
     * no-op; remounting gives the child a clean lifecycle to recover.
     */
    return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
  }
}

export function PanelBoundary(props: PanelBoundaryProps) {
  const { i18n } = useTranslation();

  return <PanelBoundaryImplementation {...props} language={i18n.resolvedLanguage ?? i18n.language} />;
}

export function AppErrorBoundary(props: Omit<PanelBoundaryProps, 'level'>) {
  return <PanelBoundary {...props} level="app" />;
}

export function ZoneErrorBoundary({
  zone,
  ...props
}: Omit<PanelBoundaryProps, 'level' | 'title'> & { zone: string; title?: string }) {
  return <PanelBoundary {...props} title={props.title ?? zone} level="zone" boundaryId={props.boundaryId ?? zone} />;
}

export function PanelErrorBoundary({
  panel,
  ...props
}: Omit<PanelBoundaryProps, 'level' | 'title'> & { panel: string; title?: string }) {
  return <PanelBoundary {...props} title={props.title ?? panel} level="panel" boundaryId={props.boundaryId ?? panel} />;
}

function safeSnapshot(getSnapshot?: () => Record<string, unknown>) {
  if (!getSnapshot) {
    return undefined;
  }

  try {
    return sanitizeSnapshot(getSnapshot());
  } catch (error) {
    return {
      snapshotError: error instanceof Error ? error.message : 'Unable to capture boundary snapshot',
    };
  }
}

function sanitizeSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeSnapshot(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/token|secret|password|api[-_]?key|authorization/i.test(key))
      .slice(0, 50)
      .map(([key, entry]) => [key, typeof entry === 'object' ? sanitizeSnapshot(entry) : entry]),
  );
}

function getBrowserSessionId() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const key = 'vibecore-error-boundary-session-id';
    const existing = window.sessionStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, next);

    return next;
  } catch {
    return undefined;
  }
}

export function PanelLoading({ title }: { title: string }) {
  const { i18n } = useTranslation();
  const copy = getErrorSurfacesCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <section
      className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-bolt-elements-background-depth-1 p-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-xs space-y-4">
        <div
          className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-bolt-elements-borderColor border-t-bolt-elements-textPrimary motion-reduce:animate-none"
          aria-hidden="true"
        />
        <div>
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">{title}</p>
          <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">
            {copy['panelBoundary.loading']}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-bolt-elements-loader-progress" />
        </div>
        <div className="grid gap-2" aria-hidden>
          <div className="h-2 rounded bg-bolt-elements-background-depth-3" />
          <div className="h-2 w-5/6 rounded bg-bolt-elements-background-depth-3" />
          <div className="h-2 w-2/3 rounded bg-bolt-elements-background-depth-3" />
        </div>
      </div>
    </section>
  );
}
