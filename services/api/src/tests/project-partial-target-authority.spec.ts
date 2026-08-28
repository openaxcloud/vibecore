import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ImportJobRecord,
  ProjectPartialTargetAuthority,
  ProjectPhysicalAccessOperation,
  RemixJobRecord,
} from '../store.js';
import { TestApiStore } from './test-api-store.js';

const authorityLost = {
  code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
  statusCode: 409,
};

describe('hidden import/remix target physical authority', () => {
  let store: TestApiStore;
  let organizationId: string;
  let projectId: string;
  const clockMs = Date.parse('2035-01-01T00:00:00.000Z');

  beforeEach(async () => {
    store = new TestApiStore();
    store.databaseClockNowMs = clockMs;
    const owner = await store.createUser({
      email: `partial-target-${Math.random()}@example.test`,
      name: 'Partial target owner',
      passwordHash: 'test-password-hash',
    });
    const organization = await store.createOrganization({
      name: 'Partial target organization',
      slug: `partial-target-${Math.random().toString(36).slice(2)}`,
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Hidden target',
      slug: `hidden-target-${Math.random().toString(36).slice(2)}`,
    });
    project.deletedAt = new Date(clockMs).toISOString();
    organizationId = organization.id;
    projectId = project.id;
  });

  function scope(authority: ProjectPartialTargetAuthority | undefined, operation: ProjectPhysicalAccessOperation) {
    return {
      projectId,
      expectedOrganizationId: organizationId,
      ...(authority ? { partialTargetAuthority: authority } : {}),
      physicalAccessOperation: operation,
    };
  }

  function seedImport(overrides: Partial<ImportJobRecord> = {}) {
    const row: ImportJobRecord = {
      id: 'import-hidden-target',
      organizationId,
      provider: 'zip',
      state: 'COMMITTING',
      idempotencyKey: 'hidden-import-key',
      requestHash: 'hidden-import-hash',
      targetProjectId: projectId,
      stagedFileCount: 1,
      redactedCount: 0,
      creditsReserved: true,
      version: 1,
      operationToken: 'import-owner-token',
      operationExpiresAt: new Date(clockMs + 60_000).toISOString(),
      createdAt: new Date(clockMs).toISOString(),
      updatedAt: new Date(clockMs).toISOString(),
      ...overrides,
    };
    store.importJobs.set(row.id, row);
    return row;
  }

  function seedRemix(overrides: Partial<RemixJobRecord> = {}) {
    const row: RemixJobRecord = {
      id: 'remix-hidden-target',
      sourceProjectId: 'source-project',
      targetProjectId: projectId,
      organizationId,
      state: 'SOURCE_SANITIZED',
      version: 1,
      storagePolicy: 'DETACH',
      scrubbedCount: 0,
      dbForked: false,
      piiMaskedCount: 0,
      operationToken: 'remix-owner-token',
      operationExpiresAt: new Date(clockMs + 60_000).toISOString(),
      createdAt: new Date(clockMs).toISOString(),
      updatedAt: new Date(clockMs).toISOString(),
      ...overrides,
    };
    store.remixJobs.set(row.id, row);
    return row;
  }

  it('allows the exact live IMPORT_TARGET to write/read COMMITTING and cleanup to delete/read only', async () => {
    const job = seedImport();
    const authority = {
      kind: 'IMPORT_TARGET' as const,
      jobId: job.id,
      operationToken: job.operationToken!,
    };
    const materialize = vi.fn(async () => 'materialized');

    await expect(store.withProjectPhysicalMutation(scope(authority, 'WRITE'), materialize)).resolves.toBe(
      'materialized',
    );
    await expect(store.withProjectPhysicalAccess(scope(authority, 'READ'), async () => 'verified')).resolves.toBe(
      'verified',
    );
    expect(materialize).toHaveBeenCalledOnce();

    job.state = 'CLEANUP_PENDING';
    await expect(store.withProjectPhysicalMutation(scope(authority, 'DELETE'), async () => 'erased')).resolves.toBe(
      'erased',
    );
    await expect(store.withProjectPhysicalAccess(scope(authority, 'READ'), async () => 'absent')).resolves.toBe(
      'absent',
    );
    await expect(
      store.withProjectPhysicalMutation(scope(authority, 'WRITE'), async () => 'forbidden'),
    ).rejects.toMatchObject(authorityLost);
  });

  it('rejects plain, wrong-token, and expired IMPORT_TARGET scopes before any effect', async () => {
    const job = seedImport();
    const effect = vi.fn(async () => undefined);

    await expect(store.withProjectPhysicalMutation(scope(undefined, 'WRITE'), effect)).rejects.toMatchObject(
      authorityLost,
    );
    await expect(
      store.withProjectPhysicalMutation(
        scope({ kind: 'IMPORT_TARGET', jobId: job.id, operationToken: 'wrong-token' }, 'WRITE'),
        effect,
      ),
    ).rejects.toMatchObject(authorityLost);
    job.operationExpiresAt = new Date(clockMs).toISOString();
    await expect(
      store.withProjectPhysicalMutation(
        scope({ kind: 'IMPORT_TARGET', jobId: job.id, operationToken: job.operationToken! }, 'WRITE'),
        effect,
      ),
    ).rejects.toMatchObject(authorityLost);
    expect(effect).not.toHaveBeenCalled();
  });

  it('allows the exact live REMIX_TARGET in SOURCE_SANITIZED and CLEANUP_PENDING only', async () => {
    const job = seedRemix();
    const authority = {
      kind: 'REMIX_TARGET' as const,
      jobId: job.id,
      operationToken: job.operationToken!,
    };

    await expect(store.withProjectPhysicalMutation(scope(authority, 'WRITE'), async () => 'cloned')).resolves.toBe(
      'cloned',
    );
    await expect(store.withProjectPhysicalAccess(scope(authority, 'READ'), async () => 'verified')).resolves.toBe(
      'verified',
    );

    job.state = 'STORAGE_PINNED';
    await expect(
      store.withProjectPhysicalAccess(scope(authority, 'OBJECT_CLONE'), async () => 'objects-cloned'),
    ).resolves.toBe('objects-cloned');

    job.state = 'CLEANUP_PENDING';
    await expect(store.withProjectPhysicalMutation(scope(authority, 'DELETE'), async () => 'erased')).resolves.toBe(
      'erased',
    );
    await expect(
      store.withProjectPhysicalMutation(scope(authority, 'WRITE'), async () => 'forbidden'),
    ).rejects.toMatchObject(authorityLost);
  });

  it('rejects wrong-token and expired REMIX_TARGET scopes before any effect', async () => {
    const job = seedRemix();
    const effect = vi.fn(async () => undefined);

    await expect(
      store.withProjectPhysicalMutation(
        scope({ kind: 'REMIX_TARGET', jobId: job.id, operationToken: 'wrong-token' }, 'WRITE'),
        effect,
      ),
    ).rejects.toMatchObject(authorityLost);
    job.operationExpiresAt = new Date(clockMs).toISOString();
    await expect(
      store.withProjectPhysicalMutation(
        scope({ kind: 'REMIX_TARGET', jobId: job.id, operationToken: job.operationToken! }, 'WRITE'),
        effect,
      ),
    ).rejects.toMatchObject(authorityLost);
    expect(effect).not.toHaveBeenCalled();
  });
});
