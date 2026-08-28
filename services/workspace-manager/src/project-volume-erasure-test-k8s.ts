import type { WorkspaceK8sClient } from '@vibecore/k8s-client';

import { StaticProjectVolumeProviderResolver } from './project-volume-erasure-adapters.js';
import type {
  ExactKubernetesDelete,
  ExactProviderVolumeDelete,
  ProjectPersistentVolume,
  ProjectPersistentVolumeClaim,
  ProjectStorageClass,
  ProjectVolumeKubernetesAdapter,
  ProjectVolumeProviderAdapter,
} from './project-volume-erasure.js';

/** Test-only CSI runtime with real Bound PVC→PV identities and an absent provider disk. */
class BoundProjectVolumeKubernetesAdapter implements ProjectVolumeKubernetesAdapter {
  readonly pvs = new Map<string, ProjectPersistentVolume>();

  constructor(
    private readonly k8s: WorkspaceK8sClient,
    private readonly registerProviderVolume: (volumeHandle: string) => void,
  ) {}

  private async materialize(namespace: string, name: string): Promise<ProjectPersistentVolumeClaim | undefined> {
    const object = await this.k8s.get('PersistentVolumeClaim', namespace, name);
    if (!object) return undefined;
    const pvcUid = `uid-${name}`;
    const pvName = `pv-${name}`;
    const volumeHandle = `test/${namespace}/${name}`;
    this.registerProviderVolume(volumeHandle);
    this.pvs.set(pvName, {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: { name: pvName, uid: `uid-${pvName}`, resourceVersion: '1' },
      spec: {
        claimRef: { namespace, name, uid: pvcUid },
        storageClassName: 'test-csi',
        persistentVolumeReclaimPolicy: 'Delete',
        csi: { driver: 'test.csi.vibecore.ai', volumeHandle },
      },
      status: { phase: 'Bound' },
    });
    return {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name,
        namespace,
        uid: pvcUid,
        resourceVersion: object.metadata.resourceVersion ?? '1',
        labels: object.metadata.labels,
      },
      spec: { volumeName: pvName, storageClassName: 'test-csi' },
      status: { phase: 'Bound' },
    };
  }

  getPersistentVolumeClaim(namespace: string, name: string) {
    return this.materialize(namespace, name);
  }

  async getPersistentVolume(name: string) {
    return this.pvs.get(name);
  }

  async listPersistentVolumes() {
    return [...this.pvs.values()];
  }

  async getStorageClass(): Promise<ProjectStorageClass> {
    return {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: 'test-csi', uid: 'uid-test-csi', resourceVersion: '1' },
      provisioner: 'test.csi.vibecore.ai',
      reclaimPolicy: 'Delete',
    };
  }

  async deletePersistentVolumeClaim(namespace: string, name: string, _exact: ExactKubernetesDelete): Promise<void> {
    await this.k8s.delete('PersistentVolumeClaim', namespace, name);
  }

  async deletePersistentVolume(name: string): Promise<void> {
    this.pvs.delete(name);
  }
}

class ExactTestProvider implements ProjectVolumeProviderAdapter {
  readonly csiDriver = 'test.csi.vibecore.ai';
  private readonly resourceIds = new Map<string, string>();

  register(volumeHandle: string) {
    if (!this.resourceIds.has(volumeHandle)) {
      this.resourceIds.set(volumeHandle, `resource-${volumeHandle.replaceAll('/', '-')}`);
    }
  }

  async inspect(volumeHandle: string) {
    const resourceId = this.resourceIds.get(volumeHandle);
    return resourceId ? { exists: true as const, resourceId } : { exists: false as const };
  }

  async deleteExact(input: ExactProviderVolumeDelete) {
    await input.assertCreationQuiescence();
    if (this.resourceIds.get(input.volumeHandle) !== input.expectedResourceId) {
      throw new Error('TEST_PROVIDER_IDENTITY_MISMATCH');
    }
    this.resourceIds.delete(input.volumeHandle);
  }
}

export function boundProjectVolumeErasureRuntime(k8s: WorkspaceK8sClient) {
  const provider = new ExactTestProvider();
  return {
    kubernetes: new BoundProjectVolumeKubernetesAdapter(k8s, (volumeHandle) => provider.register(volumeHandle)),
    providers: new StaticProjectVolumeProviderResolver([provider]),
  };
}
