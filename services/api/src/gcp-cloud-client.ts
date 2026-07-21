/*
 * Thin REST client for the GCP control-plane surfaces the CloudTenant /
 * Project Factory / Platform IAM services need: Resource Manager (projects,
 * folders, IAM policies), Cloud Billing, Service Usage, IAM service accounts
 * and Cloud Storage bucket listing (teardown inventory).
 *
 * Auth is Application Default Credentials (Workload Identity on GKE) via an
 * injectable token provider — tests inject a fake client, the live-proof
 * harness injects a gcloud-CLI token provider. There is DELIBERATELY no
 * method to create a service-account key: I-IAM-2 (zero persistent keys) is
 * structural here, not a lint rule.
 */

import { Storage } from '@google-cloud/storage';

export interface GcpTokenProvider {
  getAccessToken(): Promise<string>;
}

/**
 * ADC (Workload Identity on GKE, user ADC locally). google-auth-library is
 * reached through @google-cloud/storage's public `authClient` (a GoogleAuth
 * instance scoped to cloud-platform) so the api service does not grow a new
 * top-level dependency for a token it can already mint.
 */
export function createAdcTokenProvider(): GcpTokenProvider {
  const auth = new Storage().authClient;

  return {
    async getAccessToken() {
      const token = await auth.getAccessToken();

      if (!token) {
        throw new Error('ADC returned no access token');
      }

      return token;
    },
  };
}

export interface GcpIamBinding {
  role: string;
  members: string[];
  condition?: unknown;
}

export interface GcpIamPolicy {
  bindings?: GcpIamBinding[];
  etag?: string;
  version?: number;
}

export interface GcpProjectInfo {
  projectId: string;

  /** ACTIVE | DELETE_REQUESTED | DELETE_IN_PROGRESS */
  state: string;
  projectNumber?: string;
  parent?: string;
  displayName?: string;
}

export interface GcpServiceAccountKeyInfo {
  name: string;

  /** USER_MANAGED keys are persistent credentials — forbidden (I-IAM-2). */
  keyType: 'USER_MANAGED' | 'SYSTEM_MANAGED' | string;
}

export class GcpApiError extends Error {
  constructor(
    readonly status: number,
    readonly gcpMessage: string,
    readonly url: string,
  ) {
    super(`GCP ${status} on ${url}: ${gcpMessage}`);
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  get isNotFound(): boolean {
    return this.status === 404 || this.status === 403;
  }

  get isAlreadyExists(): boolean {
    return this.status === 409;
  }
}

export interface GcpCloudClient {
  // Resource Manager — projects
  createProject(input: {
    projectId: string;
    displayName: string;
    parent?: string;
    labels?: Record<string, string>;
  }): Promise<void>;
  getProject(projectId: string): Promise<GcpProjectInfo | null>;

  /** Soft delete: project enters DELETE_REQUESTED, recoverable ~30 days. */
  deleteProject(projectId: string): Promise<void>;
  undeleteProject(projectId: string): Promise<void>;
  getProjectIamPolicy(projectId: string): Promise<GcpIamPolicy>;
  setProjectIamPolicy(projectId: string, policy: GcpIamPolicy): Promise<GcpIamPolicy>;

  // Resource Manager — folders (rate-limited HARD: measured 2026-07-17 at
  // 5.8 sustained creations/min, burst ~10 then 429 — callers must treat
  // createFolder as a scarce operation, never a per-tenant default).
  createFolder(parent: string, displayName: string): Promise<{ name: string }>;
  listFolders(parent: string): Promise<Array<{ name: string; displayName: string }>>;

  // Cloud Billing
  linkProjectBilling(projectId: string, billingAccountId: string): Promise<void>;
  getProjectBillingInfo(projectId: string): Promise<{ billingEnabled: boolean; billingAccountName?: string }>;

  // Service Usage
  enableServices(projectId: string, services: string[]): Promise<void>;
  listEnabledServices(projectId: string): Promise<string[]>;

  // IAM service accounts — note: NO key-creation method exists (I-IAM-2).
  createServiceAccount(projectId: string, accountId: string, displayName: string): Promise<{ email: string }>;
  getServiceAccount(projectId: string, email: string): Promise<{ email: string; disabled?: boolean } | null>;
  listServiceAccounts(projectId: string): Promise<Array<{ email: string }>>;
  listServiceAccountKeys(projectId: string, email: string): Promise<GcpServiceAccountKeyInfo[]>;

  // Cloud Storage (teardown inventory only)
  listBuckets(projectId: string): Promise<Array<{ name: string }>>;
  deleteBucket(name: string): Promise<void>;
}

export class RestGcpCloudClient implements GcpCloudClient {
  constructor(
    private readonly _tokens: GcpTokenProvider = createAdcTokenProvider(),
    private readonly _fetchImpl: typeof fetch = fetch,
  ) {}

  private async _call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const token = await this._tokens.getAccessToken();
    const res = await this._fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();

    if (!res.ok) {
      let message = text.slice(0, 500);

      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // keep raw body excerpt
      }

      throw new GcpApiError(res.status, message, url);
    }

    return (text ? JSON.parse(text) : {}) as T;
  }

  async createProject(input: {
    projectId: string;
    displayName: string;
    parent?: string;
    labels?: Record<string, string>;
  }): Promise<void> {
    await this._call('POST', 'https://cloudresourcemanager.googleapis.com/v3/projects', {
      projectId: input.projectId,
      displayName: input.displayName,
      parent: input.parent,
      labels: input.labels,
    });
  }

  async getProject(projectId: string): Promise<GcpProjectInfo | null> {
    try {
      const p = await this._call<{
        projectId: string;
        state: string;
        name: string;
        parent?: string;
        displayName?: string;
      }>('GET', `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}`);

      return {
        projectId: p.projectId,
        state: p.state,
        projectNumber: p.name?.replace('projects/', ''),
        parent: p.parent,
        displayName: p.displayName,
      };
    } catch (error) {
      if (error instanceof GcpApiError && error.isNotFound) {
        return null;
      }

      throw error;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    await this._call('DELETE', `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}`);
  }

  async undeleteProject(projectId: string): Promise<void> {
    await this._call('POST', `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}:undelete`, {});
  }

  async getProjectIamPolicy(projectId: string): Promise<GcpIamPolicy> {
    return this._call('POST', `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}:getIamPolicy`, {});
  }

  async setProjectIamPolicy(projectId: string, policy: GcpIamPolicy): Promise<GcpIamPolicy> {
    return this._call('POST', `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}:setIamPolicy`, {
      policy,
    });
  }

  async createFolder(parent: string, displayName: string): Promise<{ name: string }> {
    const op = await this._call<{ name: string; response?: { name?: string }; done?: boolean }>(
      'POST',
      'https://cloudresourcemanager.googleapis.com/v3/folders',
      { parent, displayName },
    );

    if (op.response?.name) {
      return { name: op.response.name };
    }

    /*
     * folders.create returns a long-running operation; poll it briefly so the
     * caller gets a concrete folder name.
     */
    for (let i = 0; i < 10; i += 1) {
      const polled = await this._call<{ done?: boolean; response?: { name?: string } }>(
        'GET',
        `https://cloudresourcemanager.googleapis.com/v3/${op.name}`,
      );

      if (polled.done && polled.response?.name) {
        return { name: polled.response.name };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Folder creation operation ${op.name} did not complete in time`);
  }

  async listFolders(parent: string): Promise<Array<{ name: string; displayName: string }>> {
    const res = await this._call<{ folders?: Array<{ name: string; displayName: string }> }>(
      'GET',
      `https://cloudresourcemanager.googleapis.com/v3/folders?parent=${encodeURIComponent(parent)}`,
    );

    return res.folders ?? [];
  }

  async linkProjectBilling(projectId: string, billingAccountId: string): Promise<void> {
    await this._call('PUT', `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
      billingAccountName: `billingAccounts/${billingAccountId}`,
    });
  }

  async getProjectBillingInfo(projectId: string): Promise<{ billingEnabled: boolean; billingAccountName?: string }> {
    const res = await this._call<{ billingEnabled?: boolean; billingAccountName?: string }>(
      'GET',
      `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`,
    );

    return { billingEnabled: res.billingEnabled ?? false, billingAccountName: res.billingAccountName };
  }

  async enableServices(projectId: string, services: string[]): Promise<void> {
    await this._call('POST', `https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`, {
      serviceIds: services,
    });
  }

  async listEnabledServices(projectId: string): Promise<string[]> {
    const names: string[] = [];
    let pageToken = '';

    do {
      const res = await this._call<{ services?: Array<{ config?: { name?: string } }>; nextPageToken?: string }>(
        'GET',
        `https://serviceusage.googleapis.com/v1/projects/${projectId}/services?filter=state:ENABLED&pageSize=200${
          pageToken ? `&pageToken=${pageToken}` : ''
        }`,
      );
      names.push(...(res.services ?? []).map((s) => s.config?.name ?? '').filter(Boolean));
      pageToken = res.nextPageToken ?? '';
    } while (pageToken);

    return names;
  }

  async createServiceAccount(projectId: string, accountId: string, displayName: string): Promise<{ email: string }> {
    const res = await this._call<{ email: string }>(
      'POST',
      `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`,
      { accountId, serviceAccount: { displayName } },
    );

    return { email: res.email };
  }

  async getServiceAccount(projectId: string, email: string): Promise<{ email: string; disabled?: boolean } | null> {
    try {
      return await this._call<{ email: string; disabled?: boolean }>(
        'GET',
        `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${email}`,
      );
    } catch (error) {
      if (error instanceof GcpApiError && error.isNotFound) {
        return null;
      }

      throw error;
    }
  }

  async listServiceAccounts(projectId: string): Promise<Array<{ email: string }>> {
    const accounts: Array<{ email: string }> = [];
    let pageToken = '';

    do {
      const res = await this._call<{ accounts?: Array<{ email: string }>; nextPageToken?: string }>(
        'GET',
        `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts?pageSize=100${
          pageToken ? `&pageToken=${pageToken}` : ''
        }`,
      );
      accounts.push(...(res.accounts ?? []));
      pageToken = res.nextPageToken ?? '';
    } while (pageToken);

    return accounts;
  }

  async listServiceAccountKeys(projectId: string, email: string): Promise<GcpServiceAccountKeyInfo[]> {
    const res = await this._call<{ keys?: Array<{ name: string; keyType: string }> }>(
      'GET',
      `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${email}/keys`,
    );

    return (res.keys ?? []).map((k) => ({ name: k.name, keyType: k.keyType }));
  }

  async listBuckets(projectId: string): Promise<Array<{ name: string }>> {
    try {
      const res = await this._call<{ items?: Array<{ name: string }> }>(
        'GET',
        `https://storage.googleapis.com/storage/v1/b?project=${projectId}`,
      );

      return res.items ?? [];
    } catch (error) {
      /*
       * A soft-deleted project answers 403 "project is pending deletion" —
       * for teardown verification that means "no reachable resources".
       */
      if (error instanceof GcpApiError && error.isNotFound) {
        return [];
      }

      throw error;
    }
  }

  async deleteBucket(name: string): Promise<void> {
    await this._call('DELETE', `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}`);
  }
}
