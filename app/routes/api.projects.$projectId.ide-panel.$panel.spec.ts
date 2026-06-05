import { describe, expect, it } from 'vitest';
import { scopeDeploymentsForWorkspace } from './api.projects.$projectId.ide-panel.$panel';

describe('scopeDeploymentsForWorkspace', () => {
  const deployments = [
    { id: 'legacy-project-deploy' },
    { id: 'primary-deploy', workspaceId: 'workspace-primary' },
    { id: 'secondary-deploy', workspaceId: 'workspace-secondary' },
  ];

  it('keeps legacy project deployments with the primary workspace only', () => {
    expect(scopeDeploymentsForWorkspace(deployments, 'workspace-primary', 'workspace-primary')).toEqual([
      deployments[0],
      deployments[1],
    ]);
  });

  it('keeps only deployments from the selected secondary workspace', () => {
    expect(scopeDeploymentsForWorkspace(deployments, 'workspace-secondary', 'workspace-primary')).toEqual([
      deployments[2],
    ]);
  });

  it('keeps only legacy project deployments when no workspace is selected', () => {
    expect(scopeDeploymentsForWorkspace(deployments)).toEqual([deployments[0]]);
  });
});
