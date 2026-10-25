import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './projects.$projectId.deployments';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

afterEach(() => vi.unstubAllGlobals());

describe('deployment detection workspace forwarding', () => {
  for (const workspace of ['workspace-primary', 'workspace-secondary']) {
    it(`forwards the selected ${workspace} to the API`, async () => {
      const transport = vi.fn().mockResolvedValue(Response.json({ mode: 'static', framework: 'vite' }));
      vi.stubGlobal('fetch', transport);

      const response = await loader({
        request: new Request(`https://app.test/projects/project-fixture/deployments?detect=1&workspace=${workspace}`),
        params: { projectId: 'project-fixture' },
      } as EnterpriseLoaderArgs);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(String(transport.mock.calls[0][0])).toContain(
        `/projects/project-fixture/deployments/detect?workspaceId=${workspace}`,
      );
      expect(response).toMatchObject({ data: { detected: { mode: 'static' } } });
    });
  }
});
