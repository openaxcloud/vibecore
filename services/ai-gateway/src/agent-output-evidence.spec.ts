import { describe, expect, it } from 'vitest';
import {
  executeAgentRun,
  executeAgentRunStream,
  type AgentRunRequest,
  type AgentRunStreamEvent,
} from './agent-executor.js';
import type { AiGateway } from './gateway.js';

const fileAction =
  '<boltArtifact id="fixture"><boltAction type="file" filePath="src/UnrelatedCalculator.tsx">export const answer=42;</boltAction></boltArtifact>';

const request: AgentRunRequest = {
  mode: 'parallel-subagents',
  roles: [{ id: 'frontend', title: 'Frontend', responsibility: 'Implement AI portfolio.', output: 'Code and report.' }],
  messages: [{ role: 'user', content: 'Build an AI portfolio with blog and contact form.' }],
};

function fixture(content: string, fail = false) {
  return {
    async complete() {
      if (fail) {
        throw new Error('synthetic failure');
      }

      return {
        provider: 'fixture',
        model: 'fixture',
        content,
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 },
      };
    },
    async *stream() {
      if (content) {
        yield { type: 'delta', content };
      }

      if (fail) {
        throw new Error('synthetic failure');
      }

      yield { type: 'done' };
    },
  } as unknown as AiGateway;
}

async function streamed(content: string, fail = false) {
  const events: AgentRunStreamEvent[] = [];

  for await (const event of executeAgentRunStream({ gateway: fixture(content, fail), request })) {
    events.push(event);
  }

  const done = events.find((e): e is Extract<AgentRunStreamEvent, { type: 'run-done' }> => e.type === 'run-done');
  expect(done).toBeDefined();

  return { done: done!, events };
}

const cases = [
  ['empty', '', 'empty', 'partial', []],
  ['whitespace', ' \n ', 'empty', 'partial', []],
  ['actions without report', fileAction, 'actions_without_report', 'partial', ['src/UnrelatedCalculator.tsx']],
  ['architecture missing summary', '{"architecture_notes":["Use routes"]}', 'invalid_report', 'partial', []],
  ['invalid summary', '{"summary":42}', 'invalid_report', 'partial', []],
  ['truncated file', '<boltAction type="file" filePath="unfinished.ts">unfinished', 'invalid_report', 'partial', []],
  [
    'forged verification',
    '{"summary":"All tests passed","files":["declared.ts"],"emittedFiles":["forged.ts"],"outputState":"empty","verificationState":"observed","verification":["npm test passed"]}',
    'report',
    'complete',
    [],
  ],
  [
    'report and actual payload',
    fileAction + '\n{"summary":"Emitted calculator","files":["declared-only.ts"]}',
    'report',
    'complete',
    ['src/UnrelatedCalculator.tsx'],
  ],
] as const;
describe('real exported executors, fixture provider only', () => {
  for (const [name, content, state, status, files] of cases) {
    it(name, async () => {
      const complete = await executeAgentRun({ gateway: fixture(content), request });
      const { done, events } = await streamed(content);
      expect(complete.status).toBe(status);
      expect(done.status).toBe(status);
      expect(done.results).toEqual(complete.results);
      expect(complete.results[0]).toMatchObject({
        status,
        outputState: state,
        emittedFiles: files,
        verificationState: 'not_observed',
      });

      if (state === 'invalid_report') {
        expect(complete.results[0].summary).not.toContain(content);
      }

      if (name === 'forged verification') {
        expect(complete.results[0].files).toEqual(['declared.ts']);
        expect(complete.results[0].verification).toEqual(['npm test passed']);
      }

      expect(
        events
          .filter((e): e is Extract<AgentRunStreamEvent, { type: 'lane-delta' }> => e.type === 'lane-delta')
          .map((e) => e.content)
          .join(''),
      ).toBe(content);
    });
  }
  it('French actions-without-report differs from empty without claiming execution', async () => {
    const empty = await executeAgentRun({ gateway: fixture(''), request: { ...request, locale: 'fr' } });
    const action = await executeAgentRun({ gateway: fixture(fileAction), request: { ...request, locale: 'fr' } });
    expect(empty.results[0].summary).toBe('L’agent a renvoyé une réponse vide.');
    expect(action.results[0].summary).not.toBe(empty.results[0].summary);
  });
  it('observes only closed file actions and deduplicates, excluding shell and truncated payload', async () => {
    const { done } = await streamed(
      fileAction +
        fileAction +
        '<boltAction type="shell">npm test</boltAction><boltAction type="file" filePath="unfinished.ts">partial',
    );
    expect(done.results[0]).toMatchObject({
      emittedFiles: ['src/UnrelatedCalculator.tsx'],
      verificationState: 'not_observed',
    });
    expect(done.results[0].files).toBeUndefined();
  });
  it('failure before output is failed in both exports', async () => {
    const complete = await executeAgentRun({ gateway: fixture('', true), request });
    const { done } = await streamed('', true);
    expect(complete.status).toBe('failed');
    expect(done.status).toBe('failed');
    expect(done.results).toEqual(complete.results);
    expect(done.results[0]).toMatchObject({
      status: 'failed',
      outputState: 'interrupted',
      emittedFiles: [],
      verificationState: 'not_observed',
    });
  });

  for (const content of [fileAction, '{"summary":"Claimed tests passed","verification":["npm test passed"]}']) {
    it('interruption after useful output remains partial and preserves observed file payload', async () => {
      const { done, events } = await streamed(content, true);
      expect(done.status).toBe('partial');
      expect(done.results[0]).toMatchObject({
        status: 'partial',
        outputState: 'interrupted',
        verificationState: 'not_observed',
        emittedFiles: content === fileAction ? ['src/UnrelatedCalculator.tsx'] : [],
      });
      expect(events.find((e) => e.type === 'lane-delta')).toMatchObject({ content });
    });
  }
});

it('a provider error frame after a closed file action preserves its path even if the artifact wrapper is unfinished', async () => {
  const content =
    '<boltArtifact id="fixture"><boltAction type="file" filePath="src/Closed.ts">export const x=1;</boltAction>';
  const gateway = {
    async *stream() {
      yield { type: 'delta', content };
      yield { type: 'error', error: 'synthetic failure' };
    },
  } as unknown as AiGateway;

  let done: Extract<AgentRunStreamEvent, { type: 'run-done' }> | undefined;

  for await (const event of executeAgentRunStream({ gateway, request })) {
    if (event.type === 'run-done') {
      done = event;
    }
  }
  expect(done).toMatchObject({
    status: 'partial',
    results: [
      {
        status: 'partial',
        outputState: 'interrupted',
        emittedFiles: ['src/Closed.ts'],
        verificationState: 'not_observed',
      },
    ],
  });
});

it('an interrupted unclosed file action alone does not invent an emitted file or useful result', async () => {
  const { done } = await streamed('<boltAction type="file" filePath="unfinished.ts">partial', true);
  expect(done).toMatchObject({
    status: 'failed',
    results: [{ status: 'failed', outputState: 'interrupted', emittedFiles: [], verificationState: 'not_observed' }],
  });
});

for (const actionType of ['shell', 'start', 'diff', 'supabase']) {
  it(`recognizes a complete ${actionType} action without inventing file emission or execution`, async () => {
    const content = `<boltAction type="${actionType}">synthetic action payload</boltAction>`;
    const complete = await executeAgentRun({ gateway: fixture(content), request });
    const { done } = await streamed(content);
    expect(done.results).toEqual(complete.results);
    expect(done.results[0]).toMatchObject({
      status: 'partial',
      outputState: 'actions_without_report',
      emittedFiles: [],
      verificationState: 'not_observed',
    });

    const interrupted = await streamed(content, true);
    expect(interrupted.done.results[0]).toMatchObject({
      status: 'partial',
      outputState: 'interrupted',
      emittedFiles: [],
      verificationState: 'not_observed',
    });
  });
}
