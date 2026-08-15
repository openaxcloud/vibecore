import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import type { ErasureProof } from '../account-purge.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * §16.12 purge executor — the worker-triggered /internal/account-purge route +
 * store.purgeUserAccount. NEGATIVE tests first (window not elapsed, cancelled
 * request, dry-run default, double execution, concurrency race, fail-closed
 * financial retention), then the positive full-purge proof (per-class 0-rows
 * verification + persisted erasure proof).
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'internal-secret';
const internalAuth = { authorization: `Bearer ${SECRET}` };
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
const prevEnabled = process.env.ACCOUNT_PURGE_ENABLED;

afterEach(() => {
  if (prevSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
  }

  if (prevEnabled === undefined) {
    delete process.env.ACCOUNT_PURGE_ENABLED;
  } else {
    process.env.ACCOUNT_PURGE_ENABLED = prevEnabled;
  }
});

/**
 * A user with data in EVERY purgeable class: session, org+project, import,
 * AI conversation+message, notification, api key, usage event (financial),
 * newsletter subscription, and an audit trail entry.
 */
async function setup(
  accountStoragePurger: (
    inventory: { bucketProjectIds: string[]; workspaceProjectIds: string[] },
    userId: string,
  ) => Promise<{ classes: any[]; verified: boolean }> = async () => ({ classes: [], verified: true }),
) {
  process.env.INTERNAL_API_SHARED_SECRET = SECRET;
  delete process.env.ACCOUNT_PURGE_ENABLED; // dry-run default under test

  const store = new TestApiStore();
  // Physical-erasure is stubbed here (verified by default) so these DB-purge
  // route tests don't reach out to live GCS / workspace-manager; a dedicated
  // test injects a failing purger to prove the fail-closed gate.
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), accountStoragePurger });

  const user = await store.createUser({
    email: 'purge-me@example.com',
    name: 'Purge Me',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

  const org = await store.createOrganization({ name: 'Purge Org', slug: 'purge-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'Secret App', slug: 'secret-app' });
  const importJob = await store.createImportJob({ organizationId: org.id, provider: 'zip' });
  const conversation = await store.createAiConversation({ projectId: project.id, userId: user.id, title: 'chat' });
  await store.createAiMessage({ conversationId: conversation.id, role: 'user', content: 'hello world' });
  await store.createNotification({ userId: user.id, title: 'welcome' });
  await store.createApiKey({ userId: user.id, name: 'cli', keyHash: 'kh', keyPrefix: 'vk_', scopes: [] });
  await store.recordUsageEvent({ organizationId: org.id, userId: user.id, type: 'ai.tokens', quantity: 42 });
  store.newsletterSubscribers.set(user.email, { email: user.email, source: 'footer', unsubscribedAt: null });
  await store.recordAudit({
    actorUserId: user.id,
    action: 'project.created',
    resourceType: 'project',
    resourceId: project.id,
    ipAddress: '203.0.113.7',
    metadata: { name: 'Secret App' },
  });

  return { app, store, user, org, project, importJob, conversation };
}

/** Rewind the deletion request timestamp in the store (never the clock). */
async function requestDeletionElapsed(app: Awaited<ReturnType<typeof setup>>['app'], store: TestApiStore, userId: string, daysAgo = 15) {
  const res = await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
  expect(res.statusCode).toBe(200);

  const user = store.users.get(userId)!;
  const deletion = (user.preferences!.accountDeletion ?? {}) as { requestedAt?: string };
  deletion.requestedAt = new Date(Date.now() - daysAgo * DAY).toISOString();
  user.preferences = { ...user.preferences, accountDeletion: deletion };
}

function purgeProofs(store: TestApiStore): ErasureProof[] {
  return store.adminAuditLogs
    .filter((event) => event.action === 'account.purge_completed')
    .map((event) => (event.metadata as { proof: ErasureProof }).proof);
}

describe('internal account purge — negatives first', () => {
  it('rejects calls without the internal secret', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/internal/account-purge', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('REFUSES to purge while the 14-day grace window has not elapsed', async () => {
    const { app, store, user } = await setup();
    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });

    const res = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ scanned: 1, notDue: 1, purged: 0, ready: 0 });

    // Nothing was touched: session alive, conversation + project intact.
    expect([...store.sessions.values()].some((s) => s.userId === user.id)).toBe(true);
    expect([...store.aiConversations.values()].some((c) => c.userId === user.id)).toBe(true);
    expect(store.users.get(user.id)!.email).toBe('purge-me@example.com');
    expect(purgeProofs(store)).toHaveLength(0);

    // The store-level guard refuses too (defense in depth).
    const direct = await store.purgeUserAccount({ userId: user.id });
    expect(direct.outcome).toBe('not_due');
  });

  it('NEVER purges a request cancelled during the grace window', async () => {
    const { app, store, user } = await setup();
    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
    await app.inject({ method: 'POST', url: '/account/deletion/cancel', headers: auth('user-token') });

    // Even a targeted force-run finds nothing to purge.
    const res = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true, userId: user.id },
    });
    expect(res.json()).toMatchObject({ purged: 0, stale: 1 });

    const direct = await store.purgeUserAccount({ userId: user.id });
    expect(direct.outcome).toBe('not_requested');
    expect(store.users.get(user.id)!.email).toBe('purge-me@example.com');
    expect(purgeProofs(store)).toHaveLength(0);
  });

  it('DRY-RUN by default: counts ready accounts but purges nothing without the flag', async () => {
    const { app, store, user } = await setup();
    await requestDeletionElapsed(app, store, user.id);

    const res = await app.inject({ method: 'POST', url: '/internal/account-purge', headers: internalAuth, payload: {} });
    expect(res.json()).toMatchObject({ enabled: false, ready: 1, purged: 0 });
    expect(store.users.get(user.id)!.email).toBe('purge-me@example.com');
    expect([...store.sessions.values()].some((s) => s.userId === user.id)).toBe(true);
  });

  it('double execution is a proven no-op: one purge, one proof', async () => {
    const { app, store, user } = await setup();
    await requestDeletionElapsed(app, store, user.id);

    const first = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(first.json()).toMatchObject({ purged: 1 });

    // Second sweep: the queue is empty.
    const second = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(second.json()).toMatchObject({ scanned: 0, purged: 0 });

    // Even a targeted re-run is a no-op.
    const targeted = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true, userId: user.id },
    });
    expect(targeted.json()).toMatchObject({ purged: 0, alreadyPurged: 1 });

    const direct = await store.purgeUserAccount({ userId: user.id });
    expect(direct.outcome).toBe('already_purged');

    expect(purgeProofs(store)).toHaveLength(1);
  });

  it('two concurrent workers on the same request yield exactly ONE purge', async () => {
    const { app, store, user } = await setup();
    await requestDeletionElapsed(app, store, user.id);

    const [a, b] = await Promise.all([
      store.purgeUserAccount({ userId: user.id }),
      store.purgeUserAccount({ userId: user.id }),
    ]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(['already_purged', 'purged']);
  });

  it('FAIL-CLOSED financial retention: records are retained AND consigned, the rest is purged', async () => {
    const { app, store, user, org } = await setup();
    await requestDeletionElapsed(app, store, user.id);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(res.json()).toMatchObject({ purged: 1 });

    const [proof] = purgeProofs(store);

    // The recent usage event is inside the 7-year window: retained…
    const financial = proof.classes.find((entry) => entry.dataClass === 'financial_records')!;
    expect(financial.action).toBe('retained');
    expect(financial.reason).toBe('financial_retention_7y_fail_closed');
    expect(financial.models.UsageEvent).toBe(1);

    // …physically still present, but detached from the purged user…
    const survivor = [...store.usageEvents.values()].find((event) => event.organizationId === org.id)!;
    expect(survivor).toBeTruthy();
    expect(survivor.userId).toBeUndefined();

    // …and the exception is CONSIGNED in the proof, never silent.
    const exception = proof.exceptions.find((entry) => entry.dataClass === 'financial_records')!;
    expect(exception.rows).toBeGreaterThanOrEqual(1);
    expect(exception.reason).toBe('financial_retention_7y_fail_closed');

    // The rest of the account was still purged (partial purge executed).
    expect([...store.aiConversations.values()].some((c) => c.userId === user.id)).toBe(false);
    expect([...store.projects.values()].some((p) => p.organizationId === org.id)).toBe(false);
  });
});

describe('internal account purge — full erasure proof', () => {
  it('purges every class, verifies 0 rows remaining, persists the proof, and tombstones the user', async () => {
    const { app, store, user, org, project, importJob, conversation } = await setup();
    await requestDeletionElapsed(app, store, user.id);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: true, ready: 1, purged: 1, failed: 0 });

    // Per-class SQL-equivalent verification: 0 rows remaining.
    expect([...store.sessions.values()].filter((s) => s.userId === user.id)).toHaveLength(0);
    expect([...store.apiKeys.values()].filter((k) => k.userId === user.id)).toHaveLength(0);
    expect(store.aiConversations.has(conversation.id)).toBe(false);
    expect([...store.aiMessages.values()].filter((m) => m.conversationId === conversation.id)).toHaveLength(0);
    expect(store.projects.has(project.id)).toBe(false);
    expect(store.importJobs.has(importJob.id)).toBe(false);
    expect([...store.memberships.values()].filter((m) => m.userId === user.id)).toHaveLength(0);
    expect([...store.notifications.values()].filter((n) => n.userId === user.id)).toHaveLength(0);
    expect(store.newsletterSubscribers.has('purge-me@example.com')).toBe(false);

    // Tombstone: anonymized, machine state = purged, purgedAt stamped.
    const tombstone = store.users.get(user.id)!;
    expect(tombstone.email).toBe(`purged-${user.id}@erased.invalid`);
    expect(tombstone.name).toBeUndefined();
    expect(tombstone.passwordHash).toBeUndefined();
    const deletion = tombstone.preferences!.accountDeletion as { purgedAt?: string };
    expect(typeof deletion.purgedAt).toBe('string');

    // Sole org shell survives, anonymized, as the financial anchor.
    const shell = store.organizations.get(org.id)!;
    expect(shell.name).toBe('Purged account');
    expect(shell.slug).toBe(`purged-${org.id}`);

    // Audit logs were REDACTED in place, never deleted.
    const audit = store.auditLogs.find((event) => event.actorUserId === user.id)!;
    expect(audit).toBeTruthy();
    expect(audit.ipAddress).toBeUndefined();
    expect((audit.metadata as { redacted?: boolean }).redacted).toBe(true);

    // The persisted proof: structured, per class, verified zero remaining.
    const proofs = purgeProofs(store);
    expect(proofs).toHaveLength(1);
    const [proof] = proofs;
    expect(proof.kind).toBe('account-erasure-proof');
    expect(proof.userId).toBe(user.id);
    expect(proof.verifiedZeroRemaining).toBe(true);

    for (const entry of proof.classes.filter((c) => c.action === 'deleted')) {
      expect(entry.remainingAfterPurge).toBe(0);
    }

    for (const entry of proof.classes.filter((c) => c.action === 'retained')) {
      expect(entry.reason).toBeTruthy();
    }

    // Purge counts are real: the session/conversation/project rows we created.
    const byClass = Object.fromEntries(proof.classes.map((entry) => [entry.dataClass, entry]));
    expect(byClass.sessions.models.Session).toBe(1);
    expect(byClass.ai_history.models.AiConversation).toBe(1);
    expect(byClass.ai_history.models.AiMessage).toBe(1);
    expect(byClass.projects.models.Project).toBe(1);
    expect(byClass.imports.models.ImportJob).toBe(1);
    expect(byClass.marketing.models.NewsletterSubscriber).toBe(1);
    // project.created + account.deletion_requested (the request itself audits).
    expect(byClass.audit_logs.models.AuditLog).toBe(2);

    // The dead session no longer authenticates.
    const afterPurge = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('user-token') });
    expect(afterPurge.statusCode).toBe(401);
  });

  it('a shared organization is retained: membership removed, projects kept, consigned in the proof', async () => {
    const { app, store, user } = await setup();
    const other = await store.createUser({
      email: 'colleague@example.com',
      name: 'Colleague',
      passwordHash: hashPassword('password123'),
    });
    const sharedOrg = await store.createOrganization({ name: 'Shared Org', slug: 'shared-org', ownerUserId: other.id });
    await store.addMember({ organizationId: sharedOrg.id, userId: user.id, roleKey: 'member' });
    const sharedProject = await store.createProject({ organizationId: sharedOrg.id, name: 'Team App', slug: 'team-app' });

    await requestDeletionElapsed(app, store, user.id);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(res.json()).toMatchObject({ purged: 1 });

    // The shared project belongs to the other member: kept.
    expect(store.projects.has(sharedProject.id)).toBe(true);
    expect(store.organizations.get(sharedOrg.id)!.name).toBe('Shared Org');

    // But the purged user's membership is gone.
    expect(
      [...store.memberships.values()].filter((m) => m.userId === user.id && m.organizationId === sharedOrg.id),
    ).toHaveLength(0);

    // And the retained shared content is consigned.
    const [proof] = purgeProofs(store);
    const shared = proof.classes.find((entry) => entry.dataClass === 'shared_org_content')!;
    expect(shared.action).toBe('retained');
    expect(shared.models.Project).toBe(1);
  });

  it('FAIL-CLOSED: physical erasure incomplete → account NOT purged, purgedAt never stamped, no proof', async () => {
    // Inject a physical purger that reports a bucket it could not erase.
    const { app, store, user } = await setup(async () => ({
      classes: [{ dataClass: 'object_storage', action: 'deleted', models: {}, remainingAfterPurge: 3 }],
      verified: false,
    }));

    await requestDeletionElapsed(app, store, user.id);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });

    // The run reports a failure, not a purge.
    expect(res.json()).toMatchObject({ purged: 0, failed: 1 });

    // The account is NOT tombstoned: still reachable, no purgedAt, and still queued.
    const stored = store.users.get(user.id)!;
    expect(stored.email).toBe('purge-me@example.com');
    expect((stored.preferences!.accountDeletion as { purgedAt?: string }).purgedAt).toBeUndefined();
    expect(purgeProofs(store)).toHaveLength(0);
  });

  it('embeds the physical-erasure classes (object_storage, workspace_volumes) in the proof', async () => {
    const { app, store, user } = await setup(async () => ({
      classes: [
        { dataClass: 'object_storage', action: 'deleted', models: { BucketsDeleted: 1, ObjectsErased: 5 }, remainingAfterPurge: 0 },
        { dataClass: 'workspace_volumes', action: 'deleted', models: { WorkspacesDeleted: 1 }, remainingAfterPurge: 0 },
      ],
      verified: true,
    }));

    await requestDeletionElapsed(app, store, user.id);
    await app.inject({
      method: 'POST',
      url: '/internal/account-purge',
      headers: internalAuth,
      payload: { enabled: true },
    });

    const [proof] = purgeProofs(store);
    expect(proof.verifiedZeroRemaining).toBe(true);
    const os = proof.classes.find((c) => c.dataClass === 'object_storage')!;
    const vols = proof.classes.find((c) => c.dataClass === 'workspace_volumes')!;
    expect(os).toMatchObject({ action: 'deleted', remainingAfterPurge: 0, models: { ObjectsErased: 5 } });
    expect(vols).toMatchObject({ action: 'deleted', remainingAfterPurge: 0 });
  });
});
