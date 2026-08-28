import { describe, expect, it, vi } from 'vitest';

import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import { projectPhysicalMutationLockKey } from '../project-physical-mutation.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import { TestApiStore } from './test-api-store.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class PausingProjectMutationStore extends TestApiStore {
  readonly mutationEntered = deferred();
  readonly releaseMutation = deferred();
  private pausedProjectId?: string;

  pauseNextProjectMutation(projectId: string) {
    this.pausedProjectId = projectId;
  }

  override withSerializedMutation<T>(
    key: string,
    fn: () => Promise<T>,
    options?: { transactionTimeoutMs?: number },
  ): Promise<T> {
    const pausedKey = this.pausedProjectId ? projectPhysicalMutationLockKey(this.pausedProjectId) : undefined;

    if (pausedKey === key) {
      this.pausedProjectId = undefined;
      return super.withSerializedMutation(
        key,
        async () => {
          this.mutationEntered.resolve();
          await this.releaseMutation.promise;
          return fn();
        },
        options,
      );
    }

    return super.withSerializedMutation(key, fn, options);
  }
}

let fixtureSequence = 0;

async function seedFixture(label: string, store = new PausingProjectMutationStore()) {
  fixtureSequence += 1;
  const token = `${label}-${fixtureSequence}`;
  const user = await store.createUser({
    email: `${token}@example.test`,
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
  const project = await store.createProject({
    organizationId: sourceOrganization.id,
    name: `${label} project`,
    slug: `${token}-project`,
  });

  return { store, user, sourceOrganization, targetOrganization, project };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

function transfer(fixture: Fixture) {
  return fixture.store.transferProject({
    projectId: fixture.project.id,
    expectedOrganizationId: fixture.sourceOrganization.id,
    targetOrganizationId: fixture.targetOrganization.id,
    actorUserId: fixture.user.id,
    assertExternalStorageDetached: async () => undefined,
    validateTargetAdmission: async () => undefined,
  });
}

const staleTenantError = {
  code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
  statusCode: 409,
};

describe('project settings and lifecycle transfer fences', () => {
  it('rejects every stale Project/settings/delete/Git row mutation after transfer', async () => {
    const fixture = await seedFixture('project-writes-stale');
    const workspace = await fixture.store.createWorkspace({
      projectId: fixture.project.id,
      name: 'Stopped checkout',
      runtimeMode: 'remote',
      initialStatus: 'STOPPED',
    });
    await transfer(fixture);
    const staleScope = {
      projectId: fixture.project.id,
      expectedOrganizationId: fixture.sourceOrganization.id,
    };

    await expect(fixture.store.updateProject({ ...staleScope, name: 'stale-name' })).rejects.toMatchObject(
      staleTenantError,
    );
    await expect(fixture.store.renameProjectSlug({ ...staleScope, newSlug: 'stale-slug' })).rejects.toMatchObject(
      staleTenantError,
    );
    await expect(fixture.store.softDeleteProject(staleScope)).rejects.toMatchObject(staleTenantError);
    await expect(fixture.store.restoreProject(staleScope)).rejects.toMatchObject(staleTenantError);
    const staleHardDeleteEffect = vi.fn(async () => undefined);
    await expect(
      fixture.store.hardDeleteProject({
        ...staleScope,
        expectedProjectName: fixture.project.name,
        actorUserId: fixture.user.id,
        idempotencyKey: `stale-hard-delete-${fixture.project.id}`,
        requestHash: projectPermanentDeletionRequestHash({
          projectId: fixture.project.id,
          organizationId: fixture.sourceOrganization.id,
          actorUserId: fixture.user.id,
          expectedProjectName: fixture.project.name,
        }),
        preflightPhysicalErasure: async () => ({ summary: objectStorageStaticArtifactSummary([]), artifacts: [] }),
        erasePhysical: staleHardDeleteEffect,
        verifyPhysicalAbsence: vi.fn(async () => {
          throw new Error('verification must not run');
        }),
      }),
    ).rejects.toMatchObject(staleTenantError);
    expect(staleHardDeleteEffect).not.toHaveBeenCalled();
    await expect(
      fixture.store.updateWorkspaceGitRepositoryUrl({
        ...staleScope,
        workspaceId: workspace.id,
        gitRepositoryUrl: 'https://example.test/stale.git',
      }),
    ).rejects.toMatchObject(staleTenantError);

    expect(fixture.store.projectSlugRedirects).toHaveLength(0);
    const transferredProject = await fixture.store.getProject(fixture.project.id);
    expect(transferredProject).toMatchObject({
      organizationId: fixture.targetOrganization.id,
      name: fixture.project.name,
      slug: fixture.project.slug,
    });
    expect(transferredProject?.deletedAt).toBeUndefined();
    expect((await fixture.store.getWorkspace(workspace.id))?.gitRepositoryUrl).toBeUndefined();
  });

  it('lets a mutation holding the project fence finish before transfer commits', async () => {
    const fixture = await seedFixture('project-write-first');
    fixture.store.pauseNextProjectMutation(fixture.project.id);
    const update = fixture.store.updateProject({
      projectId: fixture.project.id,
      expectedOrganizationId: fixture.sourceOrganization.id,
      name: 'written-under-source-authority',
    });
    await fixture.store.mutationEntered.promise;

    let transferSettled = false;
    const pendingTransfer = transfer(fixture).finally(() => {
      transferSettled = true;
    });
    await Promise.resolve();
    expect(transferSettled).toBe(false);

    fixture.store.releaseMutation.resolve();
    await expect(update).resolves.toMatchObject({ name: 'written-under-source-authority' });
    await expect(pendingTransfer).resolves.toMatchObject({ organizationId: fixture.targetOrganization.id });
    await expect(fixture.store.getProject(fixture.project.id)).resolves.toMatchObject({
      organizationId: fixture.targetOrganization.id,
      name: 'written-under-source-authority',
    });
  });

  it('never lets a stale source-authorized transfer move the project a second time', async () => {
    const fixture = await seedFixture('stale-second-transfer');
    const thirdOrganization = await fixture.store.createOrganization({
      name: 'stale second transfer target',
      slug: `stale-second-transfer-third-${fixtureSequence}`,
      ownerUserId: fixture.user.id,
    });
    await transfer(fixture);

    await expect(
      fixture.store.transferProject({
        projectId: fixture.project.id,
        expectedOrganizationId: fixture.sourceOrganization.id,
        targetOrganizationId: thirdOrganization.id,
        actorUserId: fixture.user.id,
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      }),
    ).rejects.toMatchObject(staleTenantError);
    await expect(fixture.store.getProject(fixture.project.id)).resolves.toMatchObject({
      organizationId: fixture.targetOrganization.id,
    });
  });

  it.each(['FAILED', 'CANCELED'] as const)('refuses transfer when a %s deployment row remains', async (status) => {
    const fixture = await seedFixture(`terminal-deployment-${status.toLowerCase()}`);
    await fixture.store.createDeployment({
      projectId: fixture.project.id,
      expectedOrganizationId: fixture.sourceOrganization.id,
      provider: 'static',
      status,
    });

    await expect(transfer(fixture)).rejects.toMatchObject({
      code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE',
      statusCode: 409,
    });
    await expect(fixture.store.getProject(fixture.project.id)).resolves.toMatchObject({
      organizationId: fixture.sourceOrganization.id,
    });
  });
});
