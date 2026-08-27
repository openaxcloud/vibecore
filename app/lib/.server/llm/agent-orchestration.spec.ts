import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutorError,
  ECODE_AGENT_ROLES,
  areParallelSubagentsAvailable,
  buildAgentOrchestrationPlan,
  buildPartialExecutionFromLanes,
  buildAgentRunRequestBody,
  clampRolesToParallelLimit,
  createAgentExecutionContext,
  createAgentOrchestrationPrompt,
  createAgentPlanContext,
  parallelAgentsForBuildTier,
  executeAgentOrchestration,
  executeAgentOrchestrationStream,
  getSubagentExecutorToken,
  shouldUseAgentOrchestration,
} from './agent-orchestration';

const COMPLEX_BUILD_PROMPT =
  'Build a full-stack SaaS dashboard app with auth, backend APIs, database persistence, WebSocket collaboration, tests, deploy config, and responsive mobile support.';

const architectUsage = {
  callId: 'agent:run:architect',
  kind: 'agent-lane' as const,
  roleId: 'architect' as const,
  provider: 'openai',
  model: 'gpt-4.1-mini',
  inputTokens: 12,
  outputTokens: 7,
  estimatedCostCents: 1,
  estimated: false,
};

const runUsage = {
  laneCount: 1,
  inputTokens: 12,
  outputTokens: 7,
  totalTokens: 19,
  estimatedCostCents: 1,
  sharedContextTokens: 5,
  duplicatedInputTokens: 0,
  calls: [architectUsage],
};

describe('E-Code agent orchestration', () => {
  it('does not enable specialist lanes for discuss mode', () => {
    expect(shouldUseAgentOrchestration([{ role: 'user', content: 'Explain how React state works.' }], 'discuss')).toBe(
      false,
    );
  });

  it('enables the full ten-lane roster for complex build prompts', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [
        {
          role: 'user',
          content:
            'Build a full-stack SaaS dashboard app with auth, backend APIs, database persistence, WebSocket collaboration, tests, deploy config, and responsive mobile support.',
        },
      ],
      subagentsAvailable: true,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.mode).toBe('parallel-subagents');
    expect(plan.roles.map((role) => role.id)).toEqual([
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
  });

  it('creates a system prompt block with integration and verification gates', () => {
    const prompt = createAgentOrchestrationPrompt({
      enabled: true,
      mode: 'single-model-lanes',
      reason: 'test',
      roles: ECODE_AGENT_ROLES,
    });

    expect(prompt).toContain('<ecode_agent_orchestration>');
    expect(prompt).toContain('Architect');
    expect(prompt).toContain('Frontend');
    expect(prompt).toContain('Backend');
    expect(prompt).toContain('DevOps');
    expect(prompt).toContain('QA');
    expect(prompt).toContain('Run the relevant verification commands');
  });

  it('requires both an enable flag and executor URL before using parallel sub-agent mode', () => {
    expect(areParallelSubagentsAvailable({ ECODE_PARALLEL_SUBAGENTS_ENABLED: '1' })).toBe(false);
    expect(areParallelSubagentsAvailable({ ECODE_SUBAGENT_EXECUTOR_URL: 'http://127.0.0.1:7777' })).toBe(false);
    expect(
      areParallelSubagentsAvailable({
        ECODE_PARALLEL_SUBAGENTS_ENABLED: '1',
        ECODE_SUBAGENT_EXECUTOR_URL: 'http://127.0.0.1:7777',
      }),
    ).toBe(true);
  });

  it('calls the configured sub-agent executor with the specialist roles and messages', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Build a full-stack app with backend APIs, auth, deploy and tests.' }],
      subagentsAvailable: true,
    });

    const calls: Array<{ url: string; init: RequestInit }> = [];

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(
        JSON.stringify({
          runId: 'run_123',
          status: 'complete',
          results: [
            {
              roleId: 'architect',
              status: 'complete',
              summary: 'Architecture, data model and API contract produced.',
              usage: architectUsage,
            },
          ],
          usage: runUsage,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const response = await executeAgentOrchestration({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(response.runId).toBe('run_123');
    expect(calls[0].url).toBe('https://agents.example.com/v1/agent-runs');
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      mode: 'parallel-subagents',
      messages: [{ role: 'user', content: 'Build it.' }],
    });
  });

  it('sends the service authorization token when configured', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Build a full-stack app with backend APIs, auth, deploy and tests.' }],
      subagentsAvailable: true,
    });

    const calls: Array<{ init: RequestInit }> = [];

    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ init: init ?? {} });

      return new Response(
        JSON.stringify({
          runId: 'run_123',
          status: 'complete',
          results: [{ roleId: 'architect', status: 'complete', summary: 'ok', usage: architectUsage }],
          usage: runUsage,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };

    await executeAgentOrchestration({
      env: {
        ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com',
        ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret-token',
      },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(getSubagentExecutorToken({ ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret-token' })).toBe('secret-token');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer secret-token');
  });

  it('streams sub-agent lane events and returns the final streamed execution', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Build a full-stack app with backend APIs, auth, deploy and tests.' }],
      subagentsAvailable: true,
    });

    const encoder = new TextEncoder();

    const events = [
      { type: 'lane-start', roleId: 'architect', title: 'Architect' },
      { type: 'lane-delta', roleId: 'architect', content: 'Planning' },
      {
        type: 'lane-done',
        roleId: 'architect',
        result: { roleId: 'architect', status: 'complete', summary: 'Architecture complete.', usage: architectUsage },
      },
      {
        type: 'run-done',
        runId: 'run_stream',
        status: 'complete',
        results: [
          { roleId: 'architect', status: 'complete', summary: 'Architecture complete.', usage: architectUsage },
        ],
        usage: runUsage,
      },
    ];

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const receivedEvents: unknown[] = [];

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(
        new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }

            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };

    const response = await executeAgentOrchestrationStream({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      rateLimitKey: 'project_123',
      fetchImpl: fetchImpl as typeof fetch,
      onEvent: (event) => receivedEvents.push(event),
    });

    expect(response.runId).toBe('run_stream');
    expect(calls[0].url).toBe('https://agents.example.com/v1/agent-runs/stream');
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ rateLimitKey: 'project_123' });
    expect(receivedEvents).toEqual(events);
  });

  it('uses an idle timeout that does not abort a slow-but-steady stream', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Build a full-stack app with backend APIs, auth, deploy and tests.' }],
      subagentsAvailable: true,
    });

    const encoder = new TextEncoder();

    const frames = [
      { type: 'lane-start', roleId: 'architect', title: 'Architect' },
      { type: 'lane-delta', roleId: 'architect', content: 'a' },
      { type: 'lane-delta', roleId: 'architect', content: 'b' },
      { type: 'lane-delta', roleId: 'architect', content: 'c' },
      { type: 'lane-delta', roleId: 'architect', content: 'd' },
      {
        type: 'run-done',
        runId: 'run_idle',
        status: 'complete',
        results: [{ roleId: 'architect', status: 'complete', summary: 'ok', usage: architectUsage }],
        usage: runUsage,
      },
    ];

    const gapMs = 20;

    const fetchImpl = async () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            for (const frame of frames) {
              await new Promise((resolve) => setTimeout(resolve, gapMs));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            }

            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    /*
     * idle window (80ms) > per-frame gap (20ms), but the TOTAL stream (~120ms)
     * exceeds it. A fixed total-lifetime deadline of 80ms would have aborted
     * mid-stream; the idle timeout re-arms on each frame and must let it finish.
     */
    const response = await executeAgentOrchestrationStream({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      timeoutMs: 80,
      fetchImpl: fetchImpl as typeof fetch,
      onEvent: vi.fn(),
    });

    expect(response.runId).toBe('run_idle');
  });

  it('fails closed when the sub-agent executor is not configured or returns invalid data', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Build a full-stack app with backend APIs, auth, deploy and tests.' }],
      subagentsAvailable: true,
    });

    await expect(executeAgentOrchestration({ plan, messages: [] })).rejects.toMatchObject({
      code: 'not-configured',
    } satisfies Partial<AgentExecutorError>);

    await expect(
      executeAgentOrchestration({
        env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
        plan,
        messages: [],
        fetchImpl: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' } satisfies Partial<AgentExecutorError>);

    const mutatedUsage = { ...runUsage, totalTokens: runUsage.totalTokens + 1 };
    await expect(
      executeAgentOrchestration({
        env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
        plan,
        messages: [],
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              runId: 'run_mutated',
              status: 'complete',
              results: [{ roleId: 'architect', status: 'complete', summary: 'ok', usage: architectUsage }],
              usage: mutatedUsage,
            }),
            { status: 200 },
          )) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' } satisfies Partial<AgentExecutorError>);

    await expect(
      executeAgentOrchestration({
        env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
        plan,
        messages: [],
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              runId: 'run_unmetered',
              status: 'complete',
              results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
            }),
            { status: 200 },
          )) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' } satisfies Partial<AgentExecutorError>);
  });

  it('parses and forwards consensus payload from the executor response', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Build a full-stack app with backend APIs, auth, deploy and tests.' }],
      subagentsAvailable: true,
    });

    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          runId: 'run_consensus_e2e',
          status: 'partial',
          results: [
            { roleId: 'architect', status: 'complete', summary: 'A.', usage: architectUsage },
            { roleId: 'devops', status: 'failed', summary: 'devops timeout' },
          ],
          usage: runUsage,
          consensus: {
            algorithm: 'QUORUM',
            outcome: 'PARTIAL',
            threshold: 0.66,
            agreementScore: 0.5,
            rounds: 1,
            durationMs: 7,
            claimVotes: [
              {
                claim: 'Service mesh adds latency',
                type: 'risk',
                supporters: ['architect'],
                dissenters: [],
                agreementRatio: 1,
                decision: 'accepted',
              },
            ],
            conflicts: [
              {
                type: 'role-failure',
                description: '1 sub-agent role(s) failed: devops',
                involvedRoles: ['devops'],
                severity: 'medium',
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const response = await executeAgentOrchestration({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(response.consensus).toBeDefined();
    expect(response.consensus!.algorithm).toBe('QUORUM');
    expect(response.consensus!.outcome).toBe('PARTIAL');
    expect(response.consensus!.claimVotes).toHaveLength(1);
    expect(response.consensus!.conflicts[0]!.type).toBe('role-failure');
    expect(response.consensus!.conflicts[0]!.involvedRoles).toEqual(['devops']);
  });

  it('buildAgentExecutionAnnotation maps consensus into the streamable annotation shape', async () => {
    const { buildAgentExecutionAnnotation } = await import('./agent-orchestration');

    const annotation = buildAgentExecutionAnnotation({
      runId: 'run_anno',
      status: 'complete',
      results: [{ roleId: 'architect', status: 'complete', summary: 'a', usage: architectUsage }],
      usage: runUsage,
      consensus: {
        algorithm: 'WEIGHTED_PLURALITY',
        outcome: 'ACCEPTED',
        threshold: 0.66,
        agreementScore: 0.9,
        rounds: 1,
        durationMs: 12,
        claimVotes: [
          {
            claim: 'A risk',
            type: 'risk',
            supporters: ['architect', 'qa'],
            dissenters: ['frontend'],
            agreementRatio: 0.7,
            decision: 'accepted',
          },
        ],
        conflicts: [],
      },
    });

    expect(annotation.type).toBe('agentExecution');
    expect(annotation.runId).toBe('run_anno');
    expect(annotation.consensus).toBeDefined();
    expect(annotation.consensus!.algorithm).toBe('WEIGHTED_PLURALITY');
    expect(annotation.consensus!.outcome).toBe('ACCEPTED');
    expect(annotation.consensus!.claimVotes[0]!.supporters).toEqual(['architect', 'qa']);
    expect((annotation.results[0] as Record<string, unknown>).usage).toBeUndefined();

    // abstainers must not leak through (executor returns it but annotation drops it).
    expect((annotation.consensus!.claimVotes[0] as Record<string, unknown>).abstainers).toBeUndefined();
  });

  it('buildAgentExecutionAnnotation skips consensus field when absent', async () => {
    const { buildAgentExecutionAnnotation } = await import('./agent-orchestration');

    const annotation = buildAgentExecutionAnnotation({
      runId: 'run_no_consensus',
      status: 'complete',
      results: [{ roleId: 'architect', status: 'complete', summary: 'a', usage: architectUsage }],
      usage: runUsage,
    });
    expect(annotation.consensus).toBeUndefined();
  });

  it('formats sub-agent execution results for system prompt injection', () => {
    const context = createAgentExecutionContext({
      runId: 'run_abc',
      status: 'partial',
      results: [
        {
          roleId: 'qa',
          status: 'partial',
          summary: 'Critical tests identified.',
          files: ['tests/e2e/app.spec.ts'],
          risks: ['Preview not manually verified'],
          verification: ['pnpm run test'],
          usage: { ...architectUsage, callId: 'agent:run:qa', roleId: 'qa' },
        },
      ],
      usage: {
        ...runUsage,
        calls: [{ ...architectUsage, callId: 'agent:run:qa', roleId: 'qa' }],
      },
    });

    expect(context).toContain('<ecode_subagent_results>');
    expect(context).toContain('Run: run_abc');
    expect(context).toContain('Role: qa');
    expect(context).toContain('pnpm run test');
  });

  /*
   * Bug: parallel sub-agents ran on the gateway's DEFAULT model, not the model
   * the user selected, because provider/model were never put in the POST body.
   */
  it('threads the selected provider/model into the executor request body', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    const calls: Array<{ init: RequestInit }> = [];

    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ init: init ?? {} });

      return new Response(
        JSON.stringify({
          runId: 'run_model',
          status: 'complete',
          results: [{ roleId: 'architect', status: 'complete', summary: 'ok', usage: architectUsage }],
          usage: runUsage,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    await executeAgentOrchestration({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      provider: 'Anthropic',
      model: 'claude-opus-4',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      provider: 'Anthropic',
      model: 'claude-opus-4',
    });
  });

  it('threads the selected provider/model into the streaming executor request body', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    const encoder = new TextEncoder();
    const calls: Array<{ init: RequestInit }> = [];

    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ init: init ?? {} });

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'run-done',
                  runId: 'run_model_stream',
                  status: 'complete',
                  results: [{ roleId: 'architect', status: 'complete', summary: 'ok', usage: architectUsage }],
                  usage: runUsage,
                })}\n\n`,
              ),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };

    await executeAgentOrchestrationStream({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      provider: 'Anthropic',
      model: 'claude-sonnet-4',
      fetchImpl: fetchImpl as typeof fetch,
      onEvent: vi.fn(),
    });

    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      provider: 'Anthropic',
      model: 'claude-sonnet-4',
    });
  });

  it('omits provider/model from the body when they are blank', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    const body = buildAgentRunRequestBody({
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      provider: '   ',
      model: undefined,
    });

    expect(body).not.toHaveProperty('provider');
    expect(body).not.toHaveProperty('model');
  });

  /*
   * The persisted AgentRun needs projectId or the consensus panel (which scopes by
   * run.projectId) finds nothing — so the request body MUST carry it through.
   */
  it('threads projectId into the agent-run request body (trimmed, omitted when blank)', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    expect(
      buildAgentRunRequestBody({ plan, messages: [{ role: 'user', content: 'Build it.' }], projectId: '  proj_1  ' }),
    ).toMatchObject({ projectId: 'proj_1' });

    expect(
      buildAgentRunRequestBody({ plan, messages: [{ role: 'user', content: 'Build it.' }], projectId: '   ' }),
    ).not.toHaveProperty('projectId');

    expect(buildAgentRunRequestBody({ plan, messages: [{ role: 'user', content: 'Build it.' }] })).not.toHaveProperty(
      'projectId',
    );
  });

  /*
   * Bug: the plan-tier parallel-agent limit ('Up to 2 / 10 parallel agents')
   * was never enforced — every plan always ran the same fixed roles.
   */
  it('clamps the specialist lane roster to the plan parallel-agent entitlement', () => {
    expect(clampRolesToParallelLimit(ECODE_AGENT_ROLES, 2).map((role) => role.id)).toEqual(['architect', 'frontend']);
    expect(clampRolesToParallelLimit(ECODE_AGENT_ROLES, 10).map((role) => role.id)).toEqual(
      ECODE_AGENT_ROLES.map((role) => role.id),
    );

    // No entitlement passed: full roster preserved (back-compat for callers that don't pass a plan).
    expect(clampRolesToParallelLimit(ECODE_AGENT_ROLES, undefined)).toHaveLength(ECODE_AGENT_ROLES.length);

    // A single-agent plan can't fan out.
    expect(clampRolesToParallelLimit(ECODE_AGENT_ROLES, 1).map((role) => role.id)).toEqual(['architect']);
  });

  it('runs the ten real specialist lanes for a Pro-tier (10) plan', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
      parallelAgents: 10,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.roles).toHaveLength(10);
  });

  it('limits a Core-tier (2) plan to exactly two specialist lanes', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
      parallelAgents: 2,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.roles.map((role) => role.id)).toEqual(['architect', 'frontend']);
  });

  it('disables parallel orchestration for a single-agent (Starter) plan', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
      parallelAgents: 1,
    });

    expect(plan.enabled).toBe(false);
    expect(plan.mode).toBe('single-model-lanes');
    expect(plan.roles).toHaveLength(0);
  });

  /*
   * Bug: when the SSE failed mid-run AFTER lanes had already executed (and been
   * billed) on the gateway, the stream threw and the caller fell back to a fresh
   * /v1/agent-runs POST that re-ran (and re-billed) every lane. Mid-run failures
   * with completed lanes must resolve to a PARTIAL aggregate, not throw.
   */
  it('returns a partial aggregate (no re-run) when the stream errors after a lane completed', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    const encoder = new TextEncoder();

    const frames = [
      { type: 'lane-start', roleId: 'architect', title: 'Architect' },
      {
        type: 'lane-done',
        roleId: 'architect',
        result: {
          roleId: 'architect',
          status: 'complete',
          summary: 'Architecture complete.',
          usage: architectUsage,
        },
      },

      // Gateway-sent error AFTER a lane already finished (and was billed).
      { type: 'error', error: 'upstream lane crashed' },
    ];

    let fetchCount = 0;

    const fetchImpl = async () => {
      fetchCount += 1;

      return new Response(
        new ReadableStream({
          start(controller) {
            for (const frame of frames) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            }

            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };

    const response = await executeAgentOrchestrationStream({
      env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
      plan,
      messages: [{ role: 'user', content: 'Build it.' }],
      fetchImpl: fetchImpl as typeof fetch,
      onEvent: vi.fn(),
    });

    // Resolved (did not throw) from the already-billed lane, so the caller never re-runs.
    expect(response.status).toBe('partial');
    expect(response.results.map((result) => result.roleId)).toEqual(['architect']);
    expect(response.usage).toMatchObject({
      laneCount: 1,
      inputTokens: architectUsage.inputTokens,
      outputTokens: architectUsage.outputTokens,
      calls: [architectUsage],
    });
    expect(fetchCount).toBe(1);
  });

  /*
   * Bug guard: a stream that ends with NO lane completed (and no run-done) must
   * still throw, so the caller falls back to single-model lanes — there is no
   * billed work to preserve and nothing to double-bill.
   */
  it('still throws when the stream ends with no completed lane', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    const encoder = new TextEncoder();

    const fetchImpl = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'lane-start', roleId: 'architect', title: 'A' })}\n\n`),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    await expect(
      executeAgentOrchestrationStream({
        env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
        plan,
        messages: [{ role: 'user', content: 'Build it.' }],
        fetchImpl: fetchImpl as typeof fetch,
        onEvent: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' } satisfies Partial<AgentExecutorError>);
  });

  /*
   * Bug guard: an explicit user abort must always propagate (the caller's
   * re-fetch short-circuits on the aborted signal). Partial work from a
   * cancelled run must NOT be surfaced even if a lane completed.
   */
  it('propagates the error on caller abort even after a lane completed', async () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
    });

    const encoder = new TextEncoder();
    const abortController = new AbortController();

    const fetchImpl = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'lane-done',
                  roleId: 'architect',
                  result: { roleId: 'architect', status: 'complete', summary: 'ok' },
                })}\n\n`,
              ),
            );

            // Caller cancels, then the stream errors out.
            abortController.abort();
            controller.error(new DOMException('aborted', 'AbortError'));
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    await expect(
      executeAgentOrchestrationStream({
        env: { ECODE_SUBAGENT_EXECUTOR_URL: 'https://agents.example.com' },
        plan,
        messages: [{ role: 'user', content: 'Build it.' }],
        signal: abortController.signal,
        fetchImpl: fetchImpl as typeof fetch,
        onEvent: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AgentExecutorError);
  });

  it('buildPartialExecutionFromLanes returns undefined with no lanes, partial otherwise', () => {
    expect(buildPartialExecutionFromLanes([], 'run_x')).toBeUndefined();

    const partial = buildPartialExecutionFromLanes(
      [{ roleId: 'frontend', status: 'complete', summary: 'UI done' }],
      'run_y',
    );
    expect(partial).toMatchObject({ runId: 'run_y', status: 'partial' });
    expect(partial!.results).toHaveLength(1);
  });

  /*
   * Power controls must VISIBLY change the number of parallel agents (previously
   * the Lite/Economy/Power selector was cosmetic and every request ran the same roster).
   */
  it('maps the build tier to a parallel-agent cap (Lite=1, Economy=2, Power=10)', () => {
    expect(parallelAgentsForBuildTier('lite')).toBe(1);
    expect(parallelAgentsForBuildTier('economy')).toBe(2);
    expect(parallelAgentsForBuildTier('power')).toBe(10);

    // High-power boost adds one lane, capped at the roster size.
    expect(parallelAgentsForBuildTier('economy', true)).toBe(3);
    expect(parallelAgentsForBuildTier('power', true)).toBe(10);

    // Unknown/undefined tier falls back to the balanced default.
    expect(parallelAgentsForBuildTier(undefined)).toBe(2);
  });

  it('Lite tier (1 agent) disables the parallel fan-out', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
      parallelAgents: parallelAgentsForBuildTier('lite'),
    });
    expect(plan.enabled).toBe(false);
  });

  /*
   * Plan mode is an explicit user request to decompose; it must orchestrate even
   * for a short prompt that wouldn't trip the complexity heuristic.
   */
  it('planFirst forces orchestration for a short prompt that the heuristic would skip', () => {
    const shortPrompt = 'make a counter';

    expect(shouldUseAgentOrchestration([{ role: 'user', content: shortPrompt }], 'build')).toBe(false);
    expect(shouldUseAgentOrchestration([{ role: 'user', content: shortPrompt }], 'build', { planFirst: true })).toBe(
      true,
    );

    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: shortPrompt }],
      subagentsAvailable: true,
      planFirst: true,
    });
    expect(plan.enabled).toBe(true);
  });

  /*
   * The prompt-driven planner narrows the roster to only the roles it selected
   * (e.g. a static page needs no backend/devops), instead of the fixed 5.
   */
  it('restricts the roster to the planner-selected roles', () => {
    const plan = buildAgentOrchestrationPlan({
      chatMode: 'build',
      messages: [{ role: 'user', content: COMPLEX_BUILD_PROMPT }],
      subagentsAvailable: true,
      selectedRoleIds: ['architect', 'frontend'],
    });
    expect(plan.roles.map((role) => role.id)).toEqual(['architect', 'frontend']);
  });

  it('renders the plan tasks into an injectable system-prompt block', () => {
    const context = createAgentPlanContext([
      { title: 'Design the data model', roleId: 'architect' },
      { title: 'Build the dashboard UI', roleId: 'frontend' },
    ]);
    expect(context).toContain('<ecode_agent_plan>');
    expect(context).toContain('[architect] Design the data model');
    expect(context).toContain('[frontend] Build the dashboard UI');
    expect(createAgentPlanContext([])).toBe('');
  });
});
