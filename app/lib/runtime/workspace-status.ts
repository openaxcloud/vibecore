export type WorkspacePortLike = {
  port?: number | string | null;
  ready?: boolean | null;
  url?: string | null;
};

export type WorkspaceStatusLike = {
  status?: string | null;
  ports?: readonly WorkspacePortLike[] | null;
} | null;

export function isWorkspaceReallyRunning(
  workspace: WorkspaceStatusLike | undefined,
  ports?: readonly WorkspacePortLike[] | null,
) {
  const effectivePorts = workspace?.ports ?? ports ?? [];

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
