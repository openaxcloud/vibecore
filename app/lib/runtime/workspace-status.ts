export type WorkspacePortLike = {
  port?: number | string | null;
  ready?: boolean | null;
  url?: string | null;

  /*
   * The previews store exposes the forwarded URL as `baseUrl` (not `url`), so both
   * shapes must be recognised as a real serving port.
   */
  baseUrl?: string | null;
};

export type WorkspaceStatusLike = {
  status?: string | null;
  ports?: readonly WorkspacePortLike[] | null;
} | null;

/**
 * Ground-truth "the app is actually being served" signal: a forwarded port that the
 * runtime reported ready, or that exposes a reachable URL. This is stronger than the
 * workspace `status` field, which lags at PENDING/STARTING during cold-start
 * reconciliation — a port only enters the previews store once the runtime forwards
 * it, so a ready/URL-bearing entry means the pod is genuinely serving, not merely
 * that some port object exists in state.
 */
export function hasLivePreviewPort(ports?: readonly WorkspacePortLike[] | null): boolean {
  return (ports ?? []).some((port) => port.ready === true || Boolean(port.url) || Boolean(port.baseUrl));
}

export function isWorkspaceReallyRunning(
  workspace: WorkspaceStatusLike | undefined,
  ports?: readonly WorkspacePortLike[] | null,
) {
  /*
   * Consider ports carried on the session AND ports passed by the caller (the
   * previews store), so a live port is caught whichever source holds it.
   */
  const effectivePorts = [...(workspace?.ports ?? []), ...(ports ?? [])];

  /*
   * If a forwarded port is genuinely serving, the pod IS running — even when the
   * backend status field is still PENDING/STARTING (the cold-start case where the
   * pod became ready after the initial provisioning request timed out). Keying off
   * the live port here is what lets the status flip PENDING→RUNNING the moment the
   * preview actually renders.
   */
  if (hasLivePreviewPort(effectivePorts)) {
    return true;
  }

  return workspace?.status?.toLowerCase() === 'running' && effectivePorts.length > 0;
}

export function workspaceUiState(
  workspace: WorkspaceStatusLike | undefined,
  options: {
    ports?: readonly WorkspacePortLike[] | null;
    loading?: boolean;
    error?: unknown;
  } = {},
) {
  if (options.error) {
    return 'error';
  }

  if (options.loading) {
    return 'starting';
  }

  const status = workspace?.status?.toLowerCase();

  if (isWorkspaceReallyRunning(workspace, options.ports)) {
    return 'running';
  }

  if (status === 'running' || status === 'booting' || status === 'starting') {
    return 'starting';
  }

  if (status === 'error' || status === 'failed') {
    return 'error';
  }

  if (status === 'stopped') {
    return 'stopped';
  }

  return 'stopped';
}
