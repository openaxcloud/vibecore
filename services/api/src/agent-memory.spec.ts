import { describe, expect, it } from 'vitest';
import {
  AgentMemoryService,
  type AgentMemoryEmbeddingProvider,
  type AgentMemoryRecord,
  type AgentMemoryRepository,
} from './agent-memory.js';

const embeddings: AgentMemoryEmbeddingProvider = {
  model: 'test-embed',
  dimensions: 3,
  async embed() {
    return [0.1, 0.2, 0.3];
  },
};

function record(overrides: Partial<AgentMemoryRecord> = {}): AgentMemoryRecord {
  const now = new Date().toISOString();
  return {
    id: 'mem-existing',
    userId: 'user-1',
    scope: 'user',
    content: 'The user prefers the dark theme for the editor at all times.',
    summary: 'Prefers dark theme',
    metadata: {},
    memoryType: 'semantic',
    tags: [],
    references: [],
    importance: 0.5,
    source: 'manual',
    embeddingModel: 'test-embed',
    embeddingDimensions: 3,
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    score: 0.99,
    ...overrides,
  };
}

/**
 * Minimal in-memory repository that lets each test inject the behaviour of
 * search()/update()/create() it cares about while defaulting everything else.
 */
function makeRepository(partial: Partial<AgentMemoryRepository> & { searchResult: AgentMemoryRecord[] }): {
  repo: AgentMemoryRepository;
  created: AgentMemoryRecord[];
} {
  const created: AgentMemoryRecord[] = [];

  const repo: AgentMemoryRepository = {
    async search() {
      return partial.searchResult;
    },
    async update(input) {
      return partial.update ? partial.update(input) : undefined;
    },
    async create(input) {
      const row = record({ ...input } as Partial<AgentMemoryRecord>);
      created.push(row);

      return row;
    },
    async count() {
      return partial.count ? partial.count({} as never) : 0;
    },
    async get() {
      return undefined;
    },
    async list() {
      return [];
    },
    async export() {
      return [];
    },
    async archive() {
      return undefined;
    },
    async getPreference() {
      return undefined;
    },
    async setPreference(input) {
      return { ...input };
    },
  };

  return { repo, created };
}

describe('AgentMemoryService.remember dedup-update concurrency', () => {
  it('falls through to create() when the duplicate row vanished (update returned undefined)', async () => {
    const { repo, created } = makeRepository({
      searchResult: [record()], // a near-duplicate exists (score 0.99 >= 0.92)
      update: async () => undefined, // ...but it was archived/deleted concurrently
    });

    const service = new AgentMemoryService(repo, embeddings);

    const result = await service.remember({
      userId: 'user-1',
      scope: 'user',
      source: 'manual',
      force: true,
      content: 'The user prefers the dark theme for the editor at all times.',
    });

    // The memory must actually be persisted, not silently dropped.
    expect(created).toHaveLength(1);
    expect(result.memory).toBeDefined();
    expect(result.memory?.id).toBe(created[0].id);

    // Fresh insert, not a phantom update.
    expect(result.updated).toBe(false);
    expect(result.skipped).toBeUndefined();
  });

  it('returns the updated record (updated: true) when the duplicate update succeeds', async () => {
    const updatedRow = record({ id: 'mem-existing', content: 'updated content here please' });

    const { repo, created } = makeRepository({
      searchResult: [record()],
      update: async () => updatedRow,
    });

    const service = new AgentMemoryService(repo, embeddings);

    const result = await service.remember({
      userId: 'user-1',
      scope: 'user',
      source: 'manual',
      force: true,
      content: 'The user prefers the dark theme for the editor at all times.',
    });

    expect(created).toHaveLength(0);
    expect(result.updated).toBe(true);
    expect(result.memory?.id).toBe('mem-existing');
  });

  it('still skips with quota_exceeded if the fallthrough hits the scope cap', async () => {
    const { repo, created } = makeRepository({
      searchResult: [record()],
      update: async () => undefined,
      count: async () => Number.MAX_SAFE_INTEGER,
    });

    const service = new AgentMemoryService(repo, embeddings);

    const result = await service.remember({
      userId: 'user-1',
      scope: 'user',
      source: 'manual',
      force: true,
      content: 'The user prefers the dark theme for the editor at all times.',
    });

    expect(created).toHaveLength(0);
    expect(result.memory).toBeUndefined();
    expect(result.skipped).toBe('quota_exceeded');
  });
});
