import { describe, expect, it } from 'vitest';
import { buildVercelRedeployRequest, VercelRedeployError, VERCEL_DEPLOYMENTS_URL } from './vercel-redeploy';
import type { VercelProject } from '~/types/vercel';

const baseProject = (overrides: Partial<VercelProject> = {}): VercelProject => ({
  id: 'prj_123',
  name: 'my-app',
  createdAt: 0,
  latestDeployments: [{ id: 'dpl_abc', url: 'my-app.vercel.app', created: 0, state: 'READY' }],
  ...overrides,
});

describe('buildVercelRedeployRequest', () => {
  it('targets the v13 create-deployment API', () => {
    const { url } = buildVercelRedeployRequest('prj_123', [baseProject()]);
    expect(url).toBe(VERCEL_DEPLOYMENTS_URL);
    expect(url).toContain('/v13/deployments');
  });

  it('uses the project name (not id) and last deployment id for redeploy', () => {
    const { body } = buildVercelRedeployRequest('prj_123', [baseProject()]);
    expect(body).toEqual({
      name: 'my-app',
      deploymentId: 'dpl_abc',
      target: 'production',
    });
  });

  it('redeploys from the most recent deployment when several exist', () => {
    const project = baseProject({
      latestDeployments: [
        { id: 'dpl_new', url: 'a.vercel.app', created: 2, state: 'READY' },
        { id: 'dpl_old', url: 'b.vercel.app', created: 1, state: 'READY' },
      ],
    });

    const { body } = buildVercelRedeployRequest('prj_123', [project]);
    expect(body.deploymentId).toBe('dpl_new');
  });

  it('throws when the project cannot be resolved', () => {
    expect(() => buildVercelRedeployRequest('prj_missing', [baseProject()])).toThrow(VercelRedeployError);
    expect(() => buildVercelRedeployRequest('prj_123', undefined)).toThrow('Project not found');
  });

  it('throws when there is no prior deployment to redeploy from', () => {
    const project = baseProject({ latestDeployments: [] });
    expect(() => buildVercelRedeployRequest('prj_123', [project])).toThrow('No previous deployment to redeploy');

    const noDeploys = baseProject({ latestDeployments: undefined });
    expect(() => buildVercelRedeployRequest('prj_123', [noDeploys])).toThrow(VercelRedeployError);
  });
});
