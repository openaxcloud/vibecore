import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  };
});

import {
  deploymentPlanRequestFields,
  loader,
  type DeployPlanEntitlementsData,
} from './projects.$projectId.deployments';

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('deployment publication entitlement route', () => {
  it('proxies the exact project/provider contract without deriving rights in the browser', async () => {
    const planEntitlements = {
      version: '2026-08-27.1',
      plan: 'starter',
      provider: 'static',
      providerReady: true,
      unavailableReason: null,
      publishRegionMode: 'single',
      publishRegions: ['global'],
      defaultPublishRegion: 'global',
      badgeRemovable: false,
      badgeRequired: true,
    } as const;
    apiRequestMock.mockResolvedValue(planEntitlements);

    const response = (await loader({
      request: new Request('https://e-code.ai/projects/project-1/deployments?planEntitlements=1&provider=static'),
      params: { projectId: 'project-1' },
      context: {},
    })) as { data: DeployPlanEntitlementsData };

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      '/projects/project-1/deployments/plan-entitlements?provider=static',
    );
    expect(response.data).toEqual({ planEntitlements, error: null });
  });

  it('keeps the localized fail-closed API error and rejects non-surfaced providers', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Impossible de vérifier les autorisations de votre offre pour le moment.',
          code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
    );

    const failed = (await loader({
      request: new Request(
        'https://e-code.ai/projects/project-1/deployments?planEntitlements=1&provider=server&lang=fr',
        { headers: { 'accept-language': 'fr-FR' } },
      ),
      params: { projectId: 'project-1' },
      context: {},
    })) as { data: DeployPlanEntitlementsData };

    expect(failed.data.planEntitlements).toBeNull();
    expect(failed.data.error).toBe('Impossible de vérifier les autorisations de votre offre pour le moment.');

    const unsupported = (await loader({
      request: new Request('https://e-code.ai/projects/project-1/deployments?planEntitlements=1&provider=vercel'),
      params: { projectId: 'project-1' },
      context: {},
    })) as { data: DeployPlanEntitlementsData; init: { status: number } };

    expect(unsupported.init.status).toBe(400);
    expect(unsupported.data.planEntitlements).toBeNull();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('emits only the exact publication fields accepted by the backend', () => {
    expect(deploymentPlanRequestFields({})).toEqual({ removeBrandingBadge: false });
    expect(deploymentPlanRequestFields({ publishRegion: '  eu-west-1 ', removeBrandingBadge: 'on' })).toEqual({
      publishRegion: 'eu-west-1',
      removeBrandingBadge: true,
    });
    expect(deploymentPlanRequestFields({ publishRegion: '   ', removeBrandingBadge: 'false' })).toEqual({
      removeBrandingBadge: false,
    });
  });
});
