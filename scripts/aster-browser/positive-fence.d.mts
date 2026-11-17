export type FenceIdentity = { workspaceId: string; projectId: string };
export type ApiProcess = { uid: string; restartCount: number; containerId: string };
export type LogSnapshot = { process: ApiProcess; logs: string };
export type Completion = FenceIdentity & { missing: 1; diverged: 0; msg: string; time?: unknown };
export const successMessage: string;
export function newPositiveCompletion(before: LogSnapshot, after: LogSnapshot, identity: FenceIdentity): Completion | null;
export function positiveTreeFence<T>(options: {
  inspect(workspaceId: string, proof: string): Promise<T>;
  removeMarker(workspaceId: string, proof: string): Promise<void>;
  snapshot(): Promise<LogSnapshot>;
  fetchTree(): Promise<void>;
  identity: FenceIdentity; proof: string; expected: T; deadlineMs?: number; intervalMs?: number;
}): Promise<{ event: Completion; apiProcess: ApiProcess; markerRestored: true }>;
