import { describe, expect, it } from 'vitest';
import {
  isReasoningModel,
  MAX_RESPONSE_SEGMENTS,
  modelDisallowsTemperature,
  temperatureOptionsForModel,
} from './constants';

describe('response continuation budget', () => {
  it('allows enough length-continuations to finish a multi-file app', () => {
    /*
     * Each segment is bounded by the model's per-response token limit (~4k-8k),
     * so a from-scratch 15-25 file app needs several continuations. At 2 the
     * generation hard-stopped mid-file (truncated vite.config.ts → blank
     * preview). Guard against regressing back to a too-small value.
     */
    expect(MAX_RESPONSE_SEGMENTS).toBeGreaterThanOrEqual(6);
  });
});

describe('LLM model parameter compatibility', () => {
  it('omits temperature by default for provider compatibility', () => {
    expect(modelDisallowsTemperature('claude-opus-4-7', 'Anthropic')).toBe(true);
    expect(modelDisallowsTemperature('anthropic/claude-opus-4.7', 'OpenRouter')).toBe(true);
    expect(temperatureOptionsForModel('claude-opus-4-7', 'Anthropic')).toEqual({});
    expect(temperatureOptionsForModel('gpt-4.1', 'OpenAI')).toEqual({});
    expect(temperatureOptionsForModel('gemini-2.0-flash', 'Google')).toEqual({});
    expect(temperatureOptionsForModel('mistral-large-latest', 'Mistral')).toEqual({});
  });

  it('detects reasoning models without injecting temperature', () => {
    expect(isReasoningModel('gpt-5.1')).toBe(true);
    expect(temperatureOptionsForModel('gpt-5.1', 'OpenAI')).toEqual({});
  });
});
