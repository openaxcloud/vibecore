import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('agent memory migration', () => {
  function readRepoFile(path: string) {
    return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../', path), 'utf8');
  }

  it('enables pgvector and creates a real HNSW vector index', () => {
    const sql = readRepoFile('packages/database/prisma/migrations/0010_agent_memory_pgvector/migration.sql');

    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(sql).toContain('vector(1536)');
    expect(sql).toContain('USING hnsw');
    expect(sql).toContain('vector_cosine_ops');
    expect(sql).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });

  it('creates persistent memory preferences with scoped uniqueness', () => {
    const sql = readRepoFile('packages/database/prisma/migrations/0012_agent_memory_preferences/migration.sql');

    expect(sql).toContain('CREATE TABLE "AgentMemoryPreference"');
    expect(sql).toContain('"enabled" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('AgentMemoryPreference_user_project_key');
  });

  it('adds typed memory metadata and tag indexes', () => {
    const sql = readRepoFile('packages/database/prisma/migrations/0013_agent_memory_ruflo_metadata/migration.sql');

    expect(sql).toContain('"memoryType" TEXT NOT NULL DEFAULT');
    expect(sql).toContain('"tags" TEXT[] NOT NULL');
    expect(sql).toContain('"references" TEXT[] NOT NULL');
    expect(sql).toContain('"accessCount" INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('AgentMemory_memoryType_check');
    expect(sql).toContain('AgentMemory_accessCount_check');
    expect(sql).toContain('"AgentMemory_memoryType_updatedAt_idx"');
    expect(sql).toContain('USING GIN ("tags")');
  });

  it('idempotently guards the raw HNSW and GIN indexes against drift / DR rebuilds', () => {
    const sql = readRepoFile('packages/database/prisma/migrations/0035_agent_memory_vector_index_guard/migration.sql');

    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "AgentMemory_embedding_hnsw"');
    expect(sql).toContain('USING hnsw ("embedding" vector_cosine_ops)');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "AgentMemory_tags_idx"');
    expect(sql).toContain('USING gin ("tags")');
  });

  it('keeps the generated Prisma client schema aligned with agent memory metadata', () => {
    const generatedSchema = readRepoFile('packages/database/generated/client/schema.prisma');
    const generatedClient = readRepoFile('packages/database/generated/client/index-browser.js');

    for (const field of ['memoryType', 'tags', 'references', 'accessCount']) {
      expect(generatedSchema).toContain(field);
      expect(generatedClient).toContain(`${field}: '${field}'`);
    }

    expect(generatedSchema).toContain('@@index([memoryType, updatedAt])');
  });
});
