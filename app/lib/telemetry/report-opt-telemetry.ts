/**
 * Fire-and-forget client → server forwarder for optimization telemetry.
 *
 * The diff-edit apply signal is produced in the browser ActionRunner, so its
 * `diff-edit.apply` log never reaches the pods. This helper POSTs the event to
 * `/api/telemetry`, where the web pod re-logs it as a greppable `opt.telemetry`
 * INFO line. It is deliberately best-effort:
 *  - never awaited by the caller (does not block the apply path),
 *  - never throws (all failure modes swallowed),
 *  - a no-op during SSR / when `fetch` is unavailable,
 *  - `keepalive` so an in-flight report survives a page unload.
 */
export type OptTelemetryType = 'diff-edit-apply' | 'context-optimization';

export function reportOptTelemetry(payload: { type: OptTelemetryType } & Record<string, unknown>): void {
  if (typeof fetch === 'undefined') {
    return;
  }

  try {
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Offline / aborted / server error — telemetry is best-effort, drop silently.
    });
  } catch {
    // JSON.stringify or fetch construction failure must never surface to the caller.
  }
}
