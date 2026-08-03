/**
 * Pure decision helpers for server-side runtime reseed reconciliation.
 *
 * The client (ProjectWorkspaceProvider) seeds a freshly-provisioned pod from the
 * persisted project files, but a pod reached OUTSIDE a live IDE session is never
 * client-seeded: the remote adapter re-provisions a GC'd/reaped pod on the first
 * agent 502 to serve a background terminal / file / preview op, and the new pod
 * comes up with an EMPTY /workspace. The API reconciles this at start/restart —
 * these helpers keep the "is the pod empty?" decision pure and unit-testable,
 * independent of the Fastify app wiring.
 */

/** A single node from the workspace-agent `/files/tree` listing. */
export interface RuntimeTreeNode {
  path: string;
  type?: 'file' | 'directory';
}

/**
 * True when a `/files/tree` listing shows the pod already carries project files —
 * i.e. at least one top-level entry whose basename is not a dotfile. A genuinely
 * empty (freshly provisioned / wiped) pod returns `[]` or only hidden scaffolding
 * and must be reseeded from the persisted ide-state.
 *
 * Defensive against a malformed / non-array agent response: anything that is not a
 * well-formed array of `{ path }` nodes is treated as "not populated", so the
 * reseed still runs rather than silently skipping a genuinely empty pod.
 */
export function runtimeWorkspaceTreeHasProjectFiles(tree: unknown): boolean {
  if (!Array.isArray(tree)) {
    return false;
  }

  return tree.some((node) => {
    const path = typeof (node as { path?: unknown })?.path === 'string' ? (node as { path: string }).path : '';
    const name = path.split('/').pop() ?? '';

    return name.length > 0 && !name.startsWith('.');
  });
}
