/** Bounded diagnostic projection of actual API logs, never a runtime verdict. */
export function summarizeRuntimeApi(log) {
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
