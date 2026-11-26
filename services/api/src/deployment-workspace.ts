import { appPublicEnglish } from './app-public-copy.js';

/** An explicit build target must never degrade to a different project/default workspace. */
export async function requireDeploymentWorkspaceId(
  store: { getWorkspace(id: string): Promise<{ id: string; projectId: string } | null | undefined> },
  projectId: string,
  workspaceId: string,
): Promise<string> {
  const workspace = await store.getWorkspace(workspaceId);

  if (!workspace || workspace.id !== workspaceId || workspace.projectId !== projectId) {
    throw Object.assign(new Error(appPublicEnglish('WORKSPACE_PROJECT_MISMATCH')), {
      statusCode: 404,
      code: 'WORKSPACE_NOT_FOUND',
    });
  }

  return workspace.id;
}
