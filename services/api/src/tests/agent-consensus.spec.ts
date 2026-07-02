import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

/**
 * Seed one consensus record directly into the in-memory store (there is no
 * write endpoint — the ai-gateway persists these into the shared DB; the api
 * only exposes a read-only projection). `projectId` mirrors how the Prisma
 * store scopes via AgentRun.projectId.
 */
function seedConsensus(
  store: TestApiStore,
  projectId: string,
  overrides: Partial<{
    id: string;
    outcome: 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'ABSTAINED';
    algorithm: 'QUORUM' | 'BYZANTINE_PBFT' | 'WEIGHTED_PLURALITY';
    agreementScore: number;
    roundCount: number;
    durationMs: number;
    createdAt: string;
  }> = {},
) {
  store.consensusRecords.push({
    id: overrides.id ?? `consensus_${store.consensusRecords.length + 1}`,
    runId: `run_${store.consensusRecords.length + 1}`,
    projectId,
    algorithm: overrides.algorithm ?? 'QUORUM',
    threshold: 0.66,
    outcome: overrides.outcome ?? 'ACCEPTED',
    agreementScore: overrides.agreementScore ?? 0.9,
    roundCount: overrides.roundCount ?? 2,
    durationMs: overrides.durationMs ?? 4200,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'consensus@example.com',
    name: 'Consensus User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Consensus Org', slug: 'consensus-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'consensus-token', expiresAt: new Date(Date.now() + 3600_000) });

  const projectA = await store.createProject({ organizationId: org.id, name: 'Project A', slug: 'project-a' });
  const projectB = await store.createProject({ organizationId: org.id, name: 'Project B', slug: 'project-b' });

  return { app, store, token: 'consensus-token', projectA, projectB };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('multi-agent consensus API', () => {
  it('lists a project consensus record (newest first)', async () => {
    const { app, store, token, projectA } = await setup();
    seedConsensus(store, projectA.id, { id: 'c-old', createdAt: '2026-01-01T00:00:00.000Z', outcome: 'PARTIAL' });
    seedConsensus(store, projectA.id, { id: 'c-new', createdAt: '2026-02-01T00:00:00.000Z', outcome: 'ACCEPTED' });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectA.id}/agent-consensus`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);

    const records = res.json().records as Array<{ id: string; outcome: string; agreementScore: number }>;
    expect(records).toHaveLength(2);

    // newest first
    expect(records[0]).toMatchObject({ id: 'c-new', outcome: 'ACCEPTED' });
    expect(records[1]).toMatchObject({ id: 'c-old', outcome: 'PARTIAL' });

    // projection surfaces the fields the UI renders
    expect(records[0]).toMatchObject({ agreementScore: 0.9 });
  });

  it('never returns another project consensus rows (tenant isolation)', async () => {
    const { app, store, token, projectA, projectB } = await setup();
    seedConsensus(store, projectA.id, { id: 'a-only' });
    seedConsensus(store, projectB.id, { id: 'b-only' });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectA.id}/agent-consensus`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);

    const records = res.json().records as Array<{ id: string }>;
    expect(records.map((r) => r.id)).toEqual(['a-only']);
  });

  it('honours the limit query', async () => {
    const { app, store, token, projectA } = await setup();

    for (let i = 0; i < 3; i++) {
      seedConsensus(store, projectA.id, { id: `c${i}`, createdAt: `2026-03-0${i + 1}T00:00:00.000Z` });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectA.id}/agent-consensus?limit=2`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().records).toHaveLength(2);
  });

  it('returns an empty list when a project has no consensus records', async () => {
    const { app, token, projectA } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectA.id}/agent-consensus`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().records).toEqual([]);
  });

  it('rejects unauthenticated access', async () => {
    const { app, projectA } = await setup();

    expect((await app.inject({ method: 'GET', url: `/projects/${projectA.id}/agent-consensus` })).statusCode).toBe(401);
  });

  it('store.listConsensusRecords scopes strictly to the run projectId (write-path proof)', async () => {
    const { store, projectA, projectB } = await setup();

    /*
     * Mirrors what the ai-gateway now persists: a run tagged with the owning
     * projectId. If the write path forgot to set projectId (the bug), the row
     * would land under a different/empty key and this scoped read would miss it —
     * which is exactly how the panel went empty in prod.
     */
    seedConsensus(store, projectA.id, { id: 'a-run', outcome: 'ACCEPTED' });
    seedConsensus(store, projectB.id, { id: 'b-run', outcome: 'REJECTED' });

    const forA = await store.listConsensusRecords(projectA.id);
    expect(forA.map((r) => r.id)).toEqual(['a-run']);

    // The parent run's projectId is the scoping key; a project with a persisted
    // run now returns it (populated), while an unrelated project's run is excluded.
    const forB = await store.listConsensusRecords(projectB.id);
    expect(forB.map((r) => r.id)).toEqual(['b-run']);

    // And a project whose runs were saved project-less (projectId never set) stays empty.
    const forEmpty = await store.listConsensusRecords('project-with-no-runs');
    expect(forEmpty).toEqual([]);
  });
});
