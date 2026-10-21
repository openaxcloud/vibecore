/** Deployment records are attempts; only READY completes the onboarding step. */
export function hasReadyDeployment(deployments: ReadonlyArray<{ status: string }> | undefined): boolean {
  return Array.isArray(deployments) && deployments.some((deployment) => deployment.status === 'READY');
}
