import { describe, expect, it } from 'vitest';
import {
  AgentMemoryService,
  assertNoMemorySecrets,
  shouldPersistAgentMemory,
  type AgentMemoryEmbeddingProvider,
  type AgentMemoryRecord,
  type AgentMemoryRepository,
  type AgentMemorySearchInput,
  type AgentMemoryWriteInput,
} from '../agent-memory.js';

class DeterministicEmbeddingProvider implements AgentMemoryEmbeddingProvider {
  readonly model = 'test-deterministic-1536';
  readonly dimensions = 1536;

  async embed(input: string) {
    const vector = new Array<number>(1536).fill(0);

    for (let index = 0; index < input.length; index++) {
      vector[index % vector.length] += input.charCodeAt(index) / 255;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

    return vector.map((value) => value / magnitude);
  }
}

function cosine(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

class MemoryRepository implements AgentMemoryRepository {
  readonly records = new Map<string, AgentMemoryRecord & { embedding: number[] }>();
  readonly preferences = new Map<string, any>();

  async create(
    input: AgentMemoryWriteInput & {
      id: string;
      summary: string;
      embedding: number[];
      embeddingModel: string;
      embeddingDimensions: number;
    },
  ) {
    const now = new Date().toISOString();
    const memory = {
      id: input.id,
      userId: input.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      scope: input.scope,
      content: input.content,
      summary: input.summary,
      metadata: input.metadata ?? {},
      importance: input.importance ?? 0.5,
      source: input.source,
      embeddingModel: input.embeddingModel,
      embeddingDimensions: input.embeddingDimensions,
      createdAt: now,
      updatedAt: now,
      embedding: input.embedding,
    };
    this.records.set(memory.id, memory);

    return memory;
  }

  async get(input: { id: string; userId: string }) {
    const memory = this.records.get(input.id);

    return memory?.userId === input.userId ? memory : undefined;
  }

  async update(input: {
    id: string;
    content: string;
    summary: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    importance: number;
  }) {
    const current = this.records.get(input.id);

    if (!current) {
      throw new Error('not found');
    }

    const next = {
      ...current,
      content: input.content,
      summary: input.summary,
      embedding: input.embedding,
      metadata: input.metadata,
      importance: input.importance,
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
    this.records.set(input.id, next);

    return next;
  }

  async search(input: AgentMemorySearchInput & { embedding: number[] }) {
    return [...this.records.values()]
      .filter((memory) => memory.userId === input.userId)
      .filter(
        (memory) => !input.organizationId || !memory.organizationId || memory.organizationId === input.organizationId,
      )
      .filter((memory) => !input.projectId || !memory.projectId || memory.projectId === input.projectId)
      .filter((memory) => !input.scopes?.length || input.scopes.includes(memory.scope))
      .map((memory) => ({ ...memory, score: cosine(input.embedding, memory.embedding) }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, input.limit ?? 8);
  }

  async list(input: { userId: string; organizationId?: string; projectId?: string; limit?: number }) {
    return [...this.records.values()]
      .filter((memory) => memory.userId === input.userId)
      .filter((memory) => !input.organizationId || memory.organizationId === input.organizationId)
      .filter((memory) => !input.projectId || memory.projectId === input.projectId)
      .slice(0, input.limit ?? 50);
  }

  async archive(input: { id: string; userId: string }) {
    const memory = this.records.get(input.id);

    if (!memory || memory.userId !== input.userId) {
      return undefined;
    }

    this.records.delete(input.id);

    return { ...memory, archivedAt: new Date().toISOString() };
  }

  async getPreference(input: { userId: string; organizationId?: string; projectId?: string }) {
    return this.preferences.get(`${input.userId}:${input.organizationId ?? ''}:${input.projectId ?? ''}`);
  }

  async setPreference(input: { userId: string; organizationId?: string; projectId?: string; enabled: boolean }) {
    const now = new Date().toISOString();
    const preference = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.preferences.set(`${input.userId}:${input.organizationId ?? ''}:${input.projectId ?? ''}`, preference);

    return preference;
  }
}

describe('agent memory service', () => {
  it('detects memory-worthy content without accepting arbitrary chat noise', () => {
    expect(shouldPersistAgentMemory('Remember that this project always uses pnpm.')).toBe(true);
    expect(shouldPersistAgentMemory('Salut, peux-tu regarder ce fichier ?')).toBe(false);
  });

  it('rejects secrets before embedding or storage', () => {
    expect(() => assertNoMemorySecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz')).toThrow(/secret/i);
  });

  it('stores, deduplicates and retrieves scoped memories', async () => {
    const repository = new MemoryRepository();
    const service = new AgentMemoryService(repository, new DeterministicEmbeddingProvider());
    const first = await service.remember({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      scope: 'project',
      content: 'Remember that this project always pushes validated work to main.',
      source: 'manual',
      force: true,
    });
    const second = await service.remember({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      scope: 'project',
      content: 'Remember that this project always pushes validated work to main.',
      source: 'manual',
      force: true,
    });

    expect(first.memory?.id).toBe(second.memory?.id);
    expect(second.updated).toBe(true);

    const context = await service.retrieveMemoryForAgentContext({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      query: 'How should I finish this task?',
      scopes: ['project'],
    });

    expect(context.memories).toHaveLength(1);
    expect(context.context).toContain('Persistent agent memory');
  });

  it('does not leak memories between users', async () => {
    const service = new AgentMemoryService(new MemoryRepository(), new DeterministicEmbeddingProvider());
    await service.remember({
      userId: 'user-1',
      scope: 'user',
      content: 'Remember that user one prefers strict TypeScript.',
      source: 'manual',
      force: true,
    });

    const context = await service.retrieveMemoryForAgentContext({
      userId: 'user-2',
      query: 'What are my preferences?',
    });

    expect(context.memories).toHaveLength(0);
  });

  it('persists enabled state for project memory preferences', async () => {
    const service = new AgentMemoryService(new MemoryRepository(), new DeterministicEmbeddingProvider());
    await service.setPreference({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      enabled: false,
    });

    const preference = await service.getPreference({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
    });

    expect(preference.enabled).toBe(false);
  });
});
