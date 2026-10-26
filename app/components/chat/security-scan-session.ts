export type SecurityScanStatus = 'idle' | 'running' | 'completed' | 'timeout' | 'cancelled' | 'failed';
export type SecurityScanSnapshot = {
  status: SecurityScanStatus;
  progress: number;
  message?: string;
  startedAt?: number;
  refreshRevision: number;
};
export type SecurityScanMessages = {
  preparing: string;
  timeout: string;
  cancelled: string;
  failed: string;
  completed: string;
  missingProject: string;
};

export const SECURITY_SCAN_TIMEOUT_MS = 90_000;

/** One transient scan per IDE scope; no credentials or state are persisted. */
export function createSecurityScanSession(projectId?: string, fetcher: typeof fetch = fetch) {
  let snapshot: SecurityScanSnapshot = { status: 'idle', progress: 0, refreshRevision: 0 };

  const listeners = new Set<() => void>();

  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let generation = 0;
  let claimedRefresh = 0;
  let activeMessages: SecurityScanMessages | undefined;

  const publish = (next: SecurityScanSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const clearTimers = () => {
    clearTimeout(deadline);
    clearInterval(progressTimer);
    deadline = undefined;
    progressTimer = undefined;
  };
  const cancel = () => {
    if (!controller) {
      return;
    }

    const active = controller;
    controller = undefined;
    generation += 1;
    clearTimers();
    active.abort();
    publish({
      status: 'cancelled',
      progress: 0,
      message: activeMessages?.cancelled,
      refreshRevision: snapshot.refreshRevision,
    });
  };

  return {
    projectId,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    claimRefresh: (revision: number) => {
      if (revision <= claimedRefresh) {
        return false;
      }

      claimedRefresh = revision;

      return true;
    },
    cancel,
    dispose: cancel,
    async run(body: FormData, messages: SecurityScanMessages) {
      // Repeated clicks must not submit the same scan twice.
      if (controller) {
        return;
      }

      if (!projectId) {
        publish({
          status: 'failed',
          progress: 0,
          message: messages.missingProject,
          refreshRevision: snapshot.refreshRevision,
        });
        return;
      }

      const active = new AbortController();
      const runGeneration = ++generation;
      controller = active;
      activeMessages = messages;

      const startedAt = Date.now();
      const current = () => controller === active && generation === runGeneration;

      const finish = (status: SecurityScanStatus, message: string, refresh = false) => {
        if (!current()) {
          return;
        }

        controller = undefined;
        clearTimers();
        publish({ status, progress: 100, message, refreshRevision: snapshot.refreshRevision + Number(refresh) });
      };

      publish({
        status: 'running',
        progress: 8,
        startedAt,
        message: messages.preparing,
        refreshRevision: snapshot.refreshRevision,
      });
      progressTimer = setInterval(() => {
        if (current()) {
          publish({
            ...snapshot,
            progress: Math.max(
              snapshot.progress,
              Math.min(94, 8 + Math.round(((Date.now() - startedAt) / SECURITY_SCAN_TIMEOUT_MS) * 84)),
            ),
            message: undefined,
          });
        }
      }, 800);
      deadline = setTimeout(() => {
        if (current()) {
          finish('timeout', messages.timeout);
          active.abort();
        }
      }, SECURITY_SCAN_TIMEOUT_MS);

      try {
        const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/security`, {
          method: 'POST',
          body,
          signal: active.signal,
        });

        const result = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          scan?: { status?: string };
        };

        if (!current()) {
          return;
        }

        if (!response.ok || result.ok !== true || result.scan?.status !== 'completed') {
          finish('failed', result.error || messages.failed, true);
          return;
        }

        finish('completed', messages.completed, true);
      } catch {
        if (current()) {
          finish('failed', messages.failed);
        }
      }
    },
  };
}

export type SecurityScanSession = ReturnType<typeof createSecurityScanSession>;
