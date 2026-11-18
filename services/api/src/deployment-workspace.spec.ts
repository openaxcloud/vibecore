import { describe, expect, it, vi } from 'vitest';
import { requireDeploymentWorkspaceId } from './deployment-workspace.js';

describe('explicit deployment workspace', () => {
  it('uses exactly the requested workspace in the same project', async () => {
    const getWorkspace = vi.fn(async () => ({ id: 'secondary', projectId: 'project-a' }));
    await expect(requireDeploymentWorkspaceId({ getWorkspace }, 'project-a', 'secondary')).resolves.toBe('secondary');
    expect(getWorkspace).toHaveBeenCalledWith('secondary');
  });

  it.each([null, { id: 'secondary', projectId: 'foreign' }, { id: 'wrong-id', projectId: 'project-a' }])(
    'rejects missing, foreign or substituted targets: %j',
    async (workspace) => {
      await expect(
        requireDeploymentWorkspaceId({ getWorkspace: async () => workspace }, 'project-a', 'secondary'),
      ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    },
  );

  it('propagates lookup failure instead of selecting a default', async () => {
    await expect(
      requireDeploymentWorkspaceId(
        {
          getWorkspace: async () => {
            throw new Error('STORE_UNAVAILABLE');
          },
        },
        'project-a',
        'secondary',
      ),
    ).rejects.toThrow('STORE_UNAVAILABLE');
  });
});
