import { describe, expect, it, vi } from 'vitest';
import { appPublicCopy, localizeAppPublicMessage } from './app-public-copy.js';
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

  it('keeps the stable API code and catalogued French/English message', async () => {
    const error = await requireDeploymentWorkspaceId({ getWorkspace: async () => null }, 'project-a', 'missing').catch(
      (value) => value,
    );
    expect(error).toMatchObject({ code: 'WORKSPACE_NOT_FOUND', statusCode: 404 });

    for (const locale of ['en', 'fr'] as const) {
      expect(localizeAppPublicMessage(error.message, locale)).toEqual({
        matched: true,
        value: appPublicCopy('WORKSPACE_PROJECT_MISMATCH', locale),
      });
    }
  });

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
