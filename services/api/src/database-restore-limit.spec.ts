import { describe, expect, it } from 'vitest';

import { TestApiStore } from './tests/test-api-store.js';

describe('managed database restore inventory bound', () => {
  it('accepts 512 durable restore rows and rejects the 513th', async () => {
    const store = new TestApiStore();
    store.databaseInstances.set('database-1', {
      id: 'database-1',
      projectId: 'project-1',
      organizationId: 'org-1',
      environment: 'development',
      status: 'ACTIVE',
      engine: 'postgres',
      sizeBytes: 0,
      retentionDays: 7,
      pitrEnabled: true,
      physicalAuthority: {
        tier: 'isolated',
        clusterName: 'db-project-1',
        backupBucket: 'database-backups',
        backupPrefix: 'db/project-1/',
        retentionDays: 7,
        capturedAt: '2026-08-28T08:00:00.000Z',
      },
      createdAt: '2026-08-28T08:00:00.000Z',
      updatedAt: '2026-08-28T08:00:00.000Z',
    });

    for (let index = 0; index < 512; index += 1) {
      await store.createDatabaseRestore({
        databaseInstanceId: 'database-1',
        targetTimestamp: new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString(),
      });
    }

    await expect(store.createDatabaseRestore({ databaseInstanceId: 'database-1' })).rejects.toMatchObject({
      code: 'DATABASE_RESTORE_LIMIT_REACHED',
      statusCode: 429,
    });
    expect(await store.listDatabaseRestores('database-1')).toHaveLength(512);
  });
});
