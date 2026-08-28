import { cancelAppImageBuildAndWait } from './app-image-build.js';
import type { ObjectStorageJsonObject, ObjectStorageOperationLease } from './object-storage-operation.js';
import {
  captureProjectRegistryErasureInventory,
  executeProjectRegistryErasure,
  type ProjectRegistryErasureProvider,
  type ProjectRegistryErasureReceipt,
  validateProjectRegistryErasureReceipt,
  verifyProjectRegistryErasureReplaySafety,
} from './project-registry-erasure.js';
import { registryMutationIntentHash } from './registry-mutation.js';
import type { ApiStore, RegistryMutationGuard, RegistryMutationRetryGuard } from './store.js';

export interface ProjectImageErasureSubreceipt extends ObjectStorageJsonObject {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly operationId: string;
  readonly registry: ProjectRegistryErasureReceipt;
  readonly cloudBuild: ObjectStorageJsonObject & {
    readonly producerCount: number;
    readonly terminalProofCount: number;
    readonly lateSuccessCount: number;
  };
}

export interface ProjectImageErasureCoordinatorInput {
  store: ApiStore;
  projectId: string;
  lease: ObjectStorageOperationLease;
  assertLease(): Promise<void>;
  provider: ProjectRegistryErasureProvider;
}

function guardedRegistryProvider(
  provider: ProjectRegistryErasureProvider,
  guard: Pick<RegistryMutationGuard, 'signal' | 'assertActive'> | RegistryMutationRetryGuard,
  assertLease: () => Promise<void>,
): ProjectRegistryErasureProvider {
  const invoke = async <T>(effect: () => Promise<T>): Promise<T> => {
    await assertLease();
    await guard.assertActive();
    const result = await effect();
    await guard.assertActive();
    await assertLease();
    return result;
  };
  const options = { signal: guard.signal };
  return {
    snapshotPackage: (repo) => invoke(() => provider.snapshotPackage(repo, options)),
    manifestExists: (repo, digest) => invoke(() => provider.manifestExists(repo, digest, options)),
    listReferrers: (repo, digest) => invoke(() => provider.listReferrers(repo, digest, options)),
    tagExists: (repo, tag) => invoke(() => provider.tagExists(repo, tag, options)),
    deleteTag: (repo, tag) => invoke(() => provider.deleteTag(repo, tag, options)),
    deleteReferrer: (repo, digest) => invoke(() => provider.deleteReferrer(repo, digest, options)),
    deleteImage: (repo, digest) => invoke(() => provider.deleteImage(repo, digest, options)),
    deleteVersion: (repo, digest) => invoke(() => provider.deleteVersion(repo, digest, options)),
    deletePackage: (repo) => invoke(() => provider.deletePackage(repo, options)),
  };
}

function subreceipt(
  projectId: string,
  operationId: string,
  registry: ProjectRegistryErasureReceipt,
  terminal: Awaited<ReturnType<ApiStore['listProjectAppImageBuildsForDeletion']>>,
): ProjectImageErasureSubreceipt {
  return {
    schemaVersion: 1,
    projectId,
    operationId,
    registry,
    cloudBuild: {
      producerCount: terminal.length,
      terminalProofCount: terminal.filter((row) => row.state.phase === 'CANCELLED').length,
      lateSuccessCount: terminal.filter(
        (row) =>
          row.cancellationProof && 'lateSuccess' in row.cancellationProof && row.cancellationProof.lateSuccess === true,
      ).length,
    },
  };
}

/**
 * Internal, actor-free coordinator shared by HTTP hard-delete and account
 * purge. The caller owns the existing PROJECT_PERMANENT_DELETE lease; this
 * function never creates a second saga or a competing outer proof.
 */
export async function captureCancelAndSweepProjectImages(
  input: ProjectImageErasureCoordinatorInput,
): Promise<ProjectImageErasureSubreceipt> {
  const { store, projectId, lease, assertLease, provider } = input;
  await assertLease();
  const producers = await store.listProjectAppImageBuildsForDeletion(lease);
  for (const producer of producers) {
    await assertLease();
    if (producer.state.phase === 'CANCELLED') continue;
    if (
      producer.state.phase === 'PREPARED' ||
      producer.state.phase === 'REJECTED' ||
      producer.state.phase === 'REJECTED_ABSENT'
    ) {
      await store.markUnsubmittedAppImageBuildCancelled({ lease, operationId: producer.id });
      continue;
    }
    const buildId =
      producer.state.phase === 'IDENTIFIED' || producer.state.phase === 'TERMINAL'
        ? producer.state.buildId
        : producer.providerBuildId;
    const cancellation = await cancelAppImageBuildAndWait(
      {
        gcpProject: producer.gcpProject,
        region: producer.region,
        sourceBucket: producer.sourceBucket,
        sourceObject: producer.sourceObject,
        imageUri: producer.imageUri,
        buildServiceAccount: producer.buildServiceAccount,
        timeoutSeconds: producer.timeoutSeconds,
      },
      { operationId: producer.id, ...(buildId ? { buildId } : {}) },
      {
        assertAuthority: () => assertLease(),
        recordRecoveredBuildIdentity: ({ buildId: recoveredId, operationTag, logUrl }) =>
          store.recordAppImageBuildRecoveredIdentityForDeletion({
            lease,
            operationId: producer.id,
            buildId: recoveredId,
            operationTag,
            ...(logUrl ? { logUrl } : {}),
          }),
        recordCancellationProof: (proof) =>
          store.recordAppImageBuildCancellationProof({ lease, operationId: producer.id, proof }),
      },
    );
    if (!cancellation.ok) {
      throw Object.assign(new Error(cancellation.error), { code: cancellation.code, statusCode: 503 });
    }
  }

  await assertLease();
  const prior = await store.readProjectRegistryErasure(lease);
  if (prior?.state === 'VERIFIED') {
    return subreceipt(
      projectId,
      lease.operationId,
      prior.receipt,
      await store.listProjectAppImageBuildsForDeletion(lease),
    );
  }
  const authority = await store.resolveProjectRegistryErasureAuthority(projectId);
  const referenceAuthority = {
    countOutsideProject: (
      reference: Parameters<ApiStore['countProjectRegistryReferencesOutsideProject']>[0],
      excluded: string,
    ) => store.countProjectRegistryReferencesOutsideProject(reference, excluded),
  };
  const repositories = prior ? prior.inventory.packages.map((pkg) => pkg.repository) : authority.projectPackages;
  let retryInventory = prior?.inventory;
  const erase = async (guard?: RegistryMutationGuard): Promise<ProjectRegistryErasureReceipt> => {
    const activeProvider = guard ? guardedRegistryProvider(provider, guard, assertLease) : provider;
    const inventory =
      prior?.inventory ??
      retryInventory ??
      (await captureProjectRegistryErasureInventory({
        projectId,
        projectPackages: authority.projectPackages,
        sourceImages: authority.sourceImages,
        tenantImages: authority.tenantImages,
        releaseManifests: authority.releaseManifests,
        provider: activeProvider,
        referenceAuthority,
      }));
    await assertLease();
    await store.prepareProjectRegistryErasure({ lease, inventory });
    await store.beginProjectRegistryErasure(lease);
    const receipt = await executeProjectRegistryErasure({
      inventory,
      provider: activeProvider,
      referenceAuthority,
      guard: {
        assertPreparedAndLease: async ({ projectId: guardedProjectId, inventoryHash }) => {
          await guard?.assertActive();
          await assertLease();
          const durable = await store.readProjectRegistryErasure(lease);
          if (
            !durable ||
            durable.inventory.projectId !== guardedProjectId ||
            durable.inventory.inventoryHash !== inventoryHash
          ) {
            throw new Error('REGISTRY_ERASURE_DURABLE_GUARD_LOST');
          }
        },
        withPackageFence: (_repository, effect) => effect(),
      },
    });
    await guard?.recordProviderEvidence(receipt);
    await store.completeProjectRegistryErasure({ lease, receipt });
    return receipt;
  };
  const receipt =
    repositories.length === 0
      ? await erase()
      : await store.withRegistryMutation(
          {
            operationId: `registry-mutation:erasure:${lease.operationId}`,
            projectId,
            organizationId: authority.organizationId,
            ownershipEpoch: authority.ownershipEpoch,
            kind: 'PROJECT_ERASURE',
            repositories,
            intentHash: registryMutationIntentHash({
              projectId,
              operationId: lease.operationId,
              repositories,
              authority,
            }),
          },
          erase,
          {
            replayVerified: (evidence) => {
              const inventory = prior?.inventory ?? retryInventory;
              if (!inventory || !evidence || typeof evidence !== 'object') {
                throw new Error('REGISTRY_ERASURE_REPLAY_EVIDENCE_INVALID');
              }
              validateProjectRegistryErasureReceipt(evidence as ProjectRegistryErasureReceipt, inventory);
              return evidence as ProjectRegistryErasureReceipt;
            },
            verifyFailedSafeRetry: async (retryGuard) => {
              const activeProvider = guardedRegistryProvider(provider, retryGuard, assertLease);
              const inventory =
                prior?.inventory ??
                (await captureProjectRegistryErasureInventory({
                  projectId,
                  projectPackages: authority.projectPackages,
                  sourceImages: authority.sourceImages,
                  tenantImages: authority.tenantImages,
                  releaseManifests: authority.releaseManifests,
                  provider: activeProvider,
                  referenceAuthority,
                }));
              if (prior) {
                await verifyProjectRegistryErasureReplaySafety({
                  inventory,
                  provider: activeProvider,
                  referenceAuthority,
                  guard: {
                    assertPreparedAndLease: async ({ projectId: guardedProjectId, inventoryHash }) => {
                      await retryGuard.assertActive();
                      await assertLease();
                      const durable = await store.readProjectRegistryErasure(lease);
                      if (
                        !durable ||
                        durable.inventory.projectId !== guardedProjectId ||
                        durable.inventory.inventoryHash !== inventoryHash
                      ) {
                        throw new Error('REGISTRY_ERASURE_DURABLE_GUARD_LOST');
                      }
                    },
                    withPackageFence: (_repository, effect) => effect(),
                  },
                });
              }
              retryInventory = inventory;
            },
          },
        );
  const terminal = await store.listProjectAppImageBuildsForDeletion(lease);
  if (terminal.some((row) => row.state.phase !== 'CANCELLED')) {
    throw new Error('APP_IMAGE_BUILD_TERMINAL_PROOF_INCOMPLETE');
  }
  return subreceipt(projectId, lease.operationId, receipt, terminal);
}
