import { describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

describe('TestApiStore import commit replay integrity', () => {
  it('replays the durable amount and fails closed when actualCredits changes', async () => {
    const store = new TestApiStore();
    let job = (
      await store.createImportJob({
        organizationId: 'org-replay',
        provider: 'zip',
        idempotencyKey: 'test-store-replay',
        requestHash: 'a'.repeat(64),
        reservedCredits: 4,
        expiresInMs: 60_000,
      })
    ).job;
    for (const state of ['STAGING_ISOLATED', 'SCANNING', 'READY_TO_COMMIT']) {
      job = (await store.transitionImportJob({
        id: job.id,
        organizationId: job.organizationId,
        expectedVersion: job.version,
        expectedStates: [job.state],
        state,
      }))!;
    }
    const operationToken = 'test-store-owner';
    job = (await store.transitionImportJob({
      id: job.id,
      organizationId: job.organizationId,
      expectedVersion: job.version,
      expectedStates: [job.state],
      state: 'COMMITTING',
      patch: { operationToken },
      operationLeaseDurationMs: 60_000,
    }))!;
    const project = await store.createClaimedImportProject({
      importJobId: job.id,
      organizationId: job.organizationId,
      operationToken,
      name: 'Replay target',
      slug: 'replay-target',
      sourceType: 'zip',
    });

    await expect(
      store.finalizeImportCommit({
        importJobId: job.id,
        organizationId: job.organizationId,
        operationToken,
        targetProjectId: project.id,
        actualCredits: 3,
      }),
    ).resolves.toMatchObject({ job: { state: 'COMMITTED' }, reservation: { debitedCredits: 3 } });
    await expect(
      store.finalizeImportCommit({
        importJobId: job.id,
        organizationId: job.organizationId,
        operationToken,
        targetProjectId: project.id,
        actualCredits: 3,
      }),
    ).resolves.toMatchObject({ reservation: { debitedCredits: 3 } });
    await expect(
      store.finalizeImportCommit({
        importJobId: job.id,
        organizationId: job.organizationId,
        operationToken,
        targetProjectId: project.id,
        actualCredits: 2,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_COMMIT_REPLAY_MISMATCH', statusCode: 409 });
  });
});
