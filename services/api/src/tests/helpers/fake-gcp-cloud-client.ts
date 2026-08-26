import { GcpApiError, type GcpCloudClient, type GcpIamPolicy, type GcpProjectInfo } from '../../gcp-cloud-client.js';

interface FakeServiceAccount {
  email: string;
  disabled: boolean;
  keys: Array<{ name: string; keyType: string }>;
  policy: GcpIamPolicy;
}

interface FakeProject extends GcpProjectInfo {
  billingAccountName?: string;
  services: Set<string>;
  policy: GcpIamPolicy;
  buckets: Set<string>;
  accounts: Map<string, FakeServiceAccount>;
}

export class FakeGcpCloudClient implements GcpCloudClient {
  readonly projects = new Map<string, FakeProject>();
  readonly calls = new Map<string, number>();
  private readonly failures = new Map<string, Array<{ call: number; error: Error }>>();
  private etag = 1;

  seedProject(input: {
    projectId: string;
    labels?: Record<string, string>;
    owner?: string;
    ownerRoles?: string[];
    billingAccountId?: string;
    state?: string;
  }): FakeProject {
    const project: FakeProject = {
      projectId: input.projectId,
      projectNumber: String(100_000 + this.projects.size),
      state: input.state ?? 'ACTIVE',
      labels: input.labels ?? {},
      billingAccountName: input.billingAccountId ? `billingAccounts/${input.billingAccountId}` : undefined,
      services: new Set(),
      policy: {
        etag: this._etag(),
        version: 3,
        bindings:
          input.owner && input.ownerRoles?.length
            ? input.ownerRoles.map((role) => ({ role, members: [input.owner!] }))
            : [],
      },
      buckets: new Set(),
      accounts: new Map(),
    };
    this.projects.set(input.projectId, project);
    return project;
  }

  addServiceAccount(projectId: string, email: string, userManagedKeys = 0): void {
    const project = this._project(projectId);
    project.accounts.set(email, {
      email,
      disabled: false,
      keys: Array.from({ length: userManagedKeys }, (_, index) => ({
        name: `keys/${index}`,
        keyType: 'USER_MANAGED',
      })),
      policy: { etag: this._etag(), version: 3, bindings: [] },
    });
  }

  setUserManagedKeyCount(projectId: string, email: string, count: number): void {
    const account = this._project(projectId).accounts.get(email);
    if (!account) throw new GcpApiError(404, 'account not found', 'setUserManagedKeyCount');
    account.keys = Array.from({ length: count }, (_, index) => ({
      name: `keys/${index}`,
      keyType: 'USER_MANAGED',
    }));
  }

  finalizeProjectDeletion(projectId: string): void {
    this.projects.delete(projectId);
  }

  failOnCall(method: string, call: number, error = new GcpApiError(503, 'injected', method)): void {
    const list = this.failures.get(method) ?? [];
    list.push({ call, error });
    this.failures.set(method, list);
  }

  callCount(method: string): number {
    return this.calls.get(method) ?? 0;
  }

  private _before(method: string): void {
    const call = (this.calls.get(method) ?? 0) + 1;
    this.calls.set(method, call);
    const failure = this.failures.get(method)?.find((candidate) => candidate.call === call);
    if (failure) throw failure.error;
  }

  private _etag(): string {
    return Buffer.from(`etag-${this.etag++}`).toString('base64');
  }

  private _project(projectId: string): FakeProject {
    const project = this.projects.get(projectId);
    if (!project) throw new GcpApiError(404, 'project not found', 'fake');
    return project;
  }

  async createProject(input: {
    projectId: string;
    displayName: string;
    parent?: string;
    labels?: Record<string, string>;
  }): Promise<void> {
    this._before('createProject');
    if (this.projects.has(input.projectId)) throw new GcpApiError(409, 'already exists', 'createProject');
    const project = this.seedProject({ projectId: input.projectId, labels: input.labels, state: 'ACTIVE' });
    project.displayName = input.displayName;
    project.parent = input.parent;
  }

  async getProject(projectId: string): Promise<GcpProjectInfo | null> {
    this._before('getProject');
    const project = this.projects.get(projectId);
    return project
      ? {
          projectId: project.projectId,
          projectNumber: project.projectNumber,
          state: project.state,
          labels: { ...project.labels },
          displayName: project.displayName,
          parent: project.parent,
        }
      : null;
  }

  async deleteProject(projectId: string): Promise<void> {
    this._before('deleteProject');
    const project = this._project(projectId);
    project.state = 'DELETE_REQUESTED';
  }

  async undeleteProject(projectId: string): Promise<void> {
    this._before('undeleteProject');
    this._project(projectId).state = 'ACTIVE';
  }

  async getProjectIamPolicy(projectId: string): Promise<GcpIamPolicy> {
    this._before('getProjectIamPolicy');
    return structuredClone(this._project(projectId).policy);
  }

  async setProjectIamPolicy(projectId: string, policy: GcpIamPolicy): Promise<GcpIamPolicy> {
    this._before('setProjectIamPolicy');
    const project = this._project(projectId);
    if (!policy.etag || policy.etag !== project.policy.etag) {
      throw new GcpApiError(412, 'etag mismatch', 'setProjectIamPolicy');
    }
    project.policy = { ...structuredClone(policy), etag: this._etag(), version: 3 };
    return structuredClone(project.policy);
  }

  async createFolder(_parent: string, displayName: string): Promise<{ name: string }> {
    this._before('createFolder');
    return { name: `folders/${displayName.replace(/\D/g, '') || 1}` };
  }

  async listFolders(_parent: string): Promise<Array<{ name: string; displayName: string }>> {
    this._before('listFolders');
    return [];
  }

  async linkProjectBilling(projectId: string, billingAccountId: string): Promise<void> {
    this._before('linkProjectBilling');
    this._project(projectId).billingAccountName = `billingAccounts/${billingAccountId}`;
  }

  async unlinkProjectBilling(projectId: string): Promise<void> {
    this._before('unlinkProjectBilling');
    this._project(projectId).billingAccountName = undefined;
  }

  async getProjectBillingInfo(projectId: string): Promise<{ billingEnabled: boolean; billingAccountName?: string }> {
    this._before('getProjectBillingInfo');
    const billingAccountName = this._project(projectId).billingAccountName;
    return { billingEnabled: Boolean(billingAccountName), billingAccountName };
  }

  async enableServices(projectId: string, services: string[]): Promise<void> {
    this._before('enableServices');
    const project = this._project(projectId);
    services.forEach((service) => project.services.add(service));
  }

  async listEnabledServices(projectId: string): Promise<string[]> {
    this._before('listEnabledServices');
    return [...this._project(projectId).services];
  }

  async createServiceAccount(projectId: string, accountId: string): Promise<{ email: string }> {
    this._before('createServiceAccount');
    const project = this._project(projectId);
    const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;
    if (project.accounts.has(email)) throw new GcpApiError(409, 'already exists', 'createServiceAccount');
    this.addServiceAccount(projectId, email);
    return { email };
  }

  async getServiceAccount(projectId: string, email: string): Promise<{ email: string; disabled?: boolean } | null> {
    this._before('getServiceAccount');
    const account = this._project(projectId).accounts.get(email);
    return account ? { email: account.email, disabled: account.disabled } : null;
  }

  async disableServiceAccount(projectId: string, email: string): Promise<void> {
    this._before('disableServiceAccount');
    const account = this._project(projectId).accounts.get(email);
    if (!account) throw new GcpApiError(404, 'account not found', 'disableServiceAccount');
    account.disabled = true;
  }

  async enableServiceAccount(projectId: string, email: string): Promise<void> {
    this._before('enableServiceAccount');
    const account = this._project(projectId).accounts.get(email);
    if (!account) throw new GcpApiError(404, 'account not found', 'enableServiceAccount');
    account.disabled = false;
  }

  async listServiceAccounts(projectId: string): Promise<Array<{ email: string }>> {
    this._before('listServiceAccounts');
    return [...this._project(projectId).accounts.values()].map((account) => ({ email: account.email }));
  }

  async listServiceAccountKeys(projectId: string, email: string) {
    this._before('listServiceAccountKeys');
    const account = this._project(projectId).accounts.get(email);
    if (!account) throw new GcpApiError(404, 'account not found', 'listServiceAccountKeys');
    return structuredClone(account.keys);
  }

  async getServiceAccountIamPolicy(email: string): Promise<GcpIamPolicy> {
    this._before('getServiceAccountIamPolicy');
    for (const project of this.projects.values()) {
      const account = project.accounts.get(email);
      if (account) return structuredClone(account.policy);
    }
    throw new GcpApiError(404, 'account not found', 'getServiceAccountIamPolicy');
  }

  async setServiceAccountIamPolicy(email: string, policy: GcpIamPolicy): Promise<GcpIamPolicy> {
    this._before('setServiceAccountIamPolicy');
    for (const project of this.projects.values()) {
      const account = project.accounts.get(email);
      if (!account) continue;
      if (!policy.etag || account.policy.etag !== policy.etag) {
        throw new GcpApiError(412, 'etag mismatch', 'setServiceAccountIamPolicy');
      }
      account.policy = { ...structuredClone(policy), etag: this._etag(), version: 3 };
      return structuredClone(account.policy);
    }
    throw new GcpApiError(404, 'account not found', 'setServiceAccountIamPolicy');
  }

  async listBuckets(projectId: string): Promise<Array<{ name: string }>> {
    this._before('listBuckets');
    return [...this._project(projectId).buckets].map((name) => ({ name }));
  }

  async deleteBucket(name: string, beforeIrreversibleDelete?: () => Promise<void>): Promise<void> {
    this._before('deleteBucket');
    await beforeIrreversibleDelete?.();
    for (const project of this.projects.values()) project.buckets.delete(name);
  }
}
