import { describe, expect, it } from 'vitest';
import {
  pollProviderDeployHookRecoveryIdentity,
  providerDeployHookTargetIsDedicated,
  providerDeployHookTargetSnapshot,
} from '../deployments.js';

const projectId = 'project-provider-target';
const operationTag = 'ecode-deploy-0123456789abcdef0123456789abcdef01234567';

describe('provider deploy-hook exact recovery', () => {
  it('does no provider I/O when the durable target hash has drifted', async () => {
    const env = {
      VERCEL_API_TOKEN: 'token',
      VERCEL_PROJECT_ID: 'vercel-project',
      VERCEL_DEPLOY_TARGET_DEDICATED: 'true',
      VERCEL_DEPLOY_TARGET_VIBECORE_PROJECT_ID: projectId,
    };
    const fetchCalls: string[] = [];
    const fetchImpl: typeof fetch = async (request) => {
      fetchCalls.push(String(request));
      throw new Error('provider GET must not be issued after target drift');
    };

    await expect(
      pollProviderDeployHookRecoveryIdentity({
        provider: 'vercel',
        providerBuildId: 'dpl_123',
        operationTag,
        expectedTargetHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        expectedProjectId: projectId,
        fetchImpl,
        env,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_DEPLOY_HOOK_TARGET_DRIFT' });
    expect(fetchCalls).toEqual([]);
  });

  it('requires returned Vercel deployment id and dedicated project identity', async () => {
    const env = {
      VERCEL_API_TOKEN: 'token',
      VERCEL_PROJECT_ID: 'vercel-project',
      VERCEL_TEAM_ID: 'team-1',
      VERCEL_DEPLOY_TARGET_DEDICATED: 'true',
      VERCEL_DEPLOY_TARGET_VIBECORE_PROJECT_ID: projectId,
    };
    const expectedTargetHash = providerDeployHookTargetSnapshot('vercel', env).targetHash;
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ id: 'dpl_other', projectId: 'vercel-project', teamId: 'team-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    await expect(
      pollProviderDeployHookRecoveryIdentity({
        provider: 'vercel',
        providerBuildId: 'dpl_123',
        operationTag,
        expectedTargetHash,
        expectedProjectId: projectId,
        fetchImpl,
        env,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE' });
  });

  it('requires the provider-specific dedicated-project latch for every hook provider', () => {
    expect(
      providerDeployHookTargetIsDedicated('netlify', projectId, {
        NETLIFY_DEPLOY_TARGET_DEDICATED: 'true',
        NETLIFY_DEPLOY_TARGET_VIBECORE_PROJECT_ID: projectId,
      }),
    ).toBe(true);
    expect(
      providerDeployHookTargetIsDedicated('netlify', projectId, {
        NETLIFY_DEPLOY_TARGET_DEDICATED: 'false',
        NETLIFY_DEPLOY_TARGET_VIBECORE_PROJECT_ID: projectId,
      }),
    ).toBe(false);
  });
});
