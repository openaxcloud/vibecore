import type { ObjectStorageOperationLease } from '../object-storage-operation.js';
import {
  captureProjectRegistryErasureInventory,
  executeProjectRegistryErasure,
  type ProjectRegistryErasureProvider,
  type ProjectRegistryErasureReceipt,
} from '../project-registry-erasure.js';
import type { ApiStore } from '../store.js';

const unexpectedProviderCall = async (): Promise<never> => {
  throw new Error('EMPTY_REGISTRY_ERASURE_CALLED_PROVIDER');
};

const emptyProvider: ProjectRegistryErasureProvider = {
  snapshotPackage: unexpectedProviderCall,
  manifestExists: unexpectedProviderCall,
  listReferrers: unexpectedProviderCall,
  tagExists: unexpectedProviderCall,
  deleteTag: unexpectedProviderCall,
  deleteReferrer: unexpectedProviderCall,
  deleteImage: unexpectedProviderCall,
  deleteVersion: unexpectedProviderCall,
  deletePackage: unexpectedProviderCall,
};

/** Persist and verify a real zero-package receipt for DB tests with no images. */
export async function persistEmptyProjectRegistryErasure(
  store: ApiStore,
  lease: ObjectStorageOperationLease,
  projectId: string,
): Promise<ProjectRegistryErasureReceipt> {
  const prior = await store.readProjectRegistryErasure(lease);
  if (prior?.state === 'VERIFIED') return prior.receipt;

  const inventory =
    prior?.inventory ??
    (await captureProjectRegistryErasureInventory({
      projectId,
      projectPackages: [],
      sourceImages: [],
      tenantImages: [],
      releaseManifests: [],
      provider: emptyProvider,
      referenceAuthority: { countOutsideProject: async () => 0 },
    }));

  await store.prepareProjectRegistryErasure({ lease, inventory });
  await store.beginProjectRegistryErasure(lease);
  const receipt = await executeProjectRegistryErasure({
    inventory,
    provider: emptyProvider,
    referenceAuthority: { countOutsideProject: async () => 0 },
    guard: {
      assertPreparedAndLease: async ({ projectId: guardedProjectId, inventoryHash }) => {
        const durable = await store.readProjectRegistryErasure(lease);
        if (
          !durable ||
          durable.inventory.projectId !== guardedProjectId ||
          durable.inventory.inventoryHash !== inventoryHash
        ) {
          throw new Error('EMPTY_REGISTRY_ERASURE_DURABLE_GUARD_LOST');
        }
      },
      withPackageFence: async (_repository, effect) => effect(),
    },
  });
  await store.completeProjectRegistryErasure({ lease, receipt });
  return receipt;
}
