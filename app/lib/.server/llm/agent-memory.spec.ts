import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentMemoryAnnotation,
  latestUserText,
  persistAgentMemoryCandidate,
  retrieveMemoryForAgentContext,
} from './agent-memory';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest,
}));

describe('agent memory LLM integration', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('uses the latest user message as the retrieval query', () => {
    expect(
      latestUserText([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'latest' },
      ] as any),
    ).toBe('latest');
  });

  it('retrieves project memory context when the persisted preference is enabled', async () => {
    apiRequest.mockResolvedValueOnce({ preference: { enabled: true } }).mockResolvedValueOnce({
      context: 'Persistent agent memory retrieved.',
      memories: [{ id: 'mem-1', summary: 'Always validate before pushing.', scope: 'project', score: 0.91 }],
    });

    const result = await retrieveMemoryForAgentContext(new Request('https://app.local/api/chat'), {
      projectId: 'project-1',
      messages: [{ role: 'user', content: 'How do we finish tasks?' }] as any,
    });

    expect(result?.context).toContain('Persistent agent memory');
    expect(apiRequest.mock.calls[1][1]).toBe('/agent-memory/context');
    expect(JSON.parse(apiRequest.mock.calls[1][2].body)).toMatchObject({
      projectId: 'project-1',
      query: 'How do we finish tasks?',
    });
  });

  it('does not retrieve or write when memory is disabled for the project', async () => {
    apiRequest.mockResolvedValue({ preference: { enabled: false } });

    await expect(
      retrieveMemoryForAgentContext(new Request('https://app.local/api/chat'), {
        projectId: 'project-1',
        messages: [{ role: 'user', content: 'Remember the workflow.' }] as any,
      }),
    ).resolves.toBeUndefined();
    await persistAgentMemoryCandidate(new Request('https://app.local/api/chat'), {
      projectId: 'project-1',
      messages: [{ role: 'user', content: 'Remember the workflow.' }] as any,
      assistantText: 'Done',
    });

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls.every((call) => call[1].startsWith('/agent-memory/preferences'))).toBe(true);
  });

  it('builds a visible annotation for memories used in a response', () => {
    expect(agentMemoryAnnotation([{ id: 'mem-1', scope: 'project', summary: 'Use pnpm.', score: 0.88 }])).toMatchObject(
      {
        type: 'agentMemory',
        memories: [{ id: 'mem-1', scope: 'project', summary: 'Use pnpm.', score: 0.88 }],
      },
    );
  });
});
