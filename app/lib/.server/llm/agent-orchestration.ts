import type { Message } from 'ai';

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

export type AgentExecutionResponse = {
  runId: string;
  status: 'complete' | 'partial' | 'failed';
  results: AgentExecutionResult[];
};

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
  const processEnv =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)
      : ({} as Record<string, string | undefined>);
  const flag = env?.ECODE_PARALLEL_SUBAGENTS_ENABLED ?? processEnv.ECODE_PARALLEL_SUBAGENTS_ENABLED;
  const endpoint = env?.ECODE_SUBAGENT_EXECUTOR_URL ?? processEnv.ECODE_SUBAGENT_EXECUTOR_URL;

  return flag === '1' && Boolean(endpoint?.trim());
}

export function getSubagentExecutorUrl(env?: AgentOrchestrationEnv): string | undefined {
  const processEnv =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)
      : ({} as Record<string, string | undefined>);

  return env?.ECODE_SUBAGENT_EXECUTOR_URL ?? processEnv.ECODE_SUBAGENT_EXECUTOR_URL;
}

export function getSubagentExecutorToken(env?: AgentOrchestrationEnv): string | undefined {
  const processEnv =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)
      : ({} as Record<string, string | undefined>);

  return env?.ECODE_SUBAGENT_EXECUTOR_TOKEN ?? processEnv.ECODE_SUBAGENT_EXECUTOR_TOKEN;
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
