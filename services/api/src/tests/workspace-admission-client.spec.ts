import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- NodeNext service test uses its production module.
import type { ApiStore } from '../store.js';
// eslint-disable-next-line no-restricted-imports -- NodeNext service test uses its production module.
import { WorkspaceAdmissionClient, type WorkspaceManagerRequest } from '../workspace-admission.js';

afterEach(() => vi.unstubAllEnvs());

describe('workspace admission client owner fence', () => {
  it('rejects a delayed stop authorized before transfer when the current generation has another owner', async () => {
    vi.stubEnv('WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', 'true');

    const request = vi.fn(async () => ({
      id: 'ws-test',
      orgId: 'target',
      admission: { generation: 'new-generation', state: 'ACTIVE' },
    }));

    const client = new WorkspaceAdmissionClient({} as ApiStore, request as WorkspaceManagerRequest);
    await expect(client.stop('ws-test', 'source')).rejects.toMatchObject({
      code: 'WORKSPACE_PROJECT_MISMATCH',
      statusCode: 409,
    });
    expect(request.mock.calls).toHaveLength(1);
  });

  it('carries the observed generation so a transfer after the read cannot stop its successor', async () => {
    vi.stubEnv('WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', 'true');

    const calls: Array<{ path: string; body?: RequestInit['body'] }> = [];

    const request: WorkspaceManagerRequest = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body });
      return {
        id: 'ws-test',
        orgId: 'source',
        admission: { generation: 'observed-generation', state: 'RELEASED' },
      } as T;
    };

    const client = new WorkspaceAdmissionClient({} as ApiStore, request);
    await client.stop('ws-test', 'source');
    expect(calls).toEqual([
      { path: '/v2/workspaces/ws-test', body: undefined },
      { path: '/v2/workspaces/ws-test/stop', body: JSON.stringify({ generation: 'observed-generation' }) },
    ]);
  });
});
