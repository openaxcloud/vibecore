import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.AGENT_MEMORY_PGVECTOR_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('agent memory pgvector integration', () => {
  it('uses pgvector HNSW for real cosine search', async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query('DROP TABLE IF EXISTS agent_memory_hnsw_test');
      await client.query('CREATE TABLE agent_memory_hnsw_test (id text PRIMARY KEY, embedding vector(3) NOT NULL)');
      await client.query(
        'CREATE INDEX agent_memory_hnsw_test_idx ON agent_memory_hnsw_test USING hnsw (embedding vector_cosine_ops)',
      );
      await client.query(
        "INSERT INTO agent_memory_hnsw_test (id, embedding) VALUES ('near', '[1,0,0]'), ('far', '[0,1,0]')",
      );
      await client.query('SET enable_seqscan = off');

      const explain = await client.query(
        "EXPLAIN (COSTS OFF) SELECT id FROM agent_memory_hnsw_test ORDER BY embedding <=> '[0.98,0.01,0]'::vector LIMIT 1",
      );
      const plan = explain.rows.map((row) => row['QUERY PLAN']).join('\n');

      const result = await client.query(
        "SELECT id FROM agent_memory_hnsw_test ORDER BY embedding <=> '[0.98,0.01,0]'::vector LIMIT 1",
      );

      expect(plan).toContain('agent_memory_hnsw_test_idx');
      expect(result.rows[0].id).toBe('near');
    } finally {
      await client.query('RESET enable_seqscan').catch(() => undefined);
      await client.query('DROP TABLE IF EXISTS agent_memory_hnsw_test');
      await client.end();
    }
  });
});
