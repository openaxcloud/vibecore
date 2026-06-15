import type { Message } from 'ai';
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';

export type AgentRoleId = 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';

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
};

export type AgentExecutionAnnotation = {
  type: 'agentExecution';
  runId: string;
  status: 'complete' | 'partial' | 'failed';
  results: AgentExecutionResult[];
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
    results: execution.results,
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
    title: 'Architect',
    responsibility: 'Define system architecture, data model, API contracts, state boundaries, and integration order.',
    output: 'Architecture notes, file structure, domain model, API/data contracts, and verification plan.',
  },
  {
    id: 'frontend',
    title: 'Frontend',
    responsibility:
      'Build UI components, pages, layouts, state management, accessibility, responsive behavior, loading states, and error states.',
    output: 'Complete typed frontend code with every visible control wired to meaningful behavior.',
  },
  {
    id: 'backend',
    title: 'Backend',
    responsibility:
      'Build API routes, validation, persistence adapters, auth/session boundaries, realtime handlers, and server-side error handling.',
    output: 'Complete typed backend/API implementation with validated request and response contracts.',
  },
  {
    id: 'devops',
    title: 'DevOps',
    responsibility:
      'Create runtime scripts, dependency setup, environment examples, build config, and deploy configuration.',
    output: 'Runnable package scripts, environment documentation, Docker/deploy config when relevant.',
  },
  {
    id: 'qa',
    title: 'QA',
    responsibility: 'Write critical-path tests, verify build/typecheck, inspect preview behavior, and fix failures.',
    output: 'Automated tests plus a concise verification report tied to the implemented workflow.',
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
): boolean {
  if (chatMode !== 'build') {
    return false;
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const content = lastUserMessage ? getTextContent(lastUserMessage).toLowerCase() : '';

  if (!content) {
    return false;
  }

  return content.length >= 180 || complexBuildSignals.some((signal) => content.includes(signal));
}

export function buildAgentOrchestrationPlan(input: {
  messages: Array<Omit<Message, 'id'> | Message>;
  chatMode?: string;
  subagentsAvailable?: boolean;
}): AgentOrchestrationPlan {
  const enabled = shouldUseAgentOrchestration(input.messages, input.chatMode);

  return {
    enabled,
    mode: input.subagentsAvailable ? 'parallel-subagents' : 'single-model-lanes',
    reason: enabled
      ? 'Complex build request detected; split the work into specialist lanes and integrate the result before responding.'
      : 'Single-lane response is sufficient for this request.',
    roles: enabled ? ECODE_AGENT_ROLES : [],
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

function isAgentExecutionResponse(value: unknown): value is AgentExecutionResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as AgentExecutionResponse;

  return (
    typeof candidate.runId === 'string' &&
    ['complete', 'partial', 'failed'].includes(candidate.status) &&
    Array.isArray(candidate.results) &&
    candidate.results.every(
      (result) =>
        result &&
        typeof result === 'object' &&
        ['architect', 'frontend', 'backend', 'devops', 'qa'].includes((result as AgentExecutionResult).roleId) &&
        ['complete', 'partial', 'failed'].includes((result as AgentExecutionResult).status) &&
        typeof (result as AgentExecutionResult).summary === 'string',
    )
  );
}

export async function executeAgentOrchestration(input: {
  env?: AgentOrchestrationEnv;
  plan: AgentOrchestrationPlan;
  messages: Array<Omit<Message, 'id'> | Message>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;

  /*
   * Per-tenant key for the executor's rate limiter (e.g. the project id). Without
   * it the gateway falls back to the caller pod's IP, collapsing every tenant into
   * one shared rate-limit bucket.
   */
  rateLimitKey?: string;
}): Promise<AgentExecutionResponse> {
  if (!input.plan.enabled || input.plan.mode !== 'parallel-subagents') {
    throw new AgentExecutorError('Parallel sub-agent execution is not enabled for this request.', 'not-configured');
  }

  const endpoint = getSubagentExecutorUrl(input.env);

  if (!endpoint?.trim()) {
    throw new AgentExecutorError('ECODE_SUBAGENT_EXECUTOR_URL is not configured.', 'not-configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
  const fetcher = input.fetchImpl ?? fetch;
  const token = getSubagentExecutorToken(input.env)?.trim();

  try {
    const response = await fetcher(new URL('/v1/agent-runs', endpoint).toString(), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        mode: input.plan.mode,
        roles: input.plan.roles,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: getTextContent(message),
        })),
        ...(input.rateLimitKey ? { rateLimitKey: input.rateLimitKey } : {}),
      }),
      signal: controller.signal,
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
    }
  | { type: 'error'; error: string };

/**
 * Streaming variant of {@link executeAgentOrchestration}: consumes the ai-gateway
 * SSE so the IDE can render each specialist sub-agent token-by-token live, then
 * returns the final aggregate. `onEvent` is called for every lane event as it
 * arrives. Falls back semantics identical to the non-streaming call (throws
 * AgentExecutorError so api.chat can fall back to single-model lanes).
 */
export async function executeAgentOrchestrationStream(input: {
  env?: AgentOrchestrationEnv;
  plan: AgentOrchestrationPlan;
  messages: Array<Omit<Message, 'id'> | Message>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  rateLimitKey?: string;
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
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 90_000);
  const fetcher = input.fetchImpl ?? fetch;
  const token = getSubagentExecutorToken(input.env)?.trim();

  try {
    const response = await fetcher(new URL('/v1/agent-runs/stream', endpoint).toString(), {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        mode: input.plan.mode,
        roles: input.plan.roles,
        messages: input.messages.map((message) => ({ role: message.role, content: getTextContent(message) })),
        ...(input.rateLimitKey ? { rateLimitKey: input.rateLimitKey } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new AgentExecutorError(`Sub-agent executor returned HTTP ${response.status}.`, 'http-error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let final: AgentExecutionResponse | undefined;

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

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

        input.onEvent(event);

        if (event.type === 'run-done') {
          final = { runId: event.runId, status: event.status, results: event.results, consensus: event.consensus };
        }
      }
    }

    if (!final || !isAgentExecutionResponse(final)) {
      throw new AgentExecutorError('Sub-agent stream ended without a run-done event.', 'invalid-response');
    }

    return final;
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
