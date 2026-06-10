import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { AiGateway, type AiChatRequest, type AiMessage } from './gateway.js';
import {
  runConsensus,
  selectAlgorithmForRequest,
  type ConsensusAlgorithm,
  type ConsensusOutput,
} from './consensus/index.js';
import type { AgentRunPersistence } from './agent-run-persistence.js';

export type AgentRoleId = 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';

export interface AgentRunRole {
  id: AgentRoleId;
  title: string;
  responsibility: string;
  output: string;
}

export interface AgentRunRequest {
  mode: 'parallel-subagents';
  roles: AgentRunRole[];
  messages: AiMessage[];
  organizationId?: string;
  /*
   * Per-tenant rate-limit discriminator. The only caller (web) reaches the
   * gateway from a single pod IP and does not always have a real organizationId,
   * so without this the limiter collapsed to one global bucket keyed on the pod
   * IP — a cross-tenant DoS. Distinct from organizationId so it never lands in the
   * persistence FK column.
   */
  rateLimitKey?: string;
  plan?: AiChatRequest['plan'];
  provider?: AiChatRequest['provider'];
  model?: string;
  maxTokens?: number;
  consensusAlgorithm?: ConsensusAlgorithm;
  consensusThreshold?: number;
  highStakes?: boolean;
}

export interface AgentRunResult {
  roleId: AgentRoleId;
  status: 'complete' | 'partial' | 'failed';
  summary: string;
  files?: string[];
  risks?: string[];
  verification?: string[];
}

export interface AgentRunResponse {
  runId: string;
  status: 'complete' | 'partial' | 'failed';
  results: AgentRunResult[];
  consensus: ConsensusOutput;
}

const roleIds = new Set<AgentRoleId>(['architect', 'frontend', 'backend', 'devops', 'qa']);
const maxAgentRoles = roleIds.size;
const maxAgentMessages = 30;
const maxAgentInputCharacters = 200_000;
const defaultAgentMaxTokens = 1400;
const maxAgentMaxTokens = 4000;

export function positiveIntegerOrDefault(value: number | undefined, fallback: number, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(value));
}

export interface AgentRunRateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface AgentRunRateLimiter {
  backend: 'memory' | 'redis';
  check(key: string): AgentRunRateLimitDecision | Promise<AgentRunRateLimitDecision>;
  clear?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface RedisRateLimitClient {
  eval(script: string, numberOfKeys: number, key: string, limit: string, windowMs: string): Promise<[number, number]>;
  disconnect?(): void;
  quit?(): Promise<unknown>;
}

export function createAgentRunRateLimiter(input?: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
}): AgentRunRateLimiter {
  const limit = positiveIntegerOrDefault(input?.limit, 30);
  const windowMs = positiveIntegerOrDefault(input?.windowMs, 60_000, 1_000);
  const now = input?.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  /*
   * Evict expired buckets periodically. Without this the map grows without
   * bound: a caller varying source IP creates a key that is only overwritten
   * when that exact key recurs, so one-off keys live forever (memory leak in
   * the non-Redis fallback path of this long-running process).
   */
  const sweep = setInterval(() => {
    const timestamp = now();

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) {
        buckets.delete(key);
      }
    }
  }, windowMs);
  (sweep as unknown as { unref?: () => void }).unref?.();

  return {
    backend: 'memory',
    check(key: string): AgentRunRateLimitDecision {
      const timestamp = now();
      const bucket = buckets.get(key);

      if (!bucket || timestamp >= bucket.resetAt) {
        const resetAt = timestamp + windowMs;
        buckets.set(key, { count: 1, resetAt });

        return { allowed: true, remaining: limit - 1, resetAt };
      }

      if (bucket.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
      }

      bucket.count += 1;

      return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
    },
    clear() {
      buckets.clear();
    },
    close() {
      // Clear the sweep interval so a replaced/reconfigured limiter doesn't leak a
      // live timer (clear() only emptied the map, leaving the interval running).
      clearInterval(sweep);
      buckets.clear();
    },
  };
}

const redisRateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  ttl = tonumber(ARGV[2])
end
return { current, ttl }
`;

function stableRateLimitKey(prefix: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex');
  return `${prefix}:agent-runs:${digest}`;
}

export function createRedisAgentRunRateLimiter(input: {
  redis: RedisRateLimitClient;
  limit?: number;
  windowMs?: number;
  now?: () => number;
  prefix?: string;
}): AgentRunRateLimiter {
  const limit = positiveIntegerOrDefault(input.limit, 30);
  const windowMs = positiveIntegerOrDefault(input.windowMs, 60_000, 1_000);
  const now = input.now ?? Date.now;
  const prefix = input.prefix?.trim() || 'vibecore';

  return {
    backend: 'redis',
    async check(key: string): Promise<AgentRunRateLimitDecision> {
      try {
        const [count, ttl] = await input.redis.eval(
          redisRateLimitScript,
          1,
          stableRateLimitKey(prefix, key),
          String(limit),
          String(windowMs),
        );
        const resetAt = now() + Math.max(1, ttl);

        return {
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          resetAt,
        };
      } catch (error) {
        /*
         * Fail OPEN: a Redis outage/error must not 500 the entire agent-run
         * endpoint. Rate limiting is a protective layer — if it's unavailable,
         * allow the request (logged) rather than denying all traffic.
         */
        console.warn('agent-run rate limiter unavailable; failing open', error);

        return { allowed: true, remaining: limit, resetAt: now() + windowMs };
      }
    },
    async close() {
      if (input.redis.quit) {
        try {
          await input.redis.quit();
          return;
        } catch {
          input.redis.disconnect?.();
          return;
        }
      }

      input.redis.disconnect?.();
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeAgentRun(input: {
  authorizationHeader?: string | string[];
  expectedToken?: string;
  allowInsecure?: boolean;
}): boolean {
  const expectedToken = input.expectedToken?.trim();

  if (!expectedToken) {
    /*
     * Fail CLOSED when no executor token is configured. /v1/agent-runs triggers
     * paid LLM agent runs, so an unset token must not silently open the endpoint
     * to anyone. Only an explicit `allowInsecure` (dev/test) keeps it permissive.
     */
    return Boolean(input.allowInsecure);
  }

  const authorizationHeader = Array.isArray(input.authorizationHeader)
    ? input.authorizationHeader[0]
    : input.authorizationHeader;
  const providedToken = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return Boolean(providedToken && safeTokenEqual(providedToken, expectedToken));
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return values.length ? values : undefined;
}

function validateRole(value: unknown): AgentRunRole | undefined {
  if (!isRecord(value) || !roleIds.has(value.id as AgentRoleId)) {
    return undefined;
  }

  if (
    typeof value.title !== 'string' ||
    typeof value.responsibility !== 'string' ||
    typeof value.output !== 'string' ||
    !value.title.trim() ||
    !value.responsibility.trim() ||
    !value.output.trim()
  ) {
    return undefined;
  }

  return {
    id: value.id as AgentRoleId,
    title: value.title,
    responsibility: value.responsibility,
    output: value.output,
  };
}

function validateMessage(value: unknown): AiMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (!['system', 'user', 'assistant', 'tool'].includes(String(value.role)) || typeof value.content !== 'string') {
    return undefined;
  }

  return { role: value.role as AiMessage['role'], content: value.content };
}

export function parseAgentRunRequest(value: unknown): AgentRunRequest {
  if (!isRecord(value)) {
    throw Object.assign(new Error('Request body must be an object.'), { statusCode: 400 });
  }

  if (value.mode !== 'parallel-subagents') {
    throw Object.assign(new Error('mode must be parallel-subagents.'), { statusCode: 400 });
  }

  const roles = Array.isArray(value.roles)
    ? value.roles.map(validateRole).filter((role): role is AgentRunRole => Boolean(role))
    : [];
  const messages = Array.isArray(value.messages)
    ? value.messages.map(validateMessage).filter((message): message is AiMessage => Boolean(message))
    : [];

  if (!roles.length) {
    throw Object.assign(new Error('roles must include at least one supported agent role.'), { statusCode: 400 });
  }

  if (roles.length > maxAgentRoles) {
    throw Object.assign(new Error(`roles cannot include more than ${maxAgentRoles} entries.`), { statusCode: 400 });
  }

  if (new Set(roles.map((role) => role.id)).size !== roles.length) {
    throw Object.assign(new Error('roles must not contain duplicate role ids.'), { statusCode: 400 });
  }

  if (!messages.length) {
    throw Object.assign(new Error('messages must include at least one chat message.'), { statusCode: 400 });
  }

  if (messages.length > maxAgentMessages) {
    throw Object.assign(new Error(`messages cannot include more than ${maxAgentMessages} entries.`), {
      statusCode: 400,
    });
  }

  const inputCharacters = messages.reduce((total, message) => total + message.content.length, 0);

  if (inputCharacters > maxAgentInputCharacters) {
    throw Object.assign(new Error(`messages cannot exceed ${maxAgentInputCharacters} characters.`), {
      statusCode: 400,
    });
  }

  const maxTokens =
    typeof value.maxTokens === 'number' && Number.isFinite(value.maxTokens)
      ? Math.min(maxAgentMaxTokens, positiveIntegerOrDefault(value.maxTokens, defaultAgentMaxTokens))
      : undefined;

  const allowedAlgorithms: readonly ConsensusAlgorithm[] = ['QUORUM', 'BYZANTINE_PBFT', 'WEIGHTED_PLURALITY'];
  const consensusAlgorithm =
    typeof value.consensusAlgorithm === 'string' &&
    (allowedAlgorithms as readonly string[]).includes(value.consensusAlgorithm)
      ? (value.consensusAlgorithm as ConsensusAlgorithm)
      : undefined;

  const consensusThreshold =
    typeof value.consensusThreshold === 'number' &&
    Number.isFinite(value.consensusThreshold) &&
    value.consensusThreshold >= 0 &&
    value.consensusThreshold <= 1
      ? value.consensusThreshold
      : undefined;

  return {
    mode: 'parallel-subagents',
    roles,
    messages,
    organizationId: typeof value.organizationId === 'string' ? value.organizationId : undefined,
    rateLimitKey: typeof value.rateLimitKey === 'string' ? value.rateLimitKey : undefined,
    plan: typeof value.plan === 'string' ? (value.plan as AgentRunRequest['plan']) : undefined,
    provider: typeof value.provider === 'string' ? (value.provider as AgentRunRequest['provider']) : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    maxTokens,
    consensusAlgorithm,
    consensusThreshold,
    highStakes: typeof value.highStakes === 'boolean' ? value.highStakes : undefined,
  };
}

function buildRoleMessages(request: AgentRunRequest, role: AgentRunRole): AiMessage[] {
  return [
    {
      role: 'system',
      content: [
        `You are the ${role.title} sub-agent for E-Code.`,
        `Responsibility: ${role.responsibility}`,
        `Expected output: ${role.output}`,
        'Analyze only your lane, but make your result directly integrable by the final coding agent.',
        'Do not invent completed files. Only list files when your lane specifically requires creating or changing them.',
        'Return strict JSON with this shape: {"summary":"string","files":["path"],"risks":["risk"],"verification":["check"]}.',
      ].join('\n'),
    },
    ...request.messages,
  ];
}

function parseJsonObject(content: string): Record<string, unknown> | undefined {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;

  try {
    const parsed = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start === -1 || end <= start) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function normalizeAgentOutput(roleId: AgentRoleId, content: string): AgentRunResult {
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    return {
      roleId,
      status: 'partial',
      summary: content.trim() || 'Agent returned an empty response.',
    };
  }

  return {
    roleId,
    status: 'complete',
    summary: parsed.summary,
    files: stringArray(parsed.files),
    risks: stringArray(parsed.risks),
    verification: stringArray(parsed.verification),
  };
}

function aggregateStatus(results: AgentRunResult[]): AgentRunResponse['status'] {
  if (results.every((result) => result.status === 'complete')) {
    return 'complete';
  }

  if (results.every((result) => result.status === 'failed')) {
    return 'failed';
  }

  return 'partial';
}

export async function executeAgentRun(input: {
  gateway: AiGateway;
  request: AgentRunRequest;
  persistence?: AgentRunPersistence;
  signal?: AbortSignal;
}): Promise<AgentRunResponse> {
  const runId = randomUUID();
  const startedAt = new Date();
  const results = await Promise.all(
    input.request.roles.map(async (role): Promise<AgentRunResult> => {
      try {
        const completion = await input.gateway.complete(
          {
            organizationId: input.request.organizationId,
            plan: input.request.plan ?? 'free',
            provider: input.request.provider,
            model: input.request.model,
            messages: buildRoleMessages(input.request, role),
            maxTokens: input.request.maxTokens ?? defaultAgentMaxTokens,
          },
          input.signal,
        );

        return normalizeAgentOutput(role.id, completion.content);
      } catch (error) {
        return {
          roleId: role.id,
          status: 'failed',
          summary: error instanceof Error ? error.message : 'Agent execution failed.',
        };
      }
    }),
  );

  const status = aggregateStatus(results);
  const hasFailedRoles = results.some((r) => r.status === 'failed');
  const algorithm =
    input.request.consensusAlgorithm ??
    selectAlgorithmForRequest({
      highStakes: input.request.highStakes,
      hasFailedRoles,
      preferWeighted: false,
    });

  const consensus = runConsensus({
    results,
    algorithm,
    threshold: input.request.consensusThreshold,
  });

  const response: AgentRunResponse = { runId, status, results, consensus };

  /*
   * Skip persistence when the client disconnected mid-run: every role threw
   * 'aborted' (swallowed into status:'failed'), so this would write a junk
   * all-failed AgentRun row for a run nobody is waiting on.
   */
  if (input.persistence && !input.signal?.aborted) {
    try {
      await input.persistence.recordRun({
        runId,
        request: input.request,
        response,
        consensus,
        startedAt,
        completedAt: new Date(),
        metadata: {
          plan: input.request.plan,
          provider: input.request.provider,
          model: input.request.model,
        },
      });
    } catch (error) {
      console.error('Failed to persist agent run', { runId, error });
    }
  }

  return response;
}
