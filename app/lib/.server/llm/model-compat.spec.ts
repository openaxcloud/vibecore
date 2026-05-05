import { describe, expect, it } from 'vitest';
import type { LanguageModelV1 } from 'ai';
import { removeUnsupportedModelSettings } from './model-compat';

function captureModel(calls: unknown[]): LanguageModelV1 {
  return {
    specificationVersion: 'v1',
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'tool',
    supportsImageUrls: false,
    async doGenerate(params) {
      calls.push(params);
      return {
        text: 'ok',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
    async doStream(params) {
      calls.push(params);
      return {
        stream: new ReadableStream(),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  } as LanguageModelV1;
}

describe('removeUnsupportedModelSettings', () => {
  it('removes temperature and related sampling settings before generation', async () => {
    const calls: unknown[] = [];
    const model = removeUnsupportedModelSettings(captureModel(calls), 'claude-opus-4-7', 'Anthropic');

    await model.doGenerate({
      mode: { type: 'regular' },
      prompt: [],
      inputFormat: 'messages',
      temperature: 0,
      topP: 0.9,
      presencePenalty: 0,
      frequencyPenalty: 0,
    } as any);

    expect(calls[0]).not.toHaveProperty('temperature');
    expect(calls[0]).not.toHaveProperty('topP');
    expect(calls[0]).not.toHaveProperty('presencePenalty');
    expect(calls[0]).not.toHaveProperty('frequencyPenalty');
  });

  it('removes temperature before streaming', async () => {
    const calls: unknown[] = [];
    const model = removeUnsupportedModelSettings(captureModel(calls), 'gpt-4.1', 'OpenAI');

    await model.doStream({
      mode: { type: 'regular' },
      prompt: [],
      inputFormat: 'messages',
      temperature: 0,
    } as any);

    expect(calls[0]).not.toHaveProperty('temperature');
  });
});
