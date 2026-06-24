import type { VercelProject } from '~/types/vercel';

/**
 * Vercel's create-deployment API is v13. Redeploying an existing project means
 * re-creating its last deployment from source, which Vercel exposes by passing
 * the previous `deploymentId` plus the project `name` (NOT the project id) to
 * `POST /v13/deployments`. The legacy `v1/deployments` shape used previously is
 * removed and always errors, and a deployment cannot be created without a
 * source (files/gitSource/deploymentId), so the prior call could never succeed.
 *
 * See app/routes/api.vercel-deploy.ts and services/api/src/deployments.ts which
 * both target v13.
 */
export const VERCEL_DEPLOYMENTS_URL = 'https://api.vercel.com/v13/deployments';

export interface VercelRedeployRequest {
  url: string;
  body: {
    name: string;
    deploymentId: string;
    target: 'production';
  };
}

export class VercelRedeployError extends Error {}

/**
 * Build the v13 redeploy-from-existing request for a given project id, using the
 * project's name and most recent deployment id resolved from the connection
 * stats. Throws a {@link VercelRedeployError} with a user-facing message when the
 * project or a prior deployment cannot be found (no source = nothing to redeploy).
 */
export function buildVercelRedeployRequest(
  projectId: string,
  projects: VercelProject[] | undefined,
): VercelRedeployRequest {
  const project = projects?.find((p) => p.id === projectId);

  if (!project) {
    throw new VercelRedeployError('Project not found');
  }

  const lastDeploymentId = project.latestDeployments?.[0]?.id;

  if (!lastDeploymentId) {
    throw new VercelRedeployError('No previous deployment to redeploy');
  }

  return {
    url: VERCEL_DEPLOYMENTS_URL,
    body: {
      name: project.name,
      deploymentId: lastDeploymentId,
      target: 'production',
    },
  };
}
