-- Drift guard for AgentMemory raw-SQL indexes.
--
-- The `embedding` column is `Unsupported("vector")` (pgvector) and `tags` is a
-- String[]; Prisma's @@index cannot express an HNSW(vector_cosine_ops) index nor
-- a GIN index on a scalar-list column. These indexes are therefore created only
-- via raw SQL (originally migrations 0010 and 0013) and are invisible to the
-- Prisma schema. That mismatch means a future `prisma migrate dev` / db push /
-- drift-resolution — or a disaster-recovery rebuild that replays migrations onto
-- an empty database — could silently drop or omit them, killing vector-similarity
-- recall and tag search.
--
-- This migration idempotently re-asserts the extension and both indexes so they
-- are guaranteed on every database that replays the migration chain. It is a
-- no-op where they already exist (e.g. production), and instant on a fresh empty
-- table. CONCURRENTLY is intentionally NOT used: it cannot run inside the
-- transactional shadow database that `prisma migrate dev` uses, and on the only
-- code path where these indexes are actually built from scratch (a fresh/DR
-- database) the table is empty, so there is nothing to lock.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS "AgentMemory_embedding_hnsw"
  ON "AgentMemory" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "AgentMemory_tags_idx"
  ON "AgentMemory" USING gin ("tags");
