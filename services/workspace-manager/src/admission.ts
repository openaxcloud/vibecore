import { randomUUID } from 'node:crypto';
import type { WorkspacePlan } from '@vibecore/k8s-client';
import type { WorkspaceRecord, WorkspaceStore } from './manager.js';

export type AdmissionState = 'RESERVED' | 'PROVISIONING' | 'ACTIVE' | 'STOPPING' | 'RELEASED';
export interface WorkspaceAdmission {
  generation: string;
  attemptId?: string;
  state: AdmissionState;
  reservedAt: string;
}

export interface AdmissionGuard {
  lastActiveAt?: string;
  orgId?: string;
  projectId?: string;
}

export interface ReserveWorkspaceInput {
  workspaceId: string;
  orgId: string;
  projectId: string;
  plan: WorkspacePlan;
}

export function admissionUnavailable(code = 'WORKSPACE_ADMISSION_UNCONFIRMED'): Error {
  return Object.assign(new Error('Workspace admission could not be confirmed'), { statusCode: 503, code });
}

export function assertWorkspaceOwner(record: WorkspaceRecord, input: ReserveWorkspaceInput): void {
  if (record.orgId !== input.orgId || record.projectId !== input.projectId) {
    throw admissionUnavailable('WORKSPACE_ADMISSION_OWNER_MISMATCH');
  }
}

/** Both stores use the same protocol; create and compareAdmission must be atomic. */
export async function reserveInStore(store: WorkspaceStore, input: ReserveWorkspaceInput): Promise<WorkspaceRecord> {
  const admission: WorkspaceAdmission = {
    generation: randomUUID(),
    state: 'RESERVED',
    reservedAt: new Date().toISOString(),
  };
  let record = await store.get(input.workspaceId);

  if (!record) {
    try {
      return await store.create({
        id: input.workspaceId,
        orgId: input.orgId,
        projectId: input.projectId,
        plan: input.plan,
        status: 'STARTING',
        pvcName: `pvc-${input.workspaceId}`,
        podName: `workspace-${input.workspaceId}`,
        serviceName: `workspace-${input.workspaceId}`,
        agentTokenSecretName: `agent-token-${input.workspaceId}`,
        admission,
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      record = await store.get(input.workspaceId);
    }
  }

  if (!record) throw admissionUnavailable();
  if (record.projectId !== input.projectId) throw admissionUnavailable('WORKSPACE_ADMISSION_OWNER_MISMATCH');
  // A legacy row is not evidence that no Kubernetes mutation was issued. The
  // API revalidates project ownership before choosing its legacy lifecycle.
  if (!record.admission) return record;
  if (record.admission.state !== 'RELEASED') {
    assertWorkspaceOwner(record, input);
    return record;
  }

  // The API fences project transfers against all in-flight reserve requests.
  // Only a stopped, released runtime may adopt the project's new organization.
  await store.compareAdmission(
    record.id,
    record.admission,
    admission,
    {
      orgId: input.orgId,
      plan: input.plan,
      status: 'STARTING',
      lastActiveAt: admission.reservedAt,
      error: undefined,
    },
    { orgId: record.orgId, projectId: record.projectId },
  );
  const current = await store.get(record.id);
  if (!current) throw admissionUnavailable();
  assertWorkspaceOwner(current, input);
  return current;
}
