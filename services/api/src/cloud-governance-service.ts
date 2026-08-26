import { createHash, randomUUID } from 'node:crypto';
import {
  CloudGovernanceError,
  type ClaimedOperation,
  type CloudProjectBindingState,
  type CloudTenantBoundaryType,
  type MutationContext,
  type PlatformIamIdentityKind,
  PrismaCloudGovernanceStore,
} from './cloud-governance-store.js';
import { GcpApiError, type GcpCloudClient, type GcpIamPolicy } from './gcp-cloud-client.js';

export const BASELINE_SERVICES = [
  'iam.googleapis.com',
  'cloudresourcemanager.googleapis.com',
  'serviceusage.googleapis.com',
  'storage.googleapis.com',
] as const;
export const RECOVERY_WINDOW_DAYS = 30;
export const MAX_IMPERSONATION_LIFETIME_SECONDS = 3600;

const PRINCIPAL = /^(user|group|serviceAccount|domain|principal|principalSet):[^\s]{1,500}$/;
const WORKLOAD_IDENTITY_MEMBER =
  /^(serviceAccount:[a-z][a-z0-9-]{4,28}\.svc\.id\.goog\[[a-z0-9-]{1,63}\/[a-z0-9-]{1,63}\]|principal(Set)?:\/\/iam\.googleapis\.com\/[^\s]{1,900})$/;
const ROLE = /^roles\/[A-Za-z0-9_.]+$/;

const FACTORY_TRANSITIONS: Record<CloudProjectBindingState, CloudProjectBindingState[]> = {
  REQUESTED: ['CREATING'],
  CREATING: ['BILLING_LINKED'],
  BILLING_LINKED: ['APIS_ENABLING'],
  APIS_ENABLING: ['SERVICE_AGENTS_READY'],
  SERVICE_AGENTS_READY: ['IAM_BOUND'],
  IAM_BOUND: ['EDGE_READY'],
  EDGE_READY: ['ACTIVE'],
  ACTIVE: ['BILLING_SUSPENDED', 'QUOTA_EXHAUSTED', 'DRIFT_DETECTED', 'DELETE_REQUESTED'],
  BILLING_SUSPENDED: ['ACTIVE', 'DELETE_REQUESTED'],
  QUOTA_EXHAUSTED: ['ACTIVE', 'DELETE_REQUESTED'],
  DRIFT_DETECTED: ['ACTIVE', 'DELETE_REQUESTED'],
  DELETE_REQUESTED: ['RECOVERY_WINDOW'],
  RECOVERY_WINDOW: ['RESTORING', 'PURGING'],
  RESTORING: ['ACTIVE'],
  PURGING: ['PURGED'],
  PURGED: [],
};

const TEARDOWN_REQUESTABLE = new Set<CloudProjectBindingState>([
  'ACTIVE',
  'BILLING_SUSPENDED',
  'QUOTA_EXHAUSTED',
  'DRIFT_DETECTED',
]);

const TRANSFER_PROJECT_STATES = new Set<CloudProjectBindingState>([
  'CREATING',
  'BILLING_LINKED',
  'APIS_ENABLING',
  'SERVICE_AGENTS_READY',
  'IAM_BOUND',
  'EDGE_READY',
  'ACTIVE',
  'BILLING_SUSPENDED',
  'QUOTA_EXHAUSTED',
  'DRIFT_DETECTED',
]);

const IDENTITY_ROLES: Record<PlatformIamIdentityKind, ReadonlySet<string>> = {
  BUILD: new Set(['roles/cloudbuild.builds.builder', 'roles/artifactregistry.writer', 'roles/logging.logWriter']),
  PROMOTION: new Set([
    'roles/artifactregistry.reader',
    'roles/run.admin',
    'roles/iam.serviceAccountUser',
    'roles/logging.logWriter',
  ]),
  RUNTIME: new Set([
    'roles/logging.logWriter',
    'roles/monitoring.metricWriter',
    'roles/secretmanager.secretAccessor',
    'roles/cloudsql.client',
    'roles/storage.objectUser',
  ]),
};

const PROMOTE_CAPABLE = new Set([
  'roles/run.admin',
  'roles/run.developer',
  'roles/container.admin',
  'roles/container.developer',
  'roles/appengine.deployer',
]);
const BUILD_CAPABLE = new Set([
  'roles/cloudbuild.builds.editor',
  'roles/cloudbuild.builds.builder',
  'roles/artifactregistry.writer',
  'roles/artifactregistry.admin',
]);
const TENANT_PRINCIPAL_ALLOWED_ROLES = new Set([
  'roles/viewer',
  'roles/browser',
  'roles/logging.viewer',
  'roles/monitoring.viewer',
  'roles/storage.objectViewer',
]);

function assertPrincipal(value: string, field: string): void {
  if (!PRINCIPAL.test(value)) {
    throw new CloudGovernanceError('IAM_PRINCIPAL_INVALID', `${field} is not a supported IAM member`, 400);
  }
}

function assertRoles(values: string[]): string[] {
  const roles = [...new Set(values)].sort();
  if (roles.length === 0 || roles.some((role) => !ROLE.test(role))) {
    throw new CloudGovernanceError('IAM_ROLES_INVALID', 'At least one valid predefined IAM role is required', 400);
  }
  return roles;
}

function assertTenantPrincipalRoles(values: string[]): string[] {
  const roles = assertRoles(values);
  const forbidden = roles.filter((role) => !TENANT_PRINCIPAL_ALLOWED_ROLES.has(role));
  if (forbidden.length > 0) {
    throw new CloudGovernanceError(
      'TENANT_PRINCIPAL_ROLE_FORBIDDEN',
      `Tenant principals cannot receive privileged platform roles: ${forbidden.join(', ')}`,
      403,
    );
  }
  return roles;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloudGovernanceError('OPERATION_PAYLOAD_CORRUPT', 'Cloud operation payload is invalid', 500);
  }
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, field: string): string {
  if (typeof value[field] !== 'string') {
    throw new CloudGovernanceError('OPERATION_PAYLOAD_CORRUPT', `Cloud operation payload has no ${field}`, 500);
  }
  return value[field];
}

function numberField(value: Record<string, unknown>, field: string): number {
  if (typeof value[field] !== 'number' || !Number.isInteger(value[field])) {
    throw new CloudGovernanceError('OPERATION_PAYLOAD_CORRUPT', `Cloud operation payload has no ${field}`, 500);
  }
  return value[field];
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CloudGovernanceError('OPERATION_PAYLOAD_CORRUPT', `Cloud operation payload has invalid ${field}`, 500);
  }
  return value as string[];
}

function clonePolicy(policy: GcpIamPolicy): GcpIamPolicy {
  return {
    ...policy,
    bindings: (policy.bindings ?? []).map((binding) => ({
      ...binding,
      members: [...binding.members],
      condition: binding.condition ? { ...binding.condition } : undefined,
    })),
  };
}

function heldRoles(policy: GcpIamPolicy, member: string): string[] {
  return (policy.bindings ?? []).filter((binding) => binding.members.includes(member)).map((binding) => binding.role);
}

function hasExactRoles(policy: GcpIamPolicy, member: string, expected: string[]): boolean {
  const actual = [...new Set(heldRoles(policy, member))].sort();
  const wanted = [...new Set(expected)].sort();
  return actual.length === wanted.length && actual.every((role, index) => role === wanted[index]);
}

function addRoles(policy: GcpIamPolicy, member: string, roles: string[]): GcpIamPolicy {
  const next = clonePolicy(policy);
  const bindings = next.bindings ?? [];
  next.bindings = bindings;

  for (const role of roles) {
    const binding = bindings.find((candidate) => candidate.role === role && !candidate.condition);
    if (binding) {
      if (!binding.members.includes(member)) binding.members.push(member);
    } else {
      bindings.push({ role, members: [member] });
    }
  }
  return next;
}

function removeMember(policy: GcpIamPolicy, member: string): GcpIamPolicy {
  const next = clonePolicy(policy);
  next.bindings = (next.bindings ?? [])
    .map((binding) => ({ ...binding, members: binding.members.filter((candidate) => candidate !== member) }))
    .filter((binding) => binding.members.length > 0);
  return next;
}

function replaceMemberRoles(policy: GcpIamPolicy, member: string, roles: string[]): GcpIamPolicy {
  return addRoles(removeMember(policy, member), member, roles);
}

function setRoleMembers(policy: GcpIamPolicy, role: string, members: string[]): GcpIamPolicy {
  const next = clonePolicy(policy);
  next.bindings = (next.bindings ?? []).filter((binding) => binding.role !== role);
  if (members.length > 0) next.bindings.push({ role, members: [...new Set(members)].sort() });
  return next;
}

function policyChanged(before: GcpIamPolicy, after: GcpIamPolicy): boolean {
  return JSON.stringify(before.bindings ?? []) !== JSON.stringify(after.bindings ?? []);
}

export interface CloudGovernanceServiceOptions {
  leaseSeconds?: number;
  workerId?: string;
  allowedParentFolders?: string[];
}

export class CloudGovernanceService {
  private readonly _leaseSeconds: number;
  private readonly _workerId: string;
  private readonly _allowedParentFolders: ReadonlySet<string>;

  constructor(
    readonly store: PrismaCloudGovernanceStore,
    readonly gcp: GcpCloudClient,
    options: CloudGovernanceServiceOptions = {},
  ) {
    // One guarded idempotent REST mutation can consume four 15s attempts plus
    // bounded Retry-After delays (<= 90s). Keep the production lease at least
    // twice that envelope so a second worker cannot reclaim during the call.
    this._leaseSeconds = Math.max(1, Math.trunc(options.leaseSeconds ?? 180));
    this._workerId = options.workerId ?? `api-${randomUUID()}`;
    this._allowedParentFolders = new Set(
      options.allowedParentFolders ??
        (process.env.CLOUD_TENANT_ALLOWED_PARENT_FOLDERS ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
    );
  }

  createTenant(input: {
    context: MutationContext;
    organizationId: string;
    customerBoundaryType: CloudTenantBoundaryType;
    ownerPrincipalId: string;
    billingPrincipalId: string;
    billingAccountId: string;
    legalEntityId?: string | null;
    residencyPolicy?: string;
  }) {
    assertPrincipal(input.ownerPrincipalId, 'ownerPrincipalId');
    assertPrincipal(input.billingPrincipalId, 'billingPrincipalId');
    return this.store.createTenant({ ...input, residencyPolicy: input.residencyPolicy ?? 'eu' });
  }

  bindProject(input: Parameters<PrismaCloudGovernanceStore['bindProject']>[0]) {
    if (!input.parentFolderId || !this._allowedParentFolders.has(input.parentFolderId)) {
      throw new CloudGovernanceError(
        this._allowedParentFolders.size === 0 ? 'CLOUD_PARENT_FOLDERS_NOT_CONFIGURED' : 'CLOUD_PARENT_FOLDER_FORBIDDEN',
        'Project parent folder is not in the configured CloudTenant allowlist',
        this._allowedParentFolders.size === 0 ? 503 : 403,
      );
    }
    return this.store.bindProject(input);
  }

  changeTenantLifecycle(input: Parameters<PrismaCloudGovernanceStore['changeTenantLifecycle']>[0]) {
    return this.store.changeTenantLifecycle(input);
  }

  mergeTenants(input: Parameters<PrismaCloudGovernanceStore['mergeTenants']>[0]) {
    return this.store.mergeTenants({ ...input, grantRoles: assertTenantPrincipalRoles(input.grantRoles) });
  }

  splitTenant(input: Parameters<PrismaCloudGovernanceStore['splitTenant']>[0]) {
    assertPrincipal(input.newTenant.ownerPrincipalId, 'ownerPrincipalId');
    assertPrincipal(input.newTenant.billingPrincipalId, 'billingPrincipalId');
    return this.store.splitTenant({ ...input, grantRoles: assertTenantPrincipalRoles(input.grantRoles) });
  }

  async startTransfer(input: {
    context: MutationContext;
    tenantId: string;
    expectedOwnershipVersion: number;
    toPrincipalId: string;
    grantRoles: string[];
  }) {
    assertPrincipal(input.toPrincipalId, 'toPrincipalId');
    return this.store.beginTransfer({ ...input, grantRoles: assertTenantPrincipalRoles(input.grantRoles) });
  }

  startProjectAdvance(input: {
    context: MutationContext;
    bindingId: string;
    expectedBindingVersion: number;
    services?: string[];
  }) {
    const services = [...new Set([...(input.services ?? []), ...BASELINE_SERVICES])].sort();
    return this.store.beginBindingOperation({
      context: input.context,
      kind: 'PROJECT_ADVANCE',
      bindingId: input.bindingId,
      expectedBindingVersion: input.expectedBindingVersion,
      payload: { services },
    });
  }

  startTeardownRequest(input: { context: MutationContext; bindingId: string; expectedBindingVersion: number }) {
    return this.store.beginBindingOperation({
      ...input,
      kind: 'TEARDOWN_REQUEST',
      payload: {},
    });
  }

  startTeardownExecution(input: { context: MutationContext; bindingId: string; expectedBindingVersion: number }) {
    return this.store.beginBindingOperation({
      ...input,
      kind: 'TEARDOWN_EXECUTE',
      payload: {},
    });
  }

  startTeardownVerification(input: {
    context: MutationContext;
    bindingId: string;
    expectedBindingVersion: number;
    teardownId: string;
  }) {
    return this.store.beginBindingOperation({
      context: input.context,
      kind: 'TEARDOWN_VERIFY',
      bindingId: input.bindingId,
      expectedBindingVersion: input.expectedBindingVersion,
      payload: { teardownId: input.teardownId },
    });
  }

  startProjectRestore(input: { context: MutationContext; bindingId: string; expectedBindingVersion: number }) {
    return this.store.beginBindingOperation({ ...input, kind: 'PROJECT_RESTORE', payload: {} });
  }

  startProjectPurge(input: { context: MutationContext; bindingId: string; expectedBindingVersion: number }) {
    return this.store.beginBindingOperation({ ...input, kind: 'PROJECT_PURGE', payload: {} });
  }

  startIdentityEnsure(input: {
    context: MutationContext;
    bindingId: string;
    expectedBindingVersion: number;
    kind: PlatformIamIdentityKind;
    app?: string;
    environment?: string;
    privilegeBoundary: string;
    roles: string[];
    workloadIdentityMembers?: string[];
  }) {
    const app = input.app ?? '';
    const environment = input.environment ?? '';
    if (input.kind === 'RUNTIME' && (!app || !environment)) {
      throw new CloudGovernanceError(
        'IAM_BOUNDARY_INCOMPLETE',
        'Runtime identity requires app and environment; revision ids are forbidden',
        400,
      );
    }
    if (input.kind !== 'RUNTIME' && (app || environment)) {
      throw new CloudGovernanceError('IAM_BOUNDARY_INVALID', 'Build/Promotion identities are project-scoped', 400);
    }
    const roles = assertRoles(input.roles);
    const allowed = IDENTITY_ROLES[input.kind];
    const forbidden = roles.filter((role) => !allowed.has(role));
    if (forbidden.length > 0) {
      throw new CloudGovernanceError(
        'IAM_ROLE_BOUNDARY_VIOLATION',
        `${input.kind} identity cannot receive: ${forbidden.join(', ')}`,
        403,
      );
    }
    const workloadIdentityMembers = [...new Set(input.workloadIdentityMembers ?? [])].sort();
    if (workloadIdentityMembers.some((member) => !WORKLOAD_IDENTITY_MEMBER.test(member))) {
      throw new CloudGovernanceError('WORKLOAD_IDENTITY_MEMBER_INVALID', 'Invalid Workload Identity member', 400);
    }

    return this.store.beginBindingOperation({
      context: input.context,
      kind: 'IAM_ENSURE',
      bindingId: input.bindingId,
      expectedBindingVersion: input.expectedBindingVersion,
      payload: {
        kind: input.kind,
        app,
        environment,
        privilegeBoundary: input.privilegeBoundary,
        roles,
        workloadIdentityMembers,
      },
    });
  }

  async executeOperation(operationId: string) {
    const owner = `${this._workerId}:${randomUUID()}`;
    const claimed = await this.store.claimOperation(operationId, owner, this._leaseSeconds);

    if (!claimed) {
      const existing = await this.store.getOperation(operationId);
      if (!existing) throw new CloudGovernanceError('OPERATION_NOT_FOUND', 'Cloud operation not found', 404);
      return existing;
    }

    try {
      switch (claimed.kind) {
        case 'TENANT_SUSPEND':
        case 'TENANT_RESTORE':
          await this._executeLifecycleChange(claimed);
          break;
        case 'TENANT_MERGE':
          await this._executeMerge(claimed);
          break;
        case 'TENANT_SPLIT':
          await this._executeSplit(claimed);
          break;
        case 'TENANT_TRANSFER':
          await this._executeTransfer(claimed);
          break;
        case 'PROJECT_ADVANCE':
          await this._executeAdvance(claimed);
          break;
        case 'TEARDOWN_REQUEST':
          await this._executeTeardownRequest(claimed);
          break;
        case 'TEARDOWN_EXECUTE':
          await this._executeTeardown(claimed);
          break;
        case 'TEARDOWN_VERIFY':
          await this._executeTeardownVerification(claimed);
          break;
        case 'PROJECT_RESTORE':
          await this._executeRestore(claimed);
          break;
        case 'PROJECT_PURGE':
          await this._executePurge(claimed);
          break;
        case 'IAM_ENSURE':
          await this._executeIdentityEnsure(claimed);
          break;
        default:
          throw new CloudGovernanceError('OPERATION_KIND_INVALID', `${claimed.kind} is not executable`, 409);
      }
    } catch (error) {
      if (error instanceof CloudGovernanceError && error.code === 'OPERATION_LEASE_LOST') throw error;
      const sagaMustRemainRecoverable = ['TENANT_SUSPEND', 'TENANT_RESTORE', 'TENANT_MERGE', 'TENANT_SPLIT'].includes(
        claimed.kind,
      );
      const retryable =
        sagaMustRemainRecoverable ||
        error instanceof GcpApiError ||
        (error instanceof CloudGovernanceError && error.retryable);
      const code =
        error instanceof CloudGovernanceError
          ? error.code
          : error instanceof GcpApiError
            ? `GCP_${error.status}`
            : undefined;

      if (claimed.kind === 'TENANT_TRANSFER') {
        const transfer = (await this.store.getOperation(claimed.id))?.transfer;
        if (transfer) {
          // Every post-request transfer failure remains recoverable. A retry
          // re-reads live IAM and idempotently resumes revoke/regrant.
          await this.store.failTransfer(claimed.id, transfer.id, claimed.leaseOwner, claimed.fence, error, true);
        }
      } else {
        await this.store.failOperation({
          id: claimed.id,
          owner: claimed.leaseOwner,
          fence: claimed.fence,
          error,
          code,
          retryable,
        });
      }
    }

    const operation = await this.store.getOperation(operationId);
    if (!operation) throw new CloudGovernanceError('OPERATION_NOT_FOUND', 'Cloud operation disappeared', 500);
    return operation;
  }

  async executeDueOperations(limit = 25): Promise<{
    attempted: number;
    succeeded: number;
    waiting: number;
    failed: number;
    running: number;
  }> {
    const operationIds = await this.store.listDueOperationIds(limit);
    const summary = { attempted: 0, succeeded: 0, waiting: 0, failed: 0, running: 0 };

    for (const operationId of operationIds) {
      try {
        const operation = await this.executeOperation(operationId);
        summary.attempted += 1;
        if (operation.status === 'SUCCEEDED') summary.succeeded += 1;
        else if (operation.status === 'WAITING') summary.waiting += 1;
        else if (operation.status === 'FAILED') summary.failed += 1;
        else summary.running += 1;
      } catch (error) {
        // A competing replica may fence this worker after the due-list read.
        // The row remains durably owned by the winner and is not converted to
        // FAILED by the stale worker.
        if (!(error instanceof CloudGovernanceError && error.code === 'OPERATION_LEASE_LOST')) throw error;
        summary.running += 1;
      }
    }
    return summary;
  }

  private async _guard(claimed: ClaimedOperation): Promise<void> {
    const renewed = await this.store.renewOperationLease(
      claimed.id,
      claimed.leaseOwner,
      claimed.fence,
      this._leaseSeconds,
    );
    if (!renewed) throw new CloudGovernanceError('OPERATION_LEASE_LOST', 'Cloud operation lease was lost', 409, true);
  }

  private async _mutateProjectPolicy(
    projectId: string,
    claimed: ClaimedOperation,
    mutate: (policy: GcpIamPolicy) => GcpIamPolicy,
  ): Promise<GcpIamPolicy> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this._guard(claimed);
      const before = await this.gcp.getProjectIamPolicy(projectId);
      const after = mutate(before);
      if (!policyChanged(before, after)) return before;
      await this._guard(claimed);

      try {
        return await this.gcp.setProjectIamPolicy(projectId, after);
      } catch (error) {
        if (!(error instanceof GcpApiError && error.isPreconditionFailed) || attempt === 4) throw error;
      }
    }
    throw new CloudGovernanceError('IAM_ETAG_CONTENTION', 'IAM policy changed too often; retry later', 409, true);
  }

  private async _mutateServiceAccountPolicy(
    email: string,
    claimed: ClaimedOperation,
    mutate: (policy: GcpIamPolicy) => GcpIamPolicy,
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this._guard(claimed);
      const before = await this.gcp.getServiceAccountIamPolicy(email);
      const after = mutate(before);
      if (!policyChanged(before, after)) return;
      await this._guard(claimed);

      try {
        await this.gcp.setServiceAccountIamPolicy(email, after);
        return;
      } catch (error) {
        if (!(error instanceof GcpApiError && error.isPreconditionFailed) || attempt === 4) throw error;
      }
    }
  }

  private async _enableBindingIdentities(
    projectId: string,
    emails: string[],
    claimed: ClaimedOperation,
  ): Promise<void> {
    for (const email of emails) {
      await this._guard(claimed);
      const [account, keys] = await Promise.all([
        this.gcp.getServiceAccount(projectId, email),
        this.gcp.listServiceAccountKeys(projectId, email),
      ]);
      if (!account) throw new CloudGovernanceError('IAM_IDENTITY_DRIFT', 'Service account no longer exists', 409, true);
      if (keys.some((key) => key.keyType === 'USER_MANAGED')) {
        throw new CloudGovernanceError(
          'IAM_PERSISTENT_KEY_FORBIDDEN',
          'A user-managed service-account key blocks tenant restore',
          409,
          true,
        );
      }
      if (account.disabled) {
        await this._guard(claimed);
        await this.gcp.enableServiceAccount(projectId, email);
      }
      await this._guard(claimed);
      const verified = await this.gcp.getServiceAccount(projectId, email);
      if (!verified || verified.disabled) {
        throw new CloudGovernanceError('IAM_ENABLE_UNVERIFIED', 'Service account enable is not visible', 409, true);
      }
    }
  }

  private async _quarantineIdentity(projectId: string, email: string, claimed: ClaimedOperation): Promise<void> {
    const member = `serviceAccount:${email}`;
    await this._mutateProjectPolicy(projectId, claimed, (policy) => removeMember(policy, member));
    await this._mutateServiceAccountPolicy(email, claimed, (policy) => {
      const next = clonePolicy(policy);
      next.bindings = (next.bindings ?? []).filter((binding) => binding.role !== 'roles/iam.workloadIdentityUser');
      return next;
    });
    await this._guard(claimed);
    const account = await this.gcp.getServiceAccount(projectId, email);
    if (account && !account.disabled) {
      await this._guard(claimed);
      await this.gcp.disableServiceAccount(projectId, email);
    }
    await this._guard(claimed);
    const [projectPolicy, serviceAccountPolicy, verified] = await Promise.all([
      this.gcp.getProjectIamPolicy(projectId),
      this.gcp.getServiceAccountIamPolicy(email),
      this.gcp.getServiceAccount(projectId, email),
    ]);
    const workloadStillTrusted = (serviceAccountPolicy.bindings ?? []).some(
      (binding) => binding.role === 'roles/iam.workloadIdentityUser' && binding.members.length > 0,
    );
    if (heldRoles(projectPolicy, member).length > 0 || workloadStillTrusted || !verified?.disabled) {
      throw new CloudGovernanceError(
        'IAM_QUARANTINE_UNVERIFIED',
        'Compromised service account is not durably quarantined',
        409,
        true,
      );
    }
  }

  private async _executeLifecycleChange(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.tenantId) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Operation has no tenant', 500);
    const tenant = await this.store.getTenant(claimed.tenantId);
    if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);
    const payload = asObject(claimed.payload);
    const expectedVersion = numberField(payload, 'expectedVersion');
    const completed = new Set(stringArray(asObject(claimed.checkpoint ?? {}).completed ?? [], 'completed'));

    if (claimed.kind === 'TENANT_SUSPEND') {
      if (tenant.lifecycle !== 'ACTIVE') {
        throw new CloudGovernanceError('TENANT_LIFECYCLE_CONFLICT', `CloudTenant is ${tenant.lifecycle}`, 409);
      }
      const checkpointObject = asObject(claimed.checkpoint ?? {});
      const evidence = Array.isArray(checkpointObject.evidence)
        ? ([...checkpointObject.evidence] as Array<Record<string, unknown>>)
        : [];

      for (const binding of tenant.bindings.filter((candidate) => TRANSFER_PROJECT_STATES.has(candidate.state))) {
        const wasCompleted = completed.has(binding.id);
        let item = evidence.find((candidate) => candidate.bindingId === binding.id);
        if (!item) {
          await this._guard(claimed);
          const [billing, policy, identities] = await Promise.all([
            this.gcp.getProjectBillingInfo(binding.gcpProjectId),
            this.gcp.getProjectIamPolicy(binding.gcpProjectId),
            this.store.listIdentities({ bindingId: binding.id, limit: 1000 }),
          ]);
          item = {
            bindingId: binding.id,
            gcpProjectId: binding.gcpProjectId,
            billingEnabled: billing.billingEnabled,
            billingAccountName: billing.billingAccountName ?? null,
            ownerRoles: heldRoles(policy, tenant.ownerPrincipalId),
            identityEmails: identities.map((identity) => identity.gcpServiceAccountEmail),
          };
          evidence.push(item);
          // Inventory is durable BEFORE revocation/unlink, so a crash cannot
          // lose the exact grants and billing account needed for restore.
          await this.store.checkpointOperation({
            id: claimed.id,
            owner: claimed.leaseOwner,
            fence: claimed.fence,
            step: 'SUSPEND_INVENTORIED',
            checkpoint: { completed: [...completed], evidence },
            eventType: 'SUSPEND_INVENTORY_RECORDED',
            detail: { bindingId: binding.id },
          });
        }

        await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) =>
          removeMember(policy, tenant.ownerPrincipalId),
        );
        await this._guard(claimed);
        await this.gcp.unlinkProjectBilling(binding.gcpProjectId);
        const identityEmails = stringArray(item.identityEmails ?? [], 'identityEmails');
        await this._enableOrDisableListedIdentities(binding.gcpProjectId, identityEmails, claimed, false);
        await this._guard(claimed);
        const [policy, billing] = await Promise.all([
          this.gcp.getProjectIamPolicy(binding.gcpProjectId),
          this.gcp.getProjectBillingInfo(binding.gcpProjectId),
        ]);
        if (heldRoles(policy, tenant.ownerPrincipalId).length > 0 || billing.billingEnabled) {
          throw new CloudGovernanceError('TENANT_SUSPEND_UNVERIFIED', 'IAM or billing remains active', 409, true);
        }
        completed.add(binding.id);
        if (!wasCompleted) {
          await this.store.checkpointOperation({
            id: claimed.id,
            owner: claimed.leaseOwner,
            fence: claimed.fence,
            step: 'SUSPENDING',
            checkpoint: { completed: [...completed], evidence },
            eventType: 'BINDING_SUSPENDED',
            detail: { bindingId: binding.id },
          });
        }
      }
      await this.store.completeLifecycleChange({
        operationId: claimed.id,
        owner: claimed.leaseOwner,
        fence: claimed.fence,
        tenantId: tenant.id,
        expectedVersion,
        from: 'ACTIVE',
        to: 'SUSPENDED',
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
        evidence,
      });
      return;
    }

    if (tenant.lifecycle !== 'SUSPENDED') {
      throw new CloudGovernanceError('TENANT_LIFECYCLE_CONFLICT', `CloudTenant is ${tenant.lifecycle}`, 409);
    }
    const evidence = Array.isArray(tenant.suspensionEvidence)
      ? (tenant.suspensionEvidence as Array<Record<string, unknown>>)
      : [];
    for (const item of evidence) {
      const bindingId = stringField(item, 'bindingId');
      const wasCompleted = completed.has(bindingId);
      const projectId = stringField(item, 'gcpProjectId');
      const billingWasEnabled = item.billingEnabled === true;
      const billingName = typeof item.billingAccountName === 'string' ? item.billingAccountName : null;
      if (billingWasEnabled && !billingName) {
        throw new CloudGovernanceError(
          'TENANT_SUSPENSION_EVIDENCE_INVALID',
          'Billing restore evidence is incomplete',
          500,
        );
      }
      const roles = stringArray(item.ownerRoles ?? [], 'ownerRoles');
      const identityEmails = stringArray(item.identityEmails ?? [], 'identityEmails');
      await this._guard(claimed);
      if (billingWasEnabled) {
        await this.gcp.linkProjectBilling(projectId, billingName!.replace(/^billingAccounts\//, ''));
      } else {
        await this.gcp.unlinkProjectBilling(projectId);
      }
      await this._mutateProjectPolicy(projectId, claimed, (policy) => addRoles(policy, tenant.ownerPrincipalId, roles));
      await this._enableOrDisableListedIdentities(projectId, identityEmails, claimed, true);
      await this._guard(claimed);
      const [policy, billing] = await Promise.all([
        this.gcp.getProjectIamPolicy(projectId),
        this.gcp.getProjectBillingInfo(projectId),
      ]);
      const missing = roles.filter((role) => !heldRoles(policy, tenant.ownerPrincipalId).includes(role));
      if (
        billing.billingEnabled !== billingWasEnabled ||
        (billingWasEnabled && billing.billingAccountName !== billingName) ||
        missing.length > 0
      ) {
        throw new CloudGovernanceError('TENANT_RESTORE_UNVERIFIED', 'IAM or billing restore is not visible', 409, true);
      }
      completed.add(bindingId);
      if (!wasCompleted) {
        await this.store.checkpointOperation({
          id: claimed.id,
          owner: claimed.leaseOwner,
          fence: claimed.fence,
          step: 'RESTORING',
          checkpoint: { completed: [...completed] },
          eventType: 'BINDING_RESTORED',
          detail: { bindingId },
        });
      }
    }
    await this.store.completeLifecycleChange({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      tenantId: tenant.id,
      expectedVersion,
      from: 'SUSPENDED',
      to: 'ACTIVE',
    });
  }

  private async _enableOrDisableListedIdentities(
    projectId: string,
    emails: string[],
    claimed: ClaimedOperation,
    enable: boolean,
  ): Promise<void> {
    if (enable) {
      await this._enableBindingIdentities(projectId, emails, claimed);
      return;
    }
    for (const email of emails) {
      await this._guard(claimed);
      const account = await this.gcp.getServiceAccount(projectId, email);
      if (!account) throw new CloudGovernanceError('IAM_IDENTITY_DRIFT', 'Service account no longer exists', 409, true);
      if (!account.disabled) {
        await this._guard(claimed);
        await this.gcp.disableServiceAccount(projectId, email);
      }
      await this._guard(claimed);
      const verified = await this.gcp.getServiceAccount(projectId, email);
      if (!verified?.disabled) {
        throw new CloudGovernanceError('IAM_DISABLE_UNVERIFIED', 'Service account disable is not visible', 409, true);
      }
    }
  }

  private async _executeMerge(claimed: ClaimedOperation): Promise<void> {
    const payload = asObject(claimed.payload);
    const sourceTenantId = stringField(payload, 'sourceTenantId');
    const targetTenantId = stringField(payload, 'targetTenantId');
    const [source, target] = await Promise.all([
      this.store.getTenant(sourceTenantId),
      this.store.getTenant(targetTenantId),
    ]);
    if (!source || !target)
      throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Source or target CloudTenant not found', 404);
    const grantRoles = stringArray(payload.grantRoles, 'grantRoles');
    const completed = new Set(stringArray(asObject(claimed.checkpoint ?? {}).completed ?? [], 'completed'));

    for (const binding of source.bindings.filter((candidate) => TRANSFER_PROJECT_STATES.has(candidate.state))) {
      const wasCompleted = completed.has(binding.id);
      await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) =>
        replaceMemberRoles(removeMember(policy, source.ownerPrincipalId), target.ownerPrincipalId, grantRoles),
      );
      await this._guard(claimed);
      await this.gcp.linkProjectBilling(binding.gcpProjectId, target.billingAccountId);
      await this._guard(claimed);
      const [policy, billing] = await Promise.all([
        this.gcp.getProjectIamPolicy(binding.gcpProjectId),
        this.gcp.getProjectBillingInfo(binding.gcpProjectId),
      ]);
      if (
        (source.ownerPrincipalId !== target.ownerPrincipalId &&
          heldRoles(policy, source.ownerPrincipalId).length > 0) ||
        !hasExactRoles(policy, target.ownerPrincipalId, grantRoles) ||
        !billing.billingEnabled ||
        billing.billingAccountName !== `billingAccounts/${target.billingAccountId}`
      ) {
        throw new CloudGovernanceError(
          'TENANT_MERGE_UNVERIFIED',
          'Merged IAM/billing boundary is not visible',
          409,
          true,
        );
      }
      completed.add(binding.id);
      if (!wasCompleted) {
        await this.store.checkpointOperation({
          id: claimed.id,
          owner: claimed.leaseOwner,
          fence: claimed.fence,
          step: 'MERGING',
          checkpoint: { completed: [...completed] },
          eventType: 'MERGE_BINDING_CONVERGED',
          detail: { bindingId: binding.id },
        });
      }
    }
    await this.store.completeMerge({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      sourceTenantId,
      sourceVersion: numberField(payload, 'sourceVersion'),
      targetTenantId,
      targetVersion: numberField(payload, 'targetVersion'),
    });
  }

  private async _executeSplit(claimed: ClaimedOperation): Promise<void> {
    const payload = asObject(claimed.payload);
    const sourceTenantId = stringField(payload, 'sourceTenantId');
    const source = await this.store.getTenant(sourceTenantId);
    if (!source) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Source CloudTenant not found', 404);
    const bindingIds = stringArray(payload.bindingIds, 'bindingIds');
    const newTenant = asObject(payload.newTenant);
    const newOwner = stringField(newTenant, 'ownerPrincipalId');
    const newBillingAccountId = stringField(newTenant, 'billingAccountId');
    const grantRoles = stringArray(payload.grantRoles, 'grantRoles');
    const completed = new Set(stringArray(asObject(claimed.checkpoint ?? {}).completed ?? [], 'completed'));

    for (const bindingId of bindingIds) {
      const wasCompleted = completed.has(bindingId);
      const binding = source.bindings.find((candidate) => candidate.id === bindingId);
      if (!binding)
        throw new CloudGovernanceError('TENANT_SPLIT_DRIFT', 'Selected binding left the source tenant', 409);
      if (TRANSFER_PROJECT_STATES.has(binding.state)) {
        await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) =>
          replaceMemberRoles(removeMember(policy, source.ownerPrincipalId), newOwner, grantRoles),
        );
        await this._guard(claimed);
        await this.gcp.linkProjectBilling(binding.gcpProjectId, newBillingAccountId);
        await this._guard(claimed);
        const [policy, billing] = await Promise.all([
          this.gcp.getProjectIamPolicy(binding.gcpProjectId),
          this.gcp.getProjectBillingInfo(binding.gcpProjectId),
        ]);
        if (
          (source.ownerPrincipalId !== newOwner && heldRoles(policy, source.ownerPrincipalId).length > 0) ||
          !hasExactRoles(policy, newOwner, grantRoles) ||
          !billing.billingEnabled ||
          billing.billingAccountName !== `billingAccounts/${newBillingAccountId}`
        ) {
          throw new CloudGovernanceError(
            'TENANT_SPLIT_UNVERIFIED',
            'Split IAM/billing boundary is not visible',
            409,
            true,
          );
        }
      }
      completed.add(bindingId);
      if (!wasCompleted) {
        await this.store.checkpointOperation({
          id: claimed.id,
          owner: claimed.leaseOwner,
          fence: claimed.fence,
          step: 'SPLITTING',
          checkpoint: { completed: [...completed] },
          eventType: 'SPLIT_BINDING_CONVERGED',
          detail: { bindingId },
        });
      }
    }
    await this.store.completeSplit({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      sourceTenantId,
      sourceVersion: numberField(payload, 'sourceVersion'),
      bindingIds,
      newOrganizationId: stringField(payload, 'newOrganizationId'),
      newTenant: {
        customerBoundaryType: stringField(newTenant, 'customerBoundaryType') as CloudTenantBoundaryType,
        ownerPrincipalId: newOwner,
        billingPrincipalId: stringField(newTenant, 'billingPrincipalId'),
        billingAccountId: newBillingAccountId,
        legalEntityId: typeof newTenant.legalEntityId === 'string' ? newTenant.legalEntityId : null,
        residencyPolicy: stringField(newTenant, 'residencyPolicy'),
      },
    });
  }

  private async _executeTransfer(claimed: ClaimedOperation): Promise<void> {
    const operation = await this.store.getOperation(claimed.id);
    const transfer = operation?.transfer;
    if (!transfer || !claimed.tenantId) {
      throw new CloudGovernanceError('TRANSFER_NOT_FOUND', 'Transfer operation is incomplete', 500);
    }
    const tenant = await this.store.getTenant(claimed.tenantId);
    if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);
    if (
      tenant.ownershipVersion !== transfer.expectedOwnershipVersion ||
      tenant.ownerPrincipalId !== transfer.fromPrincipalId
    ) {
      throw new CloudGovernanceError('OWNERSHIP_VERSION_CONFLICT', 'CloudTenant ownership changed', 409);
    }

    const checkpoint = asObject(claimed.checkpoint ?? {});
    const revokeDone = new Set(stringArray(checkpoint.revokeDone ?? [], 'revokeDone'));
    const grantDone = new Set(stringArray(checkpoint.grantDone ?? [], 'grantDone'));
    const revokeEvidence = Array.isArray(transfer.revokeEvidence)
      ? ([...transfer.revokeEvidence] as Array<Record<string, unknown>>)
      : [];
    const regrantEvidence = Array.isArray(transfer.regrantEvidence)
      ? ([...transfer.regrantEvidence] as Array<Record<string, unknown>>)
      : [];
    const bindings = tenant.bindings.filter((binding) => TRANSFER_PROJECT_STATES.has(binding.state));

    for (const binding of bindings) {
      const wasRevoked = revokeDone.has(binding.id);
      let removedRoles: string[] = [];
      await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) => {
        removedRoles = heldRoles(policy, transfer.fromPrincipalId);
        return removeMember(policy, transfer.fromPrincipalId);
      });
      await this._guard(claimed);
      const verified = await this.gcp.getProjectIamPolicy(binding.gcpProjectId);
      if (heldRoles(verified, transfer.fromPrincipalId).length > 0) {
        throw new CloudGovernanceError('TRANSFER_REVOKE_UNVERIFIED', 'Old owner still has project IAM', 409, true);
      }
      revokeDone.add(binding.id);
      if (!wasRevoked) {
        revokeEvidence.push({ bindingId: binding.id, gcpProjectId: binding.gcpProjectId, removedRoles });
        await this.store.updateTransferCheckpoint({
          operationId: claimed.id,
          owner: claimed.leaseOwner,
          fence: claimed.fence,
          transferId: transfer.id,
          state: 'REVOKING',
          revokeEvidence,
          checkpoint: { revokeDone: [...revokeDone], grantDone: [...grantDone] },
        });
      }
    }

    await this.store.updateTransferCheckpoint({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      transferId: transfer.id,
      state: 'REVOKED',
      revokeEvidence,
      revokeVerified: true,
      checkpoint: { revokeDone: [...revokeDone], grantDone: [...grantDone] },
    });

    const grantRoles = stringArray(transfer.grantRoles, 'grantRoles');
    for (const binding of bindings) {
      const wasGranted = grantDone.has(binding.id);
      await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) =>
        replaceMemberRoles(policy, transfer.toPrincipalId, grantRoles),
      );
      await this._guard(claimed);
      const verified = await this.gcp.getProjectIamPolicy(binding.gcpProjectId);
      if (!hasExactRoles(verified, transfer.toPrincipalId, grantRoles)) {
        throw new CloudGovernanceError('TRANSFER_REGRANT_UNVERIFIED', 'New owner IAM grant is not visible', 409, true);
      }
      grantDone.add(binding.id);
      if (!wasGranted) {
        regrantEvidence.push({ bindingId: binding.id, gcpProjectId: binding.gcpProjectId, grantedRoles: grantRoles });
        await this.store.updateTransferCheckpoint({
          operationId: claimed.id,
          owner: claimed.leaseOwner,
          fence: claimed.fence,
          transferId: transfer.id,
          state: 'REGRANTING',
          revokeEvidence,
          regrantEvidence,
          checkpoint: { revokeDone: [...revokeDone], grantDone: [...grantDone] },
        });
      }
    }

    // A resumed operation may already carry every per-binding checkpoint. The
    // live IAM sweep above still reconverges them; persist REGRANTING again so
    // the final DB ownership CAS cannot rely on a stale phase marker.
    await this.store.updateTransferCheckpoint({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      transferId: transfer.id,
      state: 'REGRANTING',
      revokeEvidence,
      regrantEvidence,
      checkpoint: { revokeDone: [...revokeDone], grantDone: [...grantDone] },
    });

    await this.store.completeTransfer({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      transferId: transfer.id,
      expectedOwnershipVersion: transfer.expectedOwnershipVersion,
      toPrincipalId: transfer.toPrincipalId,
      regrantEvidence,
    });
  }

  private async _executeAdvance(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    const binding = await this.store.getBinding(claimed.bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    const payload = asObject(claimed.payload);
    const expectedVersion = numberField(payload, 'expectedBindingVersion');
    const billingAccountId = binding.tenant.billingAccountId;
    const services = stringArray(payload.services, 'services');
    const parent = binding.parentFolderId ?? undefined;

    const transition = (to: CloudProjectBindingState, detail?: unknown, gcpProjectNumber?: string) => {
      if (!FACTORY_TRANSITIONS[binding.state].includes(to)) {
        throw new CloudGovernanceError(
          'FACTORY_TRANSITION_INVALID',
          `${binding.state} cannot transition to ${to}`,
          409,
        );
      }
      return this.store.transitionBinding({
        operationId: claimed.id,
        owner: claimed.leaseOwner,
        fence: claimed.fence,
        bindingId: binding.id,
        from: binding.state,
        expectedVersion,
        to,
        detail,
        gcpProjectNumber,
        complete: true,
      });
    };

    switch (binding.state) {
      case 'REQUESTED': {
        await this._guard(claimed);
        try {
          await this.gcp.createProject({
            projectId: binding.gcpProjectId,
            displayName: binding.gcpProjectId,
            parent,
            labels: { 'ecode-binding': binding.id.toLowerCase(), 'ecode-tenant': binding.cloudTenantId.toLowerCase() },
          });
        } catch (error) {
          if (!(error instanceof GcpApiError && error.isAlreadyExists)) throw error;
          await this._guard(claimed);
          const project = await this.gcp.getProject(binding.gcpProjectId);
          if (!project || project.labels?.['ecode-binding'] !== binding.id.toLowerCase()) {
            throw new CloudGovernanceError(
              'GCP_PROJECT_ID_COLLISION',
              'GCP project id exists but is not owned by this binding',
              409,
            );
          }
        }
        await transition('CREATING', { parent });
        return;
      }
      case 'CREATING': {
        await this._guard(claimed);
        const project = await this.gcp.getProject(binding.gcpProjectId);
        if (!project || project.state !== 'ACTIVE') {
          throw new CloudGovernanceError('FACTORY_PROJECT_PENDING', 'GCP project is not ACTIVE yet', 409, true);
        }
        await this._guard(claimed);
        await this.gcp.linkProjectBilling(binding.gcpProjectId, billingAccountId);
        await this._guard(claimed);
        const billing = await this.gcp.getProjectBillingInfo(binding.gcpProjectId);
        if (!billing.billingEnabled || billing.billingAccountName !== `billingAccounts/${billingAccountId}`) {
          throw new CloudGovernanceError(
            'FACTORY_BILLING_UNVERIFIED',
            'Expected billing account is not linked',
            409,
            true,
          );
        }
        await transition('BILLING_LINKED', { billingAccountId }, project.projectNumber);
        return;
      }
      case 'BILLING_LINKED':
        await this._guard(claimed);
        await this.gcp.enableServices(binding.gcpProjectId, services);
        await transition('APIS_ENABLING', { services });
        return;
      case 'APIS_ENABLING': {
        await this._guard(claimed);
        const enabled = await this.gcp.listEnabledServices(binding.gcpProjectId);
        const missing = services.filter((service) => !enabled.includes(service));
        if (missing.length > 0) {
          throw new CloudGovernanceError(
            'FACTORY_SERVICES_PENDING',
            `Services pending: ${missing.join(', ')}`,
            409,
            true,
          );
        }
        await transition('SERVICE_AGENTS_READY', { services });
        return;
      }
      case 'SERVICE_AGENTS_READY': {
        const owner = binding.tenant.ownerPrincipalId;
        await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) =>
          addRoles(policy, owner, ['roles/viewer']),
        );
        await this._guard(claimed);
        const verified = await this.gcp.getProjectIamPolicy(binding.gcpProjectId);
        if (!heldRoles(verified, owner).includes('roles/viewer')) {
          throw new CloudGovernanceError('FACTORY_IAM_UNVERIFIED', 'Owner viewer grant is not visible', 409, true);
        }
        await transition('IAM_BOUND', { ownerRole: 'roles/viewer' });
        return;
      }
      case 'IAM_BOUND':
        await transition('EDGE_READY', { edge: 'platform-shared-ingress' });
        return;
      case 'EDGE_READY':
        await transition('ACTIVE');
        return;
      default:
        throw new CloudGovernanceError('FACTORY_NOT_ADVANCEABLE', `Binding is ${binding.state}`, 409);
    }
  }

  private async _executeTeardownRequest(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    const binding = await this.store.getBinding(claimed.bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    if (!TEARDOWN_REQUESTABLE.has(binding.state)) {
      throw new CloudGovernanceError('TEARDOWN_STATE_INVALID', `Binding ${binding.state} cannot be torn down`, 409);
    }
    const expectedVersion = numberField(asObject(claimed.payload), 'expectedBindingVersion');
    await this._guard(claimed);
    const [buckets, serviceAccounts, enabledServices] = await Promise.all([
      this.gcp.listBuckets(binding.gcpProjectId),
      this.gcp.listServiceAccounts(binding.gcpProjectId),
      this.gcp.listEnabledServices(binding.gcpProjectId),
    ]);
    const inventory = [
      ...buckets.map((bucket) => ({ kind: 'bucket', name: bucket.name })),
      ...serviceAccounts.map((account) => ({ kind: 'serviceAccount', name: account.email })),
      ...enabledServices.map((service) => ({ kind: 'enabledService', name: service })),
    ];
    await this.store.completeTeardownRequest({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      bindingId: binding.id,
      from: binding.state,
      expectedVersion,
      inventory,
    });
  }

  private async _executeTeardown(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    const binding = await this.store.getBinding(claimed.bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    if (binding.state !== 'DELETE_REQUESTED') {
      throw new CloudGovernanceError('TEARDOWN_STATE_INVALID', `Binding is ${binding.state}`, 409);
    }
    const teardown = await this.store.latestTeardown(binding.id);
    if (!teardown || teardown.status !== 'DELETING') {
      throw new CloudGovernanceError('TEARDOWN_NOT_FOUND', 'No DELETING teardown inventory exists', 409);
    }
    const expectedVersion = numberField(asObject(claimed.payload), 'expectedBindingVersion');
    const checkpoint = asObject(claimed.checkpoint ?? {});
    const deleted = new Set(stringArray(checkpoint.deletedBuckets ?? [], 'deletedBuckets'));
    const inventory = Array.isArray(teardown.resourceInventory)
      ? (teardown.resourceInventory as Array<{ kind?: unknown; name?: unknown }>)
      : [];
    const buckets = inventory
      .filter((item) => item.kind === 'bucket' && typeof item.name === 'string')
      .map((item) => item.name as string);

    for (const bucket of buckets) {
      if (deleted.has(bucket)) continue;
      await this._guard(claimed);
      await this.gcp.deleteBucket(bucket, () => this._guard(claimed));
      deleted.add(bucket);
      await this.store.checkpointOperation({
        id: claimed.id,
        owner: claimed.leaseOwner,
        fence: claimed.fence,
        step: 'BUCKETS_DELETING',
        checkpoint: { deletedBuckets: [...deleted] },
        eventType: 'BUCKET_DELETED',
        detail: { bucket },
      });
    }
    await this._guard(claimed);
    await this.gcp.deleteProject(binding.gcpProjectId);
    await this.store.completeTeardownExecution({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      bindingId: binding.id,
      expectedVersion,
      teardownId: teardown.id,
      recoveryWindowDays: RECOVERY_WINDOW_DAYS,
      deletedBuckets: [...deleted],
    });
  }

  private async _executeTeardownVerification(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    const payload = asObject(claimed.payload);
    const teardownId = stringField(payload, 'teardownId');
    const [binding, teardown] = await Promise.all([
      this.store.getBinding(claimed.bindingId),
      this.store.getTeardown(teardownId),
    ]);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    if (!teardown || teardown.bindingId !== binding.id) {
      throw new CloudGovernanceError('TEARDOWN_NOT_FOUND', 'Teardown does not belong to this binding', 404);
    }
    await this._guard(claimed);
    const project = await this.gcp.getProject(binding.gcpProjectId);
    const erased = project === null || project.state !== 'ACTIVE';
    const inventory = Array.isArray(teardown.resourceInventory)
      ? (teardown.resourceInventory as Array<{ kind?: unknown; name?: unknown }>)
      : [];
    const orphans: Array<{ kind: string; name: string }> = [];

    if (!erased) {
      await this._guard(claimed);
      const [buckets, accounts] = await Promise.all([
        this.gcp.listBuckets(binding.gcpProjectId),
        this.gcp.listServiceAccounts(binding.gcpProjectId),
      ]);
      const liveBuckets = new Set(buckets.map((bucket) => bucket.name));
      const liveAccounts = new Set(accounts.map((account) => account.email));
      for (const item of inventory) {
        if (item.kind === 'bucket' && typeof item.name === 'string' && liveBuckets.has(item.name)) {
          orphans.push({ kind: 'bucket', name: item.name });
        }
        if (item.kind === 'serviceAccount' && typeof item.name === 'string' && liveAccounts.has(item.name)) {
          orphans.push({ kind: 'serviceAccount', name: item.name });
        }
      }
    }
    const proof = {
      checkedAt: new Date().toISOString(),
      gcpProjectId: binding.gcpProjectId,
      projectState: project?.state ?? 'NOT_FOUND',
      projectErased: erased,
      inventoryCount: inventory.length,
      orphanCount: orphans.length,
    };
    await this.store.completeTeardownVerification({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      teardownId: teardown.id,
      expectedVersion: teardown.version,
      proof,
      orphans,
      complete: erased && orphans.length === 0,
    });
  }

  private async _executeRestore(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    let binding = await this.store.getBinding(claimed.bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);

    if (binding.state === 'RECOVERY_WINDOW') {
      const expectedVersion = numberField(asObject(claimed.payload), 'expectedBindingVersion');
      await this.store.transitionBinding({
        operationId: claimed.id,
        owner: claimed.leaseOwner,
        fence: claimed.fence,
        bindingId: binding.id,
        from: 'RECOVERY_WINDOW',
        expectedVersion,
        to: 'RESTORING',
        complete: false,
      });
      binding = await this.store.getBinding(binding.id);
      if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding disappeared', 500);
    }
    if (binding.state !== 'RESTORING') {
      throw new CloudGovernanceError('RESTORE_STATE_INVALID', `Binding is ${binding.state}`, 409);
    }
    await this._guard(claimed);
    let project = await this.gcp.getProject(binding.gcpProjectId);
    if (project?.state !== 'ACTIVE') {
      await this._guard(claimed);
      try {
        await this.gcp.undeleteProject(binding.gcpProjectId);
      } catch (error) {
        if (!(error instanceof GcpApiError && error.isAlreadyExists)) throw error;
      }
    }
    await this._guard(claimed);
    project = await this.gcp.getProject(binding.gcpProjectId);
    if (!project || project.state !== 'ACTIVE') {
      throw new CloudGovernanceError('FACTORY_RESTORE_PENDING', 'GCP project is not ACTIVE after undelete', 409, true);
    }
    await this.store.transitionBinding({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      bindingId: binding.id,
      from: 'RESTORING',
      expectedVersion: binding.version,
      to: 'ACTIVE',
      clearRecoveryWindow: true,
      detail: { restored: true },
      complete: true,
    });
  }

  private async _executePurge(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    const binding = await this.store.getBinding(claimed.bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    await this._guard(claimed);
    const project = await this.gcp.getProject(binding.gcpProjectId);
    if (project) {
      throw new CloudGovernanceError(
        'PROJECT_PURGE_PENDING',
        `GCP project is still ${project.state}; final deletion is not yet verified`,
        409,
        true,
      );
    }
    await this.store.purgeBinding({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      bindingId: binding.id,
      expectedVersion: numberField(asObject(claimed.payload), 'expectedBindingVersion'),
    });
  }

  private async _executeIdentityEnsure(claimed: ClaimedOperation): Promise<void> {
    if (!claimed.bindingId) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'Operation has no binding', 500);
    const binding = await this.store.getBinding(claimed.bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    if (!['IAM_BOUND', 'EDGE_READY', 'ACTIVE'].includes(binding.state)) {
      throw new CloudGovernanceError('IAM_PROJECT_NOT_READY', `Binding is ${binding.state}`, 409);
    }
    const payload = asObject(claimed.payload);
    const kind = stringField(payload, 'kind') as PlatformIamIdentityKind;
    const app = stringField(payload, 'app');
    const environment = stringField(payload, 'environment');
    const privilegeBoundary = stringField(payload, 'privilegeBoundary');
    const roles = stringArray(payload.roles, 'roles');
    const workloadMembers = stringArray(payload.workloadIdentityMembers, 'workloadIdentityMembers');
    const boundary = { kind, app, environment, privilegeBoundary, gcpProjectId: binding.gcpProjectId };
    const existing = await this.store.findIdentity(boundary);
    const accountId = serviceAccountIdForBoundary(boundary);
    const expectedEmail = `${accountId}@${binding.gcpProjectId}.iam.gserviceaccount.com`;
    let email = existing?.gcpServiceAccountEmail ?? expectedEmail;

    await this._guard(claimed);
    let account = await this.gcp.getServiceAccount(binding.gcpProjectId, email);
    if (!account) {
      await this._guard(claimed);
      try {
        account = await this.gcp.createServiceAccount(
          binding.gcpProjectId,
          accountId,
          `${kind} ${app || privilegeBoundary} (${environment || 'platform'})`,
        );
      } catch (error) {
        if (!(error instanceof GcpApiError && error.isAlreadyExists)) throw error;
        await this._guard(claimed);
        account = await this.gcp.getServiceAccount(binding.gcpProjectId, expectedEmail);
        if (!account)
          throw new CloudGovernanceError(
            'IAM_ACCOUNT_ADOPTION_FAILED',
            'Existing service account is inaccessible',
            409,
          );
      }
      email = account.email;
    }
    if (email !== expectedEmail || account.email !== expectedEmail) {
      throw new CloudGovernanceError(
        'IAM_ACCOUNT_BOUNDARY_CONFLICT',
        'Service account does not match deterministic boundary',
        409,
      );
    }

    const member = `serviceAccount:${email}`;
    await this._guard(claimed);
    const initialKeys = await this.gcp.listServiceAccountKeys(binding.gcpProjectId, email);
    const initialPersistentKeys = initialKeys.filter((key) => key.keyType === 'USER_MANAGED').length;
    if (initialPersistentKeys > 0) {
      await this._quarantineIdentity(binding.gcpProjectId, email, claimed);
      await this.store.completeIdentityEnsure({
        operationId: claimed.id,
        owner: claimed.leaseOwner,
        fence: claimed.fence,
        bindingId: binding.id,
        boundary,
        serviceAccountEmail: email,
        persistentKeys: initialPersistentKeys,
      });
      return;
    }
    await this._mutateProjectPolicy(binding.gcpProjectId, claimed, (policy) =>
      addRoles(removeMember(policy, member), member, roles),
    );
    await this._mutateServiceAccountPolicy(email, claimed, (policy) =>
      setRoleMembers(policy, 'roles/iam.workloadIdentityUser', workloadMembers),
    );
    await this._guard(claimed);
    const [projectPolicy, serviceAccountPolicy, keys] = await Promise.all([
      this.gcp.getProjectIamPolicy(binding.gcpProjectId),
      this.gcp.getServiceAccountIamPolicy(email),
      this.gcp.listServiceAccountKeys(binding.gcpProjectId, email),
    ]);
    const actualRoles = [...new Set(heldRoles(projectPolicy, member))].sort();
    if (JSON.stringify(actualRoles) !== JSON.stringify([...roles].sort())) {
      throw new CloudGovernanceError('IAM_GRANT_UNVERIFIED', 'Exact project IAM boundary is not visible', 409, true);
    }
    const actualWorkloadMembers = [
      ...new Set(
        (serviceAccountPolicy.bindings ?? [])
          .filter((binding) => binding.role === 'roles/iam.workloadIdentityUser')
          .flatMap((binding) => binding.members),
      ),
    ].sort();
    if (JSON.stringify(actualWorkloadMembers) !== JSON.stringify([...workloadMembers].sort())) {
      throw new CloudGovernanceError(
        'IAM_WIF_GRANT_UNVERIFIED',
        'Exact Workload Identity boundary is not visible',
        409,
        true,
      );
    }
    const persistentKeys = keys.filter((key) => key.keyType === 'USER_MANAGED').length;
    if (persistentKeys > 0) {
      await this._quarantineIdentity(binding.gcpProjectId, email, claimed);
    }
    await this.store.completeIdentityEnsure({
      operationId: claimed.id,
      owner: claimed.leaseOwner,
      fence: claimed.fence,
      bindingId: binding.id,
      boundary,
      serviceAccountEmail: email,
      persistentKeys,
    });
  }

  async verifyIdentitySeparation(bindingId: string) {
    const binding = await this.store.getBinding(bindingId);
    if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    const identities = await this.store.listIdentities({ bindingId, limit: 1000 });
    const policy = await this.gcp.getProjectIamPolicy(binding.gcpProjectId);
    const violations: Array<{ identityId: string; kind: PlatformIamIdentityKind; role: string }> = [];

    for (const identity of identities) {
      const roles = heldRoles(policy, `serviceAccount:${identity.gcpServiceAccountEmail}`);
      for (const role of roles) {
        if (
          (identity.kind === 'BUILD' && PROMOTE_CAPABLE.has(role)) ||
          (identity.kind === 'PROMOTION' && BUILD_CAPABLE.has(role))
        ) {
          violations.push({ identityId: identity.id, kind: identity.kind, role });
        }
      }
    }
    return { separationHolds: violations.length === 0, violations };
  }
}

export function serviceAccountIdForBoundary(input: {
  kind: PlatformIamIdentityKind;
  app: string;
  environment: string;
  privilegeBoundary: string;
  gcpProjectId: string;
}): string {
  const prefix = input.kind === 'BUILD' ? 'bld' : input.kind === 'PROMOTION' ? 'prm' : 'rt';
  const digest = createHash('sha256')
    .update(`${input.kind}|${input.app}|${input.environment}|${input.privilegeBoundary}|${input.gcpProjectId}`)
    .digest('hex')
    .slice(0, 12);
  const slug = (input.app || input.privilegeBoundary)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30 - prefix.length - digest.length - 2);
  return `${prefix}-${slug ? `${slug}-` : ''}${digest}`.slice(0, 30).replace(/-+$/, '');
}
