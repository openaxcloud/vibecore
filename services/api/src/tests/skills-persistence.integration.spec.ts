import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';

// Dedicated local database only. Fixtures contain no third-party executable skill.
describe.skipIf(process.env.SKILLS_DATABASE_PROOF !== '1')('Skills real HTTP + Prisma persistence', () => {
  let store: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let origin: string;
  let projectId: string;
  let otherProjectId: string;
  let token: string;
  let stranger: string;
  const repo = 'ecode-proof/synthetic-guidance';
  async function request(path: string, method = 'GET', body?: unknown, session = token) {
    const response = await fetch(`${origin}/projects/${projectId}/skills${path}`, {
      method,
      headers: { authorization: `Bearer ${session}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        skills: Array<{ id: string; enabled: boolean }>;
        events: Array<{ action: string }>;
      },
    };
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.port).toBe('55439');
    expect(url.pathname).toBe('/skills_proof');
    expect(process.env.NODE_ENV).toBe('test');
    store = new PrismaApiStore();
    const suffix = randomUUID();
    const user = await store.createUser({
      email: `${suffix}@example.test`,
      name: 'Synthetic Skills QA',
      passwordHash: 'no-login',
    });
    const org = await store.createOrganization({ name: 'Synthetic Skills QA', slug: suffix, ownerUserId: user.id });
    token = randomUUID();
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) });
    const outsider = await store.createUser({
      email: `outsider-${suffix}@example.test`,
      name: 'Synthetic outsider',
      passwordHash: 'no-login',
    });
    stranger = randomUUID();
    await store.createSession({ userId: outsider.id, token: stranger, expiresAt: new Date(Date.now() + 3600000) });
    projectId = (await store.createProject({ organizationId: org.id, name: 'Skills proof', slug: suffix })).id;
    otherProjectId = (
      await store.createProject({ organizationId: org.id, name: 'Other project', slug: `other-${suffix}` })
    ).id;
    const workspaceId = (await store.createWorkspace({ projectId, name: 'Synthetic workspace', runtimeMode: 'remote' }))
      .id;
    for (const [scope, scopeId] of [
      ['project', projectId],
      ['workspace', workspaceId],
    ] as const) {
      await store.installSkill({
        scope,
        scopeId,
        ownerRepo: repo,
        name: 'Synthetic guidance',
        description: 'Synthetic skills proof',
        instructions: 'For synthetic proof requests, explain the result clearly.',
        enabled: true,
        auditVerdict: 'approved',
        resources: [
          {
            path: 'references/proof.txt',
            kind: 'reference',
            bytes: 15,
            content: 'REFERENCE_PROOF',
            contentHash: createHash('sha256').update('REFERENCE_PROOF').digest('hex'),
          },
        ],
      });
    }
    app = await buildApiApp({ store, loggerStream: { write() {} } });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
  });
  afterAll(async () => {
    await app?.close();
    await store?.prisma.$disconnect();
  });

  it('persists toggles across API and database-client reopen, isolated by project and workspace', async () => {
    expect((await request('/code-review/disable', 'POST')).status).toBe(200);
    expect((await request('/installed', 'PATCH', { ownerRepo: repo, scope: 'project', enabled: false })).status).toBe(
      200,
    );
    await app.close();
    await store.prisma.$disconnect();
    // PGlite socket releases the previous single backend asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 100));
    store = new PrismaApiStore();
    app = await buildApiApp({ store, loggerStream: { write() {} } });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    expect((await request('')).body.skills.find((s: any) => s.id === 'code-review')!.enabled).toBe(false);
    expect((await request('/installed?scope=project')).body.skills[0].enabled).toBe(false);
    expect((await store.listInstalledSkills('project', projectId))[0].resources[0].content).toBe('REFERENCE_PROOF');
    expect((await request('/installed?scope=workspace')).body.skills[0].enabled).toBe(true);
    expect(await store.listInstalledSkills('project', otherProjectId)).toEqual([]);
    expect(await store.listProjectSkillOverrides(otherProjectId)).toEqual([]);
    expect((await request('/code-review/enable', 'POST')).status).toBe(200);
  });

  it('rejects unauthorized access and malformed mutations without changing the row', async () => {
    expect((await request('', 'GET', undefined, 'invalid')).status).toBe(401);
    expect([403, 404]).toContain(
      (await request('/installed', 'PATCH', { ownerRepo: repo, enabled: true }, stranger)).status,
    );
    expect((await request('/installed', 'PATCH', { ownerRepo: repo, enabled: 'true' })).status).toBe(400);
    expect(
      (await request('/installed', 'PATCH', { ownerRepo: repo, enabled: true, scope: 'organization' })).status,
    ).toBe(400);
    expect((await request('/installed?scope=project')).body.skills[0].enabled).toBe(false);
  });

  it('persists revoke, blocks reactivation, records audit, and removes only the selected scope', async () => {
    expect((await request('/installed/revoke', 'POST', { ownerRepo: repo })).status).toBe(200);
    expect((await request('/installed', 'PATCH', { ownerRepo: repo, enabled: true })).status).toBe(409);
    expect((await request('/installed/approve', 'POST', { ownerRepo: repo })).status).toBe(409);
    expect((await request('/audit?scope=project')).body.events.some((e: any) => e.action === 'revoke')).toBe(true);
    expect((await request('/installed', 'DELETE', { ownerRepo: repo })).status).toBe(200);
    expect((await request('/installed?scope=project')).body.skills).toEqual([]);
    expect((await request('/installed?scope=workspace')).body.skills).toHaveLength(1);
  });

  it('installs and persists audited reference snapshots through real HTTP with only the public fetch boundary simulated', async () => {
    const nativeFetch = globalThis.fetch;
    const boundary = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === '127.0.0.1') return nativeFetch(input, init);
      if (url.href === 'https://raw.githubusercontent.com/ecode-proof/snapshot-install/HEAD/SKILL.md') {
        return new Response('# Synthetic snapshot guidance\nRead [guide](references/guide.txt) before applying it.');
      }
      if (url.href === 'https://raw.githubusercontent.com/ecode-proof/snapshot-install/HEAD/references/guide.txt') {
        return new Response('SAVED_REFERENCE_FROM_INSTALL');
      }
      throw new Error('Unexpected external request in isolated proof');
    });
    try {
      const response = await request('/install', 'POST', { ownerRepo: 'ecode-proof/snapshot-install' });
      expect(response.status).toBe(201);
      const saved = (await store.listInstalledSkills('project', projectId)).find(
        (skill) => skill.ownerRepo === 'ecode-proof/snapshot-install',
      )!;
      expect(saved.resources[0]).toMatchObject({
        path: 'references/guide.txt',
        content: 'SAVED_REFERENCE_FROM_INSTALL',
        contentHash: createHash('sha256').update('SAVED_REFERENCE_FROM_INSTALL').digest('hex'),
      });
      expect(saved.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(saved.auditVerdict).toBe('approved');
    } finally {
      boundary.mockRestore();
    }
  });
});
