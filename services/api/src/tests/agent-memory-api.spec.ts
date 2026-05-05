import { describe, expect, it } from 'vitest';
import { hashPassword } from '@vibecore/auth';
import { buildApiApp } from '../app.js';
import { AgentMemoryService, type AgentMemoryEmbeddingProvider, type AgentMemoryRepository } from '../agent-memory.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class TestEmbeddingProvider implements AgentMemoryEmbeddingProvider {
  readonly model = 'test-embedding-1536';
  readonly dimensions = 1536;

  async embed(input: string) {
    const vector = new Array<number>(1536).fill(0);

    for (let index = 0; index < input.length; index++) {
      vector[index % 1536] += input.charCodeAt(index);
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

    return vector.map((value) => value / magnitude);
  }
}

class TestMemoryRepository implements AgentMemoryRepository {
  readonly rows: any[] = [];
  readonly preferences = new Map<string, any>();

  async create(input: any) {
    const row = {
      ...input,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rows.push(row);

    return row;
  }

  async get(input: { id: string; userId: string }) {
    return this.rows.find((row) => row.id === input.id && row.userId === input.userId);
  }

  async update(input: any) {
    const row = this.rows.find((item) => item.id === input.id);
    Object.assign(row, input, { updatedAt: new Date().toISOString(), lastUsedAt: new Date().toISOString() });

    return row;
  }

  async search(input: any) {
    return this.rows
      .filter((row) => row.userId === input.userId)
      .filter((row) => !input.projectId || row.projectId === input.projectId || !row.projectId)
      .map((row) => ({ ...row, score: 0.95 }))
      .slice(0, input.limit ?? 8);
  }

  async list(input: any) {
    return this.rows
      .filter((row) => row.userId === input.userId)
      .filter((row) => !input.projectId || row.projectId === input.projectId)
      .slice(0, input.limit ?? 50);
  }

  async archive(input: { id: string; userId: string }) {
    const index = this.rows.findIndex((row) => row.id === input.id && row.userId === input.userId);

    if (index < 0) {
      return undefined;
    }

    return this.rows.splice(index, 1)[0];
  }

  async getPreference(input: { userId: string; organizationId?: string; projectId?: string }) {
    return this.preferences.get(`${input.userId}:${input.organizationId ?? ''}:${input.projectId ?? ''}`);
  }

  async setPreference(input: { userId: string; organizationId?: string; projectId?: string; enabled: boolean }) {
    const preference = {
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.preferences.set(`${input.userId}:${input.organizationId ?? ''}:${input.projectId ?? ''}`, preference);

    return preference;
  }
}

class TestEmailProvider implements EmailProvider {
  async send() {}
}

async function setup() {
  const store = new TestApiStore();
  const repository = new TestMemoryRepository();
  const app = await buildApiApp({
    store,
    emailProvider: new TestEmailProvider(),
    agentMemory: new AgentMemoryService(repository, new TestEmbeddingProvider()),
  });
  const user = await store.createUser({
    email: 'memory@example.com',
    name: 'Memory User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Memory Org', slug: 'memory-org', ownerUserId: user.id });
  await store.createSession({
    userId: user.id,
    token: 'memory-token',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const project = await store.createProject({ organizationId: org.id, name: 'Memory Project', slug: 'memory-project' });

  return { app, repository, token: 'memory-token', project };
}

describe('agent memory API', () => {
  it('creates, searches, patches and deletes authenticated project memory', async () => {
    const { app, token, project } = await setup();
    const create = await app.inject({
      method: 'POST',
      url: '/agent-memory',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: project.id,
        scope: 'project',
        content: 'Remember that this IDE project always validates before pushing to main.',
        source: 'manual',
        force: true,
      },
    });

    expect(create.statusCode).toBe(201);
    const memoryId = create.json().memory.id;

    const context = await app.inject({
      method: 'POST',
      url: '/agent-memory/context',
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId: project.id, query: 'How do we finish IDE tasks?' },
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().context).toContain('validates before pushing');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/agent-memory/${memoryId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'Remember that this IDE project validates typecheck, lint and tests before pushing.' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().memory.summary).toContain('typecheck');

    const deletion = await app.inject({
      method: 'DELETE',
      url: `/agent-memory/${memoryId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deletion.statusCode).toBe(200);
  });

  it('rejects secret-like content through the API', async () => {
    const { app, token, project } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/agent-memory',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: project.id,
        scope: 'project',
        content: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
        source: 'manual',
        force: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('AGENT_MEMORY_SECRET_DETECTED');
  });

  it('persists project memory preferences through authenticated API', async () => {
    const { app, token, project } = await setup();
    const update = await app.inject({
      method: 'PATCH',
      url: '/agent-memory/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId: project.id, enabled: false },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().preference.enabled).toBe(false);

    const read = await app.inject({
      method: 'GET',
      url: `/agent-memory/preferences?projectId=${project.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(read.statusCode).toBe(200);
    expect(read.json().preference.enabled).toBe(false);
  });
});
