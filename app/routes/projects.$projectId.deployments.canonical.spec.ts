import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalDeploymentHref } from './projects.$projectId.deployments.view';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});
afterEach(() => apiRequest.mockReset());

function args(query = '', body?: Record<string, string>, accept = 'text/html') {
  return {
    request: new Request(`https://app.test/projects/isolated-project/deployments${query}`, {
      headers: { accept },
      ...(body ? { method: 'POST', body: new URLSearchParams(body) } : {}),
    }),
    params: { projectId: 'isolated-project' },
  } as never;
}

describe('historical deployment route uses the canonical workflow', () => {
  it('authorizes the project and preserves workspace plus requested section', async () => {
    apiRequest.mockResolvedValue({ project: { id: 'isolated-project' } });

    const { loader } = await import('./projects.$projectId.deployments');
    const result = await loader(args('?workspace=workspace-a&view=logs'));
    expect((result as Response).headers.get('Location')).toBe(
      '/projects/isolated-project/ide?panel=deployments&workspace=workspace-a&deployView=logs',
    );
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][1]).toBe('/projects/isolated-project');
  });
  it.each([401, 403, 404])('keeps an access failure (%s) before any redirect', async (status) => {
    const failure = new Response(null, { status });
    apiRequest.mockRejectedValueOnce(failure);

    const { loader } = await import('./projects.$projectId.deployments');
    await expect(loader(args())).rejects.toBe(failure);
  });
  it.each([
    ['detect', 'detected'],
    ['rateCard', 'rateCard'],
  ])('keeps the %s data side-channel', async (query, key) => {
    const payload = { marker: query };
    apiRequest.mockResolvedValueOnce(payload);

    const { loader } = await import('./projects.$projectId.deployments');
    const result = await loader(args(`?${query}=1`));
    expect(result).toMatchObject({ data: { [key]: payload } });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it.each(['text/html', 'application/json'])('surfaces a legacy POST failure for %s without replay', async (accept) => {
    apiRequest.mockRejectedValueOnce(new Response('Provider refused deployment', { status: 503 }));

    const { action } = await import('./projects.$projectId.deployments');
    await expect(
      action(args('', { intent: 'redeploy', deploymentId: 'release-a', workspaceId: 'workspace-a' }, accept)),
    ).rejects.toMatchObject({
      data: { code: 'DEPLOYMENT_ACTION_FAILED', error: expect.any(String), workspaceId: 'workspace-a' },
      init: { status: 400 },
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][1]).toBe('/projects/isolated-project/deployments/release-a/redeploy');
  });
  it('preserves reauthentication on legacy POST', async () => {
    const login = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(login);

    const { action } = await import('./projects.$projectId.deployments');
    await expect(action(args('', { intent: 'cancel', deploymentId: 'release-a' }))).rejects.toBe(login);
  });
  it('sends successful legacy creates once with machine, workspace and configuration preserved', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./projects.$projectId.deployments');

    const result = await action(
      args('?workspace=url-workspace', {
        provider: 'server',
        machineSize: 'large',
        workspaceId: 'form-workspace',
        envVars: 'PUBLIC_VALUE=test',
      }),
    );
    expect((result as Response).headers.get('Location')).toBe(
      '/projects/isolated-project/deployments?workspace=form-workspace',
    );
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toMatchObject({
      provider: 'server',
      machineSize: 'large',
      workspaceId: 'form-workspace',
      envVars: { PUBLIC_VALUE: 'test' },
    });
  });
  it('maps Domains and rejects unknown navigation sections without preserving unrelated parameters', () => {
    expect(canonicalDeploymentHref('project', new URLSearchParams('view=domains&workspace=a/b'))).toBe(
      '/projects/project/ide?panel=domains&workspace=a%2Fb',
    );
    expect(canonicalDeploymentHref('project', new URLSearchParams('view=unknown&token=discard'))).toBe(
      '/projects/project/ide?panel=deployments',
    );
  });
});
