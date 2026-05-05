import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('agent memory migration', () => {
  it('enables pgvector and creates a real HNSW vector index', () => {
    const sql = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/database/prisma/migrations/0010_agent_memory_pgvector/migration.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(sql).toContain('vector(1536)');
    expect(sql).toContain('USING hnsw');
    expect(sql).toContain('vector_cosine_ops');
  });

  it('creates persistent memory preferences with scoped uniqueness', () => {
    const sql = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/database/prisma/migrations/0012_agent_memory_preferences/migration.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE "AgentMemoryPreference"');
    expect(sql).toContain('"enabled" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('AgentMemoryPreference_user_project_key');
  });
});
