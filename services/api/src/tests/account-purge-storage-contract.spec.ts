import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

describe('account purge — production storage writer contract', () => {
  it('refuses an injected adapter whose mutation critical section cannot share the purge lock', async () => {
    await expect(
      buildApiApp({
        store: new TestApiStore(),
        projectStorage: {} as ProjectStorage,
        isProduction: true,
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PROJECT_STORAGE_ADAPTER' });
  });

  it('keeps only the purged collaborator checkout fenced after terminal purge', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({ email: 'workspace-owner@example.test', passwordHash: 'hash' });
    const subject = await store.createUser({ email: 'workspace-subject@example.test', passwordHash: 'hash' });
    await store.updateUser({
      userId: subject.id,
      preferences: {
        accountDeletion: { requestedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000).toISOString() },
      },
    });
    const organization = await store.createOrganization({
      name: 'Retained shared organization',
      slug: 'retained-shared-organization',
      ownerUserId: owner.id,
    });
    await store.addMember({ organizationId: organization.id, userId: subject.id, roleKey: 'member' });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Retained shared project',
      slug: 'retained-shared-project',
    });

    await expect(
      store.purgeUserAccount({ userId: subject.id }, { eraseStorage: async () => ({ classes: [], verified: true }) }),
    ).resolves.toMatchObject({ outcome: 'purged' });

    const digest = createHash('sha256').update(`${project.id}:${subject.id}`).digest('hex').slice(0, 16);
    const subjectWorkspaceId = `ws-${digest}`;
    await expect(store.assertProjectStorageMutable(project.id, subjectWorkspaceId)).rejects.toMatchObject({
      code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
    });
    await expect(store.assertProjectStorageMutable(project.id, 'ws-other-collaborator')).resolves.toBeUndefined();
    await expect(store.assertProjectStorageMutable(project.id)).resolves.toBeUndefined();
  });
});
