import type { Message } from 'ai';
import { apiChatCatalog } from '~/lib/i18n/catalogs/api-chat';
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';

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

export type AgentOrchestrationMode = 'parallel-subagents' | 'single-model-lanes';

export type AgentOrchestrationRole = {
  id: AgentRoleId;
  title: string;
  responsibility: string;
  output: string;
};

export type AgentOrchestrationPlan = {
  enabled: boolean;
  mode: AgentOrchestrationMode;
  reason: string;
  roles: AgentOrchestrationRole[];
};

export type AgentOrchestrationEnv = Record<string, string | undefined> | undefined;

export type AgentExecutionResult = {
  roleId: AgentRoleId;
  status: 'complete' | 'partial' | 'failed';
  summary: string;
  files?: string[];
  risks?: string[];
  verification?: string[];
  usage?: AgentProviderCallUsage;
};

export type AgentProviderCallUsage = {
  callId: string;
  kind: 'agent-lane';
  roleId: AgentRoleId;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  estimated: boolean;
};

export type AgentRunUsage = {
  laneCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  sharedContextTokens: number;
  duplicatedInputTokens: number;
  calls: AgentProviderCallUsage[];
};

export type AgentConsensusOutput = {
  algorithm: 'QUORUM' | 'BYZANTINE_PBFT' | 'WEIGHTED_PLURALITY';
  outcome: 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'ABSTAINED';
  threshold: number;
  agreementScore: number;
  rounds: number;
  durationMs: number;
  claimVotes: Array<{
    claim: string;
    type: 'risk' | 'verification' | 'file';
    supporters: AgentRoleId[];
    dissenters: AgentRoleId[];
    abstainers?: AgentRoleId[];
    agreementRatio: number;
    decision: 'accepted' | 'rejected' | 'inconclusive';
  }>;
  conflicts: Array<{
    type: 'file-overlap' | 'risk-disagreement' | 'verification-gap' | 'role-failure';
    description: string;
    involvedRoles: AgentRoleId[];
    severity: 'low' | 'medium' | 'high';
  }>;
  consolidated?: {
    summary: string;
    acceptedRisks: string[];
    acceptedVerification: string[];
    acceptedFiles: string[];
    rejectedClaims: Array<{ claim: string; type: 'risk' | 'verification' | 'file' }>;
  };
};

export type AgentExecutionResponse = {
  runId: string;
  status: 'complete' | 'partial' | 'failed';
  results: AgentExecutionResult[];
  consensus?: AgentConsensusOutput;
  usage: AgentRunUsage;
};

export type AgentExecutionAnnotation = {
  type: 'agentExecution';
  runId: string;
  status: 'complete' | 'partial' | 'failed';
  results: Array<Omit<AgentExecutionResult, 'usage'>>;
  consensus?: {
    algorithm: AgentConsensusOutput['algorithm'];
    outcome: AgentConsensusOutput['outcome'];
    threshold: number;
    agreementScore: number;
    rounds: number;
    durationMs: number;
    claimVotes: Array<{
      claim: string;
      type: 'risk' | 'verification' | 'file';
      supporters: AgentRoleId[];
      dissenters: AgentRoleId[];
      agreementRatio: number;
      decision: 'accepted' | 'rejected' | 'inconclusive';
    }>;
    conflicts: AgentConsensusOutput['conflicts'];
  };
};

export function buildAgentExecutionAnnotation(execution: AgentExecutionResponse): AgentExecutionAnnotation {
  const annotation: AgentExecutionAnnotation = {
    type: 'agentExecution',
    runId: execution.runId,
    status: execution.status,

    /*
     * Provider/model + billing data stay server-side; the visible annotation only
     * carries the specialist's product output.
     */
    results: execution.results.map(({ usage: _usage, ...result }) => result),
  };

  if (execution.consensus) {
    annotation.consensus = {
      algorithm: execution.consensus.algorithm,
      outcome: execution.consensus.outcome,
      threshold: execution.consensus.threshold,
      agreementScore: execution.consensus.agreementScore,
      rounds: execution.consensus.rounds,
      durationMs: execution.consensus.durationMs,
      claimVotes: execution.consensus.claimVotes.map((vote) => ({
        claim: vote.claim,
        type: vote.type,
        supporters: vote.supporters,
        dissenters: vote.dissenters,
        agreementRatio: vote.agreementRatio,
        decision: vote.decision,
      })),
      conflicts: execution.consensus.conflicts,
    };
  }

  return annotation;
}

export class AgentExecutorError extends Error {
  constructor(
    message: string,
    readonly code: 'not-configured' | 'http-error' | 'invalid-response' | 'timeout' | 'network-error',
  ) {
    super(message);
    this.name = 'AgentExecutorError';
  }
}

const complexBuildSignals = [
  'app',
  'application',
  'dashboard',
  'saas',
  'clone',
  'auth',
  'database',
  'backend',
  'api',
  'websocket',
  'deploy',
  'production',
  'responsive',
  'mobile',
  'tests',
  'full-stack',
  'fullstack',
];

export const ECODE_AGENT_ROLES: AgentOrchestrationRole[] = [
  {
    id: 'architect',
    title: apiChatCatalog.en.roleArchitectTitle,
    responsibility: apiChatCatalog.en.roleArchitectResponsibility,
    output: 'Architecture notes, file structure, domain model, API/data contracts, and verification plan.',
  },
  {
    id: 'frontend',
    title: apiChatCatalog.en.roleFrontendTitle,
    responsibility: apiChatCatalog.en.roleFrontendResponsibility,
    output: 'Complete typed frontend code with every visible control wired to meaningful behavior.',
  },
  {
    id: 'backend',
    title: apiChatCatalog.en.roleBackendTitle,
    responsibility: apiChatCatalog.en.roleBackendResponsibility,
    output: 'Complete typed backend/API implementation with validated request and response contracts.',
  },
  {
    id: 'database',
    title: apiChatCatalog.en.roleDatabaseTitle,
    responsibility: apiChatCatalog.en.roleDatabaseResponsibility,
    output: 'Typed persistence changes, safe migrations, transactional tests, and data lifecycle verification.',
  },
  {
    id: 'security',
    title: apiChatCatalog.en.roleSecurityTitle,
    responsibility: apiChatCatalog.en.roleSecurityResponsibility,
    output: 'Enforced security boundaries, negative tests, audit events, and documented operational controls.',
  },
  {
    id: 'devops',
    title: apiChatCatalog.en.roleDevopsTitle,
    responsibility: apiChatCatalog.en.roleDevopsResponsibility,
    output: 'Runnable package scripts, environment documentation, Docker/deploy config when relevant.',
  },
  {
    id: 'performance',
    title: apiChatCatalog.en.rolePerformanceTitle,
    responsibility: apiChatCatalog.en.rolePerformanceResponsibility,
    output: 'Measured optimizations, resource bounds, and regression tests for the affected hot paths.',
  },
  {
    id: 'accessibility',
    title: apiChatCatalog.en.roleAccessibilityTitle,
    responsibility: apiChatCatalog.en.roleAccessibilityResponsibility,
    output: 'Accessible responsive UI changes with EN/FR coverage and automated or manual interaction evidence.',
  },
  {
    id: 'qa',
    title: apiChatCatalog.en.roleQaTitle,
    responsibility: apiChatCatalog.en.roleQaResponsibility,
    output: 'Automated tests plus a concise verification report tied to the implemented workflow.',
  },
  {
    id: 'reviewer',
    title: apiChatCatalog.en.roleReviewerTitle,
    responsibility: apiChatCatalog.en.roleReviewerResponsibility,
    output:
      'Integrated review findings, corrected regressions, and a release-readiness verdict backed by verification.',
  },
];

function getTextContent(message: Omit<Message, 'id'> | Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n')
      .trim();
  }

  return '';
}

export function shouldUseAgentOrchestration(
  messages: Array<Omit<Message, 'id'> | Message>,
  chatMode?: string,
  options?: { planFirst?: boolean },
): boolean {
  if (chatMode !== 'build') {
    return false;
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const content = lastUserMessage ? getTextContent(lastUserMessage).toLowerCase() : '';

  if (!content) {
    return false;
  }

  /*
   * Plan mode (the composer's "Plan" toggle) is an explicit user request to
   * decompose-and-plan, so honour it even for short prompts — otherwise enabling
   * Plan does nothing visible for a terse request, which reads as a dead toggle.
   */
  if (options?.planFirst) {
    return true;
  }

  return content.length >= 180 || complexBuildSignals.some((signal) => content.includes(signal));
}

/** User-facing build effort tier from the composer's power controls. */
export type AgentBuildTier = 'lite' | 'economy' | 'power';

/**
 * Map the composer's power controls to a parallel-agent cap, so the
 * Lite/Economy/Power selector + High-power boost VISIBLY change how many
 * specialist agents run (previously the controls were cosmetic and every
 * request silently ran a fixed roster).
 *
 * Lite = 1 (single lane → orchestration disabled, fastest/cheapest), Economy = 2
 * (balanced default), Power = 10 (full roster). High-power bumps the cap by one
 * (capped at the roster size) so the boost is observable. Pure + exported for
 * unit testing.
 */
export function parallelAgentsForBuildTier(tier?: AgentBuildTier, highPowerModel?: boolean): number {
  const base = tier === 'lite' ? 1 : tier === 'power' ? ECODE_AGENT_ROLES.length : 2;
  const boosted = highPowerModel ? base + 1 : base;

  return Math.max(1, Math.min(boosted, ECODE_AGENT_ROLES.length));
}

/**
 * Clamp the specialist-lane roster to the org plan's parallel-agent entitlement.
 *
 * Pure + exported so the plan-gating (Starter=1, Core=2, Pro=10, …) is unit
 * testable. The plan limit is the headline pricing differentiator
 * ('Up to 2 / 10 parallel agents'); without clamping every tier silently runs
 * the fixed roles, making the entitlement decorative. When `parallelAgents`
 * is undefined we keep the full roster (caller hasn't resolved a plan yet), and
 * we always keep at least the Architect lane when at least one agent is
 * entitled so the orchestration still produces a coherent decomposition.
 */
export function clampRolesToParallelLimit(
  roles: AgentOrchestrationRole[],
  parallelAgents?: number,
): AgentOrchestrationRole[] {
  if (parallelAgents === undefined || !Number.isFinite(parallelAgents)) {
    return roles;
  }

  const limit = Math.floor(parallelAgents);

  if (limit <= 0) {
    return [];
  }

  return roles.slice(0, Math.min(limit, roles.length));
}

export function buildAgentOrchestrationPlan(input: {
  messages: Array<Omit<Message, 'id'> | Message>;
  chatMode?: string;
  subagentsAvailable?: boolean;

  /*
   * The org plan's parallel-agent entitlement (CreditBillingPlan.parallelAgents:
   * Starter=1, Core=2, Pro=10, Enterprise=10 unless explicitly lowered). When
   * provided we clamp the lane
   * roster to it; a plan that allows only a single agent (Starter) disables
   * parallel orchestration entirely and degrades to a single-model lane. When
   * omitted (caller hasn't resolved a plan) the full roster is kept so
   * behaviour is unchanged for callers that don't yet pass the entitlement.
   */
  parallelAgents?: number;

  /*
   * The composer's "Plan" toggle. When set, orchestration is allowed even for a
   * short prompt (an explicit user request to plan-and-decompose).
   */
  planFirst?: boolean;

  /*
   * Roles the prompt-driven planner decided are actually needed for THIS request
   * (createAgentPlan). When provided, the roster is filtered to these roles
   * (then still clamped by parallelAgents) instead of always running every lane —
   * this is what makes the fan-out a tailored plan rather than a fixed roster.
   * Omitted (planner unavailable / failed) keeps the full roster (fail-open).
   */
  selectedRoleIds?: AgentRoleId[];
}): AgentOrchestrationPlan {
  const complexEnough = shouldUseAgentOrchestration(input.messages, input.chatMode, { planFirst: input.planFirst });

  const selected =
    input.selectedRoleIds && input.selectedRoleIds.length
      ? ECODE_AGENT_ROLES.filter((role) => input.selectedRoleIds!.includes(role.id))
      : ECODE_AGENT_ROLES;

  const roles = complexEnough ? clampRolesToParallelLimit(selected, input.parallelAgents) : [];

  /*
   * A plan that entitles fewer than 2 parallel agents (Starter) can't run the
   * multi-lane fan-out at all: with a single lane there is nothing to
   * orchestrate, so fall back to a normal single-lane response.
   */
  const enabled = complexEnough && roles.length >= 2;

  return {
    enabled,
    mode: enabled && input.subagentsAvailable ? 'parallel-subagents' : 'single-model-lanes',
    reason: enabled
      ? 'Complex build request detected; split the work into specialist lanes and integrate the result before responding.'
      : 'Single-lane response is sufficient for this request.',
    roles: enabled ? roles : [],
  };
}

export function areParallelSubagentsAvailable(env?: AgentOrchestrationEnv): boolean {
  /*
   * Use readRuntimeEnv (globalThis.process.env), not bare process.env: the vite node
   * polyfill shims process.env to {} in the web-pod SSR bundle, so a bare-process.env
   * fallback silently disabled the feature even when the deployment set the vars.
   */
  const flag = env?.ECODE_PARALLEL_SUBAGENTS_ENABLED ?? readRuntimeEnv('ECODE_PARALLEL_SUBAGENTS_ENABLED');
  const endpoint = env?.ECODE_SUBAGENT_EXECUTOR_URL ?? readRuntimeEnv('ECODE_SUBAGENT_EXECUTOR_URL');

  return flag === '1' && Boolean(endpoint?.trim());
}

export function getSubagentExecutorUrl(env?: AgentOrchestrationEnv): string | undefined {
  return env?.ECODE_SUBAGENT_EXECUTOR_URL ?? readRuntimeEnv('ECODE_SUBAGENT_EXECUTOR_URL');
}

export function getSubagentExecutorToken(env?: AgentOrchestrationEnv): string | undefined {
  /*
   * Fall back to AI_GATEWAY_SHARED_SECRET (the chart-owned secret already on
   * every pod, used to authenticate /chat/completions) so parallel sub-agents
   * can be enabled with just a flag + URL — no dedicated executor token / Secret
   * Manager entry required. The ai-gateway applies the same fallback for the
   * expected token, so both sides agree.
   */
  return (
    env?.ECODE_SUBAGENT_EXECUTOR_TOKEN ??
    readRuntimeEnv('ECODE_SUBAGENT_EXECUTOR_TOKEN') ??
    env?.AI_GATEWAY_SHARED_SECRET ??
    readRuntimeEnv('AI_GATEWAY_SHARED_SECRET')
  );
}

/**
 * Build the JSON body POSTed to the sub-agent executor. Pure + exported so the
 * provider/model threading (every lane must run on the user's selected model,
 * not the gateway default) is unit-testable without a live fetch. `provider`
 * and `model` are only included when non-blank so the executor falls back to
 * its own default when the caller has nothing to thread.
 */
export function buildAgentRunRequestBody(input: {
  plan: AgentOrchestrationPlan;
  messages: Array<Omit<Message, 'id'> | Message>;
  provider?: string;
  model?: string;
  rateLimitKey?: string;

  /*
   * The project this run belongs to. Threaded to the executor so the persisted
   * AgentRow row gets its projectId FK-equivalent set — the multi-agent consensus
   * panel scopes its query by AgentRun.projectId, so without this every run is
   * saved project-less and the panel shows nothing. Distinct from rateLimitKey
   * (which also happens to carry the project id but is a rate-limit discriminator,
   * not persisted).
   */
  projectId?: string;
}): {
  mode: AgentOrchestrationMode;
  roles: AgentOrchestrationRole[];
  messages: Array<{ role: Message['role']; content: string }>;
  provider?: string;
  model?: string;
  rateLimitKey?: string;
  projectId?: string;
} {
  const provider = input.provider?.trim();
  const model = input.model?.trim();
  const projectId = input.projectId?.trim();

  return {
    mode: input.plan.mode,
    roles: input.plan.roles,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: getTextContent(message),
    })),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(input.rateLimitKey ? { rateLimitKey: input.rateLimitKey } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

function isAgentExecutionResponse(value: unknown): value is AgentExecutionResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as AgentExecutionResponse;

  const usage = candidate.usage;
  const results = Array.isArray(candidate.results) ? candidate.results : [];

  const validUsage =
    Boolean(usage) &&
    typeof usage === 'object' &&
    Number.isSafeInteger(usage.laneCount) &&
    usage.laneCount >= 0 &&
    Number.isSafeInteger(usage.inputTokens) &&
    usage.inputTokens >= 0 &&
    Number.isSafeInteger(usage.outputTokens) &&
    usage.outputTokens >= 0 &&
    Number.isSafeInteger(usage.totalTokens) &&
    usage.totalTokens === usage.inputTokens + usage.outputTokens &&
    Number.isFinite(usage.estimatedCostCents) &&
    usage.estimatedCostCents >= 0 &&
    Number.isSafeInteger(usage.sharedContextTokens) &&
    usage.sharedContextTokens >= 0 &&
    Number.isSafeInteger(usage.duplicatedInputTokens) &&
    usage.duplicatedInputTokens >= 0 &&
    Array.isArray(usage.calls) &&
    usage.calls.every(isAgentProviderCallUsage) &&
    usage.laneCount === usage.calls.length &&
    usage.inputTokens === usage.calls.reduce((sum, call) => sum + call.inputTokens, 0) &&
    usage.outputTokens === usage.calls.reduce((sum, call) => sum + call.outputTokens, 0) &&
    usage.estimatedCostCents === usage.calls.reduce((sum, call) => sum + call.estimatedCostCents, 0) &&
    new Set(usage.calls.map((call) => call.callId)).size === usage.calls.length;

  const resultUsageIds = results.flatMap((result) =>
    isAgentExecutionResult(result) && result.usage ? [result.usage.callId] : [],
  );

  const summaryUsageIds = validUsage ? usage.calls.map((call) => call.callId) : [];
  const resultUsageIdSet = new Set(resultUsageIds);

  return (
    typeof candidate.runId === 'string' &&
    ['complete', 'partial', 'failed'].includes(candidate.status) &&
    validUsage &&
    Array.isArray(candidate.results) &&
    candidate.results.every(isAgentExecutionResult) &&
    resultUsageIds.length === summaryUsageIds.length &&
    resultUsageIdSet.size === resultUsageIds.length &&
    resultUsageIds.every((callId) => summaryUsageIds.includes(callId)) &&
    summaryUsageIds.every((callId) => resultUsageIdSet.has(callId))
  );
}

function isAgentExecutionResult(value: unknown): value is AgentExecutionResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const result = value as AgentExecutionResult;
  const statusValid = ['complete', 'partial', 'failed'].includes(result.status);
  const usageValid = result.usage === undefined || isAgentProviderCallUsage(result.usage);

  return (
    ECODE_AGENT_ROLES.some((role) => role.id === result.roleId) &&
    statusValid &&
    typeof result.summary === 'string' &&
    usageValid &&
    (result.usage === undefined || result.usage.roleId === result.roleId) &&
    (result.status === 'failed' || Boolean(result.usage))
  );
}

function isAgentProviderCallUsage(value: unknown): value is AgentProviderCallUsage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const usage = value as Partial<AgentProviderCallUsage>;

  return (
    typeof usage.callId === 'string' &&
    usage.callId.length > 0 &&
    usage.kind === 'agent-lane' &&
    ECODE_AGENT_ROLES.some((role) => role.id === usage.roleId) &&
    typeof usage.provider === 'string' &&
    usage.provider.length > 0 &&
    typeof usage.model === 'string' &&
    usage.model.length > 0 &&
    Number.isSafeInteger(usage.inputTokens) &&
    (usage.inputTokens ?? -1) >= 0 &&
    Number.isSafeInteger(usage.outputTokens) &&
    (usage.outputTokens ?? -1) >= 0 &&
    typeof usage.estimatedCostCents === 'number' &&
    Number.isFinite(usage.estimatedCostCents) &&
    usage.estimatedCostCents >= 0 &&
    typeof usage.estimated === 'boolean'
  );
}

export async function executeAgentOrchestration(input: {
  env?: AgentOrchestrationEnv;
  plan: AgentOrchestrationPlan;
  messages: Array<Omit<Message, 'id'> | Message>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;

  /*
   * The provider/model the user selected in the composer. Threaded into the
   * executor body so every specialist lane AND the consensus run on the SAME
   * model the user picked, instead of silently falling back to the gateway's
   * first-configured provider's hardcoded default (e.g. gpt-4.1). Omitted from
   * the body when blank so the executor keeps its own default behaviour.
   */
  provider?: string;
  model?: string;

  /*
   * Per-tenant key for the executor's rate limiter (e.g. the project id). Without
   * it the gateway falls back to the caller pod's IP, collapsing every tenant into
   * one shared rate-limit bucket.
   */
  rateLimitKey?: string;

  /* Project id persisted on the AgentRun so the consensus panel can find this run. */
  projectId?: string;

  /*
   * Caller-supplied cancellation (e.g. the chat request's AbortSignal). Combined
   * with the internal timeout so cancelling mid-run aborts the upstream fetch
   * immediately instead of billing every lane until the timeout fires.
   */
  signal?: AbortSignal;
  onProviderStart?: () => Promise<void>;
}): Promise<AgentExecutionResponse> {
  if (!input.plan.enabled || input.plan.mode !== 'parallel-subagents') {
    throw new AgentExecutorError('Parallel sub-agent execution is not enabled for this request.', 'not-configured');
  }

  const endpoint = getSubagentExecutorUrl(input.env);

  if (!endpoint?.trim()) {
    throw new AgentExecutorError('ECODE_SUBAGENT_EXECUTOR_URL is not configured.', 'not-configured');
  }

  const controller = new AbortController();

  /*
   * One-shot POST that waits for the WHOLE parallel run (all lanes + consensus)
   * to finish, so the deadline must cover a realistic multi-lane build. 60s was
   * too short and failed slow-but-healthy runs (then downgrading to
   * single-model-lanes); 180s aligns with the executor's own lane budgets.
   */
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 180_000);
  const fetcher = input.fetchImpl ?? fetch;
  const token = getSubagentExecutorToken(input.env)?.trim();

  /*
   * Abort the upstream fetch when EITHER the internal timeout fires OR the caller
   * cancels (e.g. the user stops the chat). Without the caller signal a cancelled
   * chat leaves every lane streaming until the timeout, billing the org for work
   * nobody is watching.
   */
  const fetchSignal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;

  try {
    await input.onProviderStart?.();

    const response = await fetcher(new URL('/v1/agent-runs', endpoint).toString(), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(
        buildAgentRunRequestBody({
          plan: input.plan,
          messages: input.messages,
          provider: input.provider,
          model: input.model,
          rateLimitKey: input.rateLimitKey,
          projectId: input.projectId,
        }),
      ),
      signal: fetchSignal,
    });

    if (!response.ok) {
      throw new AgentExecutorError(`Sub-agent executor returned HTTP ${response.status}.`, 'http-error');
    }

    const payload = (await response.json()) as unknown;

    if (!isAgentExecutionResponse(payload)) {
      throw new AgentExecutorError('Sub-agent executor returned an invalid response shape.', 'invalid-response');
    }

    return payload;
  } catch (error) {
    if (error instanceof AgentExecutorError) {
      throw error;
    }

    if ((error as { name?: string }).name === 'AbortError') {
      throw new AgentExecutorError('Sub-agent executor timed out.', 'timeout');
    }

    throw new AgentExecutorError(
      (error as { message?: string }).message ?? 'Sub-agent executor request failed.',
      'network-error',
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Per-lane streaming event emitted by the ai-gateway /v1/agent-runs/stream SSE. */
export type AgentLaneStreamEvent =
  | { type: 'lane-start'; roleId: AgentRoleId; title: string }
  | { type: 'lane-delta'; roleId: AgentRoleId; content: string }
  | { type: 'lane-done'; roleId: AgentRoleId; result: AgentExecutionResult }
  | {
      type: 'run-done';
      runId: string;
      status: AgentExecutionResponse['status'];
      results: AgentExecutionResult[];
      consensus?: AgentConsensusOutput;
      usage: AgentRunUsage;
    }
  | { type: 'error'; error: string };

/**
 * Assemble a best-effort {@link AgentExecutionResponse} from the lanes that have
 * already completed when a stream fails mid-run.
 *
 * Pure + exported so the double-billing guard is unit-testable. When the SSE
 * breaks AFTER one or more `lane-done` events but BEFORE a clean `run-done`
 * (gateway-sent `error`, missing run-done, or an idle timeout with partial
 * output), the lanes already executed and were billed on the gateway. Returning
 * a partial aggregate built from those lanes lets the caller proceed instead of
 * falling back to {@link executeAgentOrchestration}, which would POST a brand-new
 * /v1/agent-runs and re-run (and re-bill) every specialist lane. The status is
 * always `partial` because the run did not finish cleanly.
 */
export function buildPartialExecutionFromLanes(
  completedLanes: AgentExecutionResult[],
  runId: string,
): AgentExecutionResponse | undefined {
  if (completedLanes.length === 0) {
    return undefined;
  }

  const calls = completedLanes.flatMap((lane) => (lane.usage ? [lane.usage] : []));
  const inputTokens = calls.reduce((sum, usage) => sum + usage.inputTokens, 0);
  const outputTokens = calls.reduce((sum, usage) => sum + usage.outputTokens, 0);

  return {
    runId,
    status: 'partial',
    results: completedLanes,
    usage: {
      laneCount: calls.length,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostCents: calls.reduce((sum, usage) => sum + usage.estimatedCostCents, 0),
      sharedContextTokens: 0,
      duplicatedInputTokens: 0,
      calls,
    },
  };
}

/**
 * Streaming variant of {@link executeAgentOrchestration}: consumes the ai-gateway
 * SSE so the IDE can render each specialist sub-agent token-by-token live, then
 * returns the final aggregate. `onEvent` is called for every lane event as it
 * arrives. Falls back semantics identical to the non-streaming call (throws
 * AgentExecutorError so api.chat can fall back to single-model lanes) ONLY while
 * no lane has completed; once any lane has finished (and been billed on the
 * gateway), a mid-run failure resolves to a partial aggregate instead of
 * throwing, so the caller does not re-run and double-bill the whole fan-out.
 */
export async function executeAgentOrchestrationStream(input: {
  env?: AgentOrchestrationEnv;
  plan: AgentOrchestrationPlan;
  messages: Array<Omit<Message, 'id'> | Message>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;

  /*
   * The provider/model the user selected in the composer. Threaded so the
   * streamed specialist lanes + consensus run on the user's chosen model, not
   * the gateway's hardcoded default. See {@link executeAgentOrchestration}.
   */
  provider?: string;
  model?: string;
  rateLimitKey?: string;

  /* Project id persisted on the AgentRun so the consensus panel can find this run. */
  projectId?: string;

  /*
   * Caller-supplied cancellation (e.g. the chat request's AbortSignal). Combined
   * with the idle timeout so cancelling mid-stream aborts the upstream SSE
   * immediately instead of streaming every lane until the idle deadline.
   */
  signal?: AbortSignal;
  onProviderStart?: () => Promise<void>;
  onEvent: (event: AgentLaneStreamEvent) => void;
}): Promise<AgentExecutionResponse> {
  if (!input.plan.enabled || input.plan.mode !== 'parallel-subagents') {
    throw new AgentExecutorError('Parallel sub-agent execution is not enabled for this request.', 'not-configured');
  }

  const endpoint = getSubagentExecutorUrl(input.env);

  if (!endpoint?.trim()) {
    throw new AgentExecutorError('ECODE_SUBAGENT_EXECUTOR_URL is not configured.', 'not-configured');
  }

  const controller = new AbortController();

  /*
   * IDLE timeout, not a total-lifetime deadline. A fixed setTimeout over the
   * whole stream aborted healthy long-running parallel runs - exactly the heavy
   * case this feature targets (up to 5 specialist LLM lanes streaming real
   * output, which can exceed 90s of wall-clock while tokens are actively
   * flowing). Re-arm on every reader.read() that returns bytes so we only abort
   * when the connection has genuinely stalled for `idleMs`.
   */
  const idleMs = input.timeoutMs ?? 90_000;

  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const armIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(() => controller.abort(), idleMs);
  };

  armIdle();

  const fetcher = input.fetchImpl ?? fetch;
  const token = getSubagentExecutorToken(input.env)?.trim();

  /*
   * Abort the upstream SSE when EITHER the idle timeout fires OR the caller
   * cancels (e.g. the user stops the chat). Without the caller signal a cancelled
   * chat leaves every lane streaming until the idle deadline, billing the org for
   * work nobody is watching.
   */
  const fetchSignal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;

  /*
   * Hoisted so the finally can cancel it on ANY abnormal exit (error/timeout/abort),
   * releasing the lock and closing the upstream SSE connection instead of leaking it.
   */
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  /*
   * Hoisted above the try so the catch can build a partial aggregate from lanes
   * that already completed (and were billed) before a mid-run failure.
   */
  const completedLanes: AgentExecutionResult[] = [];

  let streamRunId: string | undefined;

  try {
    await input.onProviderStart?.();

    const response = await fetcher(new URL('/v1/agent-runs/stream', endpoint).toString(), {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(
        buildAgentRunRequestBody({
          plan: input.plan,
          messages: input.messages,
          provider: input.provider,
          model: input.model,
          rateLimitKey: input.rateLimitKey,
          projectId: input.projectId,
        }),
      ),
      signal: fetchSignal,
    });

    if (!response.ok || !response.body) {
      throw new AgentExecutorError(`Sub-agent executor returned HTTP ${response.status}.`, 'http-error');
    }

    reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = '';
    let final: AgentExecutionResponse | undefined;

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      // Bytes received: the stream is alive, so reset the idle deadline.
      armIdle();

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));

        if (!dataLine) {
          continue;
        }

        let event: AgentLaneStreamEvent | undefined;

        try {
          event = JSON.parse(dataLine.slice(5).trim()) as AgentLaneStreamEvent;
        } catch {
          continue;
        }

        if (!event) {
          continue;
        }

        if (event.type === 'error') {
          throw new AgentExecutorError(event.error || 'Sub-agent stream error.', 'http-error');
        }

        if (
          event.type === 'lane-done' &&
          (!isAgentExecutionResult(event.result) || event.result.roleId !== event.roleId)
        ) {
          throw new AgentExecutorError(
            'Sub-agent executor returned an invalid lane usage receipt.',
            'invalid-response',
          );
        }

        input.onEvent(event);

        if (event.type === 'lane-done') {
          completedLanes.push(event.result);
        }

        if (event.type === 'run-done') {
          streamRunId = event.runId;
          final = {
            runId: event.runId,
            status: event.status,
            results: event.results,
            consensus: event.consensus,
            usage: event.usage,
          };
        }
      }
    }

    if (!final || !isAgentExecutionResponse(final)) {
      /*
       * No clean run-done, but lanes already ran and were billed on the gateway.
       * Resolve to a partial aggregate so the caller does NOT re-POST a fresh
       * /v1/agent-runs and double-bill the whole fan-out. Only throw (triggering
       * the single-model-lanes fallback) when nothing completed.
       */
      const partial = buildPartialExecutionFromLanes(completedLanes, streamRunId ?? `partial-${Date.now()}`);

      if (partial) {
        return partial;
      }

      throw new AgentExecutorError('Sub-agent stream ended without a run-done event.', 'invalid-response');
    }

    return final;
  } catch (error) {
    /*
     * User-initiated cancellation must always propagate: the caller's re-fetch
     * short-circuits on the already-aborted signal, and surfacing partial work
     * for an explicit stop is wrong. For every OTHER mid-run failure, if lanes
     * already completed (and were billed) we return their partial aggregate
     * rather than throwing, so the caller does not re-run and double-bill.
     */
    const callerAborted = Boolean(input.signal?.aborted);

    if (!callerAborted && completedLanes.length > 0) {
      return buildPartialExecutionFromLanes(completedLanes, streamRunId ?? `partial-${Date.now()}`)!;
    }

    if (error instanceof AgentExecutorError) {
      throw error;
    }

    if ((error as { name?: string }).name === 'AbortError') {
      throw new AgentExecutorError('Sub-agent executor timed out.', 'timeout');
    }

    throw new AgentExecutorError(
      (error as { message?: string }).message ?? 'Sub-agent executor request failed.',
      'network-error',
    );
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }

    /*
     * Cancel the body reader so an early break/throw never leaks the upstream
     * connection (no-op once the stream has already completed normally).
     */
    if (reader) {
      void reader.cancel().catch(() => undefined);
    }
  }
}

export function createAgentExecutionContext(response: AgentExecutionResponse): string {
  const results = response.results
    .map((result) => {
      const details = [
        `Role: ${result.roleId}`,
        `Status: ${result.status}`,
        `Summary: ${result.summary}`,
        result.files?.length ? `Files: ${result.files.join(', ')}` : undefined,
        result.risks?.length ? `Risks: ${result.risks.join('; ')}` : undefined,
        result.verification?.length ? `Verification: ${result.verification.join('; ')}` : undefined,
      ].filter(Boolean);

      return details.join('\n');
    })
    .join('\n\n');

  return `
<ecode_subagent_results>
Run: ${response.runId}
Status: ${response.status}

${results}
</ecode_subagent_results>
`;
}

/**
 * Render the prompt-driven plan into the system prompt so the integrating model
 * (and the single-model-lanes fallback) actually follows the decomposition the
 * planner produced, instead of re-deriving its own. Pure + exported.
 */
export function createAgentPlanContext(tasks: Array<{ title: string; roleId: AgentRoleId }>): string {
  if (!tasks.length) {
    return '';
  }

  const lines = tasks.map((task, index) => `    ${index + 1}. [${task.roleId}] ${task.title}`).join('\n');

  return `
<ecode_agent_plan>
  This request was decomposed into the following ordered sub-tasks. Implement ALL
  of them, keep them mutually consistent, and do not skip any:
${lines}
</ecode_agent_plan>
`;
}

export function createAgentOrchestrationPrompt(plan: AgentOrchestrationPlan): string {
  if (!plan.enabled) {
    return '';
  }

  const roleLines = plan.roles
    .map((role) => `    - ${role.title}: ${role.responsibility} Output: ${role.output}`)
    .join('\n');

  return `
<ecode_agent_orchestration>
  Mode: ${plan.mode}
  Requirement:
    - Before editing, decompose the work across these specialist lanes.
    - Execute independent lanes in parallel when sub-agent execution is actually available.
    - When sub-agent execution is not available, simulate the lanes internally but still integrate into one coherent codebase.
    - Do not expose lane notes as a substitute for working code; final output must be implemented, runnable, and verified.
  Lanes:
${roleLines}
  Integration gate:
    - Resolve imports, shared types, data contracts, state flow, runtime scripts, and tests across lanes.
    - Run the relevant verification commands and fix failures before claiming completion.
</ecode_agent_orchestration>
`;
}
