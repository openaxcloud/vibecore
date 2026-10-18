import { appPublicEnglish } from './app-public-copy.js';
import type { ApiStore } from './store.js';

export interface WorkspaceAdmission {
  generation: string;
  state: 'RESERVED' | 'PROVISIONING' | 'ACTIVE' | 'STOPPING' | 'RELEASED';
  reservedAt: string;
}

export interface AdmittedWorkspace {
  id: string;
  orgId: string;
  projectId: string;
  status: string;
  admission?: WorkspaceAdmission;
  legacy?: boolean;
}

export type WorkspaceManagerRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Rollout has two phases: quota readers first, then new reservations. The first
 * phase accepts an old manager's 404 for the versioned list, but never treats a
 * network/5xx failure as zero usage. Enabling reservations requires all readers
 * and managers to have completed that first rollout.
 */
export class WorkspaceAdmissionClient {
  constructor(
    private readonly _store: ApiStore,
    private readonly _request: WorkspaceManagerRequest,
  ) {}

  get enabled() {
    return process.env.WORKSPACE_ADMISSION_V2_ENABLED === 'true';
  }

  get quotaEnabled() {
    return this.enabled || process.env.WORKSPACE_ADMISSION_V2_QUOTA_ENABLED === 'true';
  }

  async held(organizationId: string): Promise<AdmittedWorkspace[]> {
    if (!this.quotaEnabled) {
      return [];
    }

    try {
      const result = await this._request<{ workspaces: AdmittedWorkspace[] }>(
        `/v2/organizations/${encodeURIComponent(organizationId)}/admissions`,
      );

      if (!Array.isArray(result.workspaces)) {
        throw new Error(appPublicEnglish('WORKSPACE_MANAGER_INVALID_ADMISSION_RESPONSE'));
      }

      return result.workspaces.filter((workspace) => workspace.admission && workspace.admission.state !== 'RELEASED');
    } catch (error) {
      if (!this.enabled && (error as { managerStatus?: number })?.managerStatus === 404) {
        return [];
      }

      throw error;
    }
  }

  async count(organizationId: string) {
    const held = await this.held(organizationId);
    const ids = [...new Set(held.map((workspace) => workspace.id))];

    // Manager reservations survive stale API timestamps and FAILED UI records.
    return ids.length + (await this._store.countActiveWorkspaces(organizationId, ids));
  }

  async get(workspaceId: string): Promise<AdmittedWorkspace | undefined> {
    if (!this.quotaEnabled) {
      return undefined;
    }

    try {
      return await this._request<AdmittedWorkspace>(`/v2/workspaces/${encodeURIComponent(workspaceId)}`);
    } catch (error) {
      if ((error as { managerStatus?: number })?.managerStatus === 404) {
        return undefined;
      }

      throw error;
    }
  }

  async reserve(input: { workspaceId: string; orgId: string; projectId: string; plan: string }) {
    if (!this.enabled) {
      return undefined;
    }

    return this._request<AdmittedWorkspace>('/v2/workspaces/reserve', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async release(workspace: AdmittedWorkspace, deadlineMs: number) {
    if (!this.enabled || !workspace.admission) {
      return false;
    }

    const result = await this._request<{ released: boolean }>(
      `/v2/workspaces/${encodeURIComponent(workspace.id)}/release`,
      {
        method: 'POST',
        body: JSON.stringify({ generation: workspace.admission.generation, deadlineMs }),
      },
    );

    return result.released === true;
  }

  async stop(workspaceId: string, expectedOrganizationId?: string) {
    const record = await this.get(workspaceId);

    if (record?.admission && expectedOrganizationId && record.orgId !== expectedOrganizationId) {
      throw Object.assign(new Error(appPublicEnglish('WORKSPACE_PROJECT_MISMATCH')), {
        statusCode: 409,
        code: 'WORKSPACE_PROJECT_MISMATCH',
      });
    }

    if (!record?.admission) {
      return this._request(`/workspaces/${encodeURIComponent(workspaceId)}/stop`, { method: 'POST' });
    }

    return this._request(`/v2/workspaces/${encodeURIComponent(workspaceId)}/stop`, {
      method: 'POST',
      body: JSON.stringify({ generation: record.admission.generation }),
    });
  }
}
