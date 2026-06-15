import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutorError,
  ECODE_AGENT_ROLES,
  areParallelSubagentsAvailable,
  buildAgentOrchestrationPlan,
  createAgentExecutionContext,
  createAgentOrchestrationPrompt,
  executeAgentOrchestration,
  executeAgentOrchestrationStream,
  getSubagentExecutorToken,
  shouldUseAgentOrchestration,
} from './agent-orchestration';

describe('E-Code agent orchestration', () => {
  it('does not enable specialist lanes for discuss mode', () => {
    expect(shouldUseAgentOrchestration([{ role: 'user', content: 'Explain how React state works.' }], 'discuss')).toBe(
      false,
    );
  });

  it('enables architect/frontend/backend/devops/qa lanes for complex build prompts', () => {
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
    expect(plan.roles.map((role) => role.id)).toEqual(['architect', 'frontend', 'backend', 'devops', 'qa']);
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
            },
          ],
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

      return new Response(JSON.stringify({ runId: 'run_123', status: 'complete', results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
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
        result: { roleId: 'architect', status: 'complete', summary: 'Architecture complete.' },
      },
      {
        type: 'run-done',
        runId: 'run_stream',
        status: 'complete',
        results: [{ roleId: 'architect', status: 'complete', summary: 'Architecture complete.' }],
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
        results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
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
            { roleId: 'architect', status: 'complete', summary: 'A.' },
            { roleId: 'devops', status: 'failed', summary: 'devops timeout' },
          ],
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
      results: [{ roleId: 'architect', status: 'complete', summary: 'a' }],
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

    // abstainers must not leak through (executor returns it but annotation drops it).
    expect((annotation.consensus!.claimVotes[0] as Record<string, unknown>).abstainers).toBeUndefined();
  });

  it('buildAgentExecutionAnnotation skips consensus field when absent', async () => {
    const { buildAgentExecutionAnnotation } = await import('./agent-orchestration');

    const annotation = buildAgentExecutionAnnotation({
      runId: 'run_no_consensus',
      status: 'complete',
      results: [{ roleId: 'architect', status: 'complete', summary: 'a' }],
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
        },
      ],
    });

    expect(context).toContain('<ecode_subagent_results>');
    expect(context).toContain('Run: run_abc');
    expect(context).toContain('Role: qa');
    expect(context).toContain('pnpm run test');
  });
});
