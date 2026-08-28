import type { WorkspaceK8sClient } from '@vibecore/k8s-client';

import { StaticProjectVolumeProviderResolver } from './project-volume-erasure-adapters.js';
import type {
  ExactKubernetesDelete,
  ProjectPersistentVolumeClaim,
  ProjectVolumeKubernetesAdapter,
} from './project-volume-erasure.js';

/** Test-only bridge for suites whose fixtures intentionally model unbound PVCs. */
class UnboundProjectVolumeKubernetesAdapter implements ProjectVolumeKubernetesAdapter {
  constructor(private readonly k8s: WorkspaceK8sClient) {}

  async getPersistentVolumeClaim(namespace: string, name: string): Promise<ProjectPersistentVolumeClaim | undefined> {
    const object = await this.k8s.get('PersistentVolumeClaim', namespace, name);
    if (!object) return undefined;
    return {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name,
        namespace,
        uid: `uid-${name}`,
        resourceVersion: object.metadata.resourceVersion ?? '1',
        labels: object.metadata.labels,
      },
      spec: {},
    };
  }

  async getPersistentVolume() {
    return undefined;
  }

  async listPersistentVolumes() {
    return [];
  }

  async getStorageClass() {
    return undefined;
  }

  async deletePersistentVolumeClaim(namespace: string, name: string, _exact: ExactKubernetesDelete): Promise<void> {
    await this.k8s.delete('PersistentVolumeClaim', namespace, name);
  }

  async deletePersistentVolume(): Promise<void> {}
}

export function unboundProjectVolumeErasureRuntime(k8s: WorkspaceK8sClient) {
  return {
    kubernetes: new UnboundProjectVolumeKubernetesAdapter(k8s),
    providers: new StaticProjectVolumeProviderResolver(),
  };
}
