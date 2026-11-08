/** Bounded diagnostic projection of actual API logs, never a runtime verdict. */
export function summarizeRuntimeApi(log) {
  const pending = new Map();
  const counts = new Map();
  const firstErrors = [];
  const recentErrors = [];

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

    if (typeof entry.req?.url === 'string' && entry.req.url.startsWith('/api/runtime/')) {
      if (pending.size >= 5000) {
        pending.delete(pending.keys().next().value);
      }

      pending.set(id, {
        method: String(entry.req.method).slice(0, 12),

        // No headers, bodies or query tokens enter this projection.
        path: entry.req.url.split('?')[0].slice(0, 300),
      });
    }

    const status = entry.statusCode ?? entry.res?.statusCode;
    const request = pending.get(id);

    if (!request || !Number.isInteger(status)) {
      continue;
    }

    pending.delete(id); // Fastify emits two completion records; count once.
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
    completed,
    failed,
    ungrouped,

    // Keep both early preflight and late audit diagnostics when raw logs are long.
    errors: [...firstErrors, ...recentErrors],
    routeCounts: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 300),
    omittedRouteGroups: Math.max(0, counts.size - 300),
  };
}
