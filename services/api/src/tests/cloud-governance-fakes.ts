/*
 * In-memory test doubles for the CloudTenant / Project Factory / IAM specs:
 * a CloudGovernanceStore backed by Maps (enforcing the same UNIQUEs the DB
 * does, P2002-style) and a FakeGcpCloudClient that models just enough of the
 * GCP control plane (projects, IAM policies, service accounts, buckets,
 * billing, services) to exercise every invariant. Test-only.
 */

import type {
  CloudGovernanceStore,
  CloudProjectBinding,
  CloudProjectFactoryEvent,
  CloudTeardownRecord,
  CloudTenant,
  CloudTenantTransfer,
  CreateCloudProjectBindingInput,
  CreateCloudTenantInput,
  PlatformIamIdentity,
  PlatformIamIdentityBoundary,
  PlatformIamImpersonationAudit,
} from '../cloud-governance-store.js';
import type { GcpCloudClient, GcpIamPolicy, GcpProjectInfo, GcpServiceAccountKeyInfo } from '../gcp-cloud-client.js';
import { GcpApiError } from '../gcp-cloud-client.js';

let seq = 0;

const nextId = (prefix: string) => `${prefix}_${(seq += 1)}`;

function uniqueViolation(): never {
  const error = new Error('Unique constraint failed') as Error & { code: string };
  error.code = 'P2002';
  throw error;
}

export function createInMemoryCloudGovernanceStore(): CloudGovernanceStore & {
  tenants: Map<string, CloudTenant>;
  bindings: Map<string, CloudProjectBinding>;
  transfers: Map<string, CloudTenantTransfer>;
  teardowns: Map<string, CloudTeardownRecord>;
  identities: Map<string, PlatformIamIdentity>;
  events: CloudProjectFactoryEvent[];
  impersonations: PlatformIamImpersonationAudit[];
} {
  const tenants = new Map<string, CloudTenant>();
  const bindings = new Map<string, CloudProjectBinding>();
  const transfers = new Map<string, CloudTenantTransfer>();
  const teardowns = new Map<string, CloudTeardownRecord>();
  const identities = new Map<string, PlatformIamIdentity>();
  const events: CloudProjectFactoryEvent[] = [];
  const impersonations: PlatformIamImpersonationAudit[] = [];

  return {
    tenants,
    bindings,
    transfers,
    teardowns,
    identities,
    events,
    impersonations,

    async createCloudTenant(input: CreateCloudTenantInput) {
      const tenant: CloudTenant = {
        id: nextId('ten'),
        customerBoundaryType: input.customerBoundaryType,
        ownerPrincipalId: input.ownerPrincipalId,
        billingPrincipalId: input.billingPrincipalId,
        legalEntityId: input.legalEntityId ?? null,
        ownershipVersion: 1,
        residencyPolicy: input.residencyPolicy ?? 'eu',
        lifecycle: 'ACTIVE',
        mergedIntoTenantId: null,
        splitFromTenantId: input.splitFromTenantId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tenants.set(tenant.id, tenant);

      return tenant;
    },

    async getCloudTenant(id) {
      const tenant = tenants.get(id);

      if (!tenant) {
        return null;
      }

      return { ...tenant, bindings: [...bindings.values()].filter((b) => b.cloudTenantId === id) };
    },

    async updateCloudTenant(id, data) {
      const tenant = tenants.get(id);

      if (!tenant) {
        throw new Error(`tenant ${id} not found`);
      }

      const updated = { ...tenant, ...data, updatedAt: new Date() } as CloudTenant;
      tenants.set(id, updated);

      return updated;
    },

    async createCloudProjectBinding(input: CreateCloudProjectBindingInput) {
      if ([...bindings.values()].some((b) => b.gcpProjectId === input.gcpProjectId)) {
        uniqueViolation();
      }

      const binding: CloudProjectBinding = {
        id: nextId('bnd'),
        cloudTenantId: input.cloudTenantId,
        gcpProjectId: input.gcpProjectId,
        gcpProjectNumber: null,
        role: input.role,
        region: input.region,
        state: 'REQUESTED',
        parentFolderId: input.parentFolderId ?? null,
        quotas: null,
        billingLabels: input.billingLabels ?? null,
        capacityPolicy: input.capacityPolicy ?? null,
        reconciliationStatus: 'UNKNOWN',
        recoveryWindowEndsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      bindings.set(binding.id, binding);

      return binding;
    },

    async getCloudProjectBinding(id) {
      const binding = bindings.get(id);

      if (!binding) {
        return null;
      }

      const tenant = tenants.get(binding.cloudTenantId);

      if (!tenant) {
        return null;
      }

      return { ...binding, tenant };
    },

    async findCloudProjectBindingByProject(gcpProjectId) {
      return [...bindings.values()].find((b) => b.gcpProjectId === gcpProjectId) ?? null;
    },

    async updateCloudProjectBinding(id, data) {
      const binding = bindings.get(id);

      if (!binding) {
        throw new Error(`binding ${id} not found`);
      }

      const updated = { ...binding, ...data, updatedAt: new Date() } as CloudProjectBinding;
      bindings.set(id, updated);

      return updated;
    },

    async listCloudProjectBindings(filter) {
      return [...bindings.values()].filter(
        (b) =>
          (filter.cloudTenantId === undefined || b.cloudTenantId === filter.cloudTenantId) &&
          (filter.parentFolderId === undefined || b.parentFolderId === filter.parentFolderId) &&
          (filter.state === undefined || b.state === filter.state),
      );
    },

    async countCloudProjectBindingsInFolder(parentFolderId) {
      return [...bindings.values()].filter((b) => b.parentFolderId === parentFolderId).length;
    },

    async recordFactoryEvent(input) {
      const event: CloudProjectFactoryEvent = {
        id: nextId('evt'),
        bindingId: input.bindingId,
        fromState: input.fromState,
        toState: input.toState,
        actor: input.actor ?? null,
        detail: input.detail ?? null,
        createdAt: new Date(),
      };
      events.push(event);

      return event;
    },

    async listFactoryEvents(bindingId) {
      return events.filter((e) => e.bindingId === bindingId);
    },

    async createCloudTenantTransfer(input) {
      const transfer: CloudTenantTransfer = {
        id: nextId('trf'),
        cloudTenantId: input.cloudTenantId,
        fromPrincipalId: input.fromPrincipalId,
        toPrincipalId: input.toPrincipalId,
        state: 'REQUESTED',
        revokeEvidence: null,
        revokeVerifiedAt: null,
        regrantEvidence: null,
        error: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      transfers.set(transfer.id, transfer);

      return transfer;
    },

    async getCloudTenantTransfer(id) {
      return transfers.get(id) ?? null;
    },

    async updateCloudTenantTransfer(id, data) {
      const transfer = transfers.get(id);

      if (!transfer) {
        throw new Error(`transfer ${id} not found`);
      }

      const updated = { ...transfer, ...data, updatedAt: new Date() } as CloudTenantTransfer;
      transfers.set(id, updated);

      return updated;
    },

    async createTeardownRecord(input) {
      const record: CloudTeardownRecord = {
        id: nextId('trd'),
        bindingId: input.bindingId,
        status: 'INVENTORYING',
        resourceInventory: null,
        erasureProof: null,
        orphans: null,
        startedAt: new Date(),
        completedAt: null,
      };
      teardowns.set(record.id, record);

      return record;
    },

    async getTeardownRecord(id) {
      return teardowns.get(id) ?? null;
    },

    async updateTeardownRecord(id, data) {
      const record = teardowns.get(id);

      if (!record) {
        throw new Error(`teardown ${id} not found`);
      }

      const updated = { ...record, ...data } as CloudTeardownRecord;
      teardowns.set(id, updated);

      return updated;
    },

    async findPlatformIamIdentity(boundary: PlatformIamIdentityBoundary) {
      return (
        [...identities.values()].find(
          (i) =>
            i.kind === boundary.kind &&
            i.app === boundary.app &&
            i.environment === boundary.environment &&
            i.privilegeBoundary === boundary.privilegeBoundary &&
            i.gcpProjectId === boundary.gcpProjectId,
        ) ?? null
      );
    },

    async createPlatformIamIdentity(input) {
      if ([...identities.values()].some((i) => i.gcpServiceAccountEmail === input.gcpServiceAccountEmail)) {
        uniqueViolation();
      }

      const identity: PlatformIamIdentity = {
        id: nextId('idn'),
        kind: input.kind,
        app: input.app,
        environment: input.environment,
        privilegeBoundary: input.privilegeBoundary,
        gcpProjectId: input.gcpProjectId,
        gcpServiceAccountEmail: input.gcpServiceAccountEmail,
        persistentKeys: 0,
        revisionsServed: 0,
        lastRotatedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      identities.set(identity.id, identity);

      return identity;
    },

    async updatePlatformIamIdentity(id, data) {
      const identity = identities.get(id);

      if (!identity) {
        throw new Error(`identity ${id} not found`);
      }

      const updated = { ...identity, ...data, updatedAt: new Date() } as PlatformIamIdentity;
      identities.set(id, updated);

      return updated;
    },

    async listPlatformIamIdentities(filter) {
      return [...identities.values()].filter(
        (i) =>
          (filter.gcpProjectId === undefined || i.gcpProjectId === filter.gcpProjectId) &&
          (filter.kind === undefined || i.kind === filter.kind),
      );
    },

    async recordImpersonation(input) {
      const audit: PlatformIamImpersonationAudit = {
        id: nextId('imp'),
        ...input,
        createdAt: new Date(),
      };
      impersonations.push(audit);

      return audit;
    },

    async listImpersonations(identityId) {
      return impersonations.filter((i) => i.identityId === identityId);
    },
  };
}

interface FakeProject {
  info: GcpProjectInfo;
  policy: GcpIamPolicy;
  billingEnabled: boolean;
  enabledServices: Set<string>;
  serviceAccounts: Map<string, { email: string; keys: GcpServiceAccountKeyInfo[] }>;
  buckets: Set<string>;
}

export class FakeGcpCloudClient implements GcpCloudClient {
  projects = new Map<string, FakeProject>();
  folders = new Map<string, { name: string; displayName: string; parent: string }>();
  createdServiceAccountCount = 0;
  folderSeq = 0;

  /** Test hook: when true, setIamPolicy silently keeps the removed members. */
  ignorePolicyWrites = false;

  /** Test hook: when true, createFolder answers 429. */
  folderRateLimited = false;

  seedProject(projectId: string, state = 'ACTIVE'): FakeProject {
    const project: FakeProject = {
      info: { projectId, state, projectNumber: String(100000 + this.projects.size) },
      policy: { bindings: [], etag: 'fake' },
      billingEnabled: false,
      enabledServices: new Set(),
      serviceAccounts: new Map(),
      buckets: new Set(),
    };
    this.projects.set(projectId, project);

    return project;
  }

  private _mustGet(projectId: string): FakeProject {
    const project = this.projects.get(projectId);

    if (!project) {
      throw new GcpApiError(404, `project ${projectId} not found`, 'fake');
    }

    return project;
  }

  async createProject(input: { projectId: string; displayName: string; parent?: string }) {
    if (this.projects.has(input.projectId)) {
      throw new GcpApiError(409, 'already exists', 'fake');
    }

    this.seedProject(input.projectId);
  }

  async getProject(projectId: string) {
    return this.projects.get(projectId)?.info ?? null;
  }

  async deleteProject(projectId: string) {
    this._mustGet(projectId).info.state = 'DELETE_REQUESTED';
  }

  async undeleteProject(projectId: string) {
    this._mustGet(projectId).info.state = 'ACTIVE';
  }

  async getProjectIamPolicy(projectId: string) {
    const policy = this._mustGet(projectId).policy;

    return { ...policy, bindings: (policy.bindings ?? []).map((b) => ({ ...b, members: [...b.members] })) };
  }

  async setProjectIamPolicy(projectId: string, policy: GcpIamPolicy) {
    const project = this._mustGet(projectId);

    if (!this.ignorePolicyWrites) {
      project.policy = policy;
    }

    return project.policy;
  }

  async createFolder(parent: string, displayName: string) {
    if (this.folderRateLimited) {
      throw new GcpApiError(429, "Quota exceeded for quota metric 'Folder V3 create requests'", 'fake');
    }

    const name = `folders/${900000 + (this.folderSeq += 1)}`;
    this.folders.set(name, { name, displayName, parent });

    return { name };
  }

  async listFolders(parent: string) {
    return [...this.folders.values()].filter((f) => f.parent === parent);
  }

  async linkProjectBilling(projectId: string) {
    this._mustGet(projectId).billingEnabled = true;
  }

  async getProjectBillingInfo(projectId: string) {
    return { billingEnabled: this._mustGet(projectId).billingEnabled };
  }

  async enableServices(projectId: string, services: string[]) {
    const project = this._mustGet(projectId);
    services.forEach((s) => project.enabledServices.add(s));
  }

  async listEnabledServices(projectId: string) {
    return [...this._mustGet(projectId).enabledServices];
  }

  async createServiceAccount(projectId: string, accountId: string) {
    const project = this._mustGet(projectId);
    const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;

    if (project.serviceAccounts.has(email)) {
      throw new GcpApiError(409, 'already exists', 'fake');
    }

    project.serviceAccounts.set(email, { email, keys: [] });
    this.createdServiceAccountCount += 1;

    return { email };
  }

  async getServiceAccount(projectId: string, email: string) {
    return this._mustGet(projectId).serviceAccounts.get(email) ?? null;
  }

  async listServiceAccounts(projectId: string) {
    return [...this._mustGet(projectId).serviceAccounts.values()].map((sa) => ({ email: sa.email }));
  }

  async listServiceAccountKeys(projectId: string, email: string) {
    return this._mustGet(projectId).serviceAccounts.get(email)?.keys ?? [];
  }

  async listBuckets(projectId: string) {
    const project = this.projects.get(projectId);

    if (!project || project.info.state !== 'ACTIVE') {
      return [];
    }

    return [...project.buckets].map((name) => ({ name }));
  }

  async deleteBucket(name: string) {
    for (const project of this.projects.values()) {
      project.buckets.delete(name);
    }
  }
}
