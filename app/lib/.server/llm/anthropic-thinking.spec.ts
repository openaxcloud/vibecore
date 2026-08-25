import { readFileSync } from 'node:fs';

import { createAnthropic } from '@ai-sdk/anthropic';
import { describe, expect, it, vi } from 'vitest';

const asSse = (events: unknown[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

describe('BUG-CHAT-THINKING-001 — flux Anthropic avec réflexion', () => {
  it('accepte les blocs thinking, thinking_delta et signature_delta sans tuer le flux', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          asSse([
            {
              type: 'message_start',
              message: {
                id: 'msg-thinking',
                model: 'claude-fable-5',
                usage: { input_tokens: 12, output_tokens: 0 },
              },
            },
            {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'thinking', thinking: '' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'thinking_delta', thinking: 'Je vérifie le plan.' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'signature_delta', signature: 'signed-reasoning' },
            },
            { type: 'content_block_stop', index: 0 },
            {
              type: 'content_block_start',
              index: 1,
              content_block: { type: 'text', text: '' },
            },
            {
              type: 'content_block_delta',
              index: 1,
              delta: { type: 'text_delta', text: 'Application générée.' },
            },
            { type: 'content_block_stop', index: 1 },
            {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 8 },
            },
            { type: 'message_stop' },
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const model = createAnthropic({ apiKey: 'test-key', fetch })('claude-fable-5');

    const result = await model.doStream({
      mode: { type: 'regular' },
      inputFormat: 'prompt',
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Construis une application.' }] }],
      maxTokens: 1024,
    } as Parameters<typeof model.doStream>[0]);

    const chunks = [];

    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: 'reasoning', textDelta: 'Je vérifie le plan.' });
    expect(chunks).toContainEqual({ type: 'reasoning-signature', signature: 'signed-reasoning' });
    expect(chunks).toContainEqual({ type: 'text-delta', textDelta: 'Application générée.' });
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
  });

  it('ne force plus thinking=disabled dans le chemin de production', () => {
    const streamText = readFileSync('app/lib/.server/llm/stream-text.ts', 'utf8');

    expect(streamText).not.toContain('withThinkingDisabled');
    expect(streamText).not.toContain("thinking: { type: 'disabled' }");
  });

  it('reste sur la version provider qui connaît les événements de réflexion', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(pkg.dependencies['@ai-sdk/anthropic']).toBe('1.2.12');
  });
});
