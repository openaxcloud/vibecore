import { MockLanguageModelV1, simulateReadableStream } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamText } from './stream-text';

const boundary = vi.hoisted(() => ({ model: vi.fn(), fetch: vi.fn(), selectedModel: 'configured-model' }));
const catalog = vi.hoisted(() => [{ name: 'configured-model', provider: 'Google', maxTokenAllowed: 8192 }]);
vi.mock('./managed-provider-keys', () => ({ applyManagedProviderKeys: async (env: unknown) => env }));
vi.mock('./provider-credentials', () => ({
  resolveUsableProvider: () => ({
    provider: { name: 'Google', getModelInstance: boundary.model, staticModels: catalog },
    model: boundary.selectedModel,
  }),
}));
vi.mock('./provider-fallback', () => ({
  ensureProviderProbed: async () => undefined,
  resolveRuntimeProvider: (input: unknown) => input,
}));
vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: () => ({
      getAllProviders: () => [{ name: 'Google', staticModels: catalog, config: {} }],
      getDefaultProvider: () => ({ name: 'Google', staticModels: catalog, config: {} }),
      getStaticModelListFromProvider: () => catalog,
      getModelListFromProvider: async () => catalog,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  boundary.selectedModel = 'configured-model';
  boundary.fetch.mockImplementation(() => {
    throw new Error('Network forbidden');
  });
  vi.stubGlobal('fetch', boundary.fetch);
});
afterEach(() => vi.unstubAllGlobals());

function fixture(chunks: Parameters<typeof simulateReadableStream>[0]['chunks']) {
  boundary.model.mockReturnValue(
    new MockLanguageModelV1({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    }),
  );
}

async function invoke(onModelOutput: ReturnType<typeof vi.fn>, onChunk = vi.fn(), abortSignal?: AbortSignal) {
  return streamText({
    messages: [{ role: 'user', content: 'Explain this synthetic example.' }],
    chatMode: 'discuss',
    abortSignal,
    identifiantDeMessageStable: 'synthetic-message',
    onModelOutput,
    options: { onChunk, maxRetries: 0 },
  });
}

const finish = {
  type: 'finish' as const,
  finishReason: 'stop' as const,
  usage: { promptTokens: 1, completionTokens: 2 },
};

describe('real streamText SDK receipt wiring without a provider API', () => {
  it('reports the configured model only after text, and preserves the caller callback', async () => {
    fixture([{ type: 'reasoning', textDelta: 'thinking' }, { type: 'text-delta', textDelta: 'Hello world.' }, finish]);

    const output = vi.fn();

    const chunk = vi.fn(async () => {
      await Promise.resolve();
    });

    const result = await invoke(output, chunk);
    expect(output).not.toHaveBeenCalled();
    await result.consumeStream();
    expect(await result.text).toBe('Hello world.');
    expect(output).toHaveBeenCalledExactlyOnceWith({
      provider: 'Google',
      model: 'configured-model',
      evidence: 'text-delta',
      messageId: 'synthetic-message',
    });
    expect(chunk).toHaveBeenCalled();
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it('does not call reasoning-only output a served text response', async () => {
    fixture([{ type: 'reasoning', textDelta: 'thinking' }, finish]);

    const output = vi.fn();
    await (await invoke(output)).consumeStream();
    expect(output).not.toHaveBeenCalled();
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it('does not emit a receipt for an error before the first delta', async () => {
    fixture([{ type: 'error', error: new Error('synthetic provider failure') }]);

    const output = vi.fn();
    const result = await invoke(output);
    await result.consumeStream();
    expect(output).not.toHaveBeenCalled();
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('reports the final configured model after a missing-model substitution', async () => {
    boundary.selectedModel = 'missing-model';
    fixture([{ type: 'text-delta', textDelta: 'Resolved output.' }, finish]);

    const output = vi.fn();
    await (await invoke(output)).consumeStream();
    expect(output.mock.calls[0][0].model).toBe('configured-model');
    expect(boundary.model).toHaveBeenCalledWith(expect.objectContaining({ model: 'configured-model' }));
  });

  it('emits one receipt for each continuation invocation sharing a message', async () => {
    fixture([{ type: 'text-delta', textDelta: 'Segment.' }, finish]);

    const output = vi.fn();
    await (await invoke(output)).consumeStream();
    await (await invoke(output)).consumeStream();
    expect(output).toHaveBeenCalledTimes(2);
  });

  it('does not emit a receipt when the provider aborts before text', async () => {
    fixture([{ type: 'error', error: Object.assign(new Error('aborted'), { name: 'AbortError' }) }]);

    const output = vi.fn();
    await (await invoke(output)).consumeStream();
    expect(output).not.toHaveBeenCalled();
  });
  it('does not report buffered output after cancellation inside the existing SDK callback', async () => {
    fixture([{ type: 'text-delta', textDelta: 'Buffered output.' }, finish]);

    const controller = new AbortController();
    const output = vi.fn();

    const onChunk = vi.fn(() => {
      controller.abort();
    });
    await (await invoke(output, onChunk, controller.signal)).consumeStream();
    expect(onChunk).toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
  });
});
