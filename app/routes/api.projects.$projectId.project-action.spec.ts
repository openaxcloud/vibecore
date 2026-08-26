import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

function readJson(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('project action — production remix policies', () => {
  afterEach(() => apiRequest.mockReset());

  it('loads the authoritative policy/consent contract instead of duplicating its version in the UI', async () => {
    apiRequest.mockResolvedValueOnce({
      policies: ['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'],
      storageConsentVersion: 'server-version-7',
    });

    const { loader } = await import('./api.projects.$projectId.project-action');

    const result = readJson(
      await loader({
        request: new Request('https://app.test/api/projects/project-1/project-action?intent=remix-policy'),
        params: { projectId: 'project-1' },
      } as any),
    );

    expect(apiRequest.mock.calls[0][1]).toBe('/projects/project-1/remix-policy');
    expect(result).toEqual({
      ok: true,
      policies: ['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'],
      storageConsentVersion: 'server-version-7',
    });
  });

  it('forwards explicit read-only share consent and the caller idempotency key to the remix API', async () => {
    apiRequest.mockResolvedValueOnce({
      project: { id: 'target-1' },
      remix: { id: 'job-1', state: 'COMPLETED' },
    });

    const form = new FormData();
    form.set('intent', 'fork');
    form.set('projectName', 'Source');
    form.set('storagePolicy', 'SHARE_WITH_CONSENT');
    form.set('storageConsentVersion', 'server-version-7');
    form.set('idempotencyKey', 'browser-operation-key');

    const { action } = await import('./api.projects.$projectId.project-action');

    const result = readJson(
      await action({
        request: new Request('https://app.test/api/projects/project-1/project-action', { method: 'POST', body: form }),
        params: { projectId: 'project-1' },
      } as any),
    );

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/project-1/remix');
    expect(init.headers).toEqual({ 'Idempotency-Key': 'browser-operation-key' });
    expect(JSON.parse(init.body)).toMatchObject({
      storagePolicy: 'SHARE_WITH_CONSENT',
      idempotencyKey: 'browser-operation-key',
      storageConsent: { granted: true, version: 'server-version-7' },
    });
    expect(result).toMatchObject({ ok: true, pending: false, project: { id: 'target-1' } });
  });

  it('fails closed before the API when a remix storage policy is unknown', async () => {
    const form = new FormData();
    form.set('intent', 'fork');
    form.set('projectName', 'Source');
    form.set('storagePolicy', 'COPY_EVERYTHING_UNSAFELY');

    const { action } = await import('./api.projects.$projectId.project-action');

    const response = await action({
      request: new Request('https://app.test/api/projects/project-1/project-action', { method: 'POST', body: form }),
      params: { projectId: 'project-1' },
    } as any);

    const result = response instanceof Response ? await response.json() : readJson(response);

    expect(response.status).toBe(400);
    expect(result).toMatchObject({ ok: false, code: 'PROJECT_REMIX_STORAGE_POLICY_INVALID' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
