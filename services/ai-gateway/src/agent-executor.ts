import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import type { AgentRunPersistence } from './agent-run-persistence.js';
import {
  runConsensus,
  selectAlgorithmForRequest,
  type ConsensusAlgorithm,
  type ConsensusOutput,
} from './consensus/index.js';
import { AiGateway, countTokens, type AiChatRequest, type AiMessage } from './gateway.js';
import { aiGatewayError, aiGatewayMessage, localizedAiGatewayError, type AiGatewayLocale } from './public-i18n.js';
import { summarizeRunTokenUsage, type LaneTokenUsage } from './token-usage.js';

export type { AgentRunPersistence } from './agent-run-persistence.js';

export type AgentRoleId =
  | 'architect'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'security'
  | 'devops'
  | 'performance'
  | 'accessibility'
  | 'qa'
  | 'reviewer';

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

  /*
   * The project this run belongs to. Persisted on the AgentRun row (nullable, no
   * FK) so the multi-agent consensus panel — which scopes its query by
   * AgentRun.projectId — can surface the run. Without it every run is saved
   * project-less and the panel stays empty.
   */
  projectId?: string;

  /*
   * Optional owning user + conversation. userId resolves against a real FK
   * (User) in persistence — an unknown id is dropped to null there rather than
   * raising P2003 — while conversationId is a plain nullable column. Both let
   * future queries scope agent runs by user/conversation without another schema
   * change; the current consensus panel only needs projectId.
   */
  userId?: string;
  conversationId?: string;
  plan?: AiChatRequest['plan'];
  provider?: AiChatRequest['provider'];
  model?: string;
  maxTokens?: number;
  locale?: AiGatewayLocale;
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
  /**
   * Provider-authoritative usage for this paid specialist call. Failed lanes may
   * omit it when the provider never returned a terminal usage frame.
   */
  usage?: AgentProviderCallUsage;
}

export interface AgentProviderCallUsage extends LaneTokenUsage {
  callId: string;
  kind: 'agent-lane';
  roleId: AgentRoleId;
  provider: string;
  model: string;
  /** True only when a broken provider stream forced a local token estimate. */
  estimated: boolean;
}

export type AgentRunUsage = ReturnType<typeof summarizeRunTokenUsage> & {
  calls: AgentProviderCallUsage[];
};

export interface AgentRunResponse {
  runId: string;
  status: 'complete' | 'partial' | 'failed';
  results: AgentRunResult[];
  consensus: ConsensusOutput;
  usage: AgentRunUsage;
}

const roleIds = new Set<AgentRoleId>([
  'architect',
  'frontend',
  'backend',
  'database',
  'security',
  'devops',
  'performance',
  'accessibility',
  'qa',
  'reviewer',
]);
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
      /*
       * Clear the sweep interval so a replaced/reconfigured limiter doesn't leak a
       * live timer (clear() only emptied the map, leaving the interval running).
       */
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

  /*
   * Cap each role string. maxAgentInputCharacters bounds the `messages` array but
   * NOT these per-role fields, so a request could smuggle megabytes of text through
   * title/responsibility/output (memory + prompt-size blowup, cost). 8k chars is
   * generous for a role description.
   */
  const MAX_ROLE_FIELD_CHARS = 8000;

  if (
    value.title.length > MAX_ROLE_FIELD_CHARS ||
    value.responsibility.length > MAX_ROLE_FIELD_CHARS ||
    value.output.length > MAX_ROLE_FIELD_CHARS
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
    throw aiGatewayError('requestBodyObject', { statusCode: 400 });
  }

  if (value.mode !== 'parallel-subagents') {
    throw aiGatewayError('agentModeInvalid', { statusCode: 400 });
  }

  const roles = Array.isArray(value.roles)
    ? value.roles.map(validateRole).filter((role): role is AgentRunRole => Boolean(role))
    : [];
  const messages = Array.isArray(value.messages)
    ? value.messages.map(validateMessage).filter((message): message is AiMessage => Boolean(message))
    : [];

  if (!roles.length) {
    throw aiGatewayError('rolesRequired', { statusCode: 400 });
  }

  if (roles.length > maxAgentRoles) {
    throw aiGatewayError('rolesMaximum', { statusCode: 400, values: { maximum: maxAgentRoles } });
  }

  if (new Set(roles.map((role) => role.id)).size !== roles.length) {
    throw aiGatewayError('rolesDuplicate', { statusCode: 400 });
  }

  if (!messages.length) {
    throw aiGatewayError('messagesRequired', { statusCode: 400 });
  }

  if (messages.length > maxAgentMessages) {
    throw aiGatewayError('messagesMaximum', {
      statusCode: 400,
      values: { maximum: maxAgentMessages },
    });
  }

  const inputCharacters = messages.reduce((total, message) => total + message.content.length, 0);

  if (inputCharacters > maxAgentInputCharacters) {
    throw aiGatewayError('messagesCharactersMaximum', {
      statusCode: 400,
      values: { maximum: maxAgentInputCharacters },
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
    projectId: typeof value.projectId === 'string' ? value.projectId : undefined,
    userId: typeof value.userId === 'string' ? value.userId : undefined,
    conversationId: typeof value.conversationId === 'string' ? value.conversationId : undefined,
    plan: typeof value.plan === 'string' ? (value.plan as AgentRunRequest['plan']) : undefined,
    provider: typeof value.provider === 'string' ? (value.provider as AgentRunRequest['provider']) : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    maxTokens,
    consensusAlgorithm,
    consensusThreshold,
    highStakes: typeof value.highStakes === 'boolean' ? value.highStakes : undefined,
  };
}

/*
 * The lane instructions that are IDENTICAL for every role. Hoisted to a constant
 * so the leading system message + shared context form a byte-identical prefix
 * across all N lanes — which lets provider prompt caches (e.g. OpenAI automatic
 * prefix caching) bill the shared context once at full price and the rest of the
 * lanes at the cached rate, instead of re-billing it in full N times.
 */
const SHARED_AGENT_SYSTEM_PREAMBLE = [
  'You are a specialist sub-agent for E-Code, collaborating with other specialists to build one app.',
  'Analyze only your assigned lane, but make your result directly integrable by the final coding agent.',
  'Do not invent completed files. Only list files when your lane specifically requires creating or changing them.',
  'Return strict JSON with this shape: {"summary":"string","files":["path"],"risks":["risk"],"verification":["check"]}.',
].join('\n');

export function buildRoleMessages(request: AgentRunRequest, role: AgentRunRole): AiMessage[] {
  return [
    // 1) Shared preamble — identical across lanes (cacheable prefix).
    { role: 'system', content: SHARED_AGENT_SYSTEM_PREAMBLE },
    // 2) Shared context (system + user + specs) — identical across lanes.
    ...request.messages,
    // 3) The ONLY per-lane part, kept LAST so it doesn't break the shared prefix.
    {
      role: 'user',
      content: `Act as the ${role.title} sub-agent. Responsibility: ${role.responsibility}. Expected output: ${role.output}. Return only the strict JSON described above.`,
    },
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

function normalizeAgentOutput(
  roleId: AgentRoleId,
  content: string,
  locale: AgentRunRequest['locale'] = 'en',
): AgentRunResult {
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    return {
      roleId,
      status: 'partial',
      summary: content.trim() || aiGatewayMessage('agentEmptyResponse', locale),
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

function summarizeAgentRunUsage(calls: AgentProviderCallUsage[], sharedContextTokens: number): AgentRunUsage {
  return {
    ...summarizeRunTokenUsage(calls, sharedContextTokens),
    calls,
  };
}

export async function executeAgentRun(input: {
  gateway: AiGateway;
  request: AgentRunRequest;
  persistence?: AgentRunPersistence;
  signal?: AbortSignal;
}): Promise<AgentRunResponse> {
  const runId = randomUUID();
  const startedAt = new Date();

  const laneOutputs = await Promise.all(
    input.request.roles.map(async (role): Promise<{ result: AgentRunResult; usage?: AgentProviderCallUsage }> => {
      try {
        const completion = await input.gateway.complete(
          {
            organizationId: input.request.organizationId,
            plan: input.request.plan ?? 'free',
            provider: input.request.provider,
            model: input.request.model,
            locale: input.request.locale,
            messages: buildRoleMessages(input.request, role),
            maxTokens: input.request.maxTokens ?? defaultAgentMaxTokens,

            /*
             * Degrade gracefully instead of failing the lane: if the requested
             * model isn't on the plan, the gateway swaps in the plan's default
             * allowed model rather than throwing AI_MODEL_PLAN_BLOCKED. This is what
             * makes multi-agent project creation succeed on the Free plan.
             */
            planFallback: true,
          },
          input.signal,
        );

        const usage: AgentProviderCallUsage = {
          callId: `agent:${runId}:${role.id}`,
          kind: 'agent-lane',
          roleId: role.id,
          provider: completion.provider,
          model: completion.model,
          inputTokens: completion.usage.inputTokens,
          outputTokens: completion.usage.outputTokens,
          estimatedCostCents: completion.usage.estimatedCostCents,
          estimated: false,
        };

        return {
          result: { ...normalizeAgentOutput(role.id, completion.content, input.request.locale), usage },
          usage,
        };
      } catch (error) {
        return {
          result: {
            roleId: role.id,
            status: 'failed',
            summary: localizedAiGatewayError(error, input.request.locale ?? 'en', 'agentExecutionFailed'),
          },
        };
      }
    }),
  );

  const results = laneOutputs.map((output) => output.result);

  /*
   * Token accounting so a generation's spend is measurable (and the shared-context
   * duplication is visible): every lane re-sends the same system+user+specs, so
   * `duplicatedInputTokens` is the redundant input cost of fanning out N lanes.
   * The algorithmic consensus below spends NO tokens (no model call). Log-only —
   * never throws.
   */
  const sharedContextTokens = countTokens(input.request.messages);
  const usage = summarizeAgentRunUsage(
    laneOutputs.flatMap((output) => (output.usage ? [output.usage] : [])),
    sharedContextTokens,
  );

  try {
    console.info('[agent-executor] token usage', {
      runId,
      model: input.request.model,
      provider: input.request.provider,
      roles: input.request.roles.length,
      ...usage,
    });
  } catch (error) {
    console.warn('[agent-executor] token usage logging failed', error);
  }

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
    locale: input.request.locale,
    threshold: input.request.consensusThreshold,
  });

  const response: AgentRunResponse = { runId, status, results, consensus, usage };

  /*
   * Skip persistence only for a run that BOTH was aborted AND didn't complete:
   * a client disconnect makes every role throw 'aborted' (status:'failed'), and
   * persisting that writes a junk all-failed row. But a run that actually
   * finished ('completed') the instant the client disconnected must still be
   * recorded — gating on the abort signal alone silently dropped successful runs.
   */
  const hasUsefulResults = status !== 'failed';

  if (input.persistence && (hasUsefulResults || !input.signal?.aborted)) {
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
          usage,
        },
      });
    } catch (error) {
      console.error('Failed to persist agent run', { runId, error });
    }
  }

  return response;
}

/**
 * Per-lane streaming event for the multi-agent SSE endpoint. Lets the IDE render
 * each specialist sub-agent token-by-token as it works (Replit-style), instead of
 * waiting for the whole run to finish and showing all lanes at once.
 */
export type AgentRunStreamEvent =
  | { type: 'lane-start'; roleId: AgentRoleId; title: string }
  | { type: 'lane-delta'; roleId: AgentRoleId; content: string }
  | { type: 'lane-done'; roleId: AgentRoleId; result: AgentRunResult }
  | {
      type: 'run-done';
      runId: string;
      status: AgentRunResponse['status'];
      results: AgentRunResult[];
      consensus: ConsensusOutput;
      usage: AgentRunUsage;
    };

/**
 * Streaming variant of {@link executeAgentRun}. Runs every specialist lane
 * concurrently via the gateway's token stream and yields events as they arrive,
 * interleaved across lanes, then a final consensus. The non-streaming version is
 * kept for callers that only need the aggregate.
 */
export async function* executeAgentRunStream(input: {
  gateway: AiGateway;
  request: AgentRunRequest;
  persistence?: AgentRunPersistence;
  signal?: AbortSignal;
}): AsyncGenerator<AgentRunStreamEvent> {
  const runId = randomUUID();
  const startedAt = new Date();
  const roles = input.request.roles;

  for (const role of roles) {
    yield { type: 'lane-start', roleId: role.id, title: role.title };
  }

  // Merge N concurrent lane streams into one ordered event queue.
  const queue: AgentRunStreamEvent[] = [];

  let wake: (() => void) | null = null;

  const wakeUp = () => {
    const w = wake;
    wake = null;

    if (w) {
      w();
    }
  };
  const emit = (event: AgentRunStreamEvent) => {
    queue.push(event);
    wakeUp();
  };

  const results: AgentRunResult[] = [];

  let active = roles.length;

  /*
   * Chain an internal abort to input.signal so an early consumer break (client
   * disconnect → generator .return()) tears down the still-running paid lane
   * streams instead of letting them bill into a dead queue. AbortSignal.any
   * (Node 20+) merges both; the fallback degrades to input.signal's behaviour.
   */
  const lanesAbort = new AbortController();

  const laneSignal = input.signal
    ? ((AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([input.signal, lanesAbort.signal]) ??
      input.signal)
    : lanesAbort.signal;

  for (const role of roles) {
    void (async () => {
      let content = '';
      let terminalUsage:
        | {
            provider: string;
            model: string;
            inputTokens: number;
            outputTokens: number;
            estimatedCostCents: number;
          }
        | undefined;
      let observedProvider: string | undefined;
      let observedModel: string | undefined;

      try {
        for await (const chunk of input.gateway.stream(
          {
            organizationId: input.request.organizationId,
            plan: input.request.plan ?? 'free',
            provider: input.request.provider,
            model: input.request.model,
            locale: input.request.locale,
            messages: buildRoleMessages(input.request, role),
            maxTokens: input.request.maxTokens ?? defaultAgentMaxTokens,

            /* Degrade to a plan-allowed model instead of failing the lane (see executeAgentRun). */
            planFallback: true,
          },
          laneSignal,
        )) {
          if (chunk.type === 'delta' && chunk.content) {
            content += chunk.content;
            observedProvider = chunk.provider ?? observedProvider;
            observedModel = chunk.model ?? observedModel;
            emit({ type: 'lane-delta', roleId: role.id, content: chunk.content });
          } else if (chunk.type === 'error') {
            observedProvider = chunk.provider ?? observedProvider;
            observedModel = chunk.model ?? observedModel;
            throw new Error(chunk.error ?? aiGatewayMessage('subagentStreamError', input.request.locale));
          } else if (chunk.type === 'done' && chunk.usage && chunk.provider && chunk.model) {
            terminalUsage = {
              provider: chunk.provider,
              model: chunk.model,
              inputTokens: chunk.usage.inputTokens,
              outputTokens: chunk.usage.outputTokens,
              estimatedCostCents: chunk.usage.estimatedCostCents,
            };
          }
        }

        const fallbackProvider = observedProvider ?? input.request.provider;
        const fallbackModel = observedModel ?? input.request.model;
        const usage: AgentProviderCallUsage | undefined = terminalUsage
          ? {
              callId: `agent:${runId}:${role.id}`,
              kind: 'agent-lane',
              roleId: role.id,
              ...terminalUsage,
              estimated: false,
            }
          : fallbackProvider && fallbackModel
            ? {
                callId: `agent:${runId}:${role.id}`,
                kind: 'agent-lane',
                roleId: role.id,
                provider: fallbackProvider,
                model: fallbackModel,
                inputTokens: countTokens(buildRoleMessages(input.request, role)),
                outputTokens: countTokens([{ role: 'assistant', content }]),
                estimatedCostCents: 0,
                estimated: true,
              }
            : undefined;
        const result = { ...normalizeAgentOutput(role.id, content, input.request.locale), ...(usage ? { usage } : {}) };
        results.push(result);
        emit({ type: 'lane-done', roleId: role.id, result });
      } catch (error) {
        const usage: AgentProviderCallUsage | undefined =
          content && observedProvider && observedModel
            ? {
                callId: `agent:${runId}:${role.id}`,
                kind: 'agent-lane',
                roleId: role.id,
                provider: observedProvider,
                model: observedModel,
                inputTokens: countTokens(buildRoleMessages(input.request, role)),
                outputTokens: countTokens([{ role: 'assistant', content }]),
                estimatedCostCents: 0,
                estimated: true,
              }
            : undefined;
        const result: AgentRunResult = {
          roleId: role.id,
          status: 'failed',
          summary: localizedAiGatewayError(error, input.request.locale ?? 'en', 'agentExecutionFailed'),
          ...(usage ? { usage } : {}),
        };
        results.push(result);
        emit({ type: 'lane-done', roleId: role.id, result });
      } finally {
        active -= 1;
        wakeUp();
      }
    })().catch((error) => {
      /*
       * Backstop: the inner try/catch/finally handles stream + normalization
       * errors and still decrements `active`. This only fires if the catch or
       * finally block itself throws — without it that rejection would surface as
       * an unhandledRejection and (with the process handler in server.ts) could
       * crash the pod. `active` was already decremented in finally, so just log.
       */
      console.error('[agent-executor] lane task rejected unexpectedly', error);
    });
  }

  try {
    while (active > 0 || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }

      yield queue.shift()!;
    }
  } finally {
    /*
     * Consumer broke early (client disconnect / writableEnded) → tear down any
     * still-running paid provider streams. On normal completion this is a no-op
     * (active === 0, no in-flight streams).
     */
    lanesAbort.abort();
  }

  // Re-order results to the requested role order (lanes finish out of order).
  const ordered = roles
    .map((role) => results.find((result) => result.roleId === role.id))
    .filter((result): result is AgentRunResult => Boolean(result));

  const status = aggregateStatus(ordered);
  const hasFailedRoles = ordered.some((result) => result.status === 'failed');

  const algorithm =
    input.request.consensusAlgorithm ??
    selectAlgorithmForRequest({ highStakes: input.request.highStakes, hasFailedRoles, preferWeighted: false });

  const consensus = runConsensus({
    results: ordered,
    algorithm,
    locale: input.request.locale,
    threshold: input.request.consensusThreshold,
  });
  const usage = summarizeAgentRunUsage(
    ordered.flatMap((result) => (result.usage ? [result.usage] : [])),
    countTokens(input.request.messages),
  );
  const response: AgentRunResponse = { runId, status, results: ordered, consensus, usage };

  if (input.persistence && (status !== 'failed' || !input.signal?.aborted)) {
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
          usage,
        },
      });
    } catch (error) {
      console.error('Failed to persist agent run', { runId, error });
    }
  }

  yield { type: 'run-done', runId, status, results: ordered, consensus, usage };
}
