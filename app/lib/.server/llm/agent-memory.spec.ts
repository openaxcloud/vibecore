import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentMemoryAnnotation,
  isMeaningfulMemoryCandidate,
  latestUserText,
  persistAgentMemoryCandidate,
  retrieveMemoryForAgentContext,
} from './agent-memory';

describe('isMeaningfulMemoryCandidate', () => {
  it('rejects trivial acknowledgements and control words', () => {
    for (const junk of ['ok', 'okay', 'thanks', 'thank you', 'yes', 'no', 'continue', 'retry', 'cool', '👍']) {
      expect(isMeaningfulMemoryCandidate(junk)).toBe(false);
    }
  });

  it('rejects very short or too-few-word messages', () => {
    expect(isMeaningfulMemoryCandidate('do it')).toBe(false);
    expect(isMeaningfulMemoryCandidate('fix')).toBe(false);
    expect(isMeaningfulMemoryCandidate('   ')).toBe(false);
  });

  it('accepts messages that carry durable intent', () => {
    expect(isMeaningfulMemoryCandidate('Always use TypeScript strict mode in this project.')).toBe(true);
    expect(isMeaningfulMemoryCandidate('Prefer Tailwind over inline styles.')).toBe(true);
    expect(isMeaningfulMemoryCandidate('Build a dashboard with authentication.')).toBe(true);
  });
});

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

  it('strips composer [Model:]/[Provider:] prefixes from the latest user text', () => {
    expect(
      latestUserText([
        {
          role: 'user',
          content: '[Model: claude-opus-4-8]\n\n[Provider: Anthropic]\n\nmake the navbar sticky',
        },
      ] as any),
    ).toBe('make the navbar sticky');
  });

  it('strips composer prefixes from array text-part content', () => {
    expect(
      latestUserText([
        {
          role: 'user',
          content: [
            { type: 'text', text: '[Model: gpt-4.1]\n\n[Provider: OpenAI]\n\nadd a footer' },
            { type: 'image_url', image_url: { url: 'data:...' } },
          ],
        },
      ] as any),
    ).toBe('add a footer');
  });

  it('persists memory content/summary without composer boilerplate', async () => {
    apiRequest.mockResolvedValueOnce({ preference: { enabled: true } }).mockResolvedValueOnce({});

    await persistAgentMemoryCandidate(new Request('https://app.local/api/chat'), {
      projectId: 'project-1',
      messages: [
        {
          role: 'user',
          content: '[Model: claude-opus-4-8]\n\n[Provider: Anthropic]\n\nmake the navbar sticky',
        },
      ] as any,
      assistantText: 'Done',
    });

    expect(apiRequest.mock.calls[1][1]).toBe('/agent-memory');

    const body = JSON.parse(apiRequest.mock.calls[1][2].body);

    expect(body.content).toBe('make the navbar sticky');
    expect(body.summary).toBe('make the navbar sticky');
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
