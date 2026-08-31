import { describe, expect, it, vi } from 'vitest';
import {
  dispatchProviderRollback,
  observeProviderRollback,
  resolveProviderRollbackBinding,
  triggerProviderDeployHook,
  type ProviderRollbackBinding,
} from '../deployments.js';

function mockFetch(response: Partial<Response> & { jsonValue?: unknown; textValue?: string } = {}) {
  const fn = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const status = response.status ?? (response.ok === false ? 500 : 200);
    const body =
      status === 204
        ? undefined
        : response.jsonValue !== undefined
          ? JSON.stringify(response.jsonValue)
          : response.textValue;
    return new Response(body, { status });
  });
  return fn as typeof fn & typeof fetch;
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
    const result = await triggerProviderDeployHook('vercel', fetchImpl, {
      VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/hook',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result?.status).toBe('queued');
    expect(result?.buildId).toBe('job_1');
  });

  it('reports failure when the provider returns non-2xx', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 502 });
    const result = await triggerProviderDeployHook('netlify', fetchImpl, {
      NETLIFY_BUILD_HOOK_URL: 'https://api.netlify.com/build_hooks/abc',
    });
    expect(result?.status).toBe('failed');
    expect(result?.log).toContain('502');
  });

  it('catches network errors and reports them as failed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const result = await triggerProviderDeployHook('cloudflare-pages', fetchImpl, {
      CLOUDFLARE_DEPLOY_HOOK_URL: 'https://api.cloudflare.com/client/v4/pages/projects/x/deployments/hook',
    });
    expect(result?.status).toBe('failed');
    expect(result?.log).toContain('ECONNRESET');
  });

  it('dispatches a GitHub Pages workflow when env is configured', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 204 });
    const result = await triggerProviderDeployHook('github-pages', fetchImpl, {
      GITHUB_DEPLOY_TOKEN: 'gh_token',
      GITHUB_PAGES_REPO: 'org/site',
      GITHUB_PAGES_WORKFLOW: 'pages.yml',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as any).mock.calls[0];
    expect(call[0]).toBe('https://api.github.com/repos/org/site/actions/workflows/pages.yml/dispatches');
    expect(call[1].headers.authorization).toBe('Bearer gh_token');
    expect(result?.status).toBe('queued');
  });

  it('triggers Cloud Build for Cloud Run when token + URL set', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200, jsonValue: { metadata: { build: { id: 'build_42' } } } });
    const result = await triggerProviderDeployHook('google-cloud-run', fetchImpl, {
      CLOUD_RUN_BUILD_TRIGGER_URL: 'https://cloudbuild.googleapis.com/v1/projects/p/triggers/t:webhook?key=K',
      GCP_OAUTH_TOKEN: 'ya29.fake',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result?.buildId).toBe('build_42');
    expect(result?.status).toBe('queued');
  });

  it('extracts deploy URL from Netlify-style payload', async () => {
    const fetchImpl = mockFetch({
      ok: true,
      jsonValue: { result: { id: 'd1', deploy_ssl_url: 'https://my-site.netlify.app' } },
    });
    const result = await triggerProviderDeployHook('netlify', fetchImpl, {
      NETLIFY_BUILD_HOOK_URL: 'https://api.netlify.com/build_hooks/abc',
    });
    expect(result?.url).toBe('https://my-site.netlify.app');
  });
});

describe('durable provider rollback adapters', () => {
  it('binds Vercel to the inspected project and dispatches the documented project rollback endpoint', async () => {
    const inspect = mockFetch({
      jsonValue: {
        id: 'dpl_123',
        projectId: 'prj_9',
        target: 'production',
        readyState: 'READY',
        readySubstate: 'PROMOTED',
      },
    });
    const binding = await resolveProviderRollbackBinding('vercel', 'dpl_123', inspect, {
      VERCEL_API_TOKEN: 'tok',
      VERCEL_TEAM_ID: 'team_42',
    });
    expect(binding).toMatchObject({ provider: 'vercel', deploymentId: 'dpl_123', projectId: 'prj_9' });
    expect(inspect.mock.calls[0]![0]).toBe('https://api.vercel.com/v13/deployments/dpl_123?teamId=team_42');

    const dispatch = mockFetch({ status: 201, textValue: '' });
    await expect(dispatchProviderRollback(binding, dispatch, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'ACCEPTED',
      responseStatus: 201,
    });
    const [url, init] = dispatch.mock.calls[0]!;
    expect(url).toBe('https://api.vercel.com/v1/projects/prj_9/rollback/dpl_123?teamId=team_42');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok');
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
    expect(init?.body).toBeUndefined();
  });

  it('binds and dispatches the documented Netlify restore endpoint', async () => {
    const inspect = mockFetch({
      jsonValue: { id: 'deploy_99', site_id: 'site_77', context: 'production', state: 'ready' },
    });
    const binding = await resolveProviderRollbackBinding('netlify', 'deploy_99', inspect, {
      NETLIFY_AUTH_TOKEN: 'nly',
      NETLIFY_SITE_ID: 'site_77',
    });
    const dispatch = mockFetch({ status: 200, textValue: '{}' });
    await dispatchProviderRollback(binding, dispatch, { NETLIFY_AUTH_TOKEN: 'nly' });
    const [url, init] = dispatch.mock.calls[0]!;
    expect(url).toBe('https://api.netlify.com/api/v1/sites/site_77/deploys/deploy_99/restore');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer nly');
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
    expect(init?.body).toBeUndefined();
  });

  it('binds and dispatches the documented Cloudflare Pages rollback endpoint', async () => {
    const inspect = mockFetch({
      jsonValue: {
        success: true,
        result: {
          id: 'cf_dep',
          environment: 'production',
          project_id: 'cf_project_id',
          project_name: 'proj_x',
          is_skipped: false,
          latest_stage: { status: 'success' },
        },
      },
    });
    const env = {
      CLOUDFLARE_API_TOKEN: 'cf',
      CLOUDFLARE_ACCOUNT_ID: 'acct_1',
      CLOUDFLARE_PAGES_PROJECT: 'proj_x',
    };
    const binding = await resolveProviderRollbackBinding('cloudflare-pages', 'cf_dep', inspect, env);
    expect(binding).toMatchObject({
      provider: 'cloudflare-pages',
      projectId: 'cf_project_id',
      providerTarget:
        '{"provider":"cloudflare-pages","accountId":"acct_1","projectName":"proj_x","projectId":"cf_project_id"}',
    });
    const dispatch = mockFetch({ status: 200, textValue: '{}' });
    await dispatchProviderRollback(binding, dispatch, env);
    const [url, init] = dispatch.mock.calls[0]!;
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct_1/pages/projects/proj_x/deployments/cf_dep/rollback',
    );
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cf');
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
    expect(init?.body).toBeUndefined();
  });

  it.each([
    {
      provider: 'vercel' as const,
      buildId: 'dpl_invalid',
      env: { VERCEL_API_TOKEN: 'tok' },
      payload: {
        id: 'dpl_invalid',
        projectId: 'prj_9',
        target: 'production',
        readyState: 'READY',
        readySubstate: 'STAGED',
      },
    },
    {
      provider: 'netlify' as const,
      buildId: 'deploy_invalid',
      env: { NETLIFY_AUTH_TOKEN: 'nly', NETLIFY_SITE_ID: 'site_77' },
      payload: {
        id: 'deploy_invalid',
        site_id: 'site_77',
        context: 'production',
        state: 'error',
      },
    },
    {
      provider: 'cloudflare-pages' as const,
      buildId: 'cf_invalid',
      env: {
        CLOUDFLARE_API_TOKEN: 'cf',
        CLOUDFLARE_ACCOUNT_ID: 'acct_1',
        CLOUDFLARE_PAGES_PROJECT: 'proj_x',
      },
      payload: {
        success: true,
        result: {
          id: 'cf_invalid',
          environment: 'production',
          project_id: 'cf_project_id',
          project_name: 'proj_x',
          is_skipped: false,
          latest_stage: { status: 'failure' },
        },
      },
    },
  ])('rejects an ineligible $provider rollback target before creating authority', async (testCase) => {
    await expect(
      resolveProviderRollbackBinding(testCase.provider, testCase.buildId, mockFetch({ jsonValue: testCase.payload }), {
        ...testCase.env,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ROLLBACK_TARGET_UNPROVABLE' });
  });

  it('records response loss as ambiguous instead of claiming a safe retry', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_99',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('socket closed after provider acceptance');
    }) as unknown as typeof fetch;
    await expect(dispatchProviderRollback(binding, fetchImpl, { NETLIFY_AUTH_TOKEN: 'nly' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { outcome: 'response-lost' },
    });
  });

  it('does not invoke the provider transport when release authority is already aborted', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_99',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const authority = new AbortController();
    authority.abort(new Error('PROJECT_RELEASE_BARRIER_LOST'));

    await expect(
      dispatchProviderRollback(binding, fetchImpl, { NETLIFY_AUTH_TOKEN: 'nly' }, authority.signal),
    ).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { outcome: 'response-lost', errorClass: 'Error' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([409, 429, 500])('treats a mutation response %s as ambiguous', async (status) => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_99',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const fetchImpl = mockFetch({ status, textValue: '{"error":"provider outcome unknown"}' });

    await expect(dispatchProviderRollback(binding, fetchImpl, { NETLIFY_AUTH_TOKEN: 'nly' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      responseStatus: status,
      evidence: { provider: 'netlify', status },
    });
  });

  it.each([
    {
      binding: {
        provider: 'cloudflare-pages',
        deploymentId: 'cf_target',
        accountId: 'acct_1',
        projectName: 'proj_x',
        projectId: 'cf_project_id',
        providerTarget: '{"accountId":"acct_1","projectName":"proj_x","projectId":"cf_project_id"}',
      } satisfies ProviderRollbackBinding,
      env: { CLOUDFLARE_API_TOKEN: 'cf' },
      payload: {
        success: true,
        result: {
          id: 'cf_project_id',
          name: 'proj_x',
          canonical_deployment: {
            id: 'cf_target',
            environment: 'production',
            project_id: 'cf_project_id',
            project_name: 'proj_x',
          },
        },
      },
      expectedUrl: 'https://api.cloudflare.com/client/v4/accounts/acct_1/pages/projects/proj_x',
    },
  ])('treats $binding.provider live authority as exact only for the requested target', async (testCase) => {
    const live = mockFetch({ jsonValue: testCase.payload });
    await expect(observeProviderRollback(testCase.binding, live, testCase.env)).resolves.toMatchObject({
      state: 'TARGET',
      evidence: { liveDeploymentIds: [testCase.binding.deploymentId] },
    });
    expect(live.mock.calls[0]![0]).toBe(testCase.expectedUrl);
  });

  it('keeps Netlify fail-closed when canonical deploy and Split Tests cannot disprove Skew Protection', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_target',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const live = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'site_77', published_deploy: { id: 'deploy_target', site_id: 'site_77' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'split_inactive', site_id: 'site_77', active: false }])),
      ) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, live, { NETLIFY_AUTH_TOKEN: 'nly' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: {
        liveDeploymentIds: ['deploy_target'],
        activeSplitTestCount: 0,
        reason: 'netlify-skew-protection-state-unprovable',
      },
    });
    expect(live).toHaveBeenNthCalledWith(
      2,
      'https://api.netlify.com/api/v1/sites/site_77/traffic_splits',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer nly' }) }),
    );
  });

  it.each([
    {
      status: 200,
      payload: { id: 'site_other', published_deploy: { id: 'deploy_target', site_id: 'site_77' } },
    },
    {
      status: 200,
      payload: { id: 'site_77', published_deploy: { id: 'deploy_target', site_id: 'site_other' } },
    },
    {
      status: 201,
      payload: { id: 'site_77', published_deploy: { id: 'deploy_target', site_id: 'site_77' } },
    },
  ])('fails Netlify observation closed when the Site authority identity drifts', async ({ status, payload }) => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_target',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const live = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, live, { NETLIFY_AUTH_TOKEN: 'nly' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'netlify-site-authority-unprovable' },
    });
    expect(live).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      payload: [{ id: 'split_active', site_id: 'site_77', active: true }],
      headers: undefined,
      reason: 'netlify-active-split-test',
    },
    {
      payload: [{ id: 'split_unknown', site_id: 'site_77' }],
      headers: undefined,
      reason: 'netlify-split-test-state-unprovable',
    },
    {
      payload: [{ id: 'split_other', site_id: 'site_other', active: false }],
      headers: undefined,
      reason: 'netlify-split-test-state-unprovable',
    },
    {
      payload: [{ id: 'split_inactive', site_id: 'site_77', active: false }],
      headers: { link: '<https://api.netlify.com/api/v1/sites/site_77/traffic_splits?page=2>; rel="next"' },
      reason: 'netlify-split-test-state-unprovable',
    },
    {
      payload: [{ id: 'split_inactive', site_id: 'site_77', active: false }],
      headers: { link: '' },
      reason: 'netlify-split-test-state-unprovable',
    },
  ])('keeps Netlify fail-closed when split-test authority is incomplete', async ({ payload, headers, reason }) => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_target',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const live = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'site_77', published_deploy: { id: 'deploy_target', site_id: 'site_77' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200, headers }),
      ) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, live, { NETLIFY_AUTH_TOKEN: 'nly' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason },
    });
  });

  it.each([
    {
      id: 'cf_project_id',
      name: 'proj_other',
      canonical_deployment: {
        id: 'cf_target',
        environment: 'production',
        project_id: 'cf_project_id',
        project_name: 'proj_other',
      },
    },
    {
      id: 'cf_project_id',
      name: 'proj_x',
      canonical_deployment: {
        id: 'cf_target',
        environment: 'preview',
        project_id: 'cf_project_id',
        project_name: 'proj_x',
      },
    },
    {
      id: 'cf_recreated_project_id',
      name: 'proj_x',
      canonical_deployment: {
        id: 'cf_target',
        environment: 'production',
        project_id: 'cf_recreated_project_id',
        project_name: 'proj_x',
      },
    },
    {
      id: 'cf_project_id',
      name: 'proj_x',
      canonical_deployment: {
        id: 'cf_target',
        environment: 'production',
        project_id: 'cf_other_id',
        project_name: 'proj_x',
      },
    },
  ])('fails Cloudflare observation closed when the canonical Project identity drifts', async (result) => {
    const binding: ProviderRollbackBinding = {
      provider: 'cloudflare-pages',
      deploymentId: 'cf_target',
      accountId: 'acct_1',
      projectName: 'proj_x',
      projectId: 'cf_project_id',
      providerTarget: '{"accountId":"acct_1","projectName":"proj_x","projectId":"cf_project_id"}',
    };
    const live = mockFetch({ jsonValue: { success: true, result } });

    await expect(observeProviderRollback(binding, live, { CLOUDFLARE_API_TOKEN: 'cf' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'cloudflare-project-authority-unprovable' },
    });
  });

  it('proves Vercel production only when every current production alias serves the exact target', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            domains: [{ name: 'a.example' }, { name: 'b.example' }],
            pagination: { count: 2, next: null, prev: null },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_target', alias: 'a.example', projectId: 'prj_9' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_target', alias: 'b.example', projectId: 'prj_9' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            domains: [{ name: 'a.example' }, { name: 'b.example' }],
            pagination: { count: 2, next: null, prev: null },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_target', alias: 'a.example', projectId: 'prj_9' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_target', alias: 'b.example', projectId: 'prj_9' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null }))) as unknown as typeof fetch;
    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'TARGET',
      evidence: { productionDomainCount: 2 },
    });
  });

  it('keeps Vercel fail-closed unless project Skew Protection is explicitly disabled', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 86_400 })),
      ) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'vercel-skew-protection-state-unprovable' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps Vercel fail-closed when the production domain set changes during observation', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            domains: [{ name: 'a.example' }],
            pagination: { count: 1, next: null, prev: null },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_target', alias: 'a.example', projectId: 'prj_9' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            domains: [{ name: 'a.example' }, { name: 'new.example' }],
            pagination: { count: 2, next: null, prev: null },
          }),
        ),
      ) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'vercel-production-domain-authority-changed' },
    });
  });

  it('keeps Vercel fail-closed when an alias changes during the confirmation pass', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const exactDomains = {
      domains: [{ name: 'a.example' }],
      pagination: { count: 1, next: null, prev: null },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify(exactDomains)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_target', alias: 'a.example', projectId: 'prj_9' })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(exactDomains)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deploymentId: 'dpl_other', alias: 'a.example', projectId: 'prj_9' })),
      ) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'vercel-production-alias-authority-changed' },
    });
  });

  it.each([
    { type: 'rollback', activeTarget: 'dpl_target' },
    { type: 'promote', activeTarget: 'dpl_target' },
    { type: 'promote', activeTarget: 'dpl_other' },
  ])(
    'keeps Vercel fail-closed while a $type alias job is pending toward $activeTarget',
    async ({ type, activeTarget }) => {
      const binding: ProviderRollbackBinding = {
        provider: 'vercel',
        deploymentId: 'dpl_target',
        projectId: 'prj_9',
        providerTarget: '{"projectId":"prj_9"}',
      };
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'prj_9',
              skewProtectionMaxAge: 0,
              lastAliasRequest: {
                type,
                toDeploymentId: activeTarget,
                requestedAt: Date.now() - 120_000,
                jobStatus: 'in-progress',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null }))) as unknown as typeof fetch;

      await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
        state: 'AMBIGUOUS',
        evidence: { reason: 'vercel-alias-mutation-still-active' },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { domains: [], pagination: {} },
    { domains: [{ name: 'a.example' }], pagination: {} },
    { domains: [{ name: 'a.example' }], pagination: { count: 1, next: 1, prev: null } },
    { domains: [{ name: 'a.example' }], pagination: { count: 2, next: null, prev: null } },
    { domains: [{ name: 'a.example' }], pagination: { count: 1, next: null } },
    { domains: [{ name: 'a.example' }], pagination: { count: 1, next: null, prev: 123 } },
    { domains: [{ name: 'a.example' }] },
  ])('fails Vercel observation closed when the production domain set is incomplete', async (payload) => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload))) as unknown as typeof fetch;
    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'production-domain-set-unprovable' },
    });
  });

  it.each([
    { deploymentId: 'dpl_target', alias: 'moved.example', projectId: 'prj_9' },
    { deploymentId: 'dpl_target', alias: 'a.example', projectId: 'prj_other' },
    { deploymentId: 'dpl_target', alias: 'a.example' },
  ])('fails Vercel observation closed when a production alias identity drifts', async (aliasPayload) => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rollingRelease: null })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            domains: [{ name: 'a.example' }],
            pagination: { count: 1, next: null, prev: null },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(aliasPayload))) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'production-alias-unprovable' },
    });
  });

  it('keeps Vercel fail-closed while a Rolling Release can divide production traffic', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'vercel',
      deploymentId: 'dpl_target',
      projectId: 'prj_9',
      providerTarget: '{"projectId":"prj_9"}',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'prj_9', lastAliasRequest: null, skewProtectionMaxAge: 0 })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rollingRelease: {
              state: 'ACTIVE',
              currentDeployment: { id: 'dpl_target' },
              canaryDeployment: { id: 'dpl_canary' },
            },
          }),
        ),
      ) as unknown as typeof fetch;

    await expect(observeProviderRollback(binding, fetchImpl, { VERCEL_API_TOKEN: 'tok' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: { reason: 'vercel-active-rolling-release' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not classify a different Netlify canonical deployment as exhaustive while Skew Protection is unprovable', async () => {
    const binding: ProviderRollbackBinding = {
      provider: 'netlify',
      deploymentId: 'deploy_target',
      siteId: 'site_77',
      providerTarget: '{"provider":"netlify","siteId":"site_77"}',
    };
    const live = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'site_77', published_deploy: { id: 'deploy_other', site_id: 'site_77' } })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]))) as unknown as typeof fetch;
    await expect(observeProviderRollback(binding, live, { NETLIFY_AUTH_TOKEN: 'nly' })).resolves.toMatchObject({
      state: 'AMBIGUOUS',
      evidence: {
        liveDeploymentIds: ['deploy_other'],
        reason: 'netlify-skew-protection-state-unprovable',
      },
    });
  });
});
