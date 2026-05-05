# Agent Memory

VibeCore agent memory is a persistent, per-user long-term context system for IDE sessions. It uses PostgreSQL with
`pgvector` and a real HNSW index; it does not fall back to an in-memory or fake-vector store in production.

## Storage

- Table: `AgentMemory`
- Required owner: `userId`
- Optional scope links: `organizationId`, `projectId`, `sessionId`
- Vector column: `embedding vector(1536)`
- Index: `AgentMemory_embedding_hnsw` using `hnsw` and `vector_cosine_ops`
- Embedding model metadata: `embeddingModel`, `embeddingDimensions`

The migration `0010_agent_memory_pgvector` enables `pgvector`, creates the table, and creates the HNSW index.

## Embeddings

Production embeddings require:

- `OPENAI_API_KEY`
- optional `AGENT_MEMORY_EMBEDDING_MODEL`, default `text-embedding-3-small`
- optional `AGENT_MEMORY_EMBEDDING_DIMENSIONS`, currently required to be `1536`

If these are not configured, memory endpoints return `AGENT_MEMORY_UNCONFIGURED` instead of using a mock.

## API

- `POST /agent-memory`: writes a memory after secret scanning and memory-worthiness checks.
- `GET /agent-memory`: lists visible memories for the authenticated user and optional project/org filter.
- `POST /agent-memory/search`: vector search over visible memories.
- `POST /agent-memory/context`: retrieves reranked context for agent prompt injection.
- `PATCH /agent-memory/:memoryId`: corrects a memory owned by the current user.
- `DELETE /agent-memory/:memoryId`: archives a memory owned by the current user.

Browser IDE calls go through Remix proxy routes under `/api/agent-memory`.

## Security

- Every memory is isolated by `userId`.
- Project and organization scopes require existing project/org authorization.
- Secret-like content is rejected before embedding or storage.
- Create, correction and delete actions are written to audit logs.
- Users can view and delete project memories from the IDE Settings > Memory tab.

## Agent Context

The chat route retrieves memories before each authenticated IDE generation and injects only the selected summaries into
the LLM system context. Memory annotations are emitted on the stream so the UI can show which memories were used.

After a response finishes, the route submits the latest user message as a memory candidate. The backend stores it only
when the pipeline detects durable preferences, decisions, constraints or explicit remember requests.
