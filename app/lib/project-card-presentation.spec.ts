import { describe, expect, it } from 'vitest';
import { projectDeploymentSummary, projectLifecycle, projectLifecycleDisplayLabel } from './project-card-presentation';

describe('project card presentation', () => {
  it('derives lifecycle from real archive and deployment data', () => {
    expect(projectLifecycle({ deploymentCount: 0 })).toBe('draft');
    expect(projectLifecycle({ deploymentCount: 2 })).toBe('deployed');
    expect(projectLifecycle({ deletedAt: '2026-07-13T08:00:00.000Z', deploymentCount: 2 })).toBe('archived');
  });

  it('provides short customer-facing lifecycle labels', () => {
    expect(projectLifecycleDisplayLabel('draft')).toBe('Draft');
    expect(projectLifecycleDisplayLabel('deployed')).toBe('Deployed');
    expect(projectLifecycleDisplayLabel('archived')).toBe('Archived');
  });

  it('summarizes deployment counts without implementation copy', () => {
    expect(projectDeploymentSummary()).toBe('Not deployed');
    expect(projectDeploymentSummary(Number.NaN)).toBe('Not deployed');
    expect(projectDeploymentSummary(0)).toBe('Not deployed');
    expect(projectDeploymentSummary(1)).toBe('1 deployment');
    expect(projectDeploymentSummary(3)).toBe('3 deployments');
  });
});
