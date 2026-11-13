import { describe, expect, it, vi } from 'vitest';
import { admitDatabaseWrite } from '../database-write-admission.js';
import type { ApiStore } from '../store.js';

const project = { id: 'project', organizationId: 'organization' };
const connection = { key: 'DATABASE_URL', value: 'private-fixture-uri', source: 'secret', kind: 'postgres' };

function fixture() {
  const getDatabaseInstanceByProject = vi.fn().mockResolvedValue({
    id: 'instance',
    projectId: project.id,
    organizationId: project.organizationId,
    bindingVersion: 7,
    activeTargetRef: 'target',
  });
  return {
    store: { getDatabaseInstanceByProject } as unknown as ApiStore,
    read: getDatabaseInstanceByProject,
    admission: { admitConnection: vi.fn().mockResolvedValue({ id: 'durable-ticket' }) },
  };
}
describe('dormant HTTP database-write admission bridge', () => {
  it('preserves legacy behavior when no integration was injected', async () => {
    const { store, read } = fixture();
    await admitDatabaseWrite(undefined, store, project, connection);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['DATABASE_URL', 'PROD_DATABASE_URL'])(
    'binds %s to its exact instance and secret before returning',
    async (key) => {
      const { store, read, admission } = fixture();
      await admitDatabaseWrite(admission, store, project, { ...connection, key });

      const environment = key === 'PROD_DATABASE_URL' ? 'production' : 'development';
      expect(read).toHaveBeenCalledWith(project.id, environment);
      expect(admission.admitConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: 'instance',
          projectId: project.id,
          organizationId: project.organizationId,
          bindingVersion: 7,
          targetRef: 'target',
          environment,
          ownerIncarnation: expect.any(String),
        }),
        { key, value: connection.value },
      );
    },
  );
  it.each([{ source: 'env' }, { kind: 'mysql' }, { key: 'PREVIEW_DATABASE_URL' }, { ambiguous: true }])(
    'refuses unsupported connections when integration is enabled: %o',
    async (change) => {
      const { store, read, admission } = fixture();
      await expect(admitDatabaseWrite(admission, store, project, { ...connection, ...change })).rejects.toMatchObject({
        code: 'RESTORE_WORK_CONNECTION_UNSUPPORTED',
      });
      expect(read).not.toHaveBeenCalled();
      expect(admission.admitConnection).not.toHaveBeenCalled();
    },
  );
  it('does not admit a transferred or missing instance under the authorized organization', async () => {
    const { store, read, admission } = fixture();

    for (const instance of [undefined, { id: 'instance', projectId: project.id, organizationId: 'other' }]) {
      read.mockResolvedValueOnce(instance);
      await expect(admitDatabaseWrite(admission, store, project, connection)).rejects.toMatchObject({
        code: 'RESTORE_WORK_BINDING_CHANGED',
      });
    }
    expect(admission.admitConnection).not.toHaveBeenCalled();
  });
  it('copies selected URI and authorized tenant before awaiting instance lookup', async () => {
    const { store, read, admission } = fixture();
    const selected = { ...connection };
    const authorized = { ...project };
    read.mockImplementationOnce(async () => {
      selected.value = 'changed';
      authorized.organizationId = 'changed';

      return { id: 'instance', projectId: project.id, organizationId: project.organizationId, bindingVersion: 0 };
    });
    await admitDatabaseWrite(admission, store, authorized, selected);
    expect(admission.admitConnection).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: project.organizationId }),
      { key: connection.key, value: connection.value },
    );
  });
  it('awaits confirmed admission and propagates refusal without settlement', async () => {
    const { store, admission } = fixture();
    admission.admitConnection.mockRejectedValue(new Error('REFUSED'));
    await expect(admitDatabaseWrite(admission, store, project, connection)).rejects.toThrow('REFUSED');
  });
});
