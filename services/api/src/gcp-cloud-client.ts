import { Storage } from '@google-cloud/storage';

export interface GcpTokenProvider {
  getAccessToken(): Promise<string>;
}

/**
 * Production authentication is Application Default Credentials. On GKE this
 * resolves to Workload Identity; locally it resolves to user ADC. There is no
 * service-account JSON/key-file path in this module.
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
  condition?: { title?: string; description?: string; expression?: string };
}

export interface GcpIamPolicy {
  bindings?: GcpIamBinding[];
  etag?: string;
  version?: number;
}

export interface GcpProjectInfo {
  projectId: string;
  state: string;
  projectNumber?: string;
  parent?: string;
  displayName?: string;
  labels?: Record<string, string>;
}

export interface GcpServiceAccountKeyInfo {
  name: string;
  keyType: 'USER_MANAGED' | 'SYSTEM_MANAGED' | string;
}

function safeGcpMessage(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 500);
}

export class GcpApiError extends Error {
  constructor(
    readonly status: number,
    readonly gcpMessage: string,
    readonly requestName: string,
    readonly retryAfterMs?: number,
  ) {
    super(`GCP ${status} during ${requestName}: ${safeGcpMessage(gcpMessage)}`);
    this.name = 'GcpApiError';
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  /** A 403 is intentionally never collapsed into absence. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isAlreadyExists(): boolean {
    return this.status === 409;
  }

  get isPreconditionFailed(): boolean {
    return this.status === 409 || this.status === 412;
  }
}

export interface GcpCloudClient {
  createProject(input: {
    projectId: string;
    displayName: string;
    parent?: string;
    labels?: Record<string, string>;
  }): Promise<void>;
  getProject(projectId: string): Promise<GcpProjectInfo | null>;
  deleteProject(projectId: string): Promise<void>;
  undeleteProject(projectId: string): Promise<void>;
  getProjectIamPolicy(projectId: string): Promise<GcpIamPolicy>;
  setProjectIamPolicy(projectId: string, policy: GcpIamPolicy): Promise<GcpIamPolicy>;
  createFolder(parent: string, displayName: string): Promise<{ name: string }>;
  listFolders(parent: string): Promise<Array<{ name: string; displayName: string }>>;
  linkProjectBilling(projectId: string, billingAccountId: string): Promise<void>;
  unlinkProjectBilling(projectId: string): Promise<void>;
  getProjectBillingInfo(projectId: string): Promise<{ billingEnabled: boolean; billingAccountName?: string }>;
  enableServices(projectId: string, services: string[]): Promise<void>;
  listEnabledServices(projectId: string): Promise<string[]>;
  createServiceAccount(projectId: string, accountId: string, displayName: string): Promise<{ email: string }>;
  getServiceAccount(projectId: string, email: string): Promise<{ email: string; disabled?: boolean } | null>;
  disableServiceAccount(projectId: string, email: string): Promise<void>;
  enableServiceAccount(projectId: string, email: string): Promise<void>;
  listServiceAccounts(projectId: string): Promise<Array<{ email: string }>>;
  listServiceAccountKeys(projectId: string, email: string): Promise<GcpServiceAccountKeyInfo[]>;
  getServiceAccountIamPolicy(email: string): Promise<GcpIamPolicy>;
  setServiceAccountIamPolicy(email: string, policy: GcpIamPolicy): Promise<GcpIamPolicy>;
  listBuckets(projectId: string): Promise<Array<{ name: string }>>;
  /** Deletes every object generation, then the bucket; 404 is idempotent. */
  deleteBucket(name: string, beforeIrreversibleDelete?: () => Promise<void>): Promise<void>;
}

interface RestClientOptions {
  requestTimeoutMs?: number;
  operationTimeoutMs?: number;
  maxAttempts?: number;
  baseRetryMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface CallOptions {
  idempotent?: boolean;
  requestName: string;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

export class RestGcpCloudClient implements GcpCloudClient {
  private readonly _requestTimeoutMs: number;
  private readonly _operationTimeoutMs: number;
  private readonly _maxAttempts: number;
  private readonly _baseRetryMs: number;
  private readonly _sleep: (ms: number) => Promise<void>;
  private readonly _random: () => number;

  constructor(
    private readonly _tokens: GcpTokenProvider = createAdcTokenProvider(),
    private readonly _fetchImpl: typeof fetch = fetch,
    options: RestClientOptions = {},
  ) {
    this._requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this._operationTimeoutMs = options.operationTimeoutMs ?? 120_000;
    this._maxAttempts = options.maxAttempts ?? 4;
    this._baseRetryMs = options.baseRetryMs ?? 250;
    this._sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this._random = options.random ?? Math.random;
  }

  private async _call<T>(method: string, url: string, body: unknown, options: CallOptions): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const token = await this._tokens.getAccessToken();
        const response = await this._fetchImpl(url, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this._requestTimeoutMs),
        });
        const text = await response.text();

        if (!response.ok) {
          let message = text;

          try {
            message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
          } catch {
            // Preserve a bounded, sanitized response excerpt.
          }

          const error = new GcpApiError(
            response.status,
            message,
            options.requestName,
            retryAfterMs(response.headers.get('retry-after')),
          );

          if (!options.idempotent || !RETRYABLE_STATUS.has(response.status) || attempt >= this._maxAttempts) {
            throw error;
          }

          await this._retryDelay(attempt, error.retryAfterMs);
          continue;
        }

        if (!text) return {} as T;

        try {
          return JSON.parse(text) as T;
        } catch {
          throw new GcpApiError(502, 'GCP returned malformed JSON', options.requestName);
        }
      } catch (error) {
        if (error instanceof GcpApiError) throw error;

        if (!options.idempotent || attempt >= this._maxAttempts) {
          const message = error instanceof Error ? error.message : String(error);
          throw new GcpApiError(504, message, options.requestName);
        }

        await this._retryDelay(attempt);
      }
    }
  }

  private async _retryDelay(attempt: number, explicit?: number): Promise<void> {
    const capped = Math.min(10_000, this._baseRetryMs * 2 ** (attempt - 1));
    // Retry-After is advisory and controlled by the remote response. Bound it
    // so one response cannot park a worker beyond its durable operation lease.
    await this._sleep(explicit === undefined ? Math.floor(this._random() * capped) : Math.min(10_000, explicit));
  }

  private async _allPages<T>(input: {
    requestName: string;
    firstUrl: string;
    items: (body: T) => unknown[] | undefined;
    token: (body: T) => string | undefined;
  }): Promise<unknown[]> {
    const items: unknown[] = [];
    let url = input.firstUrl;
    const seen = new Set<string>();

    for (let page = 0; page < 1000; page += 1) {
      const body = await this._call<T>('GET', url, undefined, { idempotent: true, requestName: input.requestName });
      items.push(...(input.items(body) ?? []));
      const token = input.token(body) ?? '';

      if (!token) return items;
      if (seen.has(token)) throw new GcpApiError(502, 'GCP repeated a pagination token', input.requestName);
      seen.add(token);
      const separator = input.firstUrl.includes('?') ? '&' : '?';
      url = `${input.firstUrl}${separator}pageToken=${encodeURIComponent(token)}`;
    }

    throw new GcpApiError(502, 'GCP pagination exceeded 1000 pages', input.requestName);
  }

  private async _pollOperation<T extends { name: string }>(operation: T, requestName: string): Promise<T> {
    const deadline = Date.now() + this._operationTimeoutMs;
    let current: T = operation;

    while (Date.now() < deadline) {
      const state = current as T & { done?: boolean; error?: { code?: number; message?: string } };

      if (state.error) {
        throw new GcpApiError(
          state.error.code ?? 500,
          state.error.message ?? 'Long-running operation failed',
          requestName,
        );
      }

      if (state.done) return current;
      await this._sleep(1000);
      current = await this._call<T>(
        'GET',
        `https://cloudresourcemanager.googleapis.com/v3/${operation.name}`,
        undefined,
        { idempotent: true, requestName },
      );
    }

    throw new GcpApiError(504, 'Long-running operation deadline exceeded', requestName);
  }

  async createProject(input: {
    projectId: string;
    displayName: string;
    parent?: string;
    labels?: Record<string, string>;
  }): Promise<void> {
    await this._call('POST', 'https://cloudresourcemanager.googleapis.com/v3/projects', input, {
      requestName: 'projects.create',
    });
  }

  async getProject(projectId: string): Promise<GcpProjectInfo | null> {
    try {
      const project = await this._call<{
        projectId: string;
        state: string;
        name: string;
        parent?: string;
        displayName?: string;
        labels?: Record<string, string>;
      }>('GET', `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}`, undefined, {
        idempotent: true,
        requestName: 'projects.get',
      });

      return {
        projectId: project.projectId,
        state: project.state,
        projectNumber: project.name.replace(/^projects\//, ''),
        parent: project.parent,
        displayName: project.displayName,
        labels: project.labels,
      };
    } catch (error) {
      if (error instanceof GcpApiError && error.isNotFound) return null;
      throw error;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      await this._call(
        'DELETE',
        `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}`,
        undefined,
        { idempotent: true, requestName: 'projects.delete' },
      );
    } catch (error) {
      if (!(error instanceof GcpApiError && error.isNotFound)) throw error;
    }
  }

  async undeleteProject(projectId: string): Promise<void> {
    await this._call(
      'POST',
      `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}:undelete`,
      {},
      { requestName: 'projects.undelete' },
    );
  }

  getProjectIamPolicy(projectId: string): Promise<GcpIamPolicy> {
    return this._call(
      'POST',
      `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}:getIamPolicy`,
      { options: { requestedPolicyVersion: 3 } },
      { idempotent: true, requestName: 'projects.getIamPolicy' },
    );
  }

  setProjectIamPolicy(projectId: string, policy: GcpIamPolicy): Promise<GcpIamPolicy> {
    if (!policy.etag) {
      throw new GcpApiError(412, 'Refusing an IAM write without an ETag', 'projects.setIamPolicy');
    }

    return this._call(
      'POST',
      `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}:setIamPolicy`,
      { policy: { ...policy, version: Math.max(policy.version ?? 1, 3) } },
      { requestName: 'projects.setIamPolicy' },
    );
  }

  async createFolder(parent: string, displayName: string): Promise<{ name: string }> {
    const operation = await this._call<{ name: string; done?: boolean; response?: { name?: string } }>(
      'POST',
      'https://cloudresourcemanager.googleapis.com/v3/folders',
      { parent, displayName },
      { requestName: 'folders.create' },
    );
    const completed = await this._pollOperation(operation, 'folders.create');
    const name = completed.response?.name;

    if (!name) throw new GcpApiError(502, 'Folder operation completed without a folder name', 'folders.create');
    return { name };
  }

  async listFolders(parent: string): Promise<Array<{ name: string; displayName: string }>> {
    const firstUrl = `https://cloudresourcemanager.googleapis.com/v3/folders?parent=${encodeURIComponent(parent)}&pageSize=200`;
    return (await this._allPages<{ folders?: Array<{ name: string; displayName: string }>; nextPageToken?: string }>({
      requestName: 'folders.list',
      firstUrl,
      items: (body) => body.folders,
      token: (body) => body.nextPageToken,
    })) as Array<{ name: string; displayName: string }>;
  }

  async linkProjectBilling(projectId: string, billingAccountId: string): Promise<void> {
    await this._call(
      'PUT',
      `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`,
      { billingAccountName: `billingAccounts/${billingAccountId}` },
      { idempotent: true, requestName: 'billing.updateProjectBillingInfo' },
    );
  }

  async unlinkProjectBilling(projectId: string): Promise<void> {
    await this._call(
      'PUT',
      `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`,
      { billingAccountName: '' },
      { idempotent: true, requestName: 'billing.updateProjectBillingInfo' },
    );
  }

  async getProjectBillingInfo(projectId: string): Promise<{ billingEnabled: boolean; billingAccountName?: string }> {
    const body = await this._call<{ billingEnabled?: boolean; billingAccountName?: string }>(
      'GET',
      `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`,
      undefined,
      { idempotent: true, requestName: 'billing.getProjectBillingInfo' },
    );
    return { billingEnabled: body.billingEnabled ?? false, billingAccountName: body.billingAccountName };
  }

  async enableServices(projectId: string, services: string[]): Promise<void> {
    await this._call(
      'POST',
      `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services:batchEnable`,
      { serviceIds: services },
      { requestName: 'serviceusage.batchEnable' },
    );
  }

  async listEnabledServices(projectId: string): Promise<string[]> {
    const firstUrl = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services?filter=state%3AENABLED&pageSize=200`;
    const services = (await this._allPages<{
      services?: Array<{ config?: { name?: string } }>;
      nextPageToken?: string;
    }>({
      requestName: 'serviceusage.list',
      firstUrl,
      items: (body) => body.services,
      token: (body) => body.nextPageToken,
    })) as Array<{ config?: { name?: string } }>;
    return services.map((service) => service.config?.name ?? '').filter(Boolean);
  }

  async createServiceAccount(projectId: string, accountId: string, displayName: string): Promise<{ email: string }> {
    return this._call(
      'POST',
      `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts`,
      { accountId, serviceAccount: { displayName } },
      { requestName: 'iam.serviceAccounts.create' },
    );
  }

  async getServiceAccount(projectId: string, email: string): Promise<{ email: string; disabled?: boolean } | null> {
    try {
      return await this._call(
        'GET',
        `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts/${encodeURIComponent(email)}`,
        undefined,
        { idempotent: true, requestName: 'iam.serviceAccounts.get' },
      );
    } catch (error) {
      if (error instanceof GcpApiError && error.isNotFound) return null;
      throw error;
    }
  }

  async disableServiceAccount(projectId: string, email: string): Promise<void> {
    await this._call(
      'POST',
      `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts/${encodeURIComponent(email)}:disable`,
      {},
      { requestName: 'iam.serviceAccounts.disable' },
    );
  }

  async enableServiceAccount(projectId: string, email: string): Promise<void> {
    await this._call(
      'POST',
      `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts/${encodeURIComponent(email)}:enable`,
      {},
      { requestName: 'iam.serviceAccounts.enable' },
    );
  }

  async listServiceAccounts(projectId: string): Promise<Array<{ email: string }>> {
    const firstUrl = `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts?pageSize=100`;
    return (await this._allPages<{ accounts?: Array<{ email: string }>; nextPageToken?: string }>({
      requestName: 'iam.serviceAccounts.list',
      firstUrl,
      items: (body) => body.accounts,
      token: (body) => body.nextPageToken,
    })) as Array<{ email: string }>;
  }

  async listServiceAccountKeys(projectId: string, email: string): Promise<GcpServiceAccountKeyInfo[]> {
    const body = await this._call<{ keys?: Array<{ name: string; keyType: string }> }>(
      'GET',
      `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts/${encodeURIComponent(email)}/keys`,
      undefined,
      { idempotent: true, requestName: 'iam.serviceAccountKeys.list' },
    );
    return body.keys ?? [];
  }

  getServiceAccountIamPolicy(email: string): Promise<GcpIamPolicy> {
    return this._call(
      'POST',
      `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:getIamPolicy`,
      { options: { requestedPolicyVersion: 3 } },
      { idempotent: true, requestName: 'iam.serviceAccounts.getIamPolicy' },
    );
  }

  setServiceAccountIamPolicy(email: string, policy: GcpIamPolicy): Promise<GcpIamPolicy> {
    if (!policy.etag) {
      throw new GcpApiError(412, 'Refusing an IAM write without an ETag', 'iam.serviceAccounts.setIamPolicy');
    }

    return this._call(
      'POST',
      `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:setIamPolicy`,
      { policy: { ...policy, version: Math.max(policy.version ?? 1, 3) } },
      { requestName: 'iam.serviceAccounts.setIamPolicy' },
    );
  }

  async listBuckets(projectId: string): Promise<Array<{ name: string }>> {
    const firstUrl = `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}&maxResults=1000`;
    return (await this._allPages<{ items?: Array<{ name: string }>; nextPageToken?: string }>({
      requestName: 'storage.buckets.list',
      firstUrl,
      items: (body) => body.items,
      token: (body) => body.nextPageToken,
    })) as Array<{ name: string }>;
  }

  async deleteBucket(name: string, beforeIrreversibleDelete?: () => Promise<void>): Promise<void> {
    const firstUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}/o?versions=true&maxResults=1000`;

    try {
      const objects = (await this._allPages<{
        items?: Array<{ name: string; generation?: string }>;
        nextPageToken?: string;
      }>({
        requestName: 'storage.objects.list',
        firstUrl,
        items: (body) => body.items,
        token: (body) => body.nextPageToken,
      })) as Array<{ name: string; generation?: string }>;

      for (const object of objects) {
        const generation = object.generation ? `?generation=${encodeURIComponent(object.generation)}` : '';

        try {
          await beforeIrreversibleDelete?.();
          await this._call(
            'DELETE',
            `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}/o/${encodeURIComponent(object.name)}${generation}`,
            undefined,
            { idempotent: true, requestName: 'storage.objects.delete' },
          );
        } catch (error) {
          if (!(error instanceof GcpApiError && error.isNotFound)) throw error;
        }
      }

      await beforeIrreversibleDelete?.();
      await this._call('DELETE', `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}`, undefined, {
        idempotent: true,
        requestName: 'storage.buckets.delete',
      });
    } catch (error) {
      if (!(error instanceof GcpApiError && error.isNotFound)) throw error;
    }
  }
}
