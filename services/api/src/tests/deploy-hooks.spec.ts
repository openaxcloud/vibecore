import { describe, expect, it, vi } from 'vitest';
import { providerDeployHookTargetSnapshot, triggerProviderDeployHook, triggerProviderRollback } from '../deployments.js';

const durableOperationTag = 'ecode-deploy-0123456789abcdef0123456789abcdef01234567';

function durableOptions(provider: 'vercel' | 'netlify' | 'cloudflare-pages' | 'github-pages' | 'google-cloud-run', env: Record<string, string | undefined>) {
  return {
    operationTag: durableOperationTag,
    deployedAt: '2026-08-31T00:00:00.000Z',
    expectedTargetHash: providerDeployHookTargetSnapshot(provider, env).targetHash,
  };
}

function mockFetch(response: Partial<Response> & { jsonValue?: unknown } = {}): typeof fetch {
  const fn = vi.fn(async (_url: any, _init: any) => {
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      async json() {
        if (response.jsonValue !== undefined) return response.jsonValue;
        throw new Error('no json');
      },
    } as Response;
  });
  return fn as unknown as typeof fetch;
}

describe('triggerProviderDeployHook', () => {
  it('returns undefined for providers without a hook env', async () => {
    const result = await triggerProviderDeployHook('static', mockFetch(), { NODE_ENV: 'test' });
    expect(result).toBeUndefined();
  });

  it('returns undefined when the env var is unset', async () => {
    const result = await triggerProviderDeployHook('vercel', mockFetch(), { NODE_ENV: 'test' });
    expect(result).toBeUndefined();
  });

  it('queues a Vercel deploy when VERCEL_DEPLOY_HOOK_URL is set', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201, jsonValue: { job: { id: 'job_1', state: 'PENDING' } } });
    const env = {
      VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/hook',
      VERCEL_PROJECT_ID: 'project',
    };
    const result = await triggerProviderDeployHook('vercel', fetchImpl, env, durableOptions('vercel', env));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result?.status).toBe('queued');
    expect(result?.buildId).toBe('job_1');
  });

  it('reports failure when the provider returns non-2xx', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 502 });
    const env = {
      NETLIFY_BUILD_HOOK_URL: 'https://api.netlify.com/build_hooks/abc',
      NETLIFY_SITE_ID: 'site',
    };
    const result = await triggerProviderDeployHook('netlify', fetchImpl, env, durableOptions('netlify', env));
    expect(result?.status).toBe('failed');
    expect(result?.log).toContain('502');
  });

  it('catches network errors and reports them as failed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const env = {
      CLOUDFLARE_DEPLOY_HOOK_URL: 'https://api.cloudflare.com/client/v4/pages/projects/x/deployments/hook',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      CLOUDFLARE_PAGES_PROJECT: 'project',
    };
    const result = await triggerProviderDeployHook(
      'cloudflare-pages',
      fetchImpl,
      env,
      durableOptions('cloudflare-pages', env),
    );
    expect(result?.status).toBe('failed');
    expect(result?.log).toContain('ECONNRESET');
  });

  it('dispatches a GitHub Pages workflow when env is configured', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 204 });
    const env = {
      GITHUB_DEPLOY_TOKEN: 'gh_token',
      GITHUB_PAGES_REPO: 'org/site',
      GITHUB_PAGES_WORKFLOW: 'pages.yml',
    };
    const result = await triggerProviderDeployHook('github-pages', fetchImpl, env, durableOptions('github-pages', env));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as any).mock.calls[0];
    expect(call[0]).toBe('https://api.github.com/repos/org/site/actions/workflows/pages.yml/dispatches');
    expect(call[1].headers.authorization).toBe('Bearer gh_token');
    expect(result?.status).toBe('queued');
  });

  it('triggers Cloud Build for Cloud Run when token + URL set', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200, jsonValue: { metadata: { build: { id: 'build_42' } } } });
    const env = {
      CLOUD_RUN_BUILD_TRIGGER_URL: 'https://cloudbuild.googleapis.com/v1/projects/p/locations/l/triggers/t:run',
      GCP_OAUTH_TOKEN: 'ya29.fake',
    };
    const result = await triggerProviderDeployHook(
      'google-cloud-run',
      fetchImpl,
      env,
      durableOptions('google-cloud-run', env),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result?.buildId).toBe('build_42');
    expect(result?.status).toBe('queued');
  });

  it('extracts deploy URL from Netlify-style payload', async () => {
    const fetchImpl = mockFetch({
      ok: true,
      jsonValue: { result: { id: 'd1', deploy_ssl_url: 'https://my-site.netlify.app' } },
    });
    const env = {
      NETLIFY_BUILD_HOOK_URL: 'https://api.netlify.com/build_hooks/abc',
      NETLIFY_SITE_ID: 'site',
    };
    const result = await triggerProviderDeployHook('netlify', fetchImpl, env, durableOptions('netlify', env));
    expect(result?.url).toBe('https://my-site.netlify.app');
  });
});

describe('triggerProviderRollback', () => {
  it('returns undefined when build id is missing', async () => {
    const fetchImpl = mockFetch();
    const result = await triggerProviderRollback('vercel', undefined, fetchImpl, {
      VERCEL_API_TOKEN: 'tok',
    });
    expect(result).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('promotes a Vercel deployment with optional teamId', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const result = await triggerProviderRollback('vercel', 'dpl_123', fetchImpl, {
      VERCEL_API_TOKEN: 'tok',
      VERCEL_TEAM_ID: 'team_42',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as any).mock.calls[0];
    expect(call[0]).toBe('https://api.vercel.com/v13/deployments/dpl_123/promote?teamId=team_42');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(result?.status).toBe('queued');
    expect(result?.buildId).toBe('dpl_123');
  });

  it('restores a Netlify deploy when site id + token are present', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const result = await triggerProviderRollback('netlify', 'deploy_99', fetchImpl, {
      NETLIFY_AUTH_TOKEN: 'nly',
      NETLIFY_SITE_ID: 'site_77',
    });
    const call = (fetchImpl as any).mock.calls[0];
    expect(call[0]).toBe('https://api.netlify.com/api/v1/sites/site_77/deploys/deploy_99/restore');
    expect(result?.status).toBe('queued');
  });

  it('rolls back a Cloudflare Pages deployment', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const result = await triggerProviderRollback('cloudflare-pages', 'cf_dep', fetchImpl, {
      CLOUDFLARE_API_TOKEN: 'cf',
      CLOUDFLARE_ACCOUNT_ID: 'acct_1',
      CLOUDFLARE_PAGES_PROJECT: 'proj_x',
    });
    const call = (fetchImpl as any).mock.calls[0];
    expect(call[0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct_1/pages/projects/proj_x/deployments/cf_dep/rollback',
    );
    expect(result?.status).toBe('queued');
  });

  it('reports failure when the rollback API returns non-2xx', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 409 });
    const result = await triggerProviderRollback('vercel', 'dpl_x', fetchImpl, { VERCEL_API_TOKEN: 'tok' });
    expect(result?.status).toBe('failed');
    expect(result?.log).toContain('409');
  });

  it('returns undefined for providers without a rollback path', async () => {
    const fetchImpl = mockFetch();
    const result = await triggerProviderRollback('github-pages', 'run_1', fetchImpl, {});
    expect(result).toBeUndefined();
  });
});
