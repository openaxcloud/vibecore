import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@vibecore/database';

export type AgentMemoryScope = 'user' | 'organization' | 'project' | 'session';
export type AgentMemoryType = 'episodic' | 'semantic' | 'procedural' | 'working' | 'cache';

export interface AgentMemoryRecord {
  id: string;
  userId: string;
  organizationId?: string;
  projectId?: string;
  sessionId?: string;
  scope: AgentMemoryScope;
  content: string;
  summary: string;
  metadata: Record<string, unknown>;
  memoryType: AgentMemoryType;
  tags: string[];
  references: string[];
  importance: number;
  source: string;
  embeddingModel: string;
  embeddingDimensions: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  archivedAt?: string;
  accessCount: number;
  score?: number;
}

export interface AgentMemorySearchInput {
  userId: string;
  organizationId?: string;
  projectId?: string;
  sessionId?: string;
  query: string;
  limit?: number;
  scopes?: AgentMemoryScope[];
  memoryTypes?: AgentMemoryType[];
  tags?: string[];

  /*
   * When false, the search does not bump accessCount/lastUsedAt on the matched
   * rows. Used by the dedup probe inside remember(), which must not inflate the
   * usage stats of an unrelated memory on every write.
   */
  trackAccess?: boolean;
}

export interface AgentMemoryWriteInput {
  userId: string;
  organizationId?: string;
  projectId?: string;
  sessionId?: string;
  scope: AgentMemoryScope;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  memoryType?: AgentMemoryType;
  tags?: string[];
  references?: string[];
  importance?: number;
  source: string;
  force?: boolean;
  expiresAt?: string;
}

export interface AgentMemoryPreference {
  userId: string;
  organizationId?: string;
  projectId?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentMemoryEmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(input: string): Promise<number[]>;
}

export interface AgentMemoryRepository {
  create(
    input: AgentMemoryWriteInput & {
      id: string;
      summary: string;
      embedding: number[];
      embeddingModel: string;
      embeddingDimensions: number;
      memoryType: AgentMemoryType;
      tags: string[];
      references: string[];
    },
  ): Promise<AgentMemoryRecord>;
  get(input: { id: string; userId: string }): Promise<AgentMemoryRecord | undefined>;
  update(input: {
    id: string;
    userId: string;
    content: string;
    summary: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    memoryType: AgentMemoryType;
    tags: string[];
    references: string[];
    importance: number;
  }): Promise<AgentMemoryRecord | undefined>;
  search(input: AgentMemorySearchInput & { embedding: number[] }): Promise<AgentMemoryRecord[]>;
  list(input: {
    userId: string;
    organizationId?: string;
    projectId?: string;
    limit?: number;
  }): Promise<AgentMemoryRecord[]>;
  export(input: { userId: string; organizationId?: string; projectId?: string }): Promise<AgentMemoryRecord[]>;
  count(input: {
    userId: string;
    scope: AgentMemoryScope;
    organizationId?: string;
    projectId?: string;
  }): Promise<number>;
  archive(input: { id: string; userId: string }): Promise<AgentMemoryRecord | undefined>;
  getPreference(input: {
    userId: string;
    organizationId?: string;
    projectId?: string;
  }): Promise<AgentMemoryPreference | undefined>;
  setPreference(input: {
    userId: string;
    organizationId?: string;
    projectId?: string;
    enabled: boolean;
  }): Promise<AgentMemoryPreference>;
}

export class AgentMemoryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentMemoryConfigurationError';
    Object.assign(this, { statusCode: 503, code: 'AGENT_MEMORY_UNCONFIGURED' });
  }
}

export class AgentMemoryRejectedError extends Error {
  constructor(message: string, code = 'AGENT_MEMORY_REJECTED') {
    super(message);
    this.name = 'AgentMemoryRejectedError';
    Object.assign(this, { statusCode: 400, code });
  }
}

export class OpenAIEmbeddingProvider implements AgentMemoryEmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  readonly #apiKey: string;
  readonly #baseUrl: string;

  constructor(options: { apiKey?: string; model?: string; dimensions?: number; baseUrl?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new AgentMemoryConfigurationError('OPENAI_API_KEY is required for agent memory embeddings.');
    }

    this.#apiKey = apiKey;
    this.model = options.model ?? process.env.AGENT_MEMORY_EMBEDDING_MODEL ?? 'text-embedding-3-small';
    this.dimensions = options.dimensions ?? Number(process.env.AGENT_MEMORY_EMBEDDING_DIMENSIONS ?? 1536);
    this.#baseUrl = (options.baseUrl ?? process.env.OPENAI_API_BASE_URL ?? 'https://api.openai.com/v1').replace(
      /\/+$/,
      '',
    );

    if (this.dimensions !== 1536) {
      throw new AgentMemoryConfigurationError('Agent memory currently requires 1536-dimensional pgvector embeddings.');
    }
  }

  async embed(input: string) {
    const response = await fetch(`${this.#baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input,
        dimensions: this.dimensions,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: Array<{ embedding?: number[] }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw Object.assign(new Error(payload.error?.message ?? 'Embedding request failed'), {
        statusCode: response.status,
        code: 'AGENT_MEMORY_EMBEDDING_FAILED',
      });
    }

    const embedding = payload.data?.[0]?.embedding;

    if (
      !Array.isArray(embedding) ||
      embedding.length !== this.dimensions ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw Object.assign(new Error('Embedding provider returned an invalid vector.'), {
        statusCode: 502,
        code: 'AGENT_MEMORY_EMBEDDING_INVALID',
      });
    }

    return embedding;
  }
}

function iso(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

function rowToMemory(row: Record<string, any>): AgentMemoryRecord {
  const distance = typeof row.distance === 'number' ? row.distance : undefined;

  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId ?? undefined,
    projectId: row.projectId ?? undefined,
    sessionId: row.sessionId ?? undefined,
    scope: row.scope,
    content: row.content,
    summary: row.summary,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    memoryType: (row.memoryType ?? 'semantic') as AgentMemoryType,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown) => typeof tag === 'string') : [],
    references: Array.isArray(row.references)
      ? row.references.filter((reference: unknown) => typeof reference === 'string')
      : [],
    importance: Number(row.importance ?? 0.5),
    source: row.source,
    embeddingModel: row.embeddingModel,
    embeddingDimensions: Number(row.embeddingDimensions ?? 1536),
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    lastUsedAt: iso(row.lastUsedAt),
    expiresAt: iso(row.expiresAt),
    archivedAt: iso(row.archivedAt),
    accessCount: Number(row.accessCount ?? 0),
    score: typeof distance === 'number' ? Math.max(0, 1 - distance) : undefined,
  };
}

function rowToPreference(row: Record<string, any>): AgentMemoryPreference {
  return {
    userId: row.userId,
    organizationId: row.organizationId ?? undefined,
    projectId: row.projectId ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function vectorLiteral(vector: number[]) {
  if (vector.length !== 1536 || vector.some((value) => !Number.isFinite(value))) {
    throw new AgentMemoryRejectedError(
      'Embedding vector must contain exactly 1536 finite values.',
      'AGENT_MEMORY_VECTOR_INVALID',
    );
  }

  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function normalizeStringList(values?: string[]) {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function normalizeReferences(values?: string[]) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeMemoryType(value?: AgentMemoryType): AgentMemoryType {
  return value ?? 'semantic';
}

function inferMemoryType(content: string): AgentMemoryType {
  const normalized = content.toLowerCase();

  if (/workflow|procedure|runbook|step|étape|etape|commande|script|how to|process/.test(normalized)) {
    return 'procedural';
  }

  if (/session|temporary|temporaire|scratch|working|actuel|courant/.test(normalized)) {
    return 'working';
  }

  if (/incident|error|erreur|bug|resolved|fixed|corrig[ée]|failure|panne/.test(normalized)) {
    return 'episodic';
  }

  return 'semantic';
}

export class PostgresAgentMemoryRepository implements AgentMemoryRepository {
  constructor(readonly prisma: DatabaseClient) {}

  async create(
    input: AgentMemoryWriteInput & {
      id: string;
      summary: string;
      embedding: number[];
      embeddingModel: string;
      embeddingDimensions: number;
      memoryType: AgentMemoryType;
      tags: string[];
      references: string[];
    },
  ) {
    /*
     * Enforce the per-user+scope cap ATOMICALLY: hold a transaction-scoped
     * advisory lock keyed by user+scope, re-count inside it, then insert. Without
     * this, concurrent remember() calls each read the same sub-limit count and all
     * insert, exceeding AGENT_MEMORY_SCOPE_LIMIT (TOCTOU). The embedding is already
     * computed by the caller, so this transaction is short (count + insert only).
     */
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `agent-memory:${input.userId}:${input.scope}`,
      );

      const countRows = await tx.$queryRawUnsafe<Array<{ c: bigint | number }>>(
        `SELECT COUNT(*)::bigint AS c FROM "AgentMemory"
         WHERE "userId" = $1 AND "scope" = $2 AND "archivedAt" IS NULL
           AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
           AND ($3::text IS NULL OR "organizationId" = $3)
           AND ($4::text IS NULL OR "projectId" = $4)`,
        input.userId,
        input.scope,
        input.organizationId ?? null,
        input.projectId ?? null,
      );

      if (Number(countRows[0]?.c ?? 0) >= AGENT_MEMORY_SCOPE_LIMIT) {
        throw Object.assign(new Error('Agent memory scope limit reached'), { code: 'AGENT_MEMORY_QUOTA' });
      }

      const rows = await tx.$queryRawUnsafe<Array<Record<string, any>>>(
        `INSERT INTO "AgentMemory"
         ("id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "embedding", "embeddingModel", "embeddingDimensions", "metadata", "memoryType", "tags", "references", "importance", "source", "expiresAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10, $11, $12::jsonb, $13, $14::text[], $15::text[], $16, $17, $18)
         RETURNING "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount"`,
        input.id,
        input.userId,
        input.organizationId ?? null,
        input.projectId ?? null,
        input.sessionId ?? null,
        input.scope,
        input.content,
        input.summary,
        vectorLiteral(input.embedding),
        input.embeddingModel,
        input.embeddingDimensions,
        JSON.stringify(input.metadata ?? {}),
        input.memoryType,
        input.tags,
        input.references,
        input.importance ?? 0.5,
        input.source,
        input.expiresAt ? new Date(input.expiresAt) : null,
      );

      return rowToMemory(rows[0]);
    });
  }

  async update(input: {
    id: string;
    userId: string;
    content: string;
    summary: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    memoryType: AgentMemoryType;
    tags: string[];
    references: string[];
    importance: number;
  }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `UPDATE "AgentMemory"
       SET "content" = $2, "summary" = $3, "embedding" = $4::vector, "metadata" = $5::jsonb, "memoryType" = $6, "tags" = $7::text[], "references" = $8::text[], "importance" = $9, "lastUsedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "userId" = $10 AND "archivedAt" IS NULL
       RETURNING "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount"`,
      input.id,
      input.content,
      input.summary,
      vectorLiteral(input.embedding),
      JSON.stringify(input.metadata),
      input.memoryType,
      input.tags,
      input.references,
      input.importance,
      input.userId,
    );

    /*
     * The row can vanish between the caller's read and this update (archived /
     * deleted concurrently): RETURNING then yields no row, so rows[0] is
     * undefined and rowToMemory would crash. Return undefined like the sibling
     * read methods; callers already treat that as "not found".
     */
    return rows[0] ? rowToMemory(rows[0]) : undefined;
  }

  async get(input: { id: string; userId: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount"
       FROM "AgentMemory"
       WHERE "id" = $1 AND "userId" = $2 AND "archivedAt" IS NULL
       LIMIT 1`,
      input.id,
      input.userId,
    );

    return rows[0] ? rowToMemory(rows[0]) : undefined;
  }

  async search(input: AgentMemorySearchInput & { embedding: number[] }) {
    const scopes = input.scopes?.length ? input.scopes : ['user', 'organization', 'project', 'session'];
    const memoryTypes = input.memoryTypes?.length ? input.memoryTypes : undefined;
    const tags = normalizeStringList(input.tags);

    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount",
              ("embedding" <=> $1::vector) AS distance
       FROM "AgentMemory"
       WHERE "userId" = $2
         AND "archivedAt" IS NULL
         AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
         AND "scope" = ANY($3::text[])
         AND ("organizationId" IS NULL OR "organizationId" = $4)
         AND ("projectId" IS NULL OR "projectId" = $5)
         AND ("sessionId" IS NULL OR "sessionId" = $6)
         AND ($7::text[] IS NULL OR "memoryType" = ANY($7::text[]))
         AND ($8::text[] IS NULL OR "tags" @> $8::text[])
       ORDER BY ("embedding" <=> $1::vector) ASC, "importance" DESC, "accessCount" DESC, "updatedAt" DESC
       LIMIT $9`,
      vectorLiteral(input.embedding),
      input.userId,
      scopes,
      input.organizationId ?? null,
      input.projectId ?? null,
      input.sessionId ?? null,
      memoryTypes ?? null,
      tags.length ? tags : null,
      Math.min(Math.max(input.limit ?? 8, 1), 30),
    );

    if (rows.length && input.trackAccess !== false) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AgentMemory" SET "lastUsedAt" = CURRENT_TIMESTAMP, "accessCount" = "accessCount" + 1 WHERE "id" = ANY($1::text[])`,
        rows.map((row) => row.id),
      );
      rows.forEach((row) => {
        row.accessCount = Number(row.accessCount ?? 0) + 1;
        row.lastUsedAt = new Date().toISOString();
      });
    }

    return rows.map(rowToMemory);
  }

  async list(input: { userId: string; organizationId?: string; projectId?: string; limit?: number }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount"
       FROM "AgentMemory"
       WHERE "userId" = $1
         AND "archivedAt" IS NULL
         AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
         AND ($2::text IS NULL OR "organizationId" = $2)
         AND ($3::text IS NULL OR "projectId" = $3)
       ORDER BY "updatedAt" DESC
       LIMIT $4`,
      input.userId,
      input.organizationId ?? null,
      input.projectId ?? null,
      Math.min(Math.max(input.limit ?? 50, 1), 100),
    );

    return rows.map(rowToMemory);
  }

  async export(input: { userId: string; organizationId?: string; projectId?: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount"
       FROM "AgentMemory"
       WHERE "userId" = $1
         AND "archivedAt" IS NULL
         AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
         AND ($2::text IS NULL OR "organizationId" = $2)
         AND ($3::text IS NULL OR "projectId" = $3)
       ORDER BY "updatedAt" DESC`,
      input.userId,
      input.organizationId ?? null,
      input.projectId ?? null,
    );

    return rows.map(rowToMemory);
  }

  async count(input: { userId: string; scope: AgentMemoryScope; organizationId?: string; projectId?: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "AgentMemory"
       WHERE "userId" = $1
         AND "scope" = $2
         AND "archivedAt" IS NULL
         AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
         AND ($3::text IS NULL OR "organizationId" = $3)
         AND ($4::text IS NULL OR "projectId" = $4)`,
      input.userId,
      input.scope,
      input.organizationId ?? null,
      input.projectId ?? null,
    );

    return Number(rows[0]?.count ?? 0);
  }

  async archive(input: { id: string; userId: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `UPDATE "AgentMemory" SET "archivedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "userId" = $2 AND "archivedAt" IS NULL
       RETURNING "id", "userId", "organizationId", "projectId", "sessionId", "scope", "content", "summary", "metadata", "memoryType", "tags", "references", "importance", "source", "embeddingModel", "embeddingDimensions", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "archivedAt", "accessCount"`,
      input.id,
      input.userId,
    );

    return rows[0] ? rowToMemory(rows[0]) : undefined;
  }

  async getPreference(input: { userId: string; organizationId?: string; projectId?: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "userId", "organizationId", "projectId", "enabled", "createdAt", "updatedAt"
       FROM "AgentMemoryPreference"
       WHERE "userId" = $1
         AND (($2::text IS NULL AND "organizationId" IS NULL) OR "organizationId" = $2)
         AND (($3::text IS NULL AND "projectId" IS NULL) OR "projectId" = $3)
       LIMIT 1`,
      input.userId,
      input.organizationId ?? null,
      input.projectId ?? null,
    );

    return rows[0] ? rowToPreference(rows[0]) : undefined;
  }

  async setPreference(input: { userId: string; organizationId?: string; projectId?: string; enabled: boolean }) {
    const organizationId = input.organizationId ?? null;
    const projectId = input.projectId ?? null;

    /*
     * AgentMemoryPreference has no unique constraint (and Postgres treats NULLs
     * as distinct, so a plain composite unique would not even cover the common
     * user-/org-global scopes). The previous read-then-write therefore raced:
     * two concurrent setPreference calls for the same scope both saw "no row"
     * and both INSERTed, leaving duplicate rows. Serialize writers for this exact
     * (user, org, project) scope with a transaction-scoped advisory lock — no
     * schema migration needed, and occasional cross-key hash collisions only
     * cause brief serialization, never incorrectness. The lock releases at COMMIT.
     */
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `agent-mem-pref:${input.userId}:${organizationId ?? ''}:${projectId ?? ''}`;
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', lockKey);

      const updated = await tx.$queryRawUnsafe<Array<Record<string, any>>>(
        `UPDATE "AgentMemoryPreference"
         SET "enabled" = $4, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $1
           AND (($2::text IS NULL AND "organizationId" IS NULL) OR "organizationId" = $2)
           AND (($3::text IS NULL AND "projectId" IS NULL) OR "projectId" = $3)
         RETURNING "userId", "organizationId", "projectId", "enabled", "createdAt", "updatedAt"`,
        input.userId,
        organizationId,
        projectId,
        input.enabled,
      );

      if (updated[0]) {
        return rowToPreference(updated[0]);
      }

      const inserted = await tx.$queryRawUnsafe<Array<Record<string, any>>>(
        `INSERT INTO "AgentMemoryPreference"
         ("id", "userId", "organizationId", "projectId", "enabled")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "userId", "organizationId", "projectId", "enabled", "createdAt", "updatedAt"`,
        randomUUID(),
        input.userId,
        organizationId,
        projectId,
        input.enabled,
      );

      return rowToPreference(inserted[0]);
    });
  }
}

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bsk-or-v1-[A-Za-z0-9._-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{12,}/i,
];

export function assertNoMemorySecrets(content: string) {
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    throw new AgentMemoryRejectedError(
      'Agent memory refused to store content that looks like a secret.',
      'AGENT_MEMORY_SECRET_DETECTED',
    );
  }
}

export function shouldPersistAgentMemory(content: string) {
  const normalized = content.toLowerCase();

  return [
    /\bremember\b/,
    /\bpreference\b/,
    /\bdecision\b/,
    /\bconvention\b/,
    /\bworkflow\b/,
    /\bconstraint\b/,
    /\balways\b/,
    /\bnever\b/,
    /\bwhen i\b/,
    /(?:à|a) retenir/,
    /souviens-toi/,
    /m[eé]morise/,
    /toujours/,
    /jamais/,
    /pr[eé]f[eé]rence/,
    /d[eé]cision/,
    /convention/,
    /contrainte/,
  ].some((pattern) => pattern.test(normalized));
}

function summarizeMemory(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function scoreImportance(content: string, explicit?: number) {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.min(1, Math.max(0, explicit));
  }

  const normalized = content.toLowerCase();

  let score = 0.45;

  if (/always|never|toujours|jamais|must|doit|obligatoire/.test(normalized)) {
    score += 0.25;
  }

  if (/security|secret|credential|auth|billing|production|s[eé]curit[eé]/.test(normalized)) {
    score += 0.15;
  }

  if (/preference|pr[eé]f[eé]rence|convention|workflow|decision|d[eé]cision/.test(normalized)) {
    score += 0.1;
  }

  return Math.min(1, score);
}

function rerank(memories: AgentMemoryRecord[]) {
  return memories
    .map((memory) => ({
      ...memory,
      score: Math.min(1, Math.max(0, (memory.score ?? 0.5) * 0.75 + memory.importance * 0.25)),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.importance - a.importance);
}

/*
 * Max stored (non-archived, unexpired) memories per user+scope. Configurable so
 * ops can raise it for power users; defaults to a generous-but-bounded value.
 */
export const AGENT_MEMORY_SCOPE_LIMIT = (() => {
  const raw = Number(process.env.AGENT_MEMORY_SCOPE_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
})();

export class AgentMemoryService {
  constructor(
    readonly repository: AgentMemoryRepository,
    readonly embeddings: AgentMemoryEmbeddingProvider,
  ) {}

  async remember(
    input: AgentMemoryWriteInput,
  ): Promise<{ memory?: AgentMemoryRecord; skipped?: string; updated?: boolean }> {
    const content = input.content.trim();

    if (content.length < 12) {
      return { skipped: 'too_short' };
    }

    assertNoMemorySecrets(content);

    if (!input.force && !shouldPersistAgentMemory(content)) {
      return { skipped: 'not_memory_worthy' };
    }

    const summary = input.summary?.trim() || summarizeMemory(content);
    const memoryType = normalizeMemoryType(input.memoryType ?? inferMemoryType(content));
    const tags = normalizeStringList(input.tags);
    const references = normalizeReferences(input.references);
    const embedding = await this.embeddings.embed(`${summary}\n\n${content}`);

    const similar = await this.repository.search({
      userId: input.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      query: content,
      embedding,
      scopes: [input.scope],
      memoryTypes: [memoryType],
      tags: tags.length ? tags : undefined,
      limit: 1,

      // Dedup probe — must not inflate the matched memory's usage stats.
      trackAccess: false,
    });

    const duplicate = similar.find((memory) => (memory.score ?? 0) >= 0.92);

    const metadata = {
      ...(duplicate?.metadata ?? {}),
      ...(input.metadata ?? {}),
      deduplicatedAt: duplicate ? new Date().toISOString() : undefined,
    };

    /*
     * Secrets can ride in via the summary or metadata (e.g. assistantExcerpt),
     * not just content — scan those too before persisting, or they'd be stored
     * (and later surfaced back into prompts) in the clear.
     */
    assertNoMemorySecrets(summary);
    assertNoMemorySecrets(JSON.stringify(metadata));

    const mergedReferences = normalizeReferences([...(duplicate?.references ?? []), ...references]);
    const importance = scoreImportance(content, input.importance ?? duplicate?.importance);

    if (duplicate) {
      const updated = await this.repository.update({
        id: duplicate.id,
        userId: input.userId,
        content,
        summary,
        embedding,
        metadata,
        memoryType,
        tags,
        references: mergedReferences,
        importance,
      });

      /*
       * update() returns undefined when the duplicate row vanished (archived /
       * deleted concurrently) between the dedup search and the update. Returning
       * { memory: undefined, updated: true } here would report a phantom success
       * (route replies 202) while the caller's content is silently dropped.
       * Fall through to the normal create() path so the memory is actually
       * persisted as a fresh row.
       */
      if (updated) {
        return { memory: updated, updated: true };
      }
    }

    /*
     * Cap the number of stored memories per user+scope so a runaway agent (or a
     * malicious caller) can't grow the AgentMemory table unbounded — each row
     * also rides back into prompts on recall, so an unbounded scope degrades both
     * storage and retrieval quality. Only enforced for fresh inserts; dedup
     * updates above never add a row.
     */
    const scopeCount = await this.repository.count({
      userId: input.userId,
      scope: input.scope,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });

    if (scopeCount >= AGENT_MEMORY_SCOPE_LIMIT) {
      return { skipped: 'quota_exceeded' };
    }

    try {
      return {
        memory: await this.repository.create({
          ...input,
          id: randomUUID(),
          content,
          summary,
          embedding,
          embeddingModel: this.embeddings.model,
          embeddingDimensions: this.embeddings.dimensions,
          memoryType,
          tags,
          references,
          metadata,
          importance,
        }),
        updated: false,
      };
    } catch (error) {
      /*
       * create() enforces the cap atomically; a concurrent writer may have filled
       * the scope after the pre-check above — surface it as a clean skip, not a 500.
       */
      if ((error as { code?: string } | undefined)?.code === 'AGENT_MEMORY_QUOTA') {
        return { skipped: 'quota_exceeded' };
      }

      throw error;
    }
  }

  async replace(input: {
    id: string;
    userId: string;
    content: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    memoryType?: AgentMemoryType;
    tags?: string[];
    references?: string[];
    importance?: number;
  }) {
    const existing = await this.repository.get({ id: input.id, userId: input.userId });

    if (!existing) {
      return undefined;
    }

    const content = input.content.trim();
    assertNoMemorySecrets(content);

    const summary = input.summary?.trim() || summarizeMemory(content);
    const embedding = await this.embeddings.embed(`${summary}\n\n${content}`);
    const memoryType = normalizeMemoryType(input.memoryType ?? existing.memoryType);
    const tags = input.tags ? normalizeStringList(input.tags) : existing.tags;
    const references = input.references ? normalizeReferences(input.references) : existing.references;
    const metadata = { ...existing.metadata, ...(input.metadata ?? {}), correctedAt: new Date().toISOString() };

    // Scan summary + metadata for secrets too, not just content (see remember()).
    assertNoMemorySecrets(summary);
    assertNoMemorySecrets(JSON.stringify(metadata));

    return await this.repository.update({
      id: existing.id,
      userId: input.userId,
      content,
      summary,
      embedding,
      metadata,
      memoryType,
      tags,
      references,
      importance: scoreImportance(content, input.importance ?? existing.importance),
    });
  }

  async search(input: AgentMemorySearchInput) {
    /*
     * assertNoMemorySecrets is a WRITE-path control (don't persist credentials).
     * Applying it to a read-only search query wrongly 400'd legitimate searches
     * that merely mention a secret-shaped token, without any security benefit.
     */
    const embedding = await this.embeddings.embed(input.query);

    return rerank(await this.repository.search({ ...input, embedding }));
  }

  async retrieveMemoryForAgentContext(input: AgentMemorySearchInput) {
    const memories = await this.search({
      ...input,
      limit: input.limit ?? 8,
      scopes: input.scopes ?? ['project', 'organization', 'user', 'session'],
    });

    const selected = memories.filter((memory) => (memory.score ?? 0) >= 0.35).slice(0, input.limit ?? 8);

    return {
      memories: selected,
      context: selected.length
        ? [
            'Persistent agent memory retrieved for this authenticated user. Use it only when relevant and never expose memory IDs unless asked.',
            ...selected.map(
              (memory, index) =>
                `${index + 1}. [${memory.scope}/${memory.memoryType}; score=${(memory.score ?? 0).toFixed(2)}; tags=${memory.tags.join(',') || 'none'}] ${memory.summary}`,
            ),
          ].join('\n')
        : '',
    };
  }

  list(input: { userId: string; organizationId?: string; projectId?: string; limit?: number }) {
    return this.repository.list(input);
  }

  export(input: { userId: string; organizationId?: string; projectId?: string }) {
    return this.repository.export(input);
  }

  archive(input: { id: string; userId: string }) {
    return this.repository.archive(input);
  }

  async getPreference(input: { userId: string; organizationId?: string; projectId?: string }) {
    return (
      (await this.repository.getPreference(input)) ?? {
        userId: input.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        enabled: true,
      }
    );
  }

  setPreference(input: { userId: string; organizationId?: string; projectId?: string; enabled: boolean }) {
    return this.repository.setPreference(input);
  }
}

export function createPostgresAgentMemoryService(prisma: DatabaseClient) {
  return new AgentMemoryService(new PostgresAgentMemoryRepository(prisma), new OpenAIEmbeddingProvider());
}
