import { describe, expect, it, vi } from 'vitest';
import { projectPhysicalMutationLockKey } from '../project-physical-mutation.js';
import type { ProjectPhysicalMutationScope } from '../store.js';
import { TestApiStore } from './test-api-store.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });

  return { promise, resolve };
}

/**
 * Test-only fault injector for the documented failure mode where the dedicated
 * PostgreSQL session holding the physical advisory locks disappears after the
 * first tenant verdict but before NFS is acquired. Production behavior is not
 * replaced: tenant validation and transfer still use the real TestApiStore
 * paths; only physical-lock serialization is deliberately dropped.
 */
class ObservablePhysicalStore extends TestApiStore {
  readonly physicalLockKeys: string[] = [];
  readonly validationProjectIds: string[] = [];
  readonly firstPassPaused = deferred();
  readonly continueToNfs = deferred();

  dropPhysicalSerialization = false;
  private validationsBeforePause: number | undefined;

  pauseAfterValidations(count: number) {
    this.validationsBeforePause = count;
  }

  override async withSerializedMutation<T>(
    key: string,
    fn: () => Promise<T>,
    options?: { transactionTimeoutMs?: number },
  ): Promise<T> {
    if (key.startsWith('project-physical-mutation:')) {
      this.physicalLockKeys.push(key);

      if (this.dropPhysicalSerialization) {
        return fn();
      }
    }

    return super.withSerializedMutation(key, fn, options);
  }

  override async assertProjectStorageMutable(
    scope: ProjectPhysicalMutationScope,
    options: { allowDeletedProject?: boolean } = {},
  ): Promise<void> {
    this.validationProjectIds.push(scope.projectId);
    await super.assertProjectStorageMutable(scope, options);

    if (this.validationsBeforePause === undefined) return;

    this.validationsBeforePause -= 1;
    if (this.validationsBeforePause === 0) {
      this.validationsBeforePause = undefined;
      this.firstPassPaused.resolve();
      await this.continueToNfs.promise;
    }
  }
}

let fixtureSequence = 0;

async function seedFixture(label: string, projectCount = 1) {
  fixtureSequence += 1;
  const token = `${label}-${fixtureSequence}`;
  const store = new ObservablePhysicalStore();
  const user = await store.createUser({
    email: `${token}@example.test`,
    name: `${label} owner`,
    passwordHash: 'test-password-hash',
  });
  const sourceOrganization = await store.createOrganization({
    name: `${label} source`,
    slug: `${token}-source`,
    ownerUserId: user.id,
  });
  const targetOrganization = await store.createOrganization({
    name: `${label} target`,
    slug: `${token}-target`,
    ownerUserId: user.id,
  });
  const projects = await Promise.all(
    Array.from({ length: projectCount }, (_, index) =>
      store.createProject({
        organizationId: sourceOrganization.id,
        name: `${label} project ${index + 1}`,
        slug: `${token}-project-${index + 1}`,
      }),
    ),
  );

  return { store, user, sourceOrganization, targetOrganization, projects };
}

async function transferProject(fixture: Awaited<ReturnType<typeof seedFixture>>, projectId: string) {
  return fixture.store.transferProject({
    projectId,
    expectedOrganizationId: fixture.sourceOrganization.id,
    expectedOwnershipEpoch: 0,
    targetOrganizationId: fixture.targetOrganization.id,
    idempotencyKey: `physical-revalidation-${projectId}`,
    actorUserId: fixture.user.id,
    assertExternalStorageDetached: async () => undefined,
    validateTargetAdmission: async () => undefined,
  });
}

const staleTenantError = {
  code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
  statusCode: 409,
};

describe('project physical access tenant revalidation', () => {
  it('rejects a stale writer with zero effect when its advisory verdict is lost before NFS', async () => {
    const fixture = await seedFixture('single-loss');
    const project = fixture.projects[0];
    const staleScope = {
      projectId: project.id,
      expectedOrganizationId: fixture.sourceOrganization.id,
    };
    const physicalEffect = vi.fn(async () => 'written');

    fixture.store.dropPhysicalSerialization = true;
    fixture.store.pauseAfterValidations(1);
    const staleWriter = fixture.store.withProjectPhysicalMutation(staleScope, physicalEffect);
    const staleWriterRejected = expect(staleWriter).rejects.toMatchObject(staleTenantError);

    await fixture.store.firstPassPaused.promise;
    try {
      await expect(transferProject(fixture, project.id)).resolves.toMatchObject({
        organizationId: fixture.targetOrganization.id,
      });
    } finally {
      fixture.store.continueToNfs.resolve();
    }

    await staleWriterRejected;
    expect(physicalEffect).not.toHaveBeenCalled();
    await expect(fixture.store.getProject(project.id)).resolves.toMatchObject({
      organizationId: fixture.targetOrganization.id,
    });
  });

  it('deduplicates projects, acquires physical locks in sorted order, and validates every scope twice', async () => {
    const fixture = await seedFixture('multi-order', 2);
    const orderedProjects = [...fixture.projects].sort((left, right) => left.id.localeCompare(right.id));
    const reversedScopes = [...orderedProjects].reverse().map((project) => ({
      projectId: project.id,
      expectedOrganizationId: fixture.sourceOrganization.id,
    }));
    const effect = vi.fn(async () => 'read');

    await expect(
      fixture.store.withProjectPhysicalAccesses([...reversedScopes, reversedScopes[0]], effect),
    ).resolves.toBe('read');

    const orderedProjectIds = orderedProjects.map(({ id }) => id);
    expect(fixture.store.physicalLockKeys).toEqual(orderedProjectIds.map(projectPhysicalMutationLockKey));
    expect(fixture.store.validationProjectIds).toEqual([...orderedProjectIds, ...orderedProjectIds]);
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('revalidates every project after the NFS gap and rejects when the second sorted scope transfers', async () => {
    const fixture = await seedFixture('multi-loss', 2);
    const orderedProjects = [...fixture.projects].sort((left, right) => left.id.localeCompare(right.id));
    const orderedProjectIds = orderedProjects.map(({ id }) => id);
    const scopes: ProjectPhysicalMutationScope[] = [...orderedProjects].reverse().map((project) => ({
      projectId: project.id,
      expectedOrganizationId: fixture.sourceOrganization.id,
    }));
    const effect = vi.fn(async () => 'read');

    fixture.store.dropPhysicalSerialization = true;
    fixture.store.pauseAfterValidations(orderedProjects.length);
    const staleAccess = fixture.store.withProjectPhysicalAccesses(scopes, effect);
    const staleAccessRejected = expect(staleAccess).rejects.toMatchObject(staleTenantError);

    await fixture.store.firstPassPaused.promise;
    const transferredProject = orderedProjects[1];
    try {
      await expect(transferProject(fixture, transferredProject.id)).resolves.toMatchObject({
        organizationId: fixture.targetOrganization.id,
      });
    } finally {
      fixture.store.continueToNfs.resolve();
    }

    await staleAccessRejected;
    expect(effect).not.toHaveBeenCalled();
    expect(fixture.store.physicalLockKeys.slice(0, 2)).toEqual(orderedProjectIds.map(projectPhysicalMutationLockKey));
    expect(fixture.store.validationProjectIds.slice(0, 2)).toEqual(orderedProjectIds);
    expect(fixture.store.validationProjectIds.slice(-2)).toEqual(orderedProjectIds);
    await expect(fixture.store.getProject(orderedProjects[0].id)).resolves.toMatchObject({
      organizationId: fixture.sourceOrganization.id,
    });
    await expect(fixture.store.getProject(transferredProject.id)).resolves.toMatchObject({
      organizationId: fixture.targetOrganization.id,
    });
  });
});
