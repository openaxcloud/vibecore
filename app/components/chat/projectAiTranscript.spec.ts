import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSCRIPT_HYDRATION_RETRIES,
  planTranscriptHydrationRetry,
  projectAiMessagesToChatMessages,
} from './projectAiTranscript';

describe('project AI transcript normalization', () => {
  it('converts persisted project AI messages into chat messages', () => {
    expect(
      projectAiMessagesToChatMessages([
        { id: 'm1', role: 'user', content: 'Build the app' },
        { id: 'm2', role: 'assistant', content: 'Working on it.' },
      ]),
    ).toEqual([
      { id: 'm1', role: 'user', content: 'Build the app' },
      { id: 'm2', role: 'assistant', content: 'Working on it.' },
    ]);
  });

  it('drops unsupported roles and assigns stable fallback ids', () => {
    expect(
      projectAiMessagesToChatMessages([
        { role: 'user', content: 'Keep this' },
        { role: 'debug', content: 'Drop this' },
        { role: 'assistant' },
      ]),
    ).toEqual([
      { id: 'user:0', role: 'user', content: 'Keep this' },
      { id: 'assistant:2', role: 'assistant', content: '' },
    ]);
  });

  it('normalizes persisted backend tool calls into assistant tool invocation parts', () => {
    expect(
      projectAiMessagesToChatMessages([
        {
          id: 'tool-message-1',
          role: 'tool',
          content: 'write_file',
          toolCalls: [
            {
              id: 'tool-call-1',
              name: 'write_file',
              input: { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
              output: { path: 'src/App.tsx', written: true },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: 'tool-message-1',
        role: 'assistant',
        content: 'write_file',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tool-call-1',
              toolName: 'write_file',
              args: { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
              result: { path: 'src/App.tsx', written: true },
            },
          },
        ],
      },
    ]);
  });

  it('uses stable fallback tool ids and safe empty payloads for partial tool call records', () => {
    expect(
      projectAiMessagesToChatMessages([
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ name: '  ' }],
        },
      ]),
    ).toEqual([
      {
        id: 'assistant:0',
        role: 'assistant',
        content: '',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'assistant:0:tool:0',
              toolName: 'tool',
              args: {},
              result: null,
            },
          },
        ],
      },
    ]);
  });
});

describe('transcript hydration retry plan', () => {
  it('retries early failures with exponential backoff', () => {
    expect(planTranscriptHydrationRetry(0)).toEqual({ shouldRetry: true, delayMs: 1000 });
    expect(planTranscriptHydrationRetry(1)).toEqual({ shouldRetry: true, delayMs: 2000 });
    expect(planTranscriptHydrationRetry(2)).toEqual({ shouldRetry: true, delayMs: 4000 });
  });

  it('stops auto-retrying once the bounded attempt budget is exhausted', () => {
    expect(planTranscriptHydrationRetry(MAX_TRANSCRIPT_HYDRATION_RETRIES)).toEqual({
      shouldRetry: false,
      delayMs: 0,
    });
    expect(planTranscriptHydrationRetry(MAX_TRANSCRIPT_HYDRATION_RETRIES + 5)).toEqual({
      shouldRetry: false,
      delayMs: 0,
    });
  });

  it('treats invalid attempt counts as non-retryable instead of looping forever', () => {
    expect(planTranscriptHydrationRetry(-1)).toEqual({ shouldRetry: false, delayMs: 0 });
    expect(planTranscriptHydrationRetry(Number.NaN)).toEqual({ shouldRetry: false, delayMs: 0 });
    expect(planTranscriptHydrationRetry(Number.POSITIVE_INFINITY)).toEqual({ shouldRetry: false, delayMs: 0 });
  });

  it('caps the backoff delay so a returning user is never stranded silently', () => {
    const plan = planTranscriptHydrationRetry(MAX_TRANSCRIPT_HYDRATION_RETRIES - 1);
    expect(plan.shouldRetry).toBe(true);
    expect(plan.delayMs).toBeLessThanOrEqual(8000);
  });
});
