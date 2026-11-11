/** Bounded diagnostic projection of actual API logs, never a runtime verdict. */
export function summarizeRuntimeApi(log) {
  const packageExecutions = [];
  const pending = new Map();
  const counts = new Map();
  const firstErrors = [];
  const recentErrors = [];
  const ideStateFailures = [];

  let completed = 0;
  let failed = 0;
  let ungrouped = 0;

  for (const line of log.split('\n')) {
    let entry;

    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry?.event === 'package.install.execution') {
      const bounded = (value, max) => (Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null);
      const category = (value, allowed) => (typeof value === 'string' && allowed.includes(value) ? value : 'unknown');
      packageExecutions.push({
        requestedBudgetMs: bounded(entry.requestedBudgetMs, 600_000),
        effectiveBudgetMs: bounded(entry.effectiveBudgetMs, 86_400_000),
        elapsedMs: bounded(entry.elapsedMs, 86_400_000),
        stdoutBytes: bounded(entry.stdoutBytes, 1_073_741_824),
        stderrBytes: bounded(entry.stderrBytes, 1_073_741_824),
        observedPhase: category(entry.observedPhase, ['fetch', 'extract', 'lifecycle']),
        errorCode: category(entry.errorCode, [
          'EAI_AGAIN',
          'ENOTFOUND',
          'ECONNREFUSED',
          'ECONNRESET',
          'ETIMEDOUT',
          'ENOSPC',
          'EACCES',
          'ERESOLVE',
          'E404',
          'E401',
          'E403',
        ]),
        timedOut: typeof entry.timedOut === 'boolean' ? entry.timedOut : null,
        signal:
          entry.signal === null
            ? null
            : category(entry.signal, ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 'SIGSEGV']),
        exitCode: bounded(entry.exitCode, 255),
        ...(entry.installObservation &&
        typeof entry.installObservation === 'object' &&
        !Array.isArray(entry.installObservation)
          ? {
              installObservation: {
                lockfile: category(entry.installObservation.lockfile, ['present', 'absent']),
                nodeModules: category(entry.installObservation.nodeModules, ['present', 'absent']),
                dependencyCount: bounded(entry.installObservation.dependencyCount, 1000),
                devDependencyCount: bounded(entry.installObservation.devDependencyCount, 1000),
                processActivity: category(entry.installObservation.processActivity, [
                  'running',
                  'sleeping',
                  'uninterruptible',
                  'zombie',
                  'exited',
                ]),
                leaderCpuMs: bounded(entry.installObservation.leaderCpuMs, 86_400_000),
                activitySampleAgeMs: bounded(entry.installObservation.activitySampleAgeMs, 86_400_000),
              },
            }
          : {}),
      });

      if (packageExecutions.length > 60) {
        packageExecutions.shift();
      }

      continue;
    }

    const id = entry?.reqId;

    if (typeof id !== 'string') {
      continue;
    }

    const url = typeof entry.req?.url === 'string' ? entry.req.url.split('?')[0] : '';

    const ideCategory = /^\/(?:api\/)?projects\/[^/]+\/ide-state$/.test(url)
      ? 'project-ide-state'
      : /^\/(?:api\/)?workspaces\/[^/]+\/ide-state$/.test(url)
        ? 'workspace-ide-state'
        : undefined;

    if (typeof entry.req?.url === 'string' && (entry.req.url.startsWith('/api/runtime/') || ideCategory)) {
      if (pending.size >= 5000) {
        pending.delete(pending.keys().next().value);
      }

      pending.set(id, {
        method: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(entry.req.method)
          ? entry.req.method
          : 'OTHER',

        // No headers, bodies or query tokens enter this projection.
        ...(ideCategory ? { category: ideCategory } : { path: url.slice(0, 300) }),
      });
    }

    const status = entry.statusCode ?? entry.res?.statusCode;
    const request = pending.get(id);

    if (!request || !Number.isInteger(status)) {
      continue;
    }

    pending.delete(id); // Fastify emits two completion records; count once.

    if (request.category) {
      if (status >= 400) {
        ideStateFailures.push({ ...request, status, time: Number.isFinite(entry.time) ? entry.time : null });

        if (ideStateFailures.length > 60) {
          ideStateFailures.shift();
        }
      }

      continue;
    }

    completed++;

    const key = `${request.method} ${request.path} ${status}`;

    if (counts.has(key) || counts.size < 1000) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    } else {
      ungrouped++;
    }

    if (status >= 400) {
      failed++;

      const error = { ...request, status, time: entry.time };

      if (firstErrors.length < 30) {
        firstErrors.push(error);
      } else {
        recentErrors.push(error);

        if (recentErrors.length > 30) {
          recentErrors.shift();
        }
      }
    }
  }

  return {
    packageExecutions,
    ideStateFailures,
    completed,
    failed,
    ungrouped,

    // Keep both early preflight and late audit diagnostics when raw logs are long.
    errors: [...firstErrors, ...recentErrors],
    routeCounts: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 300),
    omittedRouteGroups: Math.max(0, counts.size - 300),
  };
}
