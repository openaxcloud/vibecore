/** Accept the production adapter's cold-start status recovery, never a different workspace. */
export function runtimeStartObservation(
  origin: string,
  url: string,
  method: string,
  ok: boolean,
  requestedWorkspaceId?: string,
  projectId?: string,
): 'post' | 'status' | undefined {
  if (!ok) return undefined;
  const target = new URL(url);
  if (target.origin !== origin) return undefined;
  if (method === 'POST' && target.pathname === '/api/runtime/workspaces') return 'post';
  if (method === 'GET' && requestedWorkspaceId && projectId && requestedWorkspaceId !== projectId &&
      target.pathname === `/api/runtime/workspaces/${encodeURIComponent(requestedWorkspaceId)}/status`) return 'status';
  return undefined;
}
