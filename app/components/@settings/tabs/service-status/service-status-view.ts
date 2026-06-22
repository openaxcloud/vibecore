export interface EndpointStatus {
  endpoint: string;
  ok: boolean;
  status: number;
  latency: number;
}

export type ServiceStatusView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'ready'; statuses: EndpointStatus[] };

/**
 * Derive the panel's render state from the fetch lifecycle.
 *
 * The diagnostics tab probes four endpoints. Without an explicit view model the
 * component renders a blank `<div>` in two distinct situations a user cannot tell
 * apart: while the probes are still in flight, and after the whole batch throws
 * (the catch path that previously reset statuses to `[]`). Both produced zero
 * feedback — exactly during a backend outage, when the panel is most needed.
 *
 * This helper distinguishes:
 *  - loading: probes still running -> show a spinner.
 *  - error: the batch itself rejected -> show an error message.
 *  - empty: settled with no probes (defensive) -> show an empty hint.
 *  - ready: at least one probe resolved (each individual failure is already a row
 *    with ok=false), so the list renders even when every endpoint is down.
 */
export function deriveServiceStatusView(
  loading: boolean,
  failed: boolean,
  statuses: EndpointStatus[],
): ServiceStatusView {
  if (loading) {
    return { kind: 'loading' };
  }

  if (failed) {
    return { kind: 'error' };
  }

  if (statuses.length === 0) {
    return { kind: 'empty' };
  }

  return { kind: 'ready', statuses };
}
