/** Allowlisted metadata only: never include logs, env, messages or credentials. */
export type EvidencePod = {
  metadata: { name: string; namespace: string };
  spec?: { containers?: { name: string; image: string }[] };
  status?: {
    phase?: string;
    conditions?: { type: string; status: string; reason?: string }[];
    containerStatuses?: ContainerEvidence[];
    initContainerStatuses?: ContainerEvidence[];
  };
};
type ContainerEvidence = {
  name: string;
  image: string;
  imageID: string;
  ready: boolean;
  restartCount: number;
  state?: { waiting?: { reason?: string }; terminated?: { reason?: string; exitCode: number; signal?: number } };
};

export function podEvidence(pod: EvidencePod) {
  const containers = (items: ContainerEvidence[] = []) =>
    items.map(({ name, image, imageID, ready, restartCount, state }) => ({
      name,
      image,
      imageID,
      ready,
      restartCount,
      waiting: state?.waiting ? { reason: state.waiting.reason } : undefined,
      terminated: state?.terminated
        ? {
            reason: state.terminated.reason,
            exitCode: state.terminated.exitCode,
            signal: state.terminated.signal,
          }
        : undefined,
    }));
  return {
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    images: pod.spec?.containers?.map(({ name, image }) => ({ name, image })),
    phase: pod.status?.phase,
    conditions: pod.status?.conditions?.map(({ type, status, reason }) => ({ type, status, reason })),
    containers: containers(pod.status?.containerStatuses),
    initContainers: containers(pod.status?.initContainerStatuses),
  };
}
