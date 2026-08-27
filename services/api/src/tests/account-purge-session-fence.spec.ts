import { describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function dueUser(store: TestApiStore, suffix: string) {
  const user = await store.createUser({
    email: `purge-session-${suffix}@example.test`,
    passwordHash: 'hash',
  });
  await store.updateUser({
    userId: user.id,
    preferences: {
      accountDeletion: { requestedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000).toISOString() },
    },
  });
  return user;
}

describe('account purge — TestApiStore session linearization', () => {
  it('serializes token lookup and session INSERT behind purge and refuses both afterward', async () => {
    const store = new TestApiStore();
    const user = await dueUser(store, 'race');
    const token = 'existing-before-purge';
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 60_000) });
    const entered = deferred();
    const release = deferred();

    const purge = store.purgeUserAccount(
      { userId: user.id },
      {
        eraseStorage: async () => {
          entered.resolve();
          await release.promise;
          return { classes: [], verified: true };
        },
      },
    );

    await entered.promise;
    const lookup = store.findSessionByToken(token);
    const insert = store.createSession({
      userId: user.id,
      token: 'login-read-before-purge',
      expiresAt: new Date(Date.now() + 60_000),
    });
    release.resolve();

    await expect(purge).resolves.toMatchObject({ outcome: 'purged' });
    await expect(lookup).resolves.toBeUndefined();
    await expect(insert).rejects.toMatchObject({ code: 'SESSION_ACCOUNT_PURGE_FENCED' });
    expect([...store.sessions.values()].filter((session) => session.userId === user.id)).toHaveLength(0);
  });

  it('keeps sessions fenced after a failed physical attempt leaves a durable plan', async () => {
    const store = new TestApiStore();
    const user = await dueUser(store, 'failed-plan');
    const token = 'survives-row-delete-but-not-auth';
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 60_000) });

    await expect(
      store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE' });

    await expect(store.findSessionByToken(token)).resolves.toBeUndefined();
    await expect(
      store.createSession({
        userId: user.id,
        token: 'must-not-resurrect',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 'SESSION_ACCOUNT_PURGE_FENCED' });
  });

  it('serializes impersonator token lookup and late INSERT behind its purge plan', async () => {
    const store = new TestApiStore();
    const target = await dueUser(store, 'target');
    const administrator = await dueUser(store, 'administrator');
    const token = 'impersonation-session';
    await store.createSession({
      userId: target.id,
      impersonatedBy: administrator.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const lockEntered = deferred();
    const lockRelease = deferred();
    const planCommit = store.withSerializedMutation(`account-purge:${administrator.id}`, async () => {
      lockEntered.resolve();
      await lockRelease.promise;
      store.purgePlanUserIds.add(administrator.id);
    });

    await lockEntered.promise;
    const lookup = store.findSessionByToken(token);
    const insert = store.createSession({
      userId: target.id,
      impersonatedBy: administrator.id,
      token: 'impersonation-resurrection',
      expiresAt: new Date(Date.now() + 60_000),
    });
    lockRelease.resolve();
    await planCommit;

    await expect(lookup).resolves.toBeUndefined();
    await expect(insert).rejects.toMatchObject({ code: 'SESSION_ACCOUNT_PURGE_FENCED' });
  });

  it('refuses a token row rebound to subjects that were not locked from the candidate read', async () => {
    const store = new TestApiStore();
    const originalTarget = await dueUser(store, 'rebind-original');
    const reboundTarget = await dueUser(store, 'rebind-new-target');
    const reboundImpersonator = await dueUser(store, 'rebind-new-impersonator');
    const token = 'rebound-token';
    const original = await store.createSession({
      userId: originalTarget.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const lockEntered = deferred();
    const lockRelease = deferred();
    const heldLock = store.withSerializedMutation(`account-purge:${originalTarget.id}`, async () => {
      lockEntered.resolve();
      await lockRelease.promise;
    });

    await lockEntered.promise;
    const lookup = store.findSessionByToken(token);
    store.sessions.set(original.tokenHash, {
      ...original,
      id: 'session-rebound-after-candidate-read',
      userId: reboundTarget.id,
      impersonatedBy: reboundImpersonator.id,
    });
    lockRelease.resolve();
    await heldLock;

    await expect(lookup).resolves.toBeUndefined();
  });
});
