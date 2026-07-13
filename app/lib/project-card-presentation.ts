export type ProjectLifecycle = 'deployed' | 'draft' | 'archived';

type ProjectLifecycleSource = {
  deletedAt?: string | null;
  deploymentCount?: number | null;
};

const PROJECT_LIFECYCLE_LABELS: Record<ProjectLifecycle, string> = {
  deployed: 'Deployed',
  draft: 'Draft',
  archived: 'Archived',
};

export function projectLifecycle({ deletedAt, deploymentCount }: ProjectLifecycleSource): ProjectLifecycle {
  if (deletedAt) {
    return 'archived';
  }

  return (deploymentCount ?? 0) > 0 ? 'deployed' : 'draft';
}

export function projectLifecycleDisplayLabel(lifecycle: ProjectLifecycle): string {
  return PROJECT_LIFECYCLE_LABELS[lifecycle];
}

export function projectDeploymentSummary(deploymentCount?: number | null): string {
  const count = Number.isFinite(deploymentCount) ? Math.max(0, Math.floor(deploymentCount ?? 0)) : 0;

  if (count === 0) {
    return 'Not deployed';
  }

  return `${count} deployment${count === 1 ? '' : 's'}`;
}
