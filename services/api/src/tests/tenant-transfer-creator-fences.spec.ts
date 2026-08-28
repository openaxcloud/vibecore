import { describe, expect, it, vi } from 'vitest';
import { canonicalizeProjectManifest, projectManifestDigest } from '../project-manifest.js';
import type { ObjectStorage } from '../object-storage.js';
import { TestApiStore } from './test-api-store.js';

let fixtureSequence = 0;

async function seedProjectFixture(label: string) {
  fixtureSequence += 1;
  const token = `${label}-${fixtureSequence}`;
  const store = new TestApiStore();
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
  const project = await store.createProject({
    organizationId: sourceOrganization.id,
    name: `${label} project`,
    slug: `${token}-project`,
  });

  return { store, user, sourceOrganization, targetOrganization, project };
}

type ProjectFixture = Awaited<ReturnType<typeof seedProjectFixture>>;

async function transferToTarget(fixture: ProjectFixture) {
  return fixture.store.transferProject({
    projectId: fixture.project.id,
    expectedOrganizationId: fixture.sourceOrganization.id,
    targetOrganizationId: fixture.targetOrganization.id,
    actorUserId: fixture.user.id,
    assertExternalStorageDetached: async () => undefined,
    validateTargetAdmission: async () => undefined,
  });
}

const staleMutationError = {
  code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
  statusCode: 409,
};

const activeResourceError = {
  code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE',
  statusCode: 409,
};

describe('project transfer creator fences — TestApiStore', () => {
  describe('transfer-first stale creators', () => {
    it('rejects a stale manifest append without adding a revision', async () => {
      const fixture = await seedProjectFixture('manifest-stale');
      await transferToTarget(fixture);
      const transferredRevision = await fixture.store.getLatestProjectManifest(fixture.project.id);
      expect(transferredRevision).toBeDefined();
      const rowsBefore = [...(fixture.store.projectManifestRevisions.get(fixture.project.id) ?? [])];
      const transferredManifest = canonicalizeProjectManifest(transferredRevision!.manifest);
      const nextManifest = canonicalizeProjectManifest({
        ...transferredManifest,
        manifestVersion: transferredRevision!.manifestVersion + 1,
        scopes: ['transfer-fence:stale'],
      });

      await expect(
        fixture.store.createProjectManifestRevision({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          schemaVersion: nextManifest.schemaVersion,
          manifestVersion: nextManifest.manifestVersion,
          digest: projectManifestDigest(nextManifest),
          manifest: nextManifest,
          expectedDigest: transferredRevision!.digest,
          createdByUserId: fixture.user.id,
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.projectManifestRevisions.get(fixture.project.id)).toEqual(rowsBefore);
    });

    it('rejects stale activity after transfer without appending an activity row', async () => {
      const fixture = await seedProjectFixture('activity-stale');
      await transferToTarget(fixture);

      await expect(
        fixture.store.recordProjectActivity({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          actorUserId: fixture.user.id,
          action: 'stale.activity',
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(
        [...fixture.store.projectActivity.values()].filter((row) => row.projectId === fixture.project.id),
      ).toHaveLength(0);
    });

    it('rejects a fresh stale checkpoint without creating a row', async () => {
      const fixture = await seedProjectFixture('checkpoint-stale');
      await transferToTarget(fixture);

      await expect(
        fixture.store.createProjectCheckpoint({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          createdByUserId: fixture.user.id,
          idempotencyKey: 'checkpoint-stale-key',
          requestHash: 'checkpoint-stale-hash',
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(
        [...fixture.store.projectCheckpoints.values()].filter((row) => row.projectId === fixture.project.id),
      ).toHaveLength(0);
    });

    it('checks the tenant before replaying a checkpoint idempotency row', async () => {
      const fixture = await seedProjectFixture('checkpoint-replay');
      const request = {
        projectId: fixture.project.id,
        expectedOrganizationId: fixture.sourceOrganization.id,
        createdByUserId: fixture.user.id,
        idempotencyKey: 'checkpoint-replay-key',
        requestHash: 'checkpoint-replay-hash',
      };
      const checkpoint = await fixture.store.createProjectCheckpoint(request);
      await fixture.store.updateProjectCheckpoint(checkpoint.id, { state: 'COMMITTED' });
      await transferToTarget(fixture);
      const rowBefore = { ...fixture.store.projectCheckpoints.get(checkpoint.id)! };

      await expect(fixture.store.createProjectCheckpoint(request)).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.projectCheckpoints.size).toBe(1);
      expect(fixture.store.projectCheckpoints.get(checkpoint.id)).toEqual(rowBefore);
    });

    it('rejects a stale project template without creating a row', async () => {
      const fixture = await seedProjectFixture('template-stale');
      await transferToTarget(fixture);

      await expect(
        fixture.store.createProjectTemplate({
          sourceProjectId: fixture.project.id,
          expectedSourceOrganizationId: fixture.sourceOrganization.id,
          organizationId: fixture.sourceOrganization.id,
          name: 'Stale template',
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.projectTemplates.size).toBe(0);
    });

    it('rejects a stale deployment before the deployment or access-policy rows are created', async () => {
      const fixture = await seedProjectFixture('deployment-stale');
      await transferToTarget(fixture);

      await expect(
        fixture.store.createDeployment({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          provider: 'static',
          status: 'QUEUED',
          accessPolicy: { mode: 'PUBLIC', createdByUserId: fixture.user.id },
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.deployments.size).toBe(0);
      expect(fixture.store.deploymentAccessPolicies).toHaveLength(0);
    });

    it('rejects stale direct and acquired database provisioning without creating an instance', async () => {
      const fixture = await seedProjectFixture('database-stale');
      await transferToTarget(fixture);
      const base = {
        projectId: fixture.project.id,
        expectedOrganizationId: fixture.sourceOrganization.id,
        organizationId: fixture.sourceOrganization.id,
        retentionDays: 7,
        environment: 'development',
      };

      await expect(fixture.store.createDatabaseInstance(base)).rejects.toMatchObject(staleMutationError);
      await expect(
        fixture.store.acquireDatabaseProvisioning({
          ...base,
          provisioningDeadlineAt: '2026-08-28T12:00:00.000Z',
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.databaseInstances.size).toBe(0);
    });

    it('rejects a stale project AI conversation without creating a row', async () => {
      const fixture = await seedProjectFixture('conversation-stale');
      await transferToTarget(fixture);

      await expect(
        fixture.store.createAiConversation({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          userId: fixture.user.id,
          title: 'Stale conversation',
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.aiConversations.size).toBe(0);
    });

    it('rejects stale agent patch, repair, and project-skill writes without creating rows', async () => {
      const fixture = await seedProjectFixture('agent-stale');
      await transferToTarget(fixture);

      await expect(
        fixture.store.upsertAgentPatchProposal({
          id: 'stale-proposal',
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          artifactId: 'artifact-1',
          messageId: 'message-1',
          actionId: 'action-1',
          filePath: '/workspace/src/index.ts',
          relativePath: 'src/index.ts',
          originalContent: 'export const value = 1;',
          proposedContent: 'export const value = 2;',
          hunks: [],
          status: 'pending',
        }),
      ).rejects.toMatchObject(staleMutationError);
      await expect(
        fixture.store.recordAgentRepairEvent({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          relativePath: 'src/index.ts',
          outcome: 'repaired',
        }),
      ).rejects.toMatchObject(staleMutationError);
      await expect(
        fixture.store.setProjectSkillEnabled({
          projectId: fixture.project.id,
          expectedOrganizationId: fixture.sourceOrganization.id,
          skillId: 'frontend-design',
          enabled: true,
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(fixture.store.agentPatchProposals.size).toBe(0);
      expect(fixture.store.agentRepairEvents).toHaveLength(0);
      expect(fixture.store.projectSkillOverrides.size).toBe(0);
    });
  });

  describe('create-first transfer deny-set', () => {
    const cases: Array<{
      name: string;
      create: (fixture: ProjectFixture) => Promise<unknown>;
    }> = [
      {
        name: 'checkpoint',
        create: (fixture) =>
          fixture.store.createProjectCheckpoint({
            projectId: fixture.project.id,
            expectedOrganizationId: fixture.sourceOrganization.id,
            createdByUserId: fixture.user.id,
          }),
      },
      {
        name: 'project template',
        create: (fixture) =>
          fixture.store.createProjectTemplate({
            sourceProjectId: fixture.project.id,
            expectedSourceOrganizationId: fixture.sourceOrganization.id,
            organizationId: fixture.sourceOrganization.id,
            name: 'Transfer blocker template',
          }),
      },
      {
        name: 'deployment',
        create: (fixture) =>
          fixture.store.createDeployment({
            projectId: fixture.project.id,
            expectedOrganizationId: fixture.sourceOrganization.id,
            provider: 'static',
            status: 'QUEUED',
          }),
      },
      {
        name: 'terminal canceled deployment',
        create: (fixture) =>
          fixture.store.createDeployment({
            projectId: fixture.project.id,
            expectedOrganizationId: fixture.sourceOrganization.id,
            provider: 'static',
            status: 'CANCELED',
          }),
      },
      {
        name: 'database provisioning',
        create: (fixture) =>
          fixture.store.acquireDatabaseProvisioning({
            projectId: fixture.project.id,
            expectedOrganizationId: fixture.sourceOrganization.id,
            organizationId: fixture.sourceOrganization.id,
            retentionDays: 7,
            environment: 'development',
            provisioningDeadlineAt: '2026-08-28T12:00:00.000Z',
          }),
      },
      {
        name: 'AI conversation',
        create: (fixture) =>
          fixture.store.createAiConversation({
            projectId: fixture.project.id,
            expectedOrganizationId: fixture.sourceOrganization.id,
            userId: fixture.user.id,
            title: 'Transfer blocker conversation',
          }),
      },
    ];

    it.each(cases)('keeps the source tenant when a $name already exists', async ({ name, create }) => {
      const fixture = await seedProjectFixture(`create-first-${name.replaceAll(' ', '-')}`);
      await create(fixture);

      await expect(transferToTarget(fixture)).rejects.toMatchObject(activeResourceError);
      await expect(fixture.store.getProject(fixture.project.id)).resolves.toMatchObject({
        organizationId: fixture.sourceOrganization.id,
      });
    });
  });

  describe('active remix storage shares', () => {
    async function seedRemixFixture(label: string) {
      const fixture = await seedProjectFixture(label);
      const targetProject = await fixture.store.createProject({
        organizationId: fixture.targetOrganization.id,
        name: `${label} remix target`,
        slug: `${label}-${fixtureSequence}-remix-target`,
      });
      const destinationOrganization = await fixture.store.createOrganization({
        name: `${label} destination`,
        slug: `${label}-${fixtureSequence}-destination`,
        ownerUserId: fixture.user.id,
      });

      return { ...fixture, targetProject, destinationOrganization };
    }

    it('rejects a stale share after the target transfers and creates no share', async () => {
      const fixture = await seedRemixFixture('remix-stale');
      await fixture.store.transferProject({
        projectId: fixture.targetProject.id,
        expectedOrganizationId: fixture.targetOrganization.id,
        targetOrganizationId: fixture.destinationOrganization.id,
        actorUserId: fixture.user.id,
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });

      await expect(
        fixture.store.createRemixStorageShare({
          sourceProjectId: fixture.project.id,
          targetProjectId: fixture.targetProject.id,
          sourceOrganizationId: fixture.sourceOrganization.id,
          targetOrganizationId: fixture.targetOrganization.id,
          consentVersion: 'storage-consent-v1',
          consentedByUserId: fixture.user.id,
          sourceInventory: { bucketExists: false, objects: [] },
          prepareSourceRetention: async () => ({ bucketExists: false, objects: [] }),
        }),
      ).rejects.toMatchObject(staleMutationError);

      expect(await fixture.store.getRemixStorageShareByTarget(fixture.targetProject.id)).toBeUndefined();
      expect(fixture.store.remixStorageShares.size).toBe(0);
    });

    it('blocks target transfer and both object-storage mutation wrappers while a share is active', async () => {
      const fixture = await seedRemixFixture('remix-active');
      await fixture.store.createRemixStorageShare({
        sourceProjectId: fixture.project.id,
        targetProjectId: fixture.targetProject.id,
        sourceOrganizationId: fixture.sourceOrganization.id,
        targetOrganizationId: fixture.targetOrganization.id,
        consentVersion: 'storage-consent-v1',
        consentedByUserId: fixture.user.id,
        sourceInventory: { bucketExists: false, objects: [] },
        prepareSourceRetention: async () => ({ bucketExists: false, objects: [] }),
      });

      await expect(
        fixture.store.transferProject({
          projectId: fixture.targetProject.id,
          expectedOrganizationId: fixture.targetOrganization.id,
          targetOrganizationId: fixture.destinationOrganization.id,
          actorUserId: fixture.user.id,
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        }),
      ).rejects.toMatchObject(activeResourceError);
      await expect(fixture.store.getProject(fixture.targetProject.id)).resolves.toMatchObject({
        organizationId: fixture.targetOrganization.id,
      });

      const mutationEffect = vi.fn(async () => ({ bucket: 'must-not-exist', created: true, location: 'test' }));
      const storage = { active: true, ensureBucket: mutationEffect } as unknown as ObjectStorage;
      await expect(
        fixture.store.executeTenantObjectStorageCommand({
          scopes: [
            {
              projectId: fixture.targetProject.id,
              expectedOrganizationId: fixture.targetOrganization.id,
            },
          ],
          command: { type: 'ENSURE_BUCKET', projectId: fixture.targetProject.id },
          storage,
        }),
      ).rejects.toMatchObject({ code: 'SHARED_READ_ONLY' });
      expect(mutationEffect).not.toHaveBeenCalled();

      const capabilityEffect = vi.fn(async () => ({ expiresAt: new Date(Date.now() + 60_000).toISOString() }));
      await expect(
        fixture.store.issueSignedObjectStorageCapability(
          {
            projectId: fixture.targetProject.id,
            expectedOrganizationId: fixture.targetOrganization.id,
            method: 'PUT',
            objectKey: 'must-not-sign',
          },
          ({ expiresAt }) => capabilityEffect().then((result) => ({ ...result, expiresAt })),
        ),
      ).rejects.toMatchObject({ code: 'SHARED_READ_ONLY', statusCode: 409 });
      expect(capabilityEffect).not.toHaveBeenCalled();
      expect(fixture.store.objectStorageCapabilityExpiresAt.has(fixture.targetProject.id)).toBe(false);
    });
  });
});
